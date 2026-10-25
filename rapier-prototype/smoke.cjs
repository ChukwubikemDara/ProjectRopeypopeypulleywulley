const {execFileSync}=require('node:child_process');
const path=require('node:path');
for(const name of ['calibration-check.cjs','sensor-check.cjs','phone-input-check.cjs','practice-ui-check.cjs','menu-check.cjs','ambience-check.cjs','roof-surface-check.cjs','route-check.cjs','mechanics-check.cjs','kick-check.cjs','snowbound-props-check.cjs','scooter-check.cjs','prologue-check.cjs','narration-check.cjs','full-course-check.cjs','biome-check.cjs','rotation-check.cjs','integration-check.cjs','course-session-check.cjs'])execFileSync(process.execPath,[path.join(__dirname,name)],{stdio:'inherit'});
const assert=require('node:assert/strict');
const {io}=require('socket.io-client');
const {createServer}=require('./server.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const lab=await createServer();await new Promise(r=>lab.server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${lab.server.address().port}`;
 const clients=[io(url,{transports:['websocket']}),io(url,{transports:['websocket']})];let heartbeat;
 const check=(test,text)=>{assert.ok(test,text);console.log('PASS '+text);};
 try{
  await Promise.all(clients.map(s=>new Promise(r=>s.on('connect',r))));
  clients[0].emit('join',{name:'Arms'});await wait(40);clients[1].emit('join',{name:'Legs'});await wait(80);
  const [team]=lab.teams.values(),c=lab.sim.climbers.get(team.id);
  check(team.members.length===2,'two original phone clients pair into one climber');
  const p0=lab.players.get(clients[0].id),p1=lab.players.get(clients[1].id);
  check(p0.role==='arms'&&p1.role==='legs','arms and legs roles preserved');
  lab.start();const body=lab.sim.climbers.get(team.id);
  clients[0].emit('input',{aim:.7,ay:.6,l:false,r:false});clients[1].emit('input',{aim:-.4,ay:.6,l:true,r:true});await wait(60);
  check(body.arms.aim===.7&&body.legs.aim===-.4&&!body.arms.l,'each role controls its own inputs; legs cannot grip');
  heartbeat=setInterval(()=>{clients[0].emit('input',{aim:0,ay:.6,l:body.arms.l,r:body.arms.r});clients[1].emit('input',{aim:0,ay:.6});},200);
  clients[0].emit('gesture','flick',1);await wait(50);check(body.lastJump<0,'arms cannot trigger a hop');
  clients[1].emit('gesture','flick',1);await wait(80);check(body.lastJump>=0,'existing legs gesture triggers a grounded jump');
  clearInterval(heartbeat);heartbeat=null;
  // Stop real-time ticking and exercise the deterministic physics directly.
  lab.sim.checkpoint(body,'pipe');body.legs={aim:0,ay:.6};body.arms.aim=0;
  for(let i=0;i<90;i++)lab.sim.step();
  check(body.hands.every(h=>h.grip),'two Rapier spherical joints hold the climber');
  const before=body.body.rotation();body.arms.r=false;body.assist=false;
  for(let i=0;i<45;i++)lab.sim.step();
  const after=body.body.rotation();
  check(!body.hands[1].grip&&body.hands[0].grip,'independent hand release preserves the other grip');
  check(Math.abs(after.z-before.z)+Math.abs(after.x-before.x)>.005,'one-hand suspension permits physical body rotation');
  body.arms.l=body.arms.r=false;body.depth=1;body.legs.ay=-1;
  body.body.applyImpulse({x:0,y:0,z:30},true);
  for(let i=0;i<70;i++)lab.sim.step();
  check(Math.abs(body.body.translation().z)<1e-5,'depth tilt and impulses cannot move the climber off center');
  const snap=lab.sim.snapshot(body);
  check([snap.x,snap.y,snap.z,...Object.values(snap.rotation)].every(Number.isFinite),'snapshots carry finite XYZ positions and orientation');
  check(snap.hands.every(h=>!h.grip),'releasing both pads releases all grip joints');
  const response=await fetch(url+'/phone'),html=await response.text();
  check(html.includes('/lab/phone.js')&&html.includes('/js/motion.js')&&html.includes('/lab/net.js'),'phone page reuses original controller and motion scripts');
  check((await fetch(url+'/js/alpine-character.js')).ok,'existing alpine character asset is served');
  console.log('ALL RAPIER LAB CHECKS PASSED');
 }finally{if(heartbeat)clearInterval(heartbeat);clients.forEach(s=>s.disconnect());await lab.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
