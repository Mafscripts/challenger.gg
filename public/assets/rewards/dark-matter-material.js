// Native WebGL material, shared by the application and standalone artwork preview.
// No CSS animation, moving overlays, external dependencies or network services.
const vertexSource = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position, 0., 1.); }
`;
const fragmentSource = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_art;
uniform sampler2D u_mask;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform float u_time;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x), mix(hash(i+vec2(0.,1.)), hash(i+1.), f.x), f.y);
}
float fbm(vec2 p) {
  float n = .53*noise(p);
  p = mat2(.8,-.6,.6,.8)*p*2.03 + 9.7; n += .27*noise(p);
  p = mat2(.8,-.6,.6,.8)*p*2.01 + 13.1; n += .13*noise(p);
  p = mat2(.8,-.6,.6,.8)*p*2.04 + 7.3; n += .07*noise(p);
  return n;
}
void main() {
  // Match the original square image's object-fit:contain in every card shape.
  vec2 uv = (v_uv-.5) * u_resolution/min(u_resolution.x,u_resolution.y) + .5;
  if (uv.x<0. || uv.y<0. || uv.x>1. || uv.y>1.) { gl_FragColor=vec4(0.); return; }
  vec4 art = texture2D(u_art, uv);
  vec3 mask = texture2D(u_mask, uv).rgb;
  if (mask.r<.015 || art.a<.01) { gl_FragColor=vec4(0.); return; }
  float t=u_time;
  // Two advected volumes at different depths; warp the material, never the metal.
  vec2 p = mat2(.91,-.415,.415,.91)*(uv-.5)*8.;
  vec2 drift=vec2(t*.105,-t*.065);
  vec2 warp=vec2(fbm(p*.75+drift),fbm(p*.75-drift+17.3));
  float rear=fbm(p*1.1+warp*2.8-vec2(t*.13,t*.035)-u_pointer*.16);
  float front=fbm(p*2.2-warp*2.+vec2(t*.085,-t*.12)+u_pointer*.3);
  float clouds=smoothstep(.18,.82,rear*.6+front*.4);
  float tendrils=pow(1.-abs(front*2.-1.),7.);
  vec3 deep=vec3(.009,.003,.034);
  vec3 violet=vec3(.28,.025,.66);
  vec3 indigo=vec3(.025,.055,.31);
  vec3 magenta=vec3(.73,.045,.46);
  vec3 gas=mix(indigo,violet,smoothstep(.25,.72,rear));
  gas=mix(gas,magenta,smoothstep(.57,.86,front));
  vec3 material=mix(deep,gas,clouds)*(.55+tendrils*.58);
  // Preserve baked fine detail while replacing the stagnant nebula in the inlay.
  float grain=dot(art.rgb,vec3(.2126,.7152,.0722));
  material+=art.rgb*(.16+.18*clouds)+vec3(.028,.10,.18)*tendrils*clouds;
  material*=.82+.4*grain;
  // Fractal fissures charge briefly at different locations, with no white sweep.
  float fracture=abs(fbm(p*2.8+warp+vec2(t*.1,0.))-.51);
  float filament=1.-smoothstep(.005,.023,fracture);
  float charge=pow(max(0.,sin(t*2.1+rear*9.)),16.);
  vec3 lightning=mix(vec3(.22,.13,1.),vec3(.16,.72,1.),front);
  material+=lightning*filament*(.045+.85*charge);
  // Small embedded star points, independent of the cloud and crack velocities.
  vec2 cell=p*5.-drift;
  vec2 cellId=floor(cell), point=fract(cell)-.5;
  float star=(1.-smoothstep(.008,.055,length(point)))*step(.965,hash(cellId));
  material+=vec3(.35,.56,1.)*star*(.35+.65*pow(max(0.,sin(t*1.7+hash(cellId)*16.)),4.));
  // The authored green mask confines the breathing reactor to its central lens.
  float heartbeat=.5+.5*sin(t*1.35);
  material+=vec3(.16,.035,.36)*mask.g*(.15+.5*heartbeat);
  material+=vec3(.08,.14,.26)*mask.b*charge*.38;
  // Only replace masked inlays. The full-resolution HTML image keeps metal sharp
  // even when the GPU material runs at a lower resolution on mobile devices.
  gl_FragColor=vec4(material,art.a*mask.r*.88);
}
`;

// One shared 30fps loop, with a two-surface GPU budget. Detail views take priority.
const renderers=new Set();
let animationFrame=0, lastFrame=0, order=0;
function tick(now) {
  animationFrame=0;
  if (!document.hidden && now-lastFrame>=1000/30) {
    lastFrame=now;
    [...renderers].sort((a,b)=>b.priority-a.priority || b.order-a.order).slice(0,2).forEach(renderer=>renderer.draw(now));
  }
  if (renderers.size && !document.hidden) animationFrame=requestAnimationFrame(tick);
}
function schedule() { if (!animationFrame && renderers.size && !document.hidden) animationFrame=requestAnimationFrame(tick); }
function visibility() {
  if (document.hidden) { cancelAnimationFrame(animationFrame); animationFrame=0; }
  else schedule();
}
function register(renderer) {
  if (!renderers.size) document.addEventListener('visibilitychange',visibility);
  renderers.add(renderer); schedule();
  return () => {
    renderers.delete(renderer);
    if (!renderers.size) { cancelAnimationFrame(animationFrame); animationFrame=0; document.removeEventListener('visibilitychange',visibility); }
  };
}
const loadImage = (url, signal) => new Promise((resolve,reject)=>{
  const image=new Image();
  const abort=()=>{ image.onload=null; image.onerror=null; image.src=''; reject(new DOMException('Aborted','AbortError')); };
  image.onload=()=>{ signal.removeEventListener('abort',abort); resolve(image); };
  image.onerror=()=>{ signal.removeEventListener('abort',abort); reject(new Error('Material image unavailable')); };
  if (signal.aborted) { abort(); return; }
  signal.addEventListener('abort',abort,{once:true}); image.src=url;
});

