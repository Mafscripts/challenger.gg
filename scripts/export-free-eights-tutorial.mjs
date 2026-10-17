// Export the actual desktop UI captures. No real account or backend is accessed.
// Run capture-free-eights-desktop.mjs first; it supplies an isolated example account.
import {createServer} from "node:http";
import {readFile,writeFile} from "node:fs/promises";
import {dirname,resolve,join,sep} from "node:path";
import {fileURLToPath} from "node:url";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||"playwright");
const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),publicRoot=join(root,"public"),output=join(publicRoot,"tutorials/free-8s");
const mime={html:"text/html",css:"text/css",js:"text/javascript",json:"application/json",svg:"image/svg+xml",jpg:"image/jpeg",webp:"image/webp",mp4:"video/mp4",vtt:"text/vtt"};
const server=createServer(async(req,res)=>{
  try{
    const path=resolve(publicRoot,"."+decodeURIComponent(new URL(req.url,"http://localhost").pathname));
    if(!path.startsWith(publicRoot+sep)){res.writeHead(403);res.end();return;}
    const bytes=await readFile(path);res.writeHead(200,{"Content-Type":mime[path.split('.').at(-1)]||"application/octet-stream"});res.end(bytes);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),args:["--autoplay-policy=no-user-gesture-required","--disable-background-timer-throttling","--disable-renderer-backgrounding"]});
try{
  const page=await browser.newPage({viewport:{width:2560,height:1440},deviceScaleFactor:1});
  await page.goto(`${origin}/tutorials/free-8s/index.html?export=1`);
  const manifest=await page.evaluate(async()=>{await window.desktopTutorial.ready;return window.desktopTutorial.manifest;});
  console.log(`Encoding real desktop tutorial: ${manifest.total/1000}s, ${manifest.width}x${manifest.height}.`);
  const result=await page.evaluate(async()=>{
    const guide=window.desktopTutorial;guide.stop();guide.render(0);
    const canvas=guide.canvas,stream=canvas.captureStream(12),chunks=[];
    const mimeType=["video/mp4;codecs=avc1.420033","video/mp4"].find(type=>MediaRecorder.isTypeSupported(type));
    if(!mimeType)throw new Error("Use a current Chrome/Chromium version with MP4 recording support.");
    const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:900000});
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
    const completed=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=event=>reject(event.error);});
    recorder.start(1000);const start=performance.now();
    await new Promise(resolve=>{const timer=setInterval(()=>{const elapsed=performance.now()-start;guide.render(Math.min(guide.manifest.total-1,elapsed));if(elapsed>=guide.manifest.total){clearInterval(timer);resolve();}},1000/12);});
    recorder.stop();await completed;stream.getTracks().forEach(track=>track.stop());
    const video=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(new Blob(chunks,{type:"video/mp4"}));});
    guide.render(4500);const poster=canvas.toDataURL("image/webp",.88).split(',')[1];return {video,poster};
  });
  const video=Buffer.from(result.video,"base64");
  await writeFile(join(output,"how-to-join-free-8s-desktop-1440p.mp4"),video);
  await writeFile(join(output,"poster.webp"),Buffer.from(result.poster,"base64"));
  const stamp=(ms,separator='.')=>`00:${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}${separator}${String(ms%1000).padStart(3,'0')}`;
  let start=0;const lines=manifest.chapters.map((chapter,index)=>{const row={...chapter,index,start,end:start+chapter.duration};start=row.end;return row;});
  await writeFile(join(output,"captions.vtt"),'WEBVTT\n\n'+lines.map(row=>`${stamp(row.start)} --> ${stamp(row.end)}\n${row.caption}\n`).join('\n'));
  await writeFile(join(output,"captions.srt"),lines.map(row=>`${row.index+1}\n${stamp(row.start,',')} --> ${stamp(row.end,',')}\n${row.caption}\n`).join('\n'));
  await writeFile(join(output,"transcript.txt"),'TOPFRAGG - HOW TO JOIN FREE 8s ON DESKTOP\nActual website interface at 2560 x 1440, with example account and match data.\nDiscord authorization happens in Discord; no Discord login is impersonated in this guide.\n\n'+lines.map(row=>`${row.index+1}. ${row.title}\n${row.caption}\n`).join('\n'));
  console.log(`Desktop MP4 saved: ${(video.length/1024/1024).toFixed(2)} MiB.`);
}finally{await browser.close();await new Promise(done=>server.close(done));}
