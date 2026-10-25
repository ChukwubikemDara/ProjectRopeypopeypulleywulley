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

 // narration: captions always; voice off by default on phones; recordings first, synthesized voice as fallback
 const quiet=uiHarness();quiet.load('narration.js');quiet.inbound('narrate',{id:'intro',text:'Two of you. One body.',audio:null,duration:3});
 const caption=quiet.created.find(n=>n.className==='narration-text');assert.equal(caption.textContent,'Two of you. One body.');console.log('PASS captions show without any speech support');
 const setup=saved=>{const h=uiHarness();h.spoken=[];h.played=[];h.canceled=0;h.ctx.speechSynthesis={speak:u=>h.spoken.push(u.text),cancel:()=>h.canceled++};h.ctx.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  h.ctx.Audio=class{constructor(src){h.played.push(src);}play(){return Promise.reject(new Error('missing file'));}pause(){}};h.ctx.localStorage={getItem:()=>saved,setItem(){}};h.load('narration.js');h.toggle=h.created.find(n=>n.className==='narration-toggle');return h;};
 const quietPhone=setup(null);quietPhone.inbound('narrate',{id:'step',text:'Up one whole step.',audio:null,duration:2});
 assert.equal(quietPhone.spoken.length,0,'phones stay quiet unless voice is switched on');assert.equal(quietPhone.toggle.textContent,'Narrator voice: off');
 quietPhone.toggle.onclick();assert.equal(quietPhone.toggle.textContent,'Narrator voice: on');
 const voice=setup('true');voice.inbound('narrate',{id:'wall',text:'Too tall to hop.',audio:'/lab/narration/wall.mp3',duration:2});await new Promise(r=>setTimeout(r,10));
 assert.deepEqual(voice.played,['/lab/narration/wall.mp3'],'the recording is tried first');assert.deepEqual(voice.spoken,['Too tall to hop.'],'a missing recording falls back to the synthesized voice');
 voice.toggle.onclick();assert.ok(voice.canceled>0,'muting stops the voice');console.log('PASS voice is opt-in on phones, recordings play first, and a missing file falls back to speech');
})().catch(e=>{console.error(e);process.exitCode=1;});