export function createDarkMatterRenderer(canvas,{source,mask,priority=0,onReady=()=>{},onFailure=()=>{}}) {
  const abort=new AbortController();
  let disposed=false, gl, program, buffer, resizeObserver, removeScheduler, registration;
  let width=1, height=1, elapsed=0, previous=0, lastReady=false;
  const textures=[], shaders=[], pointer=[0,0], target=[0,0];
  const pointerSurface=canvas.parentElement || canvas;
  const fail=()=>{ if (!disposed) { onFailure(); dispose(); } };
  const lost=(event)=>{ event.preventDefault(); fail(); };
  const move=(event)=>{ const rect=canvas.getBoundingClientRect(); target[0]=(event.clientX-rect.left)/rect.width-.5; target[1]=.5-(event.clientY-rect.top)/rect.height; };
  const leave=()=>{ target[0]=0; target[1]=0; };
  canvas.addEventListener('webglcontextlost',lost);
  pointerSurface.addEventListener('pointermove',move,{passive:true});
  pointerSurface.addEventListener('pointerleave',leave);
  function dispose() {
    if (disposed) return; disposed=true; abort.abort();
    removeScheduler?.(); resizeObserver?.disconnect();
    canvas.removeEventListener('webglcontextlost',lost); pointerSurface.removeEventListener('pointermove',move); pointerSurface.removeEventListener('pointerleave',leave);
    if (gl) {
      textures.forEach(texture=>gl.deleteTexture(texture)); shaders.forEach(shader=>gl.deleteShader(shader));
      if (buffer) gl.deleteBuffer(buffer); if (program) gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  }
  Promise.all([loadImage(source,abort.signal),loadImage(mask,abort.signal)]).then(([image,materialMask])=>{
    if (disposed) return;
    gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'low-power'});
    if (!gl) throw new Error('WebGL unavailable');
    const compile=(type,source)=>{
      const shader=gl.createShader(type); if (!shader) throw new Error('Shader unavailable'); shaders.push(shader);
      gl.shaderSource(shader,source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error('Material shader unavailable');
      return shader;
    };
    const precision=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision ? 'highp' : 'mediump';
    program=gl.createProgram(); if (!program) throw new Error('Material program unavailable');
    gl.attachShader(program,compile(gl.VERTEX_SHADER,vertexSource));
    gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragmentSource.replace('precision highp float;',`precision ${precision} float;`)));
    gl.linkProgram(program); if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error('Material linking unavailable');
    gl.useProgram(program);
    buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'a_position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    [image,materialMask].forEach((textureImage,index)=>{
      const texture=gl.createTexture(); if (!texture) throw new Error('Material texture unavailable'); textures.push(texture);
      gl.activeTexture(gl.TEXTURE0+index); gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,textureImage);
      gl.uniform1i(gl.getUniformLocation(program,index ? 'u_mask' : 'u_art'),index);
    });
    const resolution=gl.getUniformLocation(program,'u_resolution'), time=gl.getUniformLocation(program,'u_time'), mouse=gl.getUniformLocation(program,'u_pointer');
    const resize=()=>{
      const rect=canvas.getBoundingClientRect();
      const cap=matchMedia('(pointer: coarse)').matches ? 384 : 640;
      const ratio=Math.min(devicePixelRatio||1,1.25,cap/Math.max(rect.width,rect.height,1));
      width=Math.max(1,Math.round(rect.width*ratio)); height=Math.max(1,Math.round(rect.height*ratio));
    };
    resize(); resizeObserver=new ResizeObserver(resize); resizeObserver.observe(canvas);
    registration={priority,order:++order,draw(now){
      if (disposed) return;
      try {
        if (canvas.width!==width || canvas.height!==height) { canvas.width=width; canvas.height=height; gl.viewport(0,0,width,height); }
        if (previous) elapsed+=Math.min((now-previous)/1000,.1); previous=now;
        pointer[0]+=(target[0]-pointer[0])*.06; pointer[1]+=(target[1]-pointer[1])*.06;
        gl.uniform2f(resolution,width,height); gl.uniform1f(time,elapsed); gl.uniform2f(mouse,pointer[0],pointer[1]);
        gl.drawArrays(gl.TRIANGLES,0,6);
        if (!lastReady) { lastReady=true; onReady(); }
      } catch { fail(); }
    }};
    removeScheduler=register(registration);
  }).catch(error=>{ if (error.name!=='AbortError') fail(); });
  return {dispose,setPriority(value){ if (registration) registration.priority=value; }};
}
