const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const {harness}=require('./calibration-check.cjs');
function uiHarness(){
 const h=harness(),created=[];
 function decorate(n){n.children??=[];n.dataset??={};n.attributes??={};n.append=(...items)=>{n.children.push(...items);};n.replaceChildren=(...items)=>{n.children=items;};n.insertBefore=(item)=>{n.children.push(item);};n.setAttribute=(k,v)=>{n.attributes[k]=String(v);};n.getAttribute=k=>n.attributes[k]??null;return n;}
 const get=h.ctx.document.getElementById;h.ctx.document.getElementById=id=>decorate(get(id));h.ctx.document.createElement=tag=>{const n=decorate(h.node('created-'+created.length));n.tagName=tag.toUpperCase();created.push(n);return n;};
 h.ctx.document.body=decorate(h.node('body'));h.ctx.document.body.classList.add('phone');h.ctx.document.querySelector=selector=>decorate(h.node(selector));h.ctx.isSecureContext=true;
 h.ctx.LabSensors={phone:()=>true,ready:()=>false,report:()=>({})};h.ctx.PhoneControls={setTouchMode(on){h.touch=on;}};
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
  h.ctx.Audio=class{constructor(src){h.played.push(src);}play(){return Promise.reject(new Error('missing file'));}pause(){}};h.ctx.localStorage={getItem:()=>saved,setItem(){}};h.load('narration.js');h.toggle=h.created.find(n=>n.className==='narration-toggle');return h;};
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
 console.log('PASS the caption queue ignores repeats, keeps the release line and clears when the round ends');console.log('PASS voice is opt-in on phones, recordings play first, and a missing file falls back to speech');
})().catch(e=>{console.error(e);process.exitCode=1;});
