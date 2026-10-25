const assert=require('node:assert/strict');
const {io}=require('socket.io-client');
const {createServer}=require('./server.cjs');
const {mountain,practice,prepareCourse,validateCourse,nextRace}=require('./courses.cjs');
const {harness}=require('./calibration-check.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const fixture=prepareCourse({id:'forest',kind:'race',biome:'forest',name:'Course loader test fixture',bounds:{x0:-2,x1:14,y0:-2,y1:8},spawn:{x0:.7,x1:2,y:0},finish:{x:12,y:0,zoneX:11.5},terrain:[{kind:'rock',pts:[[-2,-2],[14,-2],[14,0],[-2,0]]}],holds:[{id:'fixture',kind:'knob',x:4,y:2.1}],objects:[],path:[[1,1],[4,3],[8,3],[12,1]],signs:[]});
function place(sim,c,x,y){for(const h of c.hands)sim.release(h,'test setup');for(const o of sim.climbers.values())for(const h of o.hands)if(h.grip?.id===c.id)sim.release(h,'test setup');const p=c.body.translation(),delta={x:x-p.x,y:y-p.y,z:0};for(const b of sim.parts(c)){const at=b.translation();b.setTranslation({x:at.x+delta.x,y:at.y+delta.y,z:0},true);b.setLinvel({x:0,y:0,z:0},true);}sim.world.propagateModifiedBodyPositionsToColliders();}
(async()=>{
 assert.equal(nextRace('mountain',[mountain,fixture]),'forest');assert.equal(nextRace('forest',[mountain,fixture]),'mountain');
 assert.throws(()=>validateCourse({...fixture,path:[[0,0],[0,0]]}));assert.throws(()=>validateCourse({...fixture,holds:[fixture.holds[0],fixture.holds[0]]}));console.log('PASS course validation and ordered race rotation');
 const h=harness();h.inbound('level',{...fixture,revision:1});h.inbound('state3d',{revision:1,phase:'playing',climbers:[]});assert.ok(h.ctx.Net.sample());h.inbound('level',{...mountain,revision:2});assert.equal(h.ctx.Net.sample(),null);h.inbound('state3d',{revision:1,phase:'playing',climbers:[]});assert.equal(h.ctx.Net.sample(),null);h.inbound('state3d',{revision:2,phase:'playing',climbers:[]});assert.ok(h.ctx.Net.sample());console.log('PASS level changes clear interpolation and reject old-map snapshots');
 const game=await createServer({courses:[mountain,practice,fixture]});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${game.server.address().port}`,sockets=[];let state,level;let heartbeat,hurry;
 const connect=async surface=>{const s=io(url,{transports:['websocket'],auth:{surface}});sockets.push(s);s.on('state3d',st=>state=st);s.on('level',l=>level=l);await new Promise(r=>s.on('connect',r));return s;};
 const select=(s,id)=>new Promise(r=>s.emit('selectCourse',id,r));
 try{
  const host=await connect('spectator'),arms=await connect('phone'),legs=await connect('phone');arms.emit('join',{name:'Arms'});await wait(30);legs.emit('join',{name:'Legs'});await wait(40);const team=game.players.get(arms.id).team;
  assert.equal((await select(legs,'forest')).ok,false);assert.equal((await select(host,'campus')).ok,false);assert.equal((await select(host,'forest')).ok,true);assert.equal(game.sim.course.id,'forest');assert.equal(game.players.get(legs.id).team,team);console.log('PASS host selection rebuilds actual geometry while preserving teams; unavailable maps stay unavailable');
  host.emit('start');await wait(120);assert.equal(state.courseId,'forest');assert.equal(state.phase,'playing');assert.equal((await select(host,'mountain')).ok,false);const firstRevision=level.revision;
  place(game.sim,game.sim.climbers.get(team),12,1.05);await wait(120);assert.equal(state.phase,'results');host.emit('retryRace');await wait(100);assert.equal(state.courseId,'forest');assert.ok(level.revision>firstRevision);
  place(game.sim,game.sim.climbers.get(team),12,1.05);await wait(120);assert.equal(state.phase,'results');host.emit('start');await wait(100);assert.equal(state.courseId,'mountain');console.log('PASS retry stays on the same map; next race advances after a real finish');
  const narrated=[];arms.on('narrate',l=>narrated.push(l));const released=[];arms.on('event',e=>{if(e.type==='release')released.push(e);});
  host.emit('practice');await wait(100);assert.equal(state.mode,'practice');assert.equal(state.courseId,'practice');assert.equal(game.players.get(arms.id).team,team);let c=game.sim.climbers.get(team);
  assert.equal(c.slumped,true,'the prologue starts with the body slumped under the sign');
  heartbeat=setInterval(()=>{arms.emit('input',{aim:0,ay:.6,l:false,r:false,brace:true});legs.emit('input',{aim:0,ay:.6,brace:true});},150);
  await wait(2600);assert.equal(narrated[0]?.id,'wake');assert.ok(narrated[0].text.includes('\n')&&narrated[0].duration>5);assert.equal(narrated[0].audio,'/lab/narration/wake.mp3','the recorded line is sent');assert.ok(narrated[0].duration>15,'paced by the recording\'s real length');
  arms.emit('input',{aim:.8,ay:.6,l:false,r:false,brace:true});await wait(60);assert.equal(c.slumped,true,'the arms tilting does not stand the body up');
  legs.emit('input',{aim:.6,ay:.6,brace:true});await wait(60);assert.equal(c.slumped,false,'the legs leaning stands it up');
  console.log('PASS the prologue wakes up slumped, the narrator speaks to every device, and the legs stand the body up');
  place(game.sim,c,-12.5,3.1);await wait(300);arms.emit('practiceReset');await wait(150);let p=c.body.translation();assert.ok(p.x>-18&&p.x<-15.5&&p.y>3.8,'a fall in the gap resets to the top of the ledge');
  place(game.sim,c,12.5,3.1);await wait(1100);legs.emit('practiceReset');await wait(150);p=c.body.translation();assert.ok(p.x<18&&p.x>15.5&&p.y>3.8,'the right lane resets to its own ledge');
  console.log('PASS section reset returns a stuck team to the start of their section, in either lane');
  // fast-forward the narrator so the test doesn't sit through every speech
  hurry=setInterval(()=>{game.prologue.narrator.busyUntil=0;game.prologue.narrator.later.length=0;},100);
  place(game.sim,c,-2.5,10.85);await wait(400);
  for(let i=0;i<60&&!released.length;i++)await wait(100);
  assert.ok(narrated.some(l=>l.id==='nobody-else'),'a team alone at the barrier gets the solo line');assert.ok(released.length,'the barrier rises once everyone is at the start');
  clearInterval(hurry);for(let i=0;i<120&&state.mode!=='race';i++)await wait(100);
  assert.equal(state.mode,'race');assert.equal(state.courseId,'mountain');assert.equal(state.phase,'playing');
  console.log('PASS the barrier releases everyone into the selected race once the last line ends');
  // races reuse the fall reactions: a fall reaches every phone as narration; bots never trigger it
  const before=narrated.length;const bot=[...game.teams.values()].find(t=>t.bot);
  if(bot)game.sim.events.push({type:'fall',id:bot.id,m:6,x:5,y:1});
  game.sim.events.push({type:'fall',id:team,m:6,x:12,y:3});await wait(300);
  assert.deepEqual(narrated.slice(before).map(l=>l.id),['fall-big'],'a big fall in the race gets one reaction');
  console.log('PASS races reuse the fall reactions');
  host.emit('practice');await wait(100);assert.equal(state.mode,'practice');
  legs.emit('start');await wait(60);assert.equal(state.mode,'practice');host.emit('start');await wait(100);assert.equal(state.mode,'race');assert.equal(state.courseId,'mountain');
  host.emit('endRound');await wait(60);for(let i=0;i<8;i++){const id=i%2?'mountain':'forest';assert.equal((await select(host,id)).ok,true);assert.equal(game.sim.course.id,id);assert.equal(game.sim.climbers.size,1);}
  assert.equal(game.sim.objects.length,1);assert.equal(game.players.get(arms.id).role,'arms');assert.equal(game.players.get(legs.id).role,'legs');console.log('PASS practice can be left immediately; repeated map rebuilds retain roles and clean hazards');
  host.disconnect();await wait(60);assert.equal(game.session.host,arms.id);const replacement=await connect('spectator');await wait(40);assert.equal(game.session.host,replacement.id);console.log('PASS host reconnect and spectator takeover remain usable');
 }finally{clearInterval(heartbeat);clearInterval(hurry);sockets.forEach(s=>s.disconnect());await game.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
