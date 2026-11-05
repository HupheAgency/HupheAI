import {enhanceVideoCapability,buildVideoGenerationRequest,SEEDANCE,VEO,WAN,KLING} from '../supabase/functions/_shared/video-generation-contract';
import {app,BrowserWindow,protocol,dialog,ipcMain} from 'electron';
import {writeFile,mkdir,readFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {registerVideoTimelineIPC} from '../src/main/video-timeline-ipc';
import {serveLocalMedia} from '../src/main/lib/local-media-response';
import {requireTimelineTools,runTimelineTool} from '../src/main/lib/video-timeline-media';
const work=process.env.TEST_WORK,fixtures=process.env.TEST_FIXTURES;
app.setPath('userData',join(work,'user-data-'+process.env.TEST_RUN_ID));
protocol.registerSchemesAsPrivileged([{scheme:'huphe',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
let window,generated=0,finalized=0,expectedGenerationClip,expectedGenerationSettings,expectedReferenceTask,trackDeletionGeneration;const preparedReferenceCalls=[];const queue=[];const passes=[];let rendererErrors=[];
let currentContracts=false;
const contractRequests=[];
const currentCaps=[SEEDANCE,VEO,WAN,KLING].map(id=>enhanceVideoCapability({model_id:id,provider:'fal',markup_pct:0,video_cost_estimate:10000,
 supported_durations:id===SEEDANCE?Array.from({length:27},(_,i)=>i+4):[5,10],supported_resolutions:id===KLING?['1080p']:['480p','720p','1080p'],
 supported_aspect_ratios:['16:9','9:16','1:1',...(id===SEEDANCE?['auto']:[])],generate_audio:id!==WAN,seed:id===SEEDANCE,bitrate_mode:id===SEEDANCE,codec:id===SEEDANCE,
 supports_end_image:[SEEDANCE,KLING].includes(id),supports_references:id===SEEDANCE,reference_limits:id===SEEDANCE?{image:30,video:10,audio:10}:undefined,
 supports_auto_duration:id===SEEDANCE,supports_draft:id===SEEDANCE,draft_rate_per_second:0.005,draft_finalize_rate_per_second:0.01,pricing_skus:{duration_seconds:'0.01'}}));
const audioVideoFile=join(work,'source-C-with-audio.mp4');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const js=code=>window.webContents.executeJavaScript(code,true).catch(e=>{console.error("JS-FOUT in:",String(code).slice(0,260));throw e;});
async function until(code,label,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){if(await js(code))return;await sleep(70)}throw Error('Timeout: '+label+' '+await js('document.body.innerText.slice(0,1800)'));}
const LABELS={'⏮':'Naar begin','▶':'Afspelen','＋ Videospoor':'Videospoor toevoegen','＋ Audiospoor':'Audiospoor toevoegen','＋ Leeg blok':'Leeg blok','＋ Video toevoegen':'Video toevoegen','♫ Audio toevoegen':'Audio toevoegen','＋ Afbeelding toevoegen':'Afbeelding toevoegen','Nieuw':'Nieuw project','Exporteer film ↗':'Film exporteren'};
async function click(text){await js("document.querySelectorAll('.vt-more').forEach(d=>d.open=true)");let scope='';if(text.includes(' › ')){[scope,text]=text.split(' › ')}text=LABELS[text]||text.replace(/^Varianten \(\d+\)$/,'Varianten');const pos=await js(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(scope?`[aria-label="${scope}"] button`:'button')})].find(e=>(e.textContent.trim()===${JSON.stringify(text)}||e.getAttribute('aria-label')===${JSON.stringify(text)})&&e.getClientRects().length);if(!el)throw Error('Button missing '+${JSON.stringify(text)});if(el.disabled)throw Error('Button disabled '+${JSON.stringify(text)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...pos});window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...pos});await sleep(150);}
async function input(selector,value){await js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Input missing '+${JSON.stringify(selector)});const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(String(value))});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);await sleep(120);}
async function selectClip(index){await js(`(()=>{const el=document.querySelectorAll('[data-clip-id]')[${index}];el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()`);await click('Fragment');}
async function dragClip(index, handle, pixels) {
 const point=await js(`(()=>{const block=document.querySelectorAll('[data-clip-id]')[${index}]; const el=handlePlaceholder; const r=el.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`.replace('handlePlaceholder',handle ? `block.querySelector('.vt-handle.${handle}')` : 'block'));
 window.webContents.sendInputEvent({type:'mouseMove',...point});
 window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
 for(let i=1;i<=4;i++){window.webContents.sendInputEvent({type:'mouseMove',x:point.x+Math.round(pixels*i/4),y:point.y,modifiers:['leftbuttondown']});await sleep(40)}
 window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:point.x+pixels,y:point.y});await sleep(180);
}
async function drawEmptyBlocks() {
 const count=()=>js("document.querySelectorAll('[data-clip-id]').length");
 const geometry=()=>js("[...document.querySelectorAll('[data-clip-id]')].map(e=>({id:e.dataset.clipId,left:e.style.left,width:e.style.width}))");
 const history=async redo=>{await js(`document.querySelector('[aria-label="${redo ? 'Opnieuw' : 'Ongedaan maken'}"]').click()`);await sleep(120);};
 const point=async seconds=>js(`(()=>{const r=document.querySelector('.vt-lane[data-track="video"]').getBoundingClientRect();return {x:Math.round(r.left+${seconds}*Number(document.querySelector('[aria-label="Tijdlijnzoom"]').dataset.zoom)),y:Math.round(r.top+r.height/2)}})()`);
 const begin=async(from,to)=>{
  await click('⏮'); // Keep the separate playhead drag handle away from the drawing gesture.
  const start=await point(from),end=await point(to);
  window.webContents.sendInputEvent({type:'mouseMove',...start});window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...start});
  for(let i=1;i<=6;i++){window.webContents.sendInputEvent({type:'mouseMove',x:Math.round(start.x+(end.x-start.x)*i/6),y:end.y,modifiers:['leftbuttondown']});await sleep(25);}
  return end;
 };
 const release=async end=>{window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...end});await sleep(150);};
 const selected=async(start,duration)=>{
  await until("!!document.querySelector('[data-clip-id].selected') && !document.querySelector('.vt-block-draft')",'newly drawn block selected');
  assert.equal(await js("document.querySelector('.vt-tabs button.active').getAttribute('aria-label')"),'Genereren','Na tekenen staat direct de generatiezijbalk klaar');
  assert.match(await js("document.querySelector('[data-testid=timeline-block-duration]').textContent"),new RegExp(`\\b${String(duration).replace('.', '[.,]')}\\s*s\\b`),'De generatiezijbalk toont de getekende montageduur apart');
  const actual=await js("(()=>{const el=document.querySelector('[data-clip-id].selected'),zoom=Number(document.querySelector('[aria-label=\"Tijdlijnzoom\"]').dataset.zoom);return {start:parseFloat(el.style.left)/zoom,duration:parseFloat(el.style.width)/zoom}})()");
  assert.deepEqual(actual,{start,duration},'Getekend blok gebruikt de gekozen begin- en eindtijd');
 };
 assert.equal(await count(),0);
 const clickPoint=await point(8);window.webContents.sendInputEvent({type:'mouseMove',...clickPoint});window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...clickPoint});await release(clickPoint);
 assert.equal(await count(),0,'Een losse klik op lege ruimte maakt geen blok');
 let end=await begin(8,12);
 assert.equal(await count(),0,'Tijdens tekenen staat er alleen een voorstel, nog geen opgeslagen blok');
 const draft=await js("(()=>{const el=document.querySelector('.vt-block-draft');return el&&{left:parseFloat(el.style.left),width:parseFloat(el.style.width),text:el.textContent}})()");
 assert.ok(draft,'Tijdens het slepen is een leeg blok zichtbaar');assert.equal(draft.left,320);assert.equal(draft.width,160);assert.match(draft.text,/4(?:[.,]0+)?\s*s/,'Het voorstel toont de gekozen duur');
 await writeFile(join(work,'artifacts','draw-empty-block.png'),(await window.webContents.capturePage()).toPNG());
 await release(end);await selected(8,4);assert.equal(await count(),1);
 const projectId=await js("localStorage.getItem('huphe:timeline:last-project')");let saved;
 const saveDeadline=Date.now()+5000;
 do{try{saved=JSON.parse(await readFile(join(process.env.HUPHE_TIMELINE_ROOT,projectId,'project.json'),'utf8'));}catch{}if(saved?.clips.length===1)break;await sleep(100);}while(Date.now()<saveDeadline);
 assert.equal(saved?.clips.length,1,'Getekende blokken worden automatisch bewaard');assert.equal(saved.clips[0].start,200);assert.equal(saved.clips[0].duration,100);assert.equal(saved.clips[0].generation.requestedDuration,4);assert.equal(saved.clips[0].variants.length,0);
 await history(false);assert.equal(await count(),0,'Eén undo verwijdert het hele getekende blok');await history(true);assert.equal(await count(),1,'Redo herstelt het getekende blok');await history(false);
 end=await begin(12,8);await release(end);await selected(8,4);await history(false);
 end=await begin(8,12.96);await release(end);await selected(8,4.96);
 const fractional=(await geometry())[0];
 await until("!document.querySelector('[aria-label=Videomodel]').disabled",'model list for fractional block');
 await input('[aria-label="Videomodel"]','bytedance/seedance-2.5');
 assert.equal(await js("document.querySelector('[aria-label=Generatieduur]').getAttribute('aria-valuetext')"),'5 seconden','Een getekend blok van 4.96 s vraagt bij de eerste modelkeuze de ondersteunde 5 s aan');
 assert.deepEqual((await geometry())[0],fractional,'De eerste modelkeuze bewaart de getekende 4.96 seconden op de montage');
 await history(false);await history(false);assert.equal(await count(),0);
 end=await begin(8,12);assert.equal(await js("!!document.querySelector('.vt-block-draft')"),true,'Annuleren wordt tijdens een actief tekengebaar getest');window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await release(end);
 assert.equal(await count(),0,'Escape annuleert het getekende voorstel');assert.equal(await js("!!document.querySelector('.vt-block-draft')"),false);
 await input('[aria-label="Tijdlijnzoom"]',100*Math.log(80/6)/Math.log(1000/6));await js("document.querySelector('.vt-scroll').scrollLeft=160");await sleep(100);assert.equal(await js("document.querySelector('.vt-scroll').scrollLeft"),160);
 end=await begin(8,12);await release(end);await selected(8,4);await history(false);
 await input('[aria-label="Tijdlijnzoom"]',100*Math.log(40/6)/Math.log(1000/6));await js("document.querySelector('.vt-scroll').scrollLeft=0");await sleep(100);
 end=await begin(8,12);await release(end);const existing=(await geometry())[0];
 end=await begin(6,14);await release(end);await selected(6,2);
 assert.deepEqual((await geometry()).find(e=>e.id===existing.id),existing,'Een bestaand blok blijft staan als de tekening zijn grens raakt');await history(false);
 end=await begin(14,6);await release(end);await selected(12,2);
 assert.deepEqual((await geometry()).find(e=>e.id===existing.id),existing,'Ook achteruit tekenen loopt niet door een bestaand blok');await history(false);await history(false);
 assert.equal(await count(),0,'De tekentest laat een lege montage achter');await click('⏮');
}
async function scrub(startSeconds,endSeconds,fromPlayhead=false) {
 const points=await js(`(()=>{const ruler=document.querySelector('.vt-ruler').getBoundingClientRect();const zoom=Number(document.querySelector('[aria-label="Tijdlijnzoom"]').dataset.zoom);const head=document.querySelector('.vt-playhead').getBoundingClientRect();return {start:{x:Math.round(${fromPlayhead} ? head.x+head.width/2 : ruler.left+${startSeconds}*zoom),y:Math.round(${fromPlayhead} ? ruler.bottom+30 : ruler.top+ruler.height/2)},end:{x:Math.round(ruler.left+${endSeconds}*zoom),y:Math.round(ruler.bottom+95)}}})()`);
 window.webContents.sendInputEvent({type:'mouseMove',...points.start});
 window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...points.start});
 for(let i=1;i<=6;i++){window.webContents.sendInputEvent({type:'mouseMove',x:Math.round(points.start.x+(points.end.x-points.start.x)*i/6),y:Math.round(points.start.y+(points.end.y-points.start.y)*i/6),modifiers:['leftbuttondown']});await sleep(35)}
 const sourceSeconds=endSeconds<3 ? 2+endSeconds : 1+endSeconds-3;
 // Assert both the transport and decoded preview while the mouse is still held.
 await until(`(()=>{const d=document.querySelector('.vt canvas').dataset;return Math.abs(Number(document.querySelector('.vt-playhead').getAttribute('aria-valuenow'))-${endSeconds})<0.001&&d.previewState==='paused'&&Math.abs(Number(d.timelineTime)-${endSeconds})<0.001&&d.mediaTime!==''&&Math.abs(Number(d.mediaTime)-${sourceSeconds})<0.041})()`, 'scrub preview before mouse release');
 window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...points.end});
 window.webContents.sendInputEvent({type:'mouseMove',x:points.end.x+32,y:points.end.y});await sleep(120);
 assert.equal(await js("Number(document.querySelector('.vt-playhead').getAttribute('aria-valuenow'))"),endSeconds,'Loslaten buiten de liniaal stopt het slepen');
}
async function rapidScrubPixels() {
 // Sample compositor pixels, not currentTime or transport attributes. The custom
 // media protocol taints renderer canvases; native capture also avoids forcing readback there.
 // Both fixtures have a colored background and a source/frame barcode, with a long GOP.
 await scrub(1,1.2);
 const canvas=await js("(()=>{const r=document.querySelector('.vt canvas').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:innerWidth}})()");
 const samples=[];
 window.webContents.beginFrameSubscription(false,image=>{
  const scale=image.getSize().width/canvas.viewportWidth;
  const point=(x,y)=>({x:Math.round((canvas.x+canvas.width*x/1920)*scale),y:Math.round((canvas.y+canvas.height*y/1080)*scale)});
  const pixel=image.crop({...point(50,600),width:1,height:1}).toBitmap();
  const stripImage=image.crop({...point(160,960),width:Math.round(canvas.width*1280/1920*scale),height:1});
  const strip=stripImage.toBitmap(),width=stripImage.getSize().width;
  let barcode=0;for(let bit=0;bit<16;bit++){if(strip[Math.floor((bit+0.5)*width/16)*4]>128)barcode|=1<<bit;}
  samples.push({t:Date.now(),rgb:[pixel[2],pixel[1],pixel[0],pixel[3]],source:barcode>>8,frame:barcode&255});
 });
 const points=await js(`(()=>{const ruler=document.querySelector('.vt-ruler').getBoundingClientRect();const zoom=Number(document.querySelector('[aria-label="Tijdlijnzoom"]').dataset.zoom);return {left:ruler.left,zoom,y:Math.round(ruler.top+ruler.height/2)}})()`);
 const pointer=seconds=>({x:Math.round(points.left+seconds*points.zoom),y:points.y});
 const start=pointer(1.2);
 window.webContents.sendInputEvent({type:'mouseMove',...start});
 window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...start});
 // Keep moving in both directions for several seconds, including crossing the cut.
 for(let sweep=0;sweep<8;sweep++){
  const from=sweep%2 ? 6.2 : 0.6,to=sweep%2 ? 0.6 : 6.2;
  for(let step=0;step<=24;step++){
   window.webContents.sendInputEvent({type:'mouseMove',...pointer(from+(to-from)*step/24),modifiers:['leftbuttondown']});
   await sleep(16);
  }
 }
 const movingSamples=samples.slice();
 const target=4.2;
 window.webContents.sendInputEvent({type:'mouseMove',...pointer(target),modifiers:['leftbuttondown']});
 const settledBy=Date.now()+5000;
 while(Date.now()<settledBy && !(samples.at(-1)?.source===2&&Math.abs(samples.at(-1).frame-55)<=1))await sleep(30);
 const finalFrame=samples.at(-1);
 window.webContents.endFrameSubscription();
 window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...pointer(target)});
 const blackSamples=samples.filter(s=>s.rgb[3]===0 || Math.max(...s.rgb.slice(0,3))<16);
 const visibleFrames=new Set(movingSamples.filter(s=>s.source===1||s.source===2).map(s=>s.source+':'+s.frame));
 const summary={samples:samples.length,movingSamples:movingSamples.length,blackFrames:blackSamples.length,distinctFramesWhileMoving:visibleFrames.size,sourcesWhileMoving:[...new Set(movingSamples.map(s=>s.source))],firstBlackFrames:blackSamples.slice(0,8),finalFrame};
 await writeFile(join(work,'artifacts','scrub-pixels.json'),JSON.stringify({summary,samples},null,2));
 assert.ok(movingSamples.length>=30,'Snelle scrub moet langdurig worden gemeten');
 assert.equal(blackSamples.length,0,'Tijdens snel slepen blijft een geldig beeld zichtbaar; zie scrub-pixels.json');
 assert.ok(visibleFrames.size>=6,'De zichtbare preview blijft tijdens de beweging nieuwe bronframes tonen');
 assert.deepEqual(summary.sourcesWhileMoving.sort(),[1,2],'Ook over de knip blijven echte bronbeelden zichtbaar');
 assert.ok(finalFrame?.source===2&&Math.abs(finalFrame.frame-55)<=1,'De preview toont het juiste bronframe vóór loslaten');
 return summary;
}
async function importFile(kind,file){queue.push(join(fixtures,file));await click(kind==='video'?'＋ Video toevoegen':'♫ Audio toevoegen');await until("!document.body.innerText.includes('Media toevoegen…')",'import');}
async function generationDurationKey(key) {
 await js("document.querySelector('[aria-label=Generatieduur]').focus()");
 window.webContents.sendInputEvent({type:'keyDown',keyCode:key});window.webContents.sendInputEvent({type:'keyUp',keyCode:key});await sleep(120);
}
async function generationDurationControls(projectId) {
 const geometry=()=>js("(()=>{const el=document.querySelector('[data-clip-id].selected');return {id:el.dataset.clipId,left:el.style.left,width:el.style.width}})()");
 const rangeBounds=()=>js("(()=>{const e=document.querySelector('[aria-label=Generatieduur]');return {tag:e.tagName,type:e.type,min:Number(e.min),max:Number(e.max),step:Number(e.step)}})()");
 const requested=()=>js("Number.parseFloat(document.querySelector('[aria-label=Generatieduur]').getAttribute('aria-valuetext').replace(',','.'))");
 assert.equal(await js("document.querySelector('[aria-label=Generatieduur]').disabled"),true,'Kies eerst een model voor diens ondersteunde generatieduren');
 const original=await geometry();
 await input('[aria-label="Videomodel"]','bytedance/seedance-2.5');
 assert.deepEqual(await rangeBounds(),{tag:'INPUT',type:'range',min:0,max:1,step:1},'De schuifbalk heeft alleen posities voor ondersteunde modelduren');
 assert.equal(await requested(),4);
 await generationDurationKey('Right');
 assert.equal(await requested(),5);assert.deepEqual(await geometry(),original,'Een langere generatieaanvraag wijzigt het montageblok niet');
 await click('Fragment');await input('[aria-label="Lengte fragment"]',3.52);
 const trimmed=await geometry();assert.equal(parseFloat(trimmed.width),3.52*40,'De montageduur blijft op frames nauwkeurig instelbaar');
 await click('Genereren');assert.equal(await requested(),5,'Trimmen verandert de generatieaanvraag niet');
 await input('[aria-label="Generatieduur"]',0);assert.equal(await requested(),4);assert.deepEqual(await geometry(),trimmed,'Generatieduur wijzigen bewaart de bestaande uitsnede');
 await input('[aria-label="Videomodel"]','fal-ai/veo3.1');
 assert.deepEqual(await rangeBounds(),{tag:'INPUT',type:'range',min:0,max:1,step:1},'Ook een model met een grotere stap heeft alleen ondersteunde schuifposities');assert.equal(await requested(),6,'Modelwissel kiest een passende ondersteunde aanvraagduur');
 await input('[aria-label="Generatieduur"]',1);assert.equal(await requested(),10,'De tweede schuifpositie springt van 6 naar de ondersteunde 10 seconden');
 assert.deepEqual(await geometry(),trimmed,'Modelwissel rekt het montageblok niet op');
 await input('[aria-label="Videomodel"]','bytedance/seedance-2.5');assert.equal(await requested(),5,'Terugwisselen begrenst de eerdere aanvraagduur tot het maximum van het nieuwe model');assert.deepEqual(await geometry(),trimmed);
 await input('[aria-label="Generatieduur"]',0);assert.equal(await requested(),4);assert.deepEqual(await geometry(),trimmed);
 await js("document.querySelector('[aria-label=Generatieduur]').scrollIntoView({block:'center'})");
 await writeFile(join(work,'artifacts','generation-duration.png'),(await window.webContents.capturePage()).toPNG());
 expectedGenerationClip={id:original.id,projectId,frames:88,requestedDuration:4};
}
async function legacyGenerationDuration(projectId,clipId) {
 // Reopen a test-only project with the fractional request written by the old UI.
 // Existing variants/job snapshots must retain their original valid request.
 await sleep(600); // Let the latest autosave finish before preparing the legacy fixture.
 const path=join(process.env.HUPHE_TIMELINE_ROOT,projectId,'project.json');
 const legacy=JSON.parse(await readFile(path,'utf8'));
 legacy.clips.find(c=>c.id===clipId).generation.requestedDuration=3.52;
 await writeFile(path,JSON.stringify(legacy,null,2));
 await window.webContents.reload();await until("document.querySelector('input[placeholder=\"Beschrijf je video…\"]')",'reload legacy request');await click('Timeline');
 await until(`!!document.querySelector('[data-clip-id="${clipId}"]')`,'legacy clip restored');
 await js(`document.querySelector('[data-clip-id="${clipId}"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);await click('Genereren');
 await until("!document.querySelector('[aria-label=Videomodel]')?.disabled",'legacy capabilities loaded');
 assert.equal(await js("document.querySelector('[aria-label=Generatieduur]').getAttribute('aria-valuetext')"),'Kies een generatieduur','Een oude ongeldige duur vraagt om een expliciete nieuwe keuze');
 assert.equal(await js("document.querySelector('[aria-label=Generatieduur]').getAttribute('aria-invalid')"),'true','De schuifbalk markeert de oude aanvraag als ongeldig');
 assert.equal(await js("[...document.querySelectorAll('.vt button')].find(e=>e.textContent.trim()==='Genereer').disabled"),true,'Een ongeldige oude duur kan niet ongemerkt worden verstuurd');
 assert.equal(JSON.parse(await readFile(path,'utf8')).clips.find(c=>c.id===clipId).generation.requestedDuration,3.52,'Heropenen vervangt de oude aanvraagduur niet stilzwijgend');
 await generationDurationKey('Home');
 assert.equal(await js("document.querySelector('[aria-label=Generatieduur]').getAttribute('aria-valuetext')"),'4 seconden','Ook de eerste schuifpositie kan expliciet gekozen worden wanneer de knop daar al staat');
 assert.notEqual(await js("document.querySelector('[aria-label=Generatieduur]').getAttribute('aria-invalid')"),'true');
 await click('Opslaan');
 const repaired=JSON.parse(await readFile(path,'utf8')),clip=repaired.clips.find(c=>c.id===clipId);
 assert.equal(clip.generation.requestedDuration,4);assert.equal(clip.duration,88,'De expliciete correctie verandert de montage niet');
 assert.equal(clip.variants.at(-1).generation.requestedDuration,4,'De bestaande variantsnapshot blijft intact');
 assert.equal(generated,1,'Een duur kiezen of corrigeren start geen nieuwe generatie');
}
async function generationSettingsParity(projectId,clipId) {
 const projectPath=join(process.env.HUPHE_TIMELINE_ROOT,projectId,'project.json');
 const readProject=async()=>JSON.parse(await readFile(projectPath,'utf8'));
 const saveProject=async()=>{await until("[...document.querySelectorAll('.vt button')].some(e=>(e.textContent.trim()||e.getAttribute('aria-label'))==='Opslaan'&&!e.disabled)",'media action completed before save');await click('Opslaan');return readProject();};
 const selectedClip=p=>p.clips.find(c=>c.id===clipId);
 const selectVideo=async()=>{await js(`document.querySelector('[data-clip-id="${clipId}"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);await click('Genereren');};
 const setSwitch=async(label,value)=>{
  await js(`(()=>{const e=document.querySelector('.vt [role="switch"][aria-label="${label}"]');if(!e)throw Error('Switch ontbreekt: ${label}');if(e.checked!==${value}){if(e.disabled)throw Error('Switch disabled: ${label}');e.click();}})()`);await sleep(120);
 };
 const openAdvanced=async()=>{await js("(()=>{const e=[...document.querySelectorAll('.vt summary')].find(e=>e.textContent.trim()==='Geavanceerd');if(!e)throw Error('Geavanceerd ontbreekt');if(!e.parentElement.open)e.click();})()");await sleep(80);};
 const variantAction=async(id,label)=>{await js(`(()=>{const card=document.querySelector('[data-variant-id="${id}"]');const button=[...card.querySelectorAll('button')].find(e=>(e.textContent.trim()||e.getAttribute('aria-label'))===${JSON.stringify(label)});if(!button||button.disabled)throw Error('Variantactie niet beschikbaar: '+${JSON.stringify(label)});button.click();})()`);await sleep(150);};
 const awaitVariants=async count=>{await sleep(300);await js("document.querySelector('.vt-tabs [aria-label=Varianten]')?.click()");return until(`document.querySelectorAll('.vt-inspector [data-variant-id]').length===${count}`,'new variant visible')};
 await selectVideo();const before=await saveProject(),beforeClip=structuredClone(selectedClip(before));
 await js("document.querySelector('[aria-label=\"Automatische generatieduur\"]').click()");await sleep(120);
 assert.equal(await js("document.querySelector('[aria-label=Generatieduur]').disabled"),true,'Auto maakt de handmatige schuifbalk inactief');
 assert.equal(await js("document.querySelector('[aria-label=\"Automatische generatieduur\"]').getAttribute('aria-pressed')"),'true');
 await js("document.querySelector('[aria-label=\"Automatische generatieduur\"]').click()");await sleep(120);
 assert.equal(await js("document.querySelector('[aria-label=Generatieduur]').getAttribute('aria-valuetext')"),'4 seconden');
 await setSwitch('Audio genereren',true);await setSwitch('Draft',true);await openAdvanced();
 await input('[aria-label="Bitrate"]','high');await input('[aria-label="Codec"]','H265');
 expectedGenerationSettings={duration:4,resolution:'480p',generateAudio:true,draft:true,bitrateMode:'high',codec:'H265'};
 await writeFile(join(work,'artifacts','generation-settings.png'),(await window.webContents.capturePage()).toPNG());
 await click('Genereer');await awaitVariants(beforeClip.variants.length+1);assert.equal(generated,2);
 let saved=await saveProject(),clip=selectedClip(saved),draft=clip.variants.find(v=>v.draftId==='fixture-draft-1');
 assert.ok(draft,'De draft wordt als een eigen variant bewaard');assert.equal(draft.draftDuration,4);assert.equal(draft.generation.resolution,'480p');assert.equal(draft.generation.draft,true);
 assert.equal(clip.duration,88);assert.equal(clip.activeVariantId,draft.id,'Een nieuw resultaat wordt direct het actieve fragment');assert.deepEqual(clip.variants.slice(0,beforeClip.variants.length),beforeClip.variants,'Een draft toevoegen bewaart alle bestaande varianten');
 const immutableDraft=structuredClone(draft);
 await variantAction(draft.id,'Render naar 1080p');await awaitVariants(beforeClip.variants.length+2);assert.equal(finalized,1);
 saved=await saveProject();clip=selectedClip(saved);const final=clip.variants.find(v=>v.finalizedFromVariantId===draft.id);
 assert.ok(final,'Finaliseren voegt een gekoppelde eindvariant toe');assert.equal(final.generation.resolution,'1080p');assert.equal(final.generation.draft,false);
 assert.deepEqual(clip.variants.find(v=>v.id===draft.id),immutableDraft,'Finaliseren overschrijft de draft niet');assert.equal(clip.activeVariantId,final.id,'De eindvariant wordt direct actief');assert.equal(clip.duration,88);
 await writeFile(join(work,'artifacts','draft-final-variants.png'),(await window.webContents.capturePage()).toPNG());
 passes.push('Volledige video-instellingen, 480p-draft en aparte 1080p-eindvariant met behoud van draft, snapshot en actieve montage');
 await variantAction(final.id,'Geluid op audiospoor');
 saved=await saveProject();clip=selectedClip(saved);const addedAudio=saved.clips.filter(c=>c.track==='audio'&&!before.clips.some(old=>old.id===c.id));
 assert.equal(addedAudio.length,1,'Generatiegeluid wordt als een apart monteerbaar audiospoor toegevoegd');assert.equal(addedAudio[0].start,clip.start);assert.equal(addedAudio[0].duration,clip.duration);assert.equal(addedAudio[0].variants[0].inPoint,final.inPoint);
 const audioAsset=saved.assets.find(a=>a.id===addedAudio[0].variants[0].assetId);assert.equal(audioAsset.kind,'audio');assert.ok(audioAsset.duration>=3.52);assert.ok((await readFile(resolve(process.env.HUPHE_TIMELINE_ROOT,projectId,audioAsset.path))).byteLength>100,'Audio-extractie schrijft een echt lokaal mediabestand');
 passes.push('Geluid uit een lokale videofixture via FFmpeg als apart audiospoor met dezelfde starttijd en uitsnede');
 await selectVideo();const montageBeforeRefs=saved.clips.map(c=>({id:c.id,start:c.start,duration:c.duration}));
 for(const [label,file] of [['＋ Beeldreferentie','reference.png'],['＋ Videoreferentie','source-A.mp4'],['＋ Audioreferentie','baseline.wav']]){queue.push(join(fixtures,file));await click(label);await until("!document.body.innerText.includes('Media toevoegen…') && !document.body.innerText.includes('Referentie toevoegen…')",'reference import');}
 saved=await saveProject();clip=selectedClip(saved);
 assert.equal(clip.generation.referenceAssetIds.length,3,'Beeld-, video- en audioreferentie zijn gekoppeld aan dit blok');assert.deepEqual(saved.clips.map(c=>({id:c.id,start:c.start,duration:c.duration})),montageBeforeRefs,'Referenties toevoegen maakt geen montageblokken');
 assert.equal(clip.generation.referenceAssetId,beforeClip.generation.referenceAssetId,'Startbeeld blijft bewaard naast referenties');assert.equal(clip.generation.endImageAssetId,beforeClip.generation.endImageAssetId,'Eindbeeld blijft bewaard naast referenties');
 assert.equal(await js("document.querySelector('.vt [role=switch][aria-label=Draft]').disabled"),true,'Draft is niet beschikbaar met referentie-media');
 await click('Generatiemodus › Bewerken');await openAdvanced();await input('[aria-label="Seed"]',42);await input('[aria-label="Bitrate"]','high');await input('[aria-label="Codec"]','H265');
 expectedGenerationSettings={duration:'auto',aspectRatio:'auto',generateAudio:true,draft:false,seed:42,bitrateMode:'high',codec:'H265'};expectedReferenceTask='editing';
 await click('Genereer');await awaitVariants(beforeClip.variants.length+3);assert.equal(generated,3);
 saved=await saveProject();clip=selectedClip(saved);let latest=clip.variants.at(-1);
 assert.equal(latest.generation.task,'editing');assert.equal(latest.generation.requestedDuration,'auto');assert.equal(latest.generation.aspectRatio,'auto');assert.equal(latest.generation.seed,42);assert.equal(latest.generation.referenceAssetIds.length,3);assert.equal(clip.activeVariantId,latest.id,'Het nieuwste resultaat is direct actief');
 await selectVideo();await click('Verlengen');expectedReferenceTask='extension';
 await click('Genereer');await awaitVariants(beforeClip.variants.length+4);assert.equal(generated,4);
 saved=await saveProject();clip=selectedClip(saved);latest=clip.variants.at(-1);assert.equal(latest.generation.task,'extension');assert.equal(latest.generation.requestedDuration,'auto');assert.equal(clip.duration,88);assert.equal(clip.activeVariantId,latest.id,'Het nieuwste resultaat is direct actief');assert.deepEqual(clip.variants.find(v=>v.id===draft.id),immutableDraft);
 assert.equal(preparedReferenceCalls.length,2,'Referenties worden pas bij de twee expliciete aanvragen voorbereid');
 passes.push('Beeld/video/audio-referenties, Bewerken/Verlengen, Auto en geavanceerde opties gaan met lokale asset-IDs en exacte snapshots naar de simulator');
 await window.webContents.reload();await until("document.querySelector('input[placeholder=\"Beschrijf je video…\"]')",'reload video settings');await click('Timeline');await until(`!!document.querySelector('[data-clip-id="${clipId}"]')`,'generation settings restored');await selectVideo();
 await until("!document.querySelector('[aria-label=Videomodel]')?.disabled",'settings model loaded');
 assert.equal(await js("[...document.querySelectorAll('.vt button')].find(e=>e.textContent.trim()==='Verlengen').getAttribute('aria-pressed')"),'true');
 await openAdvanced();assert.equal(await js("document.querySelector('[aria-label=Seed]').value"),'42');assert.equal(await js("document.querySelector('[aria-label=Codec]').value"),'H265');assert.equal(await js("document.querySelector('[aria-label=Bitrate]').value"),'high');
 assert.equal(generated,4);assert.equal(finalized,1);passes.push('Heropenen bewaart referenties, werkmodus, geavanceerde instellingen en alle draft/eindvarianten');
}
async function assertEmptyGapClearsPreview() {
 await selectClip(1);await input('[aria-label="Start fragment"]',4);
 const point=await js("(()=>{const r=document.querySelector('.vt-ruler').getBoundingClientRect();return {x:Math.round(r.left+3.4*Number(document.querySelector('[aria-label=\"Tijdlijnzoom\"]').dataset.zoom)),y:Math.round(r.top+r.height/2)}})()");
 window.webContents.sendInputEvent({type:'mouseMove',...point});window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
 await until("Math.abs(Number(document.querySelector('.vt canvas').dataset.timelineTime)-3.4)<0.001 && document.querySelector('.vt canvas').dataset.mediaTime===''",'seek to empty interval');
 await sleep(200); // A late seek/decode completion must not repaint the previous clip here.
 const rect=await js("(()=>{const r=document.querySelector('.vt canvas').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),width:1,height:1}})()");
 const pixel=(await window.webContents.capturePage(rect)).toBitmap();
 assert.ok(Math.max(pixel[0],pixel[1],pixel[2])<8,'Een echt leeg interval wordt wel zwart; het vorige bronbeeld blijft daar niet hangen');
 await js("document.querySelector('[aria-label=\"Ongedaan maken\"]').click()");await sleep(120);await click('⏮');
}
async function multitrackEditing() {
 await click('Nieuw');await until("document.querySelectorAll('[data-clip-id]').length===0",'new multitrack project');
 await importFile('video','source-A.mp4');await importFile('video','source-B.mp4');
 const projectId=await js("localStorage.getItem('huphe:timeline:last-project')");
 const save=async()=>{await click('Opslaan');return JSON.parse(await readFile(join(process.env.HUPHE_TIMELINE_ROOT,projectId,'project.json'),'utf8'));};
 const select=async id=>{await js(`document.querySelector('[data-clip-id="${id}"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);await click('Fragment');};
 const undo=async redo=>{await js(`document.querySelector('[aria-label="${redo?'Opnieuw':'Ongedaan maken'}"]').click()`);await sleep(120);};
 const drop=async(assetId,track,seconds,{fresh=false,valid=true}={})=>{
  const selector=fresh?`[data-new-track="${track}"]`:`.vt-lane[data-track-id="${track}"]`;
  const feedback=await js(`(()=>{
   const source=document.querySelector('[data-asset-id="${assetId}"]'),target=document.querySelector(${JSON.stringify(selector)}),dataTransfer=new DataTransfer();
   if(!source.draggable)throw Error('Projectmedia card is not draggable');target.scrollIntoView({block:'nearest'});
   source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer}));
   const r=target.getBoundingClientRect(),x=${fresh?'r.left+r.width/2':`r.left+${seconds}*Number(document.querySelector('[aria-label=Tijdlijnzoom]').dataset.zoom)`},y=r.top+r.height/2;
   target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer,clientX:x,clientY:y}));
   window.__dropFixture={source,target,dataTransfer,x,y};return dataTransfer.getData('application/x-huphe-timeline-asset');
  })()`);
  assert.equal(JSON.parse(feedback).projectId,projectId,'Media drag bevat alleen project- en assetidentiteit');
  await sleep(80);
  assert.equal(await js("getComputedStyle(document.querySelector('.vt-playhead')).pointerEvents"),'none','De afspeelkop onderschept geen media die precies op de knip wordt gedropt');
  if(!fresh)assert.equal(await js("!document.querySelector('.vt-drop-preview')?.classList.contains('invalid')"),valid,'Dropvoorstel toont of de plek geschikt is');
  await js("(()=>{const {source,target,dataTransfer,x,y}=window.__dropFixture;target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer,clientX:x,clientY:y}));source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer}));delete window.__dropFixture;})()");await sleep(180);
 };
 let p=await save(),a=p.assets.find(a=>a.name==='source-A.mp4'),b=p.clips.find(c=>c.label==='source-B.mp4');
 const aOriginal=structuredClone(p.assets);
 await drop(a.id,'video-1',6);p=await save();
 assert.deepEqual(p.clips.filter(c=>c.track==='video').sort((a,b)=>a.start-b.start).map(c=>[c.start,c.duration]),[[0,150],[150,150],[300,125]],'Tussen twee scènes invoegen schuift alleen de volgende scènes op');
 assert.deepEqual(p.assets,aOriginal,'Een mediakaart slepen dupliceert of wijzigt het bronbestand niet');
 await undo(false);assert.equal((await save()).clips.length,2);await undo(true);assert.equal((await save()).clips.length,3);
 await drop(a.id,'video-1',1,{valid:false});assert.equal((await save()).clips.length,3,'Midden in een bezette scène droppen overschrijft niets');
 passes.push('Sleepbare Projectmedia: invoegen op een knip, bezette plek weigeren, bron behouden en undo/redo');

 await click('＋ Videospoor');p=await save();const upper=p.tracks.find(t=>t.kind==='video'&&t.id!=='video-1');
 assert.ok(upper,'Een leeg extra videospoor wordt opgeslagen');
 queue.push(join(fixtures,'reference.png'));await click('＋ Afbeelding toevoegen');await until("document.querySelectorAll('[data-clip-id]').length===4",'image on upper track');
 p=await save();let image=p.clips.find(c=>c.trackId===upper.id);
 assert.equal(p.assets.find(a=>a.id===image.variants[0].assetId).kind,'image');assert.equal(image.duration,100);assert.equal(image.transform.scale,.25);
 await select(image.id);await input('[aria-label="Lengte fragment"]',8);await input('[aria-label=Grootte]',35);await input('[aria-label="Horizontale positie"]',75);await input('[aria-label="Verticale positie"]',25);await input('[aria-label=Dekking]',60);
 await click('⏮');await dragClip(0,'left',40);p=await save();image=p.clips.find(c=>c.id===image.id);
 assert.equal(image.start,25);assert.equal(image.duration,175);assert.equal(image.variants[0].inPoint,0,'Een stilstaand logo trimmen maakt geen bron-inpunt');
 assert.deepEqual(image.transform,{scale:.35,x:.75,y:.25});assert.equal(image.opacity,.6);
 assert.equal(await js("document.querySelector('.vt-inspector [aria-label=\"Begin in bron\"]')===null"),true,'Een afbeelding heeft geen bronduuruitsnede');
 passes.push('Extra videospoor met afbeelding/logo, vrije beeldduur, trimmen, positie, grootte en dekking');

 await click('＋ Audiospoor');await importFile('audio','baseline.wav');p=await save();
 const audio=p.assets.find(a=>a.kind==='audio'),voice=p.clips.find(c=>c.track==='audio');
 await drop(audio.id,'audio-1',0);p=await save();const music=p.clips.find(c=>c.track==='audio'&&c.trackId==='audio-1');
 assert.ok(voice.trackId!=='audio-1');assert.equal(music.start,voice.start);
 await select(music.id);await input('[aria-label=Volume]',40);await select(voice.id);await input('[aria-label=Volume]',120);
 p=await save();assert.equal(p.clips.find(c=>c.id===music.id).gain,.4);assert.equal(p.clips.find(c=>c.id===voice.id).gain,1.2);
 await drop(a.id,'audio-1',9,{valid:false});assert.equal((await save()).clips.length,6,'Video kan niet op een audiospoor worden gedropt');
 await click('⏮');await drop(audio.id,'audio',0,{fresh:true});p=await save();
 assert.equal(p.tracks.filter(t=>t.kind==='audio').length,3);assert.equal(p.clips.filter(c=>c.track==='audio').length,3);
 await undo(false);p=await save();assert.equal(p.tracks.filter(t=>t.kind==='audio').length,2);assert.equal(p.clips.filter(c=>c.track==='audio').length,2,'Undo van drop op nieuw spoor verwijdert spoor en clip samen');
 passes.push('Muziek en voice-over op gelijktijdige audiosporen, eigen volumes en media droppen op een nieuw spoor');

 await click('＋ Videospoor');p=await save();const top=p.tracks.filter(t=>t.kind==='video').at(-1);
 // Pointer capture must survive a React reparent when a block crosses track lanes.
 const source=p.clips.find(c=>c.trackId==='video-1');await select(source.id);await click('⏮');
 const points=await js(`(()=>{const block=document.querySelector('[data-clip-id="${source.id}"]'),lane=document.querySelector('[data-track-id="${top.id}"]');block.scrollIntoView({block:'nearest'});const b=block.getBoundingClientRect(),l=lane.getBoundingClientRect();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2),targetY:Math.round(l.y+l.height/2)}})()`);
 window.webContents.sendInputEvent({type:'mouseMove',x:points.x,y:points.y});window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:points.x,y:points.y});
 window.webContents.sendInputEvent({type:'mouseMove',x:points.x,y:points.targetY,modifiers:['leftbuttondown']});await sleep(120);
 window.webContents.sendInputEvent({type:'mouseMove',x:points.x+40,y:points.targetY,modifiers:['leftbuttondown']});await sleep(120);
 window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:points.x+40,y:points.targetY});p=await save();
 assert.equal(p.clips.find(c=>c.id===source.id).trackId,top.id);assert.equal(p.clips.find(c=>c.id===source.id).start,25,'Door slepen na de spoorwissel blijft de pointer actief');
 await js("document.querySelector('.vt').focus()");window.webContents.sendInputEvent({type:'keyDown',keyCode:'Backspace'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Backspace'});await sleep(120);
 assert.equal(await js(`!!document.querySelector('[data-clip-id="${source.id}"]')`),false,'Na loslaten op een ander spoor is de sleepactie beëindigd en werkt Backspace');await undo(false);
 await undo(false);p=await save();assert.equal(p.clips.find(c=>c.id===source.id).trackId,'video-1');
 await select(source.id);await input('[aria-label="Spoor fragment"]',top.id);p=await save();assert.equal(p.clips.find(c=>c.id===source.id).trackId,top.id);
 await input('[aria-label="Spoor fragment"]','video-1');
 await js(`document.querySelector('.vt-track-label[title="Selecteer ${top.name}"],.vt-track-label[data-tip="Selecteer ${top.name}"]').click()`);await sleep(100);
 await js(`document.querySelector('[data-asset-id="${a.id}"]').click()`);p=await save();assert.ok(p.clips.some(c=>c.trackId===top.id),'Klikken blijft achteraan op het gekozen spoor plaatsen');
 passes.push('Bestaande clips tussen sporen slepen met doorlopende pointercapture, spoorselectie en klikken om media te plaatsen');
 const expected=structuredClone({tracks:p.tracks,clips:p.clips});await click('⏮');
 await window.webContents.reload();await until("document.querySelector('input[placeholder=\"Beschrijf je video…\"]')",'multitrack reload');await click('Timeline');
 await until(`document.querySelectorAll('[data-track-id]').length===${p.tracks.length}`,'all tracks restored');
 const restored=await save();assert.deepEqual({tracks:restored.tracks,clips:restored.clips},expected,'Heropenen bewaart sporen, lagen, volumes en media');
 await writeFile(join(work,'artifacts','multitrack.png'),(await window.webContents.capturePage()).toPNG());
 passes.push('Meerdere sporen, lege sporen, beeldinstellingen en geluidsvolumes blijven bewaard na heropenen');
}
async function deleteTimelineTracks() {
 const projectId=await js("localStorage.getItem('huphe:timeline:last-project')");
 const save=async()=>{await until("[...document.querySelectorAll('.vt button')].some(e=>(e.textContent.trim()||e.getAttribute('aria-label'))==='Opslaan'&&!e.disabled)",'track deletion ready to save');await click('Opslaan');return JSON.parse(await readFile(join(process.env.HUPHE_TIMELINE_ROOT,projectId,'project.json'),'utf8'));};
 const key=clip=>clip.trackId??`${clip.track}-1`;
 const edit=project=>({tracks:project.tracks,clips:project.clips});
 const select=async id=>{await js(`document.querySelector('[data-clip-id="${id}"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);await click('Fragment');};
 const undo=async redo=>{await js(`document.querySelector('[aria-label="${redo?'Opnieuw':'Ongedaan maken'}"]').click()`);await sleep(150);};
 const remove=async track=>{
  const point=await js(`(()=>{const button=document.querySelector('[data-delete-track="${track.id}"]');if(!button)throw Error('Delete-track button missing');if(button.disabled)throw Error('Delete-track button disabled');if(button.getAttribute('aria-label')!==${JSON.stringify(track.name+' verwijderen')})throw Error('Delete-track accessible name missing');button.scrollIntoView({block:'nearest'});const r=button.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
  await until(`!document.querySelector('[data-track-id="${track.id}"]')`,'track removed');
 };
 let p=await save();
 for(const kind of ['video','audio']) {
  const before=structuredClone(p),track=p.tracks.find(track=>track.kind===kind&&p.clips.some(clip=>key(clip)===track.id));
  assert.ok(track,`Een gevuld ${kind}spoor staat klaar voor verwijderen`);
  await select(p.clips.find(clip=>key(clip)===track.id).id);
  await remove(track);p=await save();
  assert.deepEqual(p.tracks,before.tracks.filter(item=>item.id!==track.id));
  assert.deepEqual(p.clips,before.clips.filter(clip=>key(clip)!==track.id),'Andere sporen, uitsneden en posities blijven exact gelijk');
  assert.deepEqual(p.assets,before.assets,'Spoor verwijderen wist geen bronmedia');assert.deepEqual(p.jobs,before.jobs,'Spoor verwijderen wist geen jobhistorie');
  assert.equal(await js("document.querySelector('.vt-block.selected')===null"),true,'Selectie van een verwijderd fragment wordt gewist');
  assert.equal(await js("document.querySelector('.vt-inspector [aria-label=\"Lengte fragment\"]')===null"),true,'De inspector blijft niet aan een verwijderd fragment gekoppeld');
  for(const asset of p.assets)assert.ok((await readFile(resolve(process.env.HUPHE_TIMELINE_ROOT,projectId,asset.path))).length>0,'Bronbestand blijft beschikbaar op schijf');
  await undo(false);assert.deepEqual(edit(await save()),edit(before),'Eén undo herstelt spoor en alle fragmenten samen');
  await undo(true);const redone=await save();assert.deepEqual(edit(redone),edit(p),'Eén redo verwijdert hetzelfde spoor en zijn fragmenten');p=redone;
  passes.push(`${kind==='video'?'Videospoor':'Audiospoor'} verwijderen bewaart bronnen, jobs en andere posities; selectie verdwijnt en undo/redo herstelt spoor plus clips`);
 }
 await click('＋ Audiospoor');p=await save();const empty=p.tracks.filter(track=>track.kind==='audio').at(-1),beforeEmpty=structuredClone(p);
 assert.equal(p.clips.some(clip=>key(clip)===empty.id),false);await remove(empty);p=await save();assert.deepEqual(p.clips,beforeEmpty.clips,'Een leeg spoor verwijderen verandert geen clips');
 await undo(false);assert.deepEqual(edit(await save()),edit(beforeEmpty));await undo(true);p=await save();
 await writeFile(join(work,'artifacts','track-removal.png'),(await window.webContents.capturePage()).toPNG());
 const retainedAssets=structuredClone(p.assets),retainedJobs=structuredClone(p.jobs);
 for(const track of [...p.tracks]){await remove(track);p=await save();}
 assert.deepEqual(p.tracks,[],'Ook het laatste video- en audiospoor mogen weg');assert.deepEqual(p.clips,[]);assert.deepEqual(p.assets,retainedAssets);assert.deepEqual(p.jobs,retainedJobs);
 await window.webContents.reload();await until("document.querySelector('input[placeholder=\"Beschrijf je video…\"]')",'zero-track project reload');await click('Timeline');
 await until("document.querySelector('[data-testid=video-timeline]')?.getClientRects().length && document.querySelectorAll('[data-track-id]').length===0",'zero tracks restored');
 p=await save();assert.deepEqual(p.tracks,[],'Heropenen maakt verwijderde standaardsporen niet opnieuw');assert.deepEqual(p.clips,[]);assert.deepEqual(p.assets,retainedAssets);
 const video=p.assets.find(asset=>asset.kind==='video'),audio=p.assets.find(asset=>asset.kind==='audio');
 await js(`document.querySelector('[data-asset-id="${video.id}"]').click()`);await until("document.querySelectorAll('[data-clip-id]').length===1",'video placed');p=await save();assert.equal(p.tracks.length,1);assert.equal(p.tracks[0].kind,'video');assert.equal(p.clips.length,1);assert.equal(key(p.clips[0]),p.tracks[0].id,'Mediakaart klikken maakt een ontbrekend videospoor');
 await remove(p.tracks[0]);p=await save();await js(`document.querySelector('[data-asset-id="${audio.id}"]').click()`);await until("document.querySelectorAll('[data-clip-id]').length===1",'audio placed');p=await save();assert.equal(p.tracks.length,1);assert.equal(p.tracks[0].kind,'audio');assert.equal(p.clips.length,1);assert.equal(key(p.clips[0]),p.tracks[0].id,'Mediakaart klikken maakt een ontbrekend audiospoor');
 await remove(p.tracks[0]);p=await save();await click('＋ Leeg blok');p=await save();assert.equal(p.tracks.length,1);assert.equal(p.tracks[0].kind,'video');assert.equal(p.clips.length,1);assert.equal(p.clips[0].variants.length,0,'Leeg blok maakt een nieuw videospoor na het verwijderen van alle sporen');
 const generationTrack=p.tracks[0],generationClip=p.clips[0];
 await importFile('audio','baseline.wav');p=await save();assert.equal(p.tracks.filter(track=>track.kind==='audio').length,1,'Audio-import herstelt een ontbrekend audiospoor');assert.ok(p.clips.some(clip=>clip.track==='audio'));
 passes.push('Leeg en laatste spoor verwijderen; nul sporen blijft na heropenen bewaard en media klikken, leeg blok en import maken passende nieuwe sporen');

 await click('＋ Audiospoor');p=await save();const removable=p.tracks.filter(track=>track.kind==='audio').at(-1);
 await select(generationClip.id);await click('Genereren');await until("!document.querySelector('[aria-label=Videomodel]').disabled",'model selection for protected track');await input('[aria-label=Videomodel]','bytedance/seedance-2.5');await input('.vt textarea','Lokale test voor spoorbescherming.');
 trackDeletionGeneration={projectId,clipId:generationClip.id,release:undefined};
 await click('Genereer');
 await until(`document.querySelector('[data-delete-track="${generationTrack.id}"]')?.disabled`,'generating track cannot be removed');
 const title=await js(`document.querySelector('[data-delete-track="${generationTrack.id}"]').title`);assert.match(title,/gener|render/i,'De knop legt uit waarom het spoor tijdelijk niet kan worden verwijderd');
 await js(`document.querySelector('[data-delete-track="${generationTrack.id}"]').click()`);assert.equal(await js(`!!document.querySelector('[data-track-id="${generationTrack.id}"]')`),true);
 await remove(removable);
 const deadline=Date.now()+5000;while(!trackDeletionGeneration.release&&Date.now()<deadline)await sleep(30);assert.ok(trackDeletionGeneration.release,'De lokale simulatie heeft de generatieopdracht ontvangen');
 trackDeletionGeneration.release();
 await until(`!document.querySelector('[data-delete-track="${generationTrack.id}"]')?.disabled && ![...document.querySelectorAll('button')].some(button=>button.textContent.includes('Bezig met genereren'))`,'generation finishes and track becomes removable');
 p=await save();const completed=p.jobs.find(job=>job.clipId===generationClip.id&&job.status==='completed');assert.ok(completed,'De generatie rondt af terwijl een ander spoor wordt verwijderd');
 const completedAssets=structuredClone(p.assets),completedJobs=structuredClone(p.jobs);assert.ok(p.clips.find(clip=>clip.id===generationClip.id).variants.length>0);
 await remove(generationTrack);p=await save();assert.deepEqual(p.assets,completedAssets);assert.deepEqual(p.jobs,completedJobs,'Ook afgeronde betaalde-opdrachthistorie blijft bewaard bij spoor verwijderen');
 trackDeletionGeneration=undefined;
 await writeFile(join(work,'artifacts','track-deletion.png'),(await window.webContents.capturePage()).toPNG());
 passes.push('Een genererend spoor is beschermd met uitleg; andere sporen blijven verwijderbaar en afgeronde varianten/jobs blijven bewaard na verwijderen');
}

async function scrubAdditionalSource(file) {
 // Optional local diagnostic source: a clip of at least four seconds, no provider request.
 await click('Nieuw');await until("document.querySelectorAll('[data-clip-id]').length===0",'empty diagnostic timeline');
 queue.push(resolve(file));await click('＋ Video toevoegen');
 await until("document.querySelectorAll('[data-clip-id]').length===1 && document.querySelector('.vt canvas').dataset.mediaTime!==''",'diagnostic source imported');
 await sleep(200);
 const layout=await js("(()=>{const c=document.querySelector('.vt canvas').getBoundingClientRect();const r=document.querySelector('.vt-ruler').getBoundingClientRect();return {canvas:{x:c.x,y:c.y,width:c.width,height:c.height},viewportWidth:innerWidth,left:r.left,zoom:Number(document.querySelector('[aria-label=\"Tijdlijnzoom\"]').dataset.zoom),y:Math.round(r.top+r.height/2)}})()");
 const samples=[];
 window.webContents.beginFrameSubscription(false,image=>{
  const scale=image.getSize().width/layout.viewportWidth,c=layout.canvas;
  const frame=image.crop({x:Math.round(c.x*scale),y:Math.round(c.y*scale),width:Math.round(c.width*scale),height:Math.round(c.height*scale)}).resize({width:64,height:36});
  const bytes=frame.toBitmap();let hash=2166136261,brightPixels=0;
  for(let i=0;i<bytes.length;i+=4){hash=Math.imul(hash^bytes[i],16777619);hash=Math.imul(hash^bytes[i+1],16777619);hash=Math.imul(hash^bytes[i+2],16777619);if(Math.max(bytes[i],bytes[i+1],bytes[i+2])>16)brightPixels++;}
  samples.push({t:Date.now(),hash:hash>>>0,brightPixels});
 });
 const pointer=seconds=>({x:Math.round(layout.left+seconds*layout.zoom),y:layout.y});
 window.webContents.sendInputEvent({type:'mouseMove',...pointer(0.2)});window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...pointer(0.2)});
 for(let sweep=0;sweep<8;sweep++){const from=sweep%2 ? 3.6 : 0.2,to=sweep%2 ? 0.2 : 3.6;
  for(let step=0;step<=24;step++){window.webContents.sendInputEvent({type:'mouseMove',...pointer(from+(to-from)*step/24),modifiers:['leftbuttondown']});await sleep(16);}}
 const movingSamples=samples.slice();window.webContents.sendInputEvent({type:'mouseMove',...pointer(2.28),modifiers:['leftbuttondown']});
 await until("Math.abs(Number(document.querySelector('.vt canvas').dataset.mediaTime)-2.28)<0.05",'diagnostic source final seek');await sleep(150);
 window.webContents.endFrameSubscription();window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...pointer(2.28)});
 const summary={samples:samples.length,movingSamples:movingSamples.length,blackFrames:samples.filter(s=>s.brightPixels<8).length,distinctFramesWhileMoving:new Set(movingSamples.map(s=>s.hash)).size};
 await writeFile(join(work,'artifacts','scrub-additional-source.json'),JSON.stringify({summary,samples},null,2));
 assert.ok(movingSamples.length>=30,'Ook de extra bron wordt tijdens de beweging gemeten');
 assert.equal(summary.blackFrames,0,'De extra bron toont geen zwarte tussenframes tijdens slepen');
 assert.ok(summary.distinctFramesWhileMoving>=6,'De extra bron ververst tijdens slepen');return summary;
}
async function modelCapabilityControls(){
 currentContracts=true;
 await window.webContents.reload();await until("document.querySelector('input[placeholder=\"Beschrijf je video…\"]')",'new capabilities in Single');
 const selectSingle=async id=>{await js("document.querySelector('[aria-label^=\"Model kiezen\"]').click()");await until("document.querySelector('input[placeholder=\"Zoek model…\"]')",'model menu');await js(`([...document.querySelectorAll('button')].find(b=>b.querySelector('p.font-mono')?.textContent===${JSON.stringify(id)})).click()`);await sleep(250);};
 await selectSingle(VEO);await until("!!document.querySelector('[aria-label=\"Veo-uitvoering\"]')",'Veo fields in Single');
 await input('[aria-label="Veo-uitvoering"]','fast');await input('[aria-label="Negatieve prompt"]','tekst in beeld');
 await selectSingle(WAN);await until("!!document.querySelector('[aria-label=\"Prompt uitbreiden\"]')",'Wan fields in Single');
 await selectSingle(KLING);await until("document.body.innerText.includes('Shotindeling')",'Kling fields in Single');
 await selectSingle(VEO);assert.equal(await js("document.querySelector('[aria-label=\"Veo-uitvoering\"]').value"),'fast');assert.equal(await js("document.querySelector('[aria-label=\"Negatieve prompt\"]').value"),'tekst in beeld');
 passes.push('Nieuwe modelinstellingen verschijnen ook in Single en blijven bewaard bij modelwissel');
 await click('Timeline');await until("document.querySelector('.vt')?.getClientRects().length",'current timeline');await click('Nieuw');await click('＋ Leeg blok');
 const set=(selector,value)=>input('.vt '+selector,value);
 const choose=async id=>{await until(`!!document.querySelector('[aria-label=Videomodel] option[value="${id}"]')`,'model available');await set('[aria-label=Videomodel]',id);};
 const prompt=()=>'textarea[placeholder="Wat gebeurt er in deze scène?"]';
 await choose(VEO);assert.equal(await js("document.querySelector('[aria-label=Generatieduur]').max"),'2');
 await set('[aria-label=Resolutie]','4k');assert.equal(await js("document.querySelector('[aria-label=Generatieduur]').getAttribute('aria-valuetext')"),'8 seconden');
 await set('[aria-label="Veo-uitvoering"]','fast');await set('[aria-label="Negatieve prompt"]','tekst in beeld');
 queue.push(join(fixtures,'reference.png'));await click('＋ Startbeeld kiezen');await until("!!document.querySelector('.vt img.vt-reference') && !document.querySelector('.vt-generation-controls').disabled",'start image ready');queue.push(join(fixtures,'reference.png'));await click('＋ Eindbeeld kiezen');await until("document.querySelectorAll('.vt img.vt-reference').length===2 && !document.querySelector('.vt-generation-controls').disabled",'end image ready');
 await set(prompt(),'Een papieren boot op een meer');await click('Genereer');await until("document.body.innerText.includes('Het resultaat staat in je film')",'Veo simulated generation');
 assert.equal(contractRequests.at(-1).endpoint,'fal-ai/veo3.1/fast/first-last-frame-to-video');assert.equal(contractRequests.at(-1).body.duration,'8s');assert.equal(contractRequests.at(-1).body.resolution,'4k');
 passes.push('Veo Fast, eerste/laatste beeld en 4K dwingen 8 s af en gaan via de juiste aanvraagroute');
 await click('Genereren');await choose(KLING);assert.equal(await js("document.querySelector('[aria-label=Generatieduur]').max"),'12');await set('[aria-label=Generatieduur]',5);await set(prompt(),'');
 await click('＋ Shot');await set('[aria-label="Shot 1 prompt"]','De boot vaart');await click('＋ Shot');await set('[aria-label="Shot 2 prompt"]','De camera komt dichterbij');await set('[aria-label="Shot 2 duur"]',5);
 await click('＋ Personage of object');await set('[aria-label="Element 1 hoofdbeeld"]','https://fixture.invalid/front.png');await set('[aria-label="Element 1 aanzichten"]','https://fixture.invalid/side.png');await set('[aria-label="Prompt volgen"]',0.7);
 await click('Genereer');await until("document.body.innerText.includes('Het resultaat staat in je film')",'Kling simulated generation');
 assert.equal(contractRequests.at(-1).endpoint,'fal-ai/kling-video/v3/pro/image-to-video');assert.equal(contractRequests.at(-1).body.multi_prompt.length,2);assert.equal(contractRequests.at(-1).body.elements.length,1);
 await click('Opslaan');const projectId=await js("localStorage.getItem('huphe:timeline:last-project')");const saved=JSON.parse(await readFile(join(process.env.HUPHE_TIMELINE_ROOT,projectId,'project.json'),'utf8'));
 assert.equal(saved.clips[0].variants.at(-1).generation.extraParams.multi_prompt[1].duration,'5');assert.equal(saved.clips[0].generation.extraParams.cfg_scale,0.7);
 passes.push('Kling 3: 3–15 s, twee shots en een personage gaan mee met de aanvraag en blijven in de variant opgeslagen');
 await click('Genereren');await choose(WAN);await set(prompt(),'Een papieren boot op een meer');queue.push(join(fixtures,'baseline.wav'));await click('＋ Audioreferentie');await until("document.querySelectorAll('.vt-reference-item').length===1 && !document.querySelector('.vt-generation-controls').disabled",'audio reference ready');await set('[aria-label="Negatieve prompt"]','onscherp');await js("document.querySelector('.vt [aria-label=\"Prompt uitbreiden\"]').click()");
 assert.equal(await js("!!document.querySelector('.vt [aria-label=\"Audio genereren\"]')"),false);assert.equal(await js("!!document.querySelector('.vt [aria-label=\"Seed\"]').disabled"),false);
 await click('Genereer');await until("document.body.innerText.includes('Het resultaat staat in je film')",'Wan simulated generation');
 assert.equal(contractRequests.at(-1).endpoint,'fal-ai/wan-25-preview/image-to-video');assert.ok(contractRequests.at(-1).body.audio_url);assert.equal(contractRequests.at(-1).body.enable_prompt_expansion,false);
 passes.push('Wan: startbeeld plus eigen audio, negatieve prompt en promptuitbreiding worden samen doorgegeven');
 await click('Genereren');await choose(SEEDANCE);await js("document.querySelector('.vt [aria-label=Draft]').click()");assert.equal(await js("document.querySelector('.vt [aria-label=Draft]').disabled"),false);
 await click('Genereer');await until("document.body.innerText.includes('Het resultaat staat in je film')",'Seedance reference draft simulation');
 assert.equal(contractRequests.at(-1).endpoint,'bytedance/seedance-2.5/us/reference-to-video');assert.equal(contractRequests.at(-1).body.draft,true);assert.equal(contractRequests.at(-1).body.resolution,'480p');
 passes.push('Seedance: draft met referenties blijft beschikbaar en gebruikt de US-referentieroute');
 await click('Genereren');await writeFile(join(work,'artifacts','model-capabilities.png'),(await window.webContents.capturePage()).toPNG());
}
(async()=>{try{
 await app.whenReady();registerVideoTimelineIPC();protocol.handle('huphe',request=>serveLocalMedia(request,decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/,''))));
 const timelineTools=await requireTimelineTools();
 await runTimelineTool(timelineTools.ffmpeg,['-hide_banner','-loglevel','error','-y','-i',join(fixtures,'source-C.mp4'),'-i',join(fixtures,'baseline.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-shortest',audioVideoFile]);
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[queue.shift()]});dialog.showSaveDialog=async()=>({canceled:false,filePath:join(work,'ui-export.mp4')});
 ipcMain.handle('test:capabilities',()=>({ok:true,models:currentContracts?currentCaps:[{model_id:'bytedance/seedance-2.5',provider:'fal',markup_pct:0,video_cost_estimate:10000,supported_durations:[4,5],supported_resolutions:['480p','720p','1080p'],supported_aspect_ratios:['16:9','9:16'],generate_audio:true,seed:true,bitrate_mode:true,codec:true,supports_end_image:true,supports_references:true,reference_limits:{image:4,video:2,audio:2},supports_auto_duration:true,supports_draft:true,draft_rate_per_second:0.005,draft_finalize_rate_per_second:0.01,pricing_skus:{duration_seconds:'0.01'}},{model_id:'fal-ai/veo3.1',provider:'fal',markup_pct:0,video_cost_estimate:10000,supported_durations:[6,10],supported_resolutions:['720p'],supported_aspect_ratios:['16:9'],generate_audio:false,pricing_skus:{duration_seconds:'0.01'}}]}));
 ipcMain.handle('test:prepare-references',async(_event,args)=>{
  assert.equal(args.accessToken,'local-fixture-only');
  const saved=JSON.parse(await readFile(join(process.env.HUPHE_TIMELINE_ROOT,args.projectId,'project.json'),'utf8'));
  const references={imageUrls:[],videoUrls:[],audioUrls:[]};
  for(const id of args.assetIds){
   const asset=saved.assets.find(a=>a.id===id);assert.ok(asset,'Een referentie verwijst naar een bewaard projectasset');
   references[asset.kind+'Urls'].push(`https://fixture.invalid/${asset.kind}/${asset.id}`);
  }
  preparedReferenceCalls.push({assetIds:[...args.assetIds],references});
  return {ok:true,references};
 });
 ipcMain.handle('test:generate',async(_event,args)=>{
  if(currentContracts){
   const settings=args[5],refs=args[7];
   const media=value=>value?'https://fixture.invalid/image.png':undefined;
   const request=buildVideoGenerationRequest(currentCaps.find(c=>c.model_id===args[1]),{
    prompt:args[0],image_url:media(args[4]),end_image_url:media(args[9]),duration:settings.duration,resolution:settings.resolution,aspect_ratio:settings.aspectRatio,
    generate_audio:settings.generateAudio,draft:settings.draft,seed:settings.seed,codec:settings.codec,bitrate_mode:settings.bitrateMode,extra_params:settings.extraParams,
    image_urls:refs?.imageUrls,video_urls:refs?.videoUrls,audio_urls:refs?.audioUrls,task:refs?.task});
   contractRequests.push(request);generated++;
   return {ok:true,filePath:'huphe://file/'+encodeURIComponent(join(fixtures,'source-C.mp4')),...(request.draft?{draftId:'fixture-current-draft',resolvedDuration:4}:{})};
  }

  if(trackDeletionGeneration){
   const held=trackDeletionGeneration;
   const saved=JSON.parse(await readFile(join(process.env.HUPHE_TIMELINE_ROOT,held.projectId,'project.json'),'utf8'));
   const job=saved.jobs.find(job=>job.id===args[8]);assert.equal(job?.clipId,held.clipId);assert.equal(job.status,'running');
   generated++;await new Promise(resolve=>{held.release=resolve;});
   return {ok:true,filePath:'huphe://file/'+encodeURIComponent(join(fixtures,'source-C.mp4'))};
  }
  assert.equal(args[1],'bytedance/seedance-2.5');assert.equal(args[5].duration,expectedGenerationSettings?.duration ?? 4);
  if(!expectedReferenceTask){assert.match(args[4],/^huphe:\/\/file\//,'Het gekozen startbeeld wordt meegestuurd');assert.match(args[9],/^huphe:\/\/file\//,'Het gekozen eindbeeld wordt meegestuurd');}
  assert.ok(expectedGenerationClip,'De generatieduurtest heeft een montageblok voorbereid');
  const saved=JSON.parse(await readFile(join(process.env.HUPHE_TIMELINE_ROOT,expectedGenerationClip.projectId,'project.json'),'utf8'));
  const clip=saved.clips.find(c=>c.id===expectedGenerationClip.id),job=saved.jobs.find(j=>j.id===args[8]);
  assert.equal(clip.duration,expectedGenerationClip.frames,'De aanvraag bewaart de kortere montageuitsnede');
  if(!expectedReferenceTask)assert.equal(clip.generation.requestedDuration,args[5].duration,'Opgeslagen aanvraag en provideropties hebben dezelfde modelduur');
  assert.equal(job.generation.requestedDuration,args[5].duration,'De onveranderlijke jobsnapshot bevat de echte providerduur');
  assert.equal(job.kind,'generate');
  if(expectedGenerationSettings)for(const [key,value] of Object.entries(expectedGenerationSettings)){
   assert.equal(args[5][key],value,`Provideroptie ${key} volgt de ingestelde waarde`);
   assert.equal(job.generation[key==='duration'?'requestedDuration':key],value,`Jobsnapshot bewaart ${key}`);
  }
  if(expectedReferenceTask){
   assert.equal(args[7].task,expectedReferenceTask);assert.equal(job.generation.task,expectedReferenceTask);
   assert.deepEqual({...args[7],task:undefined},{...preparedReferenceCalls.at(-1).references,task:undefined},'Referentie-uploads worden per mediasoort aan de provider doorgegeven');
   assert.deepEqual(job.generation.referenceAssetIds,preparedReferenceCalls.at(-1).assetIds,'De snapshot bewaart de lokale referentie-assets');
  }
  generated++;return {ok:true,filePath:'huphe://file/'+encodeURIComponent(args[5].generateAudio?audioVideoFile:join(fixtures,'source-C.mp4')),...(args[5].draft?{draftId:'fixture-draft-1',resolvedDuration:4}:{})};
 });
 ipcMain.handle('test:finalize',async(_event,args)=>{
  assert.equal(args[0],'bytedance/seedance-2.5');assert.equal(args[1],'fixture-draft-1');assert.equal(args[2],4,'Finaliseren gebruikt de bewaarde providerduur, niet de 3.52 s montage of 6 s testbron');assert.equal(args[3],'H265');assert.equal(args[4],'local-fixture-only');
  const saved=JSON.parse(await readFile(join(process.env.HUPHE_TIMELINE_ROOT,expectedGenerationClip.projectId,'project.json'),'utf8'));
  const clip=saved.clips.find(c=>c.id===expectedGenerationClip.id),draft=clip.variants.find(v=>v.draftId==='fixture-draft-1'),job=saved.jobs.find(j=>j.id===args[5]);
  assert.equal(job.kind,'finalize');assert.equal(job.sourceVariantId,draft.id);assert.equal(clip.duration,88);
  finalized++;return {ok:true,filePath:'huphe://file/'+encodeURIComponent(audioVideoFile)};
 });
 window=new BrowserWindow({width:1500,height:1000,show:false,webPreferences:{preload:process.env.TEST_PRELOAD,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 window.webContents.on('console-message',(_event,level,message)=>{if(level>=3){rendererErrors.push(message);console.error('renderer:',message)}});
 window.webContents.on('did-fail-load',(_e,code,description)=>console.error('load:',code,description));
 await window.loadURL(process.env.TEST_URL);await until("document.querySelector('input[placeholder=\"Beschrijf je video…\"]') && !document.querySelector('[aria-label=\"Model kiezen\"]')?.disabled",'video generator');
 if(process.env.TEST_MODEL_CONTROLS_ONLY){await modelCapabilityControls();console.log(JSON.stringify({passed:passes,rendererErrors,generatedProviderCalls:0,localSimulatedGenerations:generated},null,2));app.exit(0);return;}
 const draftPrompt='Deze videogenerator-prompt blijft bewaard bij een bezoek aan de tijdlijn.';
 await input('input[placeholder="Beschrijf je video…"]',draftPrompt);
 await js("window.__generatorPromptNode=document.querySelector('input[placeholder=\"Beschrijf je video…\"]')");
 await until("document.querySelector('[role=tablist][aria-label=Videoweergave] [role=tab][aria-selected=true]')?.textContent.trim()==='Single'",'Single tab selected');
 assert.equal(await js("!!document.querySelector('[data-testid=video-timeline]')"),false);
 await mkdir(join(work,'artifacts'),{recursive:true});await writeFile(join(work,'artifacts','single.png'),(await window.webContents.capturePage()).toPNG());
 await click('Timeline');await until("document.querySelector('[data-testid=video-timeline]')?.getClientRects().length && document.body.innerText.includes('Opgeslagen op deze Mac')",'timeline from generator');
 assert.equal(await js("document.querySelector('[role=tablist][aria-label=Videoweergave] [role=tab][aria-selected=true]')?.textContent.trim()"),'Timeline');
 await js("window.__timelineNode=document.querySelector('[data-testid=video-timeline]')");
 await click('Single');await until("document.querySelector('[data-testid=video-timeline]') && !document.querySelector('[data-testid=video-timeline]').getClientRects().length && document.querySelector('[role=tablist][aria-label=Videoweergave] [role=tab][aria-selected=true]')?.textContent.trim()==='Single'",'back to video generator');
 assert.equal(await js("document.querySelector('input[placeholder=\"Beschrijf je video…\"]')===window.__generatorPromptNode"),true,'De bestaande generator blijft gemonteerd');
 assert.equal(await js('window.__generatorPromptNode.value'),draftPrompt,'De prompt blijft bewaard');
 await click('Timeline');await until("document.querySelector('[data-testid=video-timeline]')?.getClientRects().length && document.querySelector('[role=tablist][aria-label=Videoweergave] [role=tab][aria-selected=true]')?.textContent.trim()==='Timeline'",'reopen from generator');
 assert.equal(await js("document.querySelector('[data-testid=video-timeline]')===window.__timelineNode"),true,'De tijdlijn blijft gemonteerd bij wisselen tussen Single en Timeline');
 passes.push('Single / Timeline wisselt de actieve tab en bewaart de prompt, generator en tijdlijn');passes.push('Nieuwe tijdlijn en automatisch opslaan');
 await drawEmptyBlocks();passes.push('Lege videoblokken tekenen: live voorstel, duur, generatiezijbalk, autosave, undo/redo, achteruit, Escape, zoom/scroll en begrenzing aan bestaande blokken');
 await importFile('video','source-A.mp4');await importFile('video','source-B.mp4');await selectClip(0);await input('[aria-label="Begin in bron"]',2);await input('[aria-label="Lengte fragment"]',3);
 await selectClip(1);await input('[aria-label="Start fragment"]',3);await input('[aria-label="Begin in bron"]',1);await input('[aria-label="Lengte fragment"]',4);
 await importFile('audio','baseline.wav');await until("document.querySelectorAll('[data-clip-id]').length===3",'3 clips');passes.push('Import A/B/audio en niet-destructief trimmen via zijbalk');
 await selectClip(0);await dragClip(0,'left',40);
 assert.equal(await js("Number(document.querySelector('[aria-label=\"Begin in bron\"]').value)"),3,'De trimrand blijft bereikbaar naast de afspeellijn');
 await js("document.querySelector('[aria-label=\"Ongedaan maken\"]').click()");await sleep(120);
 await dragClip(0,'right',-40);assert.equal(await js("Number(document.querySelector('[aria-label=\"Lengte fragment\"]').value)"),2);
 await js("document.querySelector('[aria-label=\"Ongedaan maken\"]').click()");await sleep(120);assert.equal(await js("Number(document.querySelector('[aria-label=\"Lengte fragment\"]').value)"),3);
 await js("document.querySelector('.vt-ripple').click()");await dragClip(0,'right',40);await selectClip(1);assert.equal(await js("Number(document.querySelector('[aria-label=\"Start fragment\"]').value)"),4);
 await js("document.querySelector('[aria-label=\"Ongedaan maken\"]').click()");await sleep(120);await js("document.querySelector('.vt-ripple').click()");
 await dragClip(1,null,40);assert.equal(await js("Number(document.querySelector('[aria-label=\"Start fragment\"]').value)"),4);await js("document.querySelector('[aria-label=\"Ongedaan maken\"]').click()");await sleep(120);
 passes.push('Trim slepen, verplaatsen, meeschuiven en undo via echte muisinteractie');

 const clipGeometry=()=>js("[...document.querySelectorAll('[data-clip-id]')].map(e=>({id:e.dataset.clipId,left:e.style.left,width:e.style.width}))");
 const beforeScrub=await clipGeometry();await click('⏮');await click('▶');await until("document.querySelector('.vt canvas').dataset.previewState==='playing'",'play before scrubbing');
 await scrub(0.8,4.2);await scrub(4.2,2.28,true);
 assert.deepEqual(await clipGeometry(),beforeScrub,'De afspeellijn sleept geen fragmenten mee');
 await input('[aria-label="Tijdlijnzoom"]',100*Math.log(80/6)/Math.log(1000/6));await js("document.querySelector('.vt-scroll').scrollLeft=120");await sleep(100);
 assert.equal(await js("document.querySelector('.vt-scroll').scrollLeft"),120,'De horizontaal verschoven tijdlijn wordt werkelijk getest');
 await scrub(3.2,4.4);
 {
  const zoomNow=()=>js("Number(document.querySelector('[aria-label=\"Tijdlijnzoom\"]').dataset.zoom)");
  const pinch=async dy=>{await js(`(()=>{const e=new WheelEvent('wheel',{ctrlKey:true,deltaY:${dy},clientX:420,clientY:360,bubbles:true,cancelable:true});window.__pinchPrevented=!document.querySelector('.vt-scroll').dispatchEvent(e)})()`);await sleep(60);};
  const before=await zoomNow();await pinch(-150);
  assert.ok(await zoomNow()>before,'Pinch naar buiten zoomt in');assert.equal(await js('window.__pinchPrevented'),true,'Pinch zoomt niet het hele venster');
  for(let i=0;i<12;i++)await pinch(-150);
  assert.ok(await zoomNow()>=500,'Verder inzoomen komt op beeldniveau');
  assert.ok(await js("[...document.querySelectorAll('.vt-ruler>span')].some(e=>/\\d+f$/.test(e.textContent))"),'Ingezoomd toont de liniaal losse frames');
  for(let i=0;i<30;i++)await pinch(150);
  assert.ok(await zoomNow()<=before,'Pinch naar binnen zoomt weer uit');
  await input('[aria-label="Tijdlijnzoom"]',100*Math.log(80/6)/Math.log(1000/6));await js("document.querySelector('.vt-scroll').scrollLeft=120");await sleep(100);
  passes.push('Pinch-zoom op de tijdlijn: van seconden tot losse frames en terug');
 }
 await js("document.querySelector('.vt-playhead').focus()");
 for(const [key,expected] of [['Right',4.44],['Left',4.4]]){
  window.webContents.sendInputEvent({type:'keyDown',keyCode:key});window.webContents.sendInputEvent({type:'keyUp',keyCode:key});
  await until(`Math.abs(Number(document.querySelector('.vt-playhead').getAttribute('aria-valuenow'))-${expected})<0.001`,'one-frame keyboard seek');
 }
 await input('[aria-label="Tijdlijnzoom"]',100*Math.log(40/6)/Math.log(1000/6));await js("document.querySelector('.vt-scroll').scrollLeft=0");await click('⏮');
 assert.deepEqual(await clipGeometry(),beforeScrub,'Scrubben, zoomen en pijltoetsen veranderen geen fragmenten');
 passes.push('Afspeellijn en liniaal slepen met live preview, achteruit over de knip, loslaten buiten de liniaal, horizontaal scrollen en één frame per pijltoets');

 const scrubPixelSummary=await rapidScrubPixels();await assertEmptyGapClearsPreview();
 passes.push('Canvaspixels blijven zichtbaar bij snel heen en weer slepen over de knip, verversen tijdens de beweging en eindigen op het juiste bronframe');

 await click('Opslaan');await until("document.body.innerText.includes('Opgeslagen op deze Mac')",'save');
 const id=await js("localStorage.getItem('huphe:timeline:last-project')");let saved=JSON.parse(await readFile(join(process.env.HUPHE_TIMELINE_ROOT,id,'project.json'),'utf8'));assert.equal(saved.clips.filter(c=>c.track==='video').reduce((s,c)=>s+c.duration,0),175);assert.equal(saved.clips[0].variants[0].inPoint,2);assert.equal(saved.assets[0].duration,6);
 await selectClip(0);await js("window.__videoEvents=[];document.querySelectorAll('.vt video').forEach((v,i)=>['seeking','seeked','waiting','playing','pause'].forEach(name=>v.addEventListener(name,()=>window.__videoEvents.push({i,name,t:Number(document.querySelector('.vt canvas').dataset.timelineTime),source:v.currentTime,ready:v.readyState}))));window.__previewSamples=[];window.__sampleTimer=setInterval(()=>{const d=document.querySelector('.vt canvas').dataset;window.__previewSamples.push({t:Number(d.timelineTime),drift:Number(d.videoDriftMs),seek:Number(d.seekMs),state:d.previewState})},20);document.querySelector('[aria-label=Afspelen]').click()");await until("Number(document.querySelector('.vt canvas').dataset.timelineTime)>3.3",'preview across cut',12000);await js("document.querySelector('[aria-label=Pauzeren]').click()");await js('clearInterval(window.__sampleTimer)');const previewSamples=await js('window.__previewSamples');const videoEvents=await js('window.__videoEvents');const rebufferCount=await js("Number(document.querySelector('.vt canvas').dataset.rebufferCount||0)");assert.equal(rebufferCount,0,'Volgende clip moet na trim/undo op het inpunt klaarstaan');passes.push('Preview speelt over de knip met los audiospoor, zonder herbuffering na trim/undo');
 await click('Exporteer film ↗');await until("document.body.innerText.includes('Film geëxporteerd:')",'native export',90000);passes.push('Export via echte UI en FFmpeg');
 await window.webContents.reload();await until("document.querySelector('input[placeholder=\"Beschrijf je video…\"]')",'generator after reload');await click('Timeline');await until("document.querySelectorAll('[data-clip-id]').length===3",'reopen');passes.push('Heropenen via Timeline bewaart montage, bron en actieve varianten');
 await selectClip(0);queue.push(join(fixtures,'source-C.mp4'));await click('Andere versie importeren');await until("document.querySelector('[aria-label=\"Varianten\"] small')?.textContent==='2'",'second variant');await click('Varianten (2)');await click('Gebruik deze variant');await click('Opslaan');saved=JSON.parse(await readFile(join(process.env.HUPHE_TIMELINE_ROOT,id,'project.json'),'utf8'));assert.equal(saved.clips[0].activeVariantId,saved.clips[0].variants[1].id);passes.push('Variant toevoegen en expliciet actief kiezen');
 await click('＋ Leeg blok');await until("!document.querySelector('[aria-label=Videomodel]')?.disabled && !!document.querySelector('[aria-label=Videomodel] option[value=\"bytedance/seedance-2.5\"]')",'video models available automatically');
 await generationDurationControls(id);passes.push('Schuifbalk met geldige modelduren en pijltoetsen, montage trimmen op frames, aanvraagduur en model wisselen zonder het blok te verlengen');
 queue.push(join(fixtures,'reference.png'));await click('＋ Startbeeld kiezen');await until("!!document.querySelector('.vt-reference')",'reference image');queue.push(join(fixtures,'reference.png'));await click('＋ Eindbeeld kiezen');await until("document.querySelectorAll('.vt-reference').length===2",'end image');await input('.vt textarea','Een lokaal testfragment, zonder providerverzoek.');await click('Genereer');await until("document.body.innerText.includes('Het resultaat staat in je film')",'local generation');assert.equal(generated,1);passes.push('Generatieadapter en jobsnapshot vragen met start/eindbeeld 4 seconden aan voor een montageblok van 3.52 seconden (uitsluitend lokale simulator)');
 await click('Opslaan');
 saved=JSON.parse(await readFile(join(process.env.HUPHE_TIMELINE_ROOT,id,'project.json'),'utf8'));
 const generatedClip=saved.clips.find(c=>c.id===expectedGenerationClip.id);assert.equal(generatedClip.duration,88);assert.equal(generatedClip.generation.requestedDuration,4);assert.equal(generatedClip.variants.at(-1).generation.requestedDuration,4);assert.equal(generatedClip.activeVariantId,generatedClip.variants.at(-1).id,'De nieuwe variant gebruikt de bestaande montageuitsnede');
 await legacyGenerationDuration(id,expectedGenerationClip.id);passes.push('Oude fractionele aanvraagduur heropenen blokkeert generatie tot een expliciete geldige keuze, zonder montagewijziging');
 await generationSettingsParity(id,expectedGenerationClip.id);
 await mkdir(join(work,'artifacts'),{recursive:true});await writeFile(join(work,'artifacts','timeline.png'),(await window.webContents.capturePage()).toPNG());
 await multitrackEditing();
 await deleteTimelineTracks();
 await modelCapabilityControls();
 if(process.env.TEST_SCRUB_SOURCE){const result=await scrubAdditionalSource(process.env.TEST_SCRUB_SOURCE);console.log('Additional source pixels:',JSON.stringify(result));passes.push('Extra lokale bron: compositorbeelden blijven zichtbaar en verversen tijdens snel slepen');}
 const playingSamples=previewSamples.filter(x=>x.state==='playing');const previewSummary={samples:playingSamples.length,maxObservedDriftMs:Math.max(...playingSamples.map(x=>Math.abs(x.drift))),rebufferCount};const report={passed:passes,rendererErrors,previewSamples,previewSummary,scrubPixelSummary,videoEvents,generatedProviderCalls:0,localSimulatedGenerations:generated,localSimulatedFinalizations:finalized,preparedReferenceRequests:preparedReferenceCalls.length,export:join(work,'ui-export.mp4'),screenshot:join(work,'artifacts','timeline.png'),singleScreenshot:join(work,'artifacts','single.png')};await writeFile(join(work,'artifacts','report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,previewSamples:undefined,videoEvents:undefined},null,2));app.exit(0);
 }catch(error){console.error(error);try{if(window&&!window.isDestroyed()){await writeFile(join(work,'failure.png'),(await window.webContents.capturePage()).toPNG());console.error(await js('document.body.innerText'));}}catch(captureError){console.error('Failure screenshot:',captureError);}app.exit(1)}})();
