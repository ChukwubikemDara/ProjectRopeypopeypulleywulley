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
 const game=await createServer({courses:[mountain,practice,fixture]});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${game.server.address().port}`,sockets=[];let state,level;let heartbeat;
 const connect=async surface=>{const s=io(url,{transports:['websocket'],auth:{surface}});sockets.push(s);s.on('state3d',st=>state=st);s.on('level',l=>level=l);await new Promise(r=>s.on('connect',r));return s;};
 const select=(s,id)=>new Promise(r=>s.emit('selectCourse',id,r));
 try{
  const host=await connect('spectator'),arms=await connect('phone'),legs=await connect('phone');arms.emit('join',{name:'Arms'});await wait(30);legs.emit('join',{name:'Legs'});await wait(40);const team=game.players.get(arms.id).team;
  assert.equal((await select(legs,'forest')).ok,false);assert.equal((await select(host,'campus')).ok,false);assert.equal((await select(host,'forest')).ok,true);assert.equal(game.sim.course.id,'forest');assert.equal(game.players.get(legs.id).team,team);console.log('PASS host selection rebuilds actual geometry while preserving teams; unavailable maps stay unavailable');
  host.emit('start');await wait(120);assert.equal(state.courseId,'forest');assert.equal(state.phase,'playing');assert.equal((await select(host,'mountain')).ok,false);const firstRevision=level.revision;
  place(game.sim,game.sim.climbers.get(team),12,1.05);await wait(120);assert.equal(state.phase,'results');host.emit('retryRace');await wait(100);assert.equal(state.courseId,'forest');assert.ok(level.revision>firstRevision);
  place(game.sim,game.sim.climbers.get(team),12,1.05);await wait(120);assert.equal(state.phase,'results');host.emit('start');await wait(100);assert.equal(state.courseId,'mountain');console.log('PASS retry stays on the same map; next race advances after a real finish');
  host.emit('practice');await wait(100);assert.equal(state.mode,'practice');assert.equal(state.courseId,'practice');assert.equal(game.players.get(arms.id).team,team);let c=game.sim.climbers.get(team);
  place(game.sim,c,15.5,1.05);await wait(80);assert.equal(state.phase,'playing');assert.equal(game.sim.snapshot(c).finished,false);
  let closed=false;heartbeat=setInterval(()=>{arms.emit('input',{aim:0,ay:1,l:closed,r:closed,brace:true});legs.emit('input',{aim:0,ay:.6,brace:true});},150);
  arms.emit('input',{aim:.5,ay:1,l:false,r:false,brace:true});await wait(60);assert.ok(state.climbers[0].tutorial.done.includes('aim'));
  arms.emit('practiceReset');await wait(1100);closed=true;arms.emit('input',{aim:0,ay:1,l:true,r:true,brace:true});await wait(180);assert.ok(game.sim.courseGrips(c)>0);assert.ok(state.climbers[0].tutorial.done.includes('grip'));
  legs.emit('gesture','flick',1);await wait(100);closed=false;arms.emit('input',{aim:0,ay:1,l:false,r:false,brace:true});await wait(500);assert.ok(state.climbers[0].tutorial.done.includes('hop'));
  closed=true;arms.emit('input',{aim:0,ay:1,l:true,r:true,brace:true});await wait(80);legs.emit('practiceReset');await wait(180);assert.ok(game.sim.courseGrips(c)>0);assert.equal(game.sim.grounded(c),false);
  legs.emit('gesture','flick',1);await wait(110);closed=false;arms.emit('input',{aim:0,ay:1,l:false,r:false,brace:true});await wait(180);assert.ok(state.climbers[0].tutorial.done.includes('combo'));
  await wait(900);legs.emit('practiceReset');await wait(220);legs.emit('gesture','kick',1);await wait(100);const t=state.climbers[0].tutorial;assert.ok(t.done.includes('kick'));assert.equal(t.complete,true);assert.equal(state.phase,'playing');
  const dummy=game.sim.objects.find(o=>o.kind==='dummy');assert.ok(Math.abs(dummy.body.linvel().x)>.1);console.log('PASS two real roles complete aim, grip, physical hop, combo and a physical dummy kick without a race gate');
  legs.emit('start');await wait(60);assert.equal(state.mode,'practice');host.emit('start');await wait(100);assert.equal(state.mode,'race');assert.equal(state.courseId,'mountain');assert.equal(state.climbers[0].tutorial,undefined);
  host.emit('endRound');await wait(60);for(let i=0;i<8;i++){const id=i%2?'mountain':'forest';assert.equal((await select(host,id)).ok,true);assert.equal(game.sim.course.id,id);assert.equal(game.sim.climbers.size,1);}
  assert.equal(game.sim.objects.length,1);assert.equal(game.players.get(arms.id).role,'arms');assert.equal(game.players.get(legs.id).role,'legs');console.log('PASS practice can be left immediately; repeated map rebuilds retain roles and clean hazards');
  host.disconnect();await wait(60);assert.equal(game.session.host,arms.id);const replacement=await connect('spectator');await wait(40);assert.equal(game.session.host,replacement.id);console.log('PASS host reconnect and spectator takeover remain usable');
 }finally{clearInterval(heartbeat);sockets.forEach(s=>s.disconnect());await game.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
