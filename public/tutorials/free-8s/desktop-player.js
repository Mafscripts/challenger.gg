(() => {
  'use strict';
  const $ = (id) => document.getElementById(id), canvas=$('screen'), ctx=canvas.getContext('2d',{alpha:false});
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let manifest, images=[], time=0, playing=false, previous=null, lastChapter=-1;
  const pad=(value)=>String(value).padStart(2,'0');
  const stamp=(value)=>`${Math.floor(value/60000)}:${pad(Math.floor(value/1000)%60)}`;
  const params=new URLSearchParams(location.search);document.body.classList.toggle('embed',params.has('embed'));
  function roundRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function wrapped(text,maxWidth){const lines=[];let line='';for(const word of text.split(' ')){const next=line?`${line} ${word}`:word;if(ctx.measureText(next).width>maxWidth&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);return lines;}
  function drawCaption(chapter,index){
    const x=80,w=canvas.width-160,h=132,y=canvas.height-h-28;
    ctx.save();ctx.fillStyle='rgba(6,16,25,.96)';ctx.strokeStyle='rgba(0,217,255,.35)';ctx.lineWidth=2;roundRect(x,y,w,h,13);ctx.fill();ctx.stroke();
    ctx.font='bold 18px Arial';ctx.fillStyle='#00d9ff';ctx.fillText(`STEP ${pad(index+1)} / ${pad(manifest.chapters.length)}   ·   ${chapter.title.toUpperCase()}`,x+30,y+32);
    ctx.font='bold 27px Arial';ctx.fillStyle='#f0f5fa';wrapped(chapter.caption,w-60).slice(0,2).forEach((line,i)=>ctx.fillText(line,x+30,y+73+i*34));
    ctx.restore();
  }
  function render(ms,{pointer=true,caption=true}={}){
    if(!manifest||!images.length)return;
    time=Math.min(manifest.total-1,Math.max(0,ms));
    let index=manifest.chapters.length-1;
    for(let i=0;i<manifest.chapters.length;i++){if(time<manifest.chapters[i].end){index=i;break;}}
    const chapter=manifest.chapters[index], local=time-chapter.start;
    let f=chapter.frames.length-1;while(f>0&&chapter.frames[f].at>local)f--;
    const frame=chapter.frames[f], image=images[index][f];
    ctx.fillStyle='#08111b';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const box=frame.focus;
    if(pointer&&box){
      const previousFrame=f?chapter.frames[f-1]:index?manifest.chapters[index-1].frames.at(-1):frame;
      const previousBox=previousFrame.focus||box;
      const interval=(chapter.frames[f+1]?.at??chapter.duration)-frame.at;
      const phase=Math.min(1,(local-frame.at)/Math.min(1100,interval*.35));
      const smooth=reduced?1:phase*phase*(3-2*phase);
      const x=(previousBox.x+previousBox.width*.64)*(1-smooth)+(box.x+box.width*.64)*smooth;
      const y=(previousBox.y+previousBox.height*.6)*(1-smooth)+(box.y+box.height*.6)*smooth;
      ctx.save();ctx.strokeStyle='rgba(0,217,255,.9)';ctx.lineWidth=3;ctx.shadowColor='#00d9ff40';ctx.shadowBlur=12;roundRect(box.x-8,box.y-7,box.width+16,box.height+14,8);ctx.stroke();ctx.restore();
      const clickTime=frame.at+interval-350,click=(local-clickTime)/400;
      ctx.save();ctx.translate(x,y);
      if(frame.click&&click>=0&&click<1){ctx.beginPath();ctx.arc(6,6,18+click*27,0,Math.PI*2);ctx.strokeStyle=`rgba(0,217,255,${1-click})`;ctx.lineWidth=4;ctx.stroke();}
      ctx.shadowColor='#000b';ctx.shadowBlur=6;ctx.shadowOffsetY=4;ctx.beginPath();ctx.moveTo(5,3);ctx.lineTo(5,43);ctx.lineTo(17,33);ctx.lineTo(25,51);ctx.lineTo(33,47);ctx.lineTo(25,31);ctx.lineTo(40,30);ctx.closePath();ctx.fillStyle='white';ctx.fill();ctx.lineWidth=3;ctx.strokeStyle='#04121e';ctx.lineJoin='round';ctx.stroke();ctx.restore();
    }
    if(caption)drawCaption(chapter,index);
    ctx.fillStyle='#00d9ff';ctx.fillRect(0,canvas.height-5,canvas.width*time/manifest.total,5);
    $('seek').value=time;$('position').textContent=`${stamp(time)} / ${stamp(manifest.total)}`;
    $('previous').disabled=index===0;$('next').disabled=index===manifest.chapters.length-1;
    if(lastChapter!==index){$('chapter').value=index;$('step-status').textContent=`Step ${index+1}: ${chapter.title}. ${chapter.caption}`;canvas.setAttribute('aria-label',`Desktop screenshot: ${chapter.title}`);lastChapter=index;}
    return {index,frame:f,time};
  }
  function play(value){playing=value;previous=null;$('play').textContent=playing?'Pause':'Play';$('play').setAttribute('aria-label',playing?'Pause desktop tutorial':'Play desktop tutorial');}
  function jump(index){play(false);render(manifest.chapters[Math.min(manifest.chapters.length-1,Math.max(0,index))].start);}
  function tick(now){if(playing){const delta=previous===null?0:now-previous;if(time+delta>=manifest.total-1){render(manifest.total-1);play(false);}else render(time+delta);previous=now;}requestAnimationFrame(tick);}
  $('play').addEventListener('click',()=>{if(time>=manifest.total-2)render(0);play(!playing);});
  $('previous').addEventListener('click',()=>jump(lastChapter-1));$('next').addEventListener('click',()=>jump(lastChapter+1));
  $('chapter').addEventListener('change',event=>jump(Number(event.target.value)));
  $('seek').addEventListener('input',event=>{play(false);render(Number(event.target.value));});
  $('fullscreen').addEventListener('click',()=>{const operation=document.fullscreenElement?document.exitFullscreen():$('player').requestFullscreen();operation?.catch(()=>{});});
  $('watch').addEventListener('click',()=>{play(false);$('video-dialog').showModal();$('video-dialog').querySelector('video').play().catch(()=>{});});
  $('close-video').addEventListener('click',()=>$('video-dialog').close());
  $('video-dialog').addEventListener('close',()=>{$('video-dialog').querySelector('video').pause();$('watch').focus();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)play(false);});
  document.addEventListener('keydown',event=>{if($('video-dialog').open||/INPUT|SELECT|BUTTON|A/.test(event.target.tagName))return;if(event.key==='ArrowRight'){event.preventDefault();jump(lastChapter+1);}if(event.key==='ArrowLeft'){event.preventDefault();jump(lastChapter-1);}if(event.code==='Space'){event.preventDefault();$('play').click();}});
  const ready=fetch('desktop/manifest.json').then(response=>{if(!response.ok)throw new Error('The desktop guide could not be loaded.');return response.json();}).then(async data=>{
    manifest=data;let start=0;manifest.chapters.forEach((chapter,index)=>{chapter.start=start;start+=chapter.duration;chapter.end=start;const option=document.createElement('option');option.value=index;option.textContent=`${index+1}. ${chapter.title}`;$('chapter').append(option);});
    canvas.width=manifest.width;canvas.height=manifest.height;$('seek').max=manifest.total-1;
    images=await Promise.all(manifest.chapters.map(chapter=>Promise.all(chapter.frames.map(async frame=>{const image=new Image();image.src=frame.src;await image.decode();return image;}))));
    $('loading').hidden=true;render(0);requestAnimationFrame(tick);return manifest;
  }).catch(error=>{$('loading').textContent=error.message;const link=document.createElement('a');link.href='how-to-join-free-8s-desktop-1440p.mp4';link.textContent='Download the MP4 instead';$('loading').append(link);throw error;});
  window.desktopTutorial={ready,render,canvas,stop:()=>play(false),get manifest(){return manifest;}};
})();
