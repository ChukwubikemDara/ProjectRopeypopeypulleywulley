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
 h.created.find(n=>n.textContent==='Calibrate & practice together').onclick();assert.equal(h.ctx.Net.calibrated,false);assert.equal(h.emitted.filter(e=>e.type==='start').length,0);
 h.created.find(n=>n.textContent==='Continue with touch controls').onclick();assert.equal(h.touch,true);assert.equal(h.ctx.Net.calibrated,true);assert.equal(h.emitted.filter(e=>e.type==='start').at(-1).args[0].practice,true);console.log('PASS sensor-free fallback preserves a pending practice request');
 const quiet=uiHarness();quiet.load('tutorial.js');const unavailable=quiet.created.find(n=>n.textContent==='Captions only');assert.ok(unavailable?.disabled);console.log('PASS missing speech support leaves captions usable');
 const voice=uiHarness();let render;const spoken=[];let canceled=0;voice.ctx.setInterval=f=>{render=f;};voice.ctx.speechSynthesis={speak:u=>spoken.push(u.text),cancel:()=>canceled++};voice.ctx.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};voice.load('tutorial.js');
 voice.inbound('you','p1');voice.inbound('roster',[{id:'c1',members:[{id:'p1',role:'both'}]}]);voice.inbound('level',{id:'practice',kind:'practice',path:[[0,0],[1,1]]});voice.ctx.Net.calibrated=true;
 voice.inbound('state3d',{phase:'playing',climbers:[{id:'c1',hands:[],legs:[],tutorial:{step:'aim',done:[],total:5,lesson:{title:'Aim',both:'Move your hands'},line:'Two brains. One climber.'}}]});render();assert.equal(spoken.length,0);
 const audio=voice.created.find(n=>n.textContent==='Enable voice');audio.onclick();assert.equal(spoken.length,1);render();assert.equal(spoken.length,1);audio.onclick();assert.ok(canceled>0);assert.equal(audio.textContent,'Enable voice');
 voice.created.find(n=>n.textContent==='Skip tips').onclick();assert.equal(voice.created.find(n=>n.id==='practiceCard').hidden,true);assert.equal(voice.ctx.Net.phase,'playing');console.log('PASS voice is opt-in, repeats are suppressed, mute cancels, and skipping does not stop practice');
})().catch(e=>{console.error(e);process.exitCode=1;});
