// Actual user-supplied loops, sampled as item materials. No procedural substitute.
const vertexSource = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() { v_uv=a_position*.5+.5; gl_Position=vec4(a_position,0.,1.); }
`;
const fragmentSource = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_art;
uniform sampler2D u_mask;
uniform sampler2D u_loop;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform float u_zoom;
void main() {
  vec2 uv=(v_uv-.5)*u_resolution/min(u_resolution.x,u_resolution.y)+.5;
  if(uv.x<0. || uv.y<0. || uv.x>1. || uv.y>1.) { gl_FragColor=vec4(0.); return; }
  vec4 art=texture2D(u_art,uv);
  float coverage=texture2D(u_mask,uv).r;
  if(coverage<.001) { gl_FragColor=art; return; }
  vec2 materialUV=clamp((uv-.5)/u_zoom+.5+u_pointer*.018,vec2(.002),vec2(.998));
  vec3 movingMaterial=texture2D(u_loop,materialUV).rgb;
  // Preserve the supplied loop's colors and dark areas. No shine or white wash.
  // Render the complete frame. The opaque inlay fully replaces the old texture;
  // no second illustration is left showing underneath partially masked patches.
  gl_FragColor=vec4(mix(art.rgb,movingMaterial,coverage),art.a);
}
`;

// A single loop controls both GPU drawing and video decoding/playback.
const renderers=new Set();
let animationFrame=0,lastFrame=0,order=0;
function tick(now) {
  animationFrame=0;
  if(!document.hidden && now-lastFrame>=1000/30) {
    lastFrame=now;
    const chosen=new Set([...renderers].sort((a,b)=>b.priority-a.priority || b.order-a.order).slice(0,2));
    renderers.forEach(renderer=>renderer.setActive(chosen.has(renderer)));
    chosen.forEach(renderer=>renderer.draw());
  }
  if(renderers.size && !document.hidden) animationFrame=requestAnimationFrame(tick);
}
function schedule() { if(!animationFrame && renderers.size && !document.hidden) animationFrame=requestAnimationFrame(tick); }
function visibility() {
  if(document.hidden) { cancelAnimationFrame(animationFrame);animationFrame=0;renderers.forEach(renderer=>renderer.setActive(false)); }
  else schedule();
}
function register(renderer) {
  if(!renderers.size) document.addEventListener('visibilitychange',visibility);
  renderers.add(renderer);schedule();
  return ()=>{
    renderers.delete(renderer);
    if(!renderers.size) {cancelAnimationFrame(animationFrame);animationFrame=0;document.removeEventListener('visibilitychange',visibility);}
  };
}
const loadImage=(url,signal)=>new Promise((resolve,reject)=>{
  const image=new Image();
  const abort=()=>{image.onload=null;image.onerror=null;image.src='';reject(new DOMException('Aborted','AbortError'));};
  image.onload=()=>{signal.removeEventListener('abort',abort);resolve(image);};
  image.onerror=()=>{signal.removeEventListener('abort',abort);reject(new Error('Material image unavailable'));};
  if(signal.aborted) {abort();return;}
  signal.addEventListener('abort',abort,{once:true});image.src=url;
});

