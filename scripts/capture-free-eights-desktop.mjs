import { createServer } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { desktopExample, installDesktopFixtures } from "./free-eights-desktop-fixtures.mjs";

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root,"public/tutorials/free-8s/desktop");
await mkdir(output,{recursive:true});
process.env.VITE_API_URL = "http://127.0.0.1:5177/api";
console.log("Preparing the local desktop UI...");
const server = await createServer({root,optimizeDeps:{entries:[join(root,"index.html")]},server:{host:"127.0.0.1",port:5177,strictPort:true,watch:{ignored:["**/desktop/**","**/public/tutorials/**"]}},logLevel:"error"});
await server.listen();
console.log("Desktop UI server ready");
const browser = await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try {
  const context = await browser.newContext({viewport:{width:2560,height:1440},deviceScaleFactor:1});
  const state = desktopExample(); state.origin="http://127.0.0.1:5177";
  const requests = await installDesktopFixtures(context,state);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("console", msg => {if(msg.type()==="error") console.log("Page message:",msg.text().slice(0,250));});
  page.on("pageerror",error=>console.log("Rendering error:",error.message));
  await page.goto(`${state.origin}/ranked/8s`,{waitUntil:"domcontentloaded"});
  console.log("Desktop page opened");
  try { await page.getByRole("button",{name:"Open account menu for TutorialPlayer"}).waitFor(); }
  catch (error) {
    await page.screenshot({path:join(output,"render-diagnostic.jpg"),type:"jpeg"});
    console.log("Visible content:", await page.locator("body").innerText());
    console.log("Fixture reads:",JSON.stringify([...new Set(requests)]));
    throw error;
  }
  const chapters = [];
  const chapter = (title, caption, seconds, href) => {
    const item = {title,caption,duration:seconds*1000,href,frames:[]}; chapters.push(item); return item;
  };
  async function shot(item, at, name, target, click = true) {
    if (target) await target.scrollIntoViewIfNeeded();
    await page.waitForTimeout(450); // Let the site's own page/scroll transitions settle for the still image.
    const box = target ? await target.boundingBox() : null;
    const file = `${String(chapters.indexOf(item)+1).padStart(2,'0')}-${name}.jpg`;
    await page.screenshot({path:join(output,file),type:"jpeg",quality:93});
    item.frames.push({at:at*1000,src:`desktop/${file}`,focus:box,click});
    await writeFile(join(output,"capture-progress.json"),JSON.stringify({width:2560,height:1440,desktop:true,exampleData:true,chapters,total:chapters.reduce((sum,row)=>sum+row.duration,0)},null,2));
    console.log(`Desktop capture: ${file}`);
  }
  async function go(path) {
    await page.goto(`${state.origin}${path}`,{waitUntil:"domcontentloaded"});
    await page.getByRole("button",{name:"Open account menu for TutorialPlayer"}).waitFor();
  }
  const account = page.getByRole("button",{name:"Open account menu for TutorialPlayer"});
  let item = chapter("Open Account Settings","Open your profile menu, then click Account Settings. This is the actual desktop website.",12,"/settings");
  await shot(item,0,"topbar",account);
  await account.click();
  const settingsLink = page.getByRole("link",{name:"Account Settings",exact:true});
  await shot(item,4,"account-menu",settingsLink);
  await settingsLink.click();
  await page.getByRole("heading",{name:"Settings",exact:true}).waitFor();
  await shot(item,8,"settings",page.getByRole("button",{name:/^Connections Gaming/}),false);

  item = chapter("Connect Discord","Account Settings > Connections > Discord: connect, authorize on Discord and join the Topfragg server. Sync role if needed.",16,"/settings#settings-discord");
  const connections = page.getByRole("button",{name:/^Connections Gaming/});
  await shot(item,0,"connections",connections);
  await connections.click();
  const discordShortcut=page.locator('.settings-shortcuts').getByRole('button',{name:'Discord',exact:true});
  await shot(item,3,"discord-shortcut",discordShortcut);
  await discordShortcut.click();
  const connect=page.getByRole('button',{name:'Connect Discord',exact:true});
  await shot(item,6,"connect-discord",connect);
  await connect.click();
  const sync=page.getByRole('button',{name:'Sync role',exact:true});
  await sync.waitFor();
  await shot(item,11,"discord-connected",sync);
  await sync.click();
  await shot(item,14,"discord-synced",sync,false);

  item = chapter("Save your Activision ID","Connections > Gaming IDs > Edit: enter your full Activision ID, including #numbers where applicable, then Save Changes.",14,"/settings#settings-gaming");
  await page.locator('.settings-shortcuts').getByRole('button',{name:'Gaming IDs',exact:true}).click();
  const gaming=page.locator('#gaming-ids');
  const edit=gaming.getByRole('button',{name:'Edit',exact:true});
  await shot(item,0,"gaming-ids",edit);
  await edit.click();
  const activision=gaming.getByPlaceholder('PlayerName#1234567');
  await shot(item,3,"edit-id",activision);
  await activision.fill('TutorialPlayer#1234567');
  const saveIds=gaming.getByRole('button',{name:'Save Changes',exact:true});
  await shot(item,7,"activision-entered",saveIds);
  await saveIds.click();
  await edit.waitFor();
  await shot(item,11,"activision-saved",activision,false);

  item = chapter("Choose your game rank","Account > Game rank: Titan = Diamond, Master = Crimson, Apex = Iridescent. Legend = Top 250 and requires admin approval.",14,"/settings#settings-rank");
  await go('/settings#settings-rank');
  const rank=page.getByRole('combobox',{name:'Your game rank'});
  await rank.waitFor();
  await shot(item,0,"game-rank",rank);
  await rank.selectOption('diamond');
  const saveRank=page.getByRole('button',{name:'Save rank',exact:true});
  await shot(item,5,"rank-selected",saveRank);
  await saveRank.click();
  await page.getByText('Your game rank has been saved.',{exact:true}).waitFor();
  await shot(item,10,"rank-saved",page.locator('#settings-rank'),false);

  item = chapter("Find a Free 8s lobby","Open Free 8s, choose your game and switch to Matchfinder. Check 2v2 / 3v3 / 4v4 and the game mode, then Accept This Match.",12,"/ranked/8s#matchfinder");
  await go('/ranked/8s');
  const matchfinder=page.locator('.leaderboard-surface').getByRole('button',{name:'Matchfinder',exact:true});
  await shot(item,0,"free-8s",matchfinder);
  await matchfinder.click();
  const accept=page.getByRole('button',{name:'Accept This Match',exact:true});
  await accept.waitFor();
  await shot(item,5,"matchfinder",accept);
  await accept.click();
  const voice=page.getByRole('region',{name:'Free 8s Discord voice readiness'});
  await voice.waitFor();
  await shot(item,9,"matchroom",voice,false);

  item = chapter("Join this match's Waiting Room","In the matchroom, click Join 8s Waiting Room. Connect in Discord with your linked account and stay in this match's room.",12,"/ranked/8s");
  const joinVoice=voice.getByRole('link',{name:'Join 8s Waiting Room',exact:true});
  await joinVoice.waitFor();
  await shot(item,0,"join-discord-voice",joinVoice);
  // The external Discord app is not impersonated or opened. Only the example bot observation changes.
  state.inVoice=true;
  await page.waitForTimeout(1300);
  await shot(item,7,"waiting-room-ready",voice,false);

  item = chapter("Teams and voice are automatic","Once the lobby is full and everyone is in its Waiting Room, teams are assigned and the bot moves players to team voice. Follow the matchroom's maps and instructions.",10,"/ranked/8s");
  state.teamsReady=true;
  Object.assign(state.match,{free_eights_waiting_for_voice:false,teams_generated_at:new Date().toISOString(),
    series_maps:[{name:'Den',mode:'Hardpoint'},{name:'Hacienda',mode:'Search & Destroy'},{name:'Sake',mode:'Hardpoint'}]});
  await page.waitForTimeout(1400);
  await page.reload({waitUntil:'domcontentloaded'});
  await voice.waitFor();
  await shot(item,0,"teams-ready",voice,false);
  await shot(item,5,"team-voice",page.getByText('Team Voice',{exact:true}).first(),false);

  item = chapter("Using the sidebar? Same setup.","The sidebar has the same Free 8s and Account Settings links. Your Discord, Activision ID and game rank setup carries across both layouts.",10,"/ranked/8s");
  state.user.navigation_layout='sidebar';
  await go('/ranked/8s');
  await shot(item,0,"desktop-sidebar",account);
  await account.hover();
  await shot(item,5,"sidebar-account-menu",page.getByRole('link',{name:'Account Settings',exact:true}),false);
  const manifest={width:2560,height:1440,desktop:true,exampleData:true,chapters,total:chapters.reduce((sum,row)=>sum+row.duration,0)};
  await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2));
  console.log(`Captured ${chapters.length} chapters from the real desktop application.`);
} finally {await browser.close();await server.close();}
