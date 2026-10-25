const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const {harness}=require('./calibration-check.cjs');
function uiHarness(){
 const h=harness(),created=[];
 function decorate(n){n.children??=[];n.dataset??={};n.attributes??={};n.append=(...items)=>{n.children.push(...items);};n.replaceChildren=(...items)=>{n.children=items;};n.insertBefore=(item)=>{n.children.push(item);};n.setAttribute=(k,v)=>{n.attributes[k]=String(v);};n.getAttribute=k=>n.attributes[k]??null;return n;}
 const get=h.ctx.document.getElementById;h.ctx.document.getElementById=id=>decorate(get(id));h.ctx.document.createElement=tag=>{const n=decorate(h.node('created-'+created.length));n.tagName=tag.toUpperCase();created.push(n);return n;};
 h.ctx.document.body=decorate(h.node('body'));h.ctx.document.body.classList.add('phone');h.ctx.document.querySelector=selector=>decorate(h.node(selector));h.ctx.isSecureContext=true;
 h.ctx.LabSensors={phone:()=>true,ready:()=>false,report:()=>({})};h.ctx.PhoneControls={setTouchMode(on){h.touch=on;}};
 h.ctx.Audio=class{play(){return Promise.resolve();}pause(){}};h.docEvents={};h.ctx.document.addEventListener=(t,f)=>{(h.docEvents[t]??=[]).push(f);};
 h.created=created;h.load=name=>vm.runInContext(fs.readFileSync(path.join(__dirname,'client',name),'utf8'),h.ctx);return h;
}
(async()=>{
 const h=uiHarness();h.load('phone-lab.js');h.inbound('you','p1');await h.node('joinBtn').handlers.click[0]();h.inbound('roster',[{id:'c1',members:[{id:'p1',name:'Test',role:'both'}]}]);
 h.created.find(n=>n.textContent==='Prologue · learn the climb').onclick();assert.equal(h.ctx.Net.calibrated,false);assert.equal(h.emitted.filter(e=>e.type==='start').length,0);
 h.created.find(n=>n.textContent==='Continue with touch controls').onclick();assert.equal(h.touch,true);assert.equal(h.ctx.Net.calibrated,true);assert.equal(h.emitted.filter(e=>e.type==='start').at(-1).args[0].practice,true);console.log('PASS sensor-free fallback preserves a pending practice request');

 // Motion users keep the same explicit Kick action; touch users retain all three actions.
 const controls=uiHarness();let nextFrame;controls.ctx.requestAnimationFrame=fn=>{nextFrame=fn;};
 controls.node('pushText').parentElement=controls.ctx.document.getElementById('pushParent');
 const climber={id:'c1',grounded:true,hands:[{},{}],legs:[{planted:true},{planted:true}],actions:{jump:{ready:true,cooldown:0},kick:{cooldown:0}}};
 controls.ctx.Net.me='c1';controls.ctx.Net.role='legs';controls.ctx.Net.calibrated=true;let snapshot={phase:'playing',climbers:[climber]};controls.ctx.Net.sample=()=>snapshot;
 controls.load('phone-controls.js');const find=id=>controls.created.find(n=>n.id===id),dock=find('actionDock'),kick=find('action-kick'),jump=find('action-flick'),tuck=find('action-yank');
 assert.equal(dock.hidden,false);assert.equal(kick.disabled,false);assert.equal(jump.hidden,true);assert.equal(tuck.hidden,true);
 controls.ctx.Net.role='both';nextFrame();assert.equal(dock.hidden,false);assert.equal(kick.disabled,false);
 controls.ctx.Net.role='arms';nextFrame();assert.equal(dock.hidden,true);assert.equal(kick.disabled,true);
 controls.ctx.Net.role='legs';controls.ctx.Net.calibrated=false;nextFrame();assert.equal(dock.hidden,true);
 controls.ctx.Net.calibrated=true;climber.actions.kick.cooldown=1;nextFrame();assert.equal(kick.disabled,true);
 climber.actions.kick.cooldown=0;controls.ctx.PhoneControls.setTouchMode(true);nextFrame();assert.equal(jump.hidden,false);assert.equal(tuck.hidden,false);assert.equal(dock.hidden,false);
 snapshot={...snapshot,phase:'results'};nextFrame();assert.equal(dock.hidden,true);
 console.log('PASS Kick is available for calibrated motion LEGS/solo, hidden for ARMS/lobby/results, with cooldown; touch retains Jump/Tuck');

 // narration: captions always; voice off by default on phones; recordings first, synthesized voice as fallback
 const quiet=uiHarness();quiet.load('narration.js');quiet.inbound('narrate',{id:'intro',text:'Two of you. One body.',audio:null,duration:3});
 const caption=quiet.created.find(n=>n.className==='narration-text');assert.equal(caption.textContent,'Two of you. One body.');console.log('PASS captions show without any speech support');
 const setup=saved=>{const h=uiHarness();h.ctx.clearTimeout??=()=>{};h.spoken=[];h.played=[];h.canceled=0;h.ctx.speechSynthesis={speak:u=>h.spoken.push(u.text),cancel:()=>h.canceled++};h.ctx.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  h.mode='missing';h.ctx.Audio=class{play(){if(this.src.includes('_unlock'))return Promise.resolve();h.played.push(this.src);return Promise.reject(Object.assign(new Error('audio'),{name:h.mode==='blocked'?'NotAllowedError':'NotSupportedError'}));}pause(){}};h.ctx.localStorage={getItem:()=>saved,setItem(){}};h.load('narration.js');h.toggle=h.created.find(n=>n.className==='narration-toggle');return h;};
 const quietPhone=setup(null);quietPhone.inbound('narrate',{id:'step',text:'Up one whole step.',audio:null,duration:2});
 assert.equal(quietPhone.spoken.length,0,'phones stay quiet unless voice is switched on');assert.equal(quietPhone.toggle.textContent,'Narrator voice: off');
 quietPhone.toggle.onclick();assert.equal(quietPhone.toggle.textContent,'Narrator voice: on');
 const voice=setup('true');voice.inbound('narrate',{id:'wall',text:'Too tall to hop.',audio:'/lab/narration/wall.mp3',duration:2});await new Promise(r=>setTimeout(r,10));
 assert.deepEqual(voice.played,['/lab/narration/wall.mp3'],'the recording is tried first');assert.deepEqual(voice.spoken,['Too tall to hop.'],'a missing recording falls back to the synthesized voice');
 voice.toggle.onclick();assert.ok(voice.canceled>0,'muting stops the voice');
 // the caption queue: duplicates ignored, the release line never dropped, cleared when the round ends
 const q=setup(null);const say=(id,o={})=>q.inbound('narrate',{id,text:id+' text',audio:null,duration:2,...o});
 say('wake');say('wake');assert.equal(q.ctx.Narration.queue.length,0,'a repeated line is ignored (the first is playing)');
 say('release',{essential:true});for(const id of ['a','b','c','d','e'])say(id);
 assert.ok(q.ctx.Narration.queue.some(l=>l.id==='release'),'a full caption queue never drops the release line');assert.ok(q.ctx.Narration.queue.length<=3);
 q.inbound('phase','playing');q.inbound('phase','lobby');assert.equal(q.ctx.Narration.queue.length,0);assert.equal(q.ctx.Narration.playing,null,'returning to the menu clears the narration');
 // Safari: one shared audio element; a blocked line plays on the next click instead of being lost
 const safari=setup('true');safari.mode='blocked';safari.inbound('narrate',{id:'roles',text:'One of you has the arms.',audio:'/lab/narration/roles.mp3',duration:8});await new Promise(r=>setTimeout(r,10));
 assert.deepEqual(safari.played,['/lab/narration/roles.mp3']); assert.equal(safari.ctx.Narration.playing?.id,'roles','the caption carries on while sound is blocked');
 safari.mode='ok';safari.ctx.Audio.prototype.play=function(){safari.played.push(this.src);return Promise.resolve();};
 for(const f of safari.docEvents.click||[])f({});await new Promise(r=>setTimeout(r,10));
 assert.deepEqual(safari.played.filter(p=>p.includes('roles')),['/lab/narration/roles.mp3','/lab/narration/roles.mp3'],'the first click plays the blocked line');
 safari.inbound('narrate',{id:'stand-up',text:'Go on. Stand up.',audio:'/lab/narration/stand-up.mp3',duration:2});
 console.log('PASS a line blocked by the browser plays as soon as someone clicks, and the caption never stalls');
 // the how-to-play card: your role's moves when the prologue starts, once; not again before a race
 const cp=uiHarness();let tick;cp.ctx.setInterval=f=>{tick??=f;return 1;};cp.ctx.clearInterval=()=>{}; // keep the watcher, not a card's step timercp.ctx.clearInterval=()=>{};cp.ctx.sessionStorage={getItem:()=>null,setItem(){}};
 cp.inbound('you','p1');cp.inbound('roster',[{id:'c1',members:[{id:'p1',name:'Leo',role:'legs'},{id:'p2',name:'Ana',role:'arms'}]}]);cp.load('controls-preview.js');
 cp.ctx.Net.calibrated=true;cp.inbound('level',{id:'practice',kind:'practice',revision:1,path:[[0,0],[1,1]]});cp.inbound('phase','playing');cp.ctx.Net.phase='playing';tick();
 assert.equal(cp.ctx.ControlsPreview.open,true,'the card opens when the prologue starts');assert.equal(cp.ctx.ControlsPreview.step,'flick','legs start with the flick');
 cp.ctx.ControlsPreview.close();tick();assert.equal(cp.ctx.ControlsPreview.open,false,'closing it keeps it closed');
 cp.inbound('level',{id:'mountain',kind:'race',revision:2,path:[[0,0],[1,1]]});tick();assert.equal(cp.ctx.ControlsPreview.open,false,'already seen: no card before the race');
 cp.ctx.PhoneInput.setTouchMode(true);cp.ctx.ControlsPreview.show();assert.equal(cp.ctx.ControlsPreview.step,'tapjump','Touch-mode LEGS must be taught the Jump button, not a suppressed motion gesture');
 cp.ctx.Net.role='arms';cp.ctx.ControlsPreview.show();assert.equal(cp.ctx.ControlsPreview.step,'drag','Touch-mode ARMS must be taught drag aiming');
 cp.ctx.Net.role='both';cp.ctx.ControlsPreview.show();assert.equal(cp.ctx.ControlsPreview.step,'drag');
 cp.ctx.PhoneInput.setTouchMode(false);cp.ctx.Net.role='legs';cp.ctx.ControlsPreview.show();assert.equal(cp.ctx.ControlsPreview.step,'flick','Motion LEGS still learn the flick');
 console.log('PASS controls guide follows input mode and role, including replay from settings');
 // reaching the beam before the combo wall (here in the right-hand lane) brings up the combo card, your half of the move
 cp.ctx.PhoneInput.setTouchMode(false);cp.ctx.Net.role='legs';cp.ctx.ControlsPreview.close();
 cp.inbound('level',{id:'practice',kind:'practice',revision:3,mirror:true,zones:[{id:'beam',x0:-9.5,x1:-5,y0:5.4,y1:9}],path:[[0,0],[1,1]]});cp.ctx.Net.phase='playing';tick();cp.ctx.ControlsPreview.close();
 cp.inbound('state3d',{revision:3,phase:'playing',climbers:[{id:'c1',x:7,y:6.6,z:0,hands:[],legs:[]}]});tick();
 assert.equal(cp.ctx.ControlsPreview.kind,'combo','the combo card appears at the beam');assert.equal(cp.ctx.ControlsPreview.step,'comboLegs','legs are told to hop as the arms let go');
 cp.ctx.ControlsPreview.close();tick();assert.equal(cp.ctx.ControlsPreview.open,false,'and only once');
 console.log('PASS the combo card appears once when your team reaches the combo wall in the prologue');
 console.log('PASS the how-to-play card shows your role\'s moves once at the start of the prologue');
 // remote mode is the default: the phone is a controller and never loads the 3D view unless asked
 const rm=uiHarness();rm.ctx.localStorage={getItem:()=>null,setItem(){}};rm.load('remote-mode.js');
 assert.equal(rm.ctx.document.body.classList.contains('remote'),true,'phones start in remote mode');assert.equal(rm.ctx.RemoteMode.on,true);
 assert.ok(rm.created.some(n=>n.id==='showGameOnPhone'&&n.checked===false),'settings offer to show the game on the phone, off by default');
 console.log('PASS phones default to remote mode (no 3D view), with a setting to turn it back on');
 console.log('PASS the caption queue ignores repeats, keeps the release line and clears when the round ends');console.log('PASS voice is opt-in on phones, recordings play first, and a missing file falls back to speech');
})().catch(e=>{console.error(e);process.exitCode=1;});