export function createDarkMatterRenderer(canvas,{source,mask,video:motionSource,zoom=1,playbackRate=.75,priority=0,onReady=()=>{},onPause=()=>{},onFailure=()=>{}}) {
  const abort=new AbortController();
  let disposed=false,gl,program,buffer,resizeObserver,removeScheduler,registration,loopTexture;
  let width=1,height=1,lastReady=false,active=false,needsUpload=true,frameCallback=null,lastVideoTime=-1;
  const textures=[],shaders=[],pointer=[0,0],target=[0,0];
  const pointerSurface=canvas.parentElement||canvas;
  const player=document.createElement('video');
  player.muted=true;player.defaultMuted=true;player.playsInline=true;player.loop=true;player.preload='none';
  player.defaultPlaybackRate=Math.max(.25,Math.min(1,playbackRate));player.playbackRate=player.defaultPlaybackRate;
  player.setAttribute('muted','');player.setAttribute('playsinline','');player.disablePictureInPicture=true;
  const fail=()=>{if(!disposed){onFailure();dispose();}};
  const lost=event=>{event.preventDefault();fail();};
  const move=event=>{const rect=canvas.getBoundingClientRect();target[0]=(event.clientX-rect.left)/Math.max(rect.width,1)-.5;target[1]=.5-(event.clientY-rect.top)/Math.max(rect.height,1);};
  const leave=()=>{target[0]=0;target[1]=0;};
  const cancelFrame=()=>{if(frameCallback!==null){player.cancelVideoFrameCallback?.(frameCallback);frameCallback=null;}};
  function watchFrame() {
    if(disposed || !active || frameCallback!==null || !player.requestVideoFrameCallback) return;
    frameCallback=player.requestVideoFrameCallback(()=>{frameCallback=null;needsUpload=true;watchFrame();});
  }
  function setActive(next) {
    if(disposed || next===active) return;
    active=next;
    if(!active){player.pause();cancelFrame();lastReady=false;onPause();return;}
    // Only budget-selected surfaces assign a video URL or start a decoder.
    if(!player.getAttribute('src')) player.src=motionSource;
    player.playbackRate=player.defaultPlaybackRate;
    needsUpload=true;
    player.play().then(()=>{if(!disposed && active) watchFrame();}).catch(error=>{if(!disposed && active && error.name!=='AbortError') fail();});
  }
  player.addEventListener('error',fail);
  canvas.addEventListener('webglcontextlost',lost);
  pointerSurface.addEventListener('pointermove',move,{passive:true});pointerSurface.addEventListener('pointerleave',leave);
  function dispose() {
    if(disposed)return;disposed=true;abort.abort();
    removeScheduler?.();resizeObserver?.disconnect();cancelFrame();
    player.removeEventListener('error',fail);player.pause();player.removeAttribute('src');player.load();
    canvas.removeEventListener('webglcontextlost',lost);pointerSurface.removeEventListener('pointermove',move);pointerSurface.removeEventListener('pointerleave',leave);
    if(gl){textures.forEach(texture=>gl.deleteTexture(texture));shaders.forEach(shader=>gl.deleteShader(shader));if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();}
  }
  Promise.all([loadImage(source,abort.signal),loadImage(mask,abort.signal)]).then(([image,materialMask])=>{
    if(disposed)return;
    if(!motionSource) throw new Error('No supplied loop assigned');
    gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'low-power'});
    if(!gl)throw new Error('WebGL unavailable');
    const compile=(type,source)=>{const shader=gl.createShader(type);if(!shader)throw new Error('Shader unavailable');shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('Material shader unavailable');return shader;};
    program=gl.createProgram();if(!program)throw new Error('Material program unavailable');
    gl.attachShader(program,compile(gl.VERTEX_SHADER,vertexSource));
    const precision=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision?'highp':'mediump';
    gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragmentSource.replace('precision highp float;',`precision ${precision} float;`)));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Material linking unavailable');
    gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    [image,materialMask,null].forEach((textureImage,index)=>{
      const texture=gl.createTexture();if(!texture)throw new Error('Material texture unavailable');textures.push(texture);gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      if(textureImage)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,textureImage);
      else {loopTexture=texture;gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));}
      gl.uniform1i(gl.getUniformLocation(program,['u_art','u_mask','u_loop'][index]),index);
    });
    gl.uniform1f(gl.getUniformLocation(program,'u_zoom'),Math.max(1,zoom));
    const resolution=gl.getUniformLocation(program,'u_resolution'),mouse=gl.getUniformLocation(program,'u_pointer');
    const resize=()=>{const rect=canvas.getBoundingClientRect(),cap=matchMedia('(pointer: coarse)').matches?768:1536,ratio=Math.min(devicePixelRatio||1,2,cap/Math.max(rect.width,rect.height,1));width=Math.max(1,Math.round(rect.width*ratio));height=Math.max(1,Math.round(rect.height*ratio));};
    resize();resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);
    registration={priority,order:++order,setActive,draw(){
      if(disposed || !active || player.readyState<2)return;
      try {
        if(canvas.width!==width || canvas.height!==height){canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);}
        pointer[0]+=(target[0]-pointer[0])*.06;pointer[1]+=(target[1]-pointer[1])*.06;
        if(needsUpload || (!player.requestVideoFrameCallback && player.currentTime!==lastVideoTime)){
          gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,loopTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,player);needsUpload=false;lastVideoTime=player.currentTime;
        }
        gl.uniform2f(resolution,width,height);gl.uniform2f(mouse,pointer[0],pointer[1]);gl.drawArrays(gl.TRIANGLES,0,6);
        if(!lastReady){lastReady=true;onReady();}
      } catch{fail();}
    }};
    removeScheduler=register(registration);
  }).catch(error=>{if(error.name!=='AbortError')fail();});
  return {dispose,setPriority(value){if(registration)registration.priority=value;}};
}
