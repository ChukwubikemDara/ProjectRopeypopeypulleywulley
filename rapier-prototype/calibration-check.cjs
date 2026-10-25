// Exercise the real adapter + original phone controller through join/roster/phase events.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
function harness(){
 const nodes=new Map(),listeners={},timers=[];
 const hidden=new Set(['lobby','hud','results','legsHud','debug']);
 const node=id=>{if(nodes.has(id))return nodes.get(id);const classes=new Set(hidden.has(id)?['hidden']:[]);const n={id,value:id==='name'?'Phone test':'',textContent:'',innerHTML:'',style:{},handlers:{},nextElementSibling:{},firstChild:{},classList:{contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c),toggle(c,on){if(on===undefined)on=!classes.has(c);on?classes.add(c):classes.delete(c);}},addEventListener(t,f){(this.handlers[t]??=[]).push(f);}};nodes.set(id,n);return n;};
 const socket={on(t,f){(listeners[t]??=[]).push(f);},emit(){}};
 const ctx={console,Map,Set,Date,Math,Number,String,Promise,performance:{now:()=>0},io:()=>socket,document:{getElementById:node,addEventListener(){},visibilityState:'visible'},navigator:{},location:{protocol:'https:'},localStorage:{getItem:()=>null,setItem(){}},matchMedia:()=>({matches:false}),addEventListener(){},requestAnimationFrame(){},setInterval(){},setTimeout(f,ms){timers.push({f,ms});},queueMicrotask:f=>f(),Motion:{aim:0,ay:.6,brace:true,_keys:{},center(){},enable:async()=>true},Sfx:{unlock(){},play(){}}};ctx.window=ctx;
 vm.createContext(ctx);
 for(const f of ['client/net.js','client/phone.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,f),'utf8'),ctx);
 const inbound=(t,x)=>(listeners[t]||[]).forEach(f=>f(x));
 const flush=()=>{for(const t of timers.splice(0))if(t.ms<=300)t.f();};
 return{ctx,node,inbound,flush};
}
(async()=>{
 const h=harness();h.inbound('you','p1');h.inbound('phase','playing');
 await h.node('joinBtn').handlers.click[0]();
 h.inbound('state3d',{phase:'playing',climbers:[{id:'c1',x:1,y:1,z:0,hands:[],legs:[]} ]});
 h.inbound('roster',[{id:'c1',name:'Phone test',color:'#42b9ab',members:[{id:'p1',name:'Phone test',role:'both'}]}]);
 h.flush();
 assert.equal(h.node('lobby').classList.contains('hidden'),false,'Calibration/lobby must stay open when joining an already-running round');
 console.log('PASS calibration stays open after joining active round');
 h.inbound('event',{type:'start'});h.flush();
 assert.equal(h.node('lobby').classList.contains('hidden'),false,'Someone starting a round must not dismiss unfinished calibration');
 console.log('PASS another start event preserves unfinished calibration');
 if(typeof h.ctx.Net.completeCalibration==='function'){
  h.ctx.Net.completeCalibration();h.flush();
  assert.equal(h.node('hud').classList.contains('hidden'),false,'Explicit completion must enter the running game');
  console.log('PASS explicit calibration completion enters gameplay');
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
