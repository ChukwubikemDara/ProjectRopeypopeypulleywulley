const assert=require('node:assert/strict');
const {io}=require('socket.io-client');
const {createServer}=require('./server.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const game=await createServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${game.server.address().port}`,sockets=[];let state;
 const connect=async surface=>{const s=io(url,{transports:['websocket'],auth:{surface}});sockets.push(s);s.on('state3d',x=>state=x);await new Promise(r=>s.on('connect',r));return s;};
 try{
  const host=await connect('spectator'),arms=await connect('phone'),legs=await connect('phone');arms.emit('join',{name:'Arms'});await wait(40);legs.emit('join',{name:'Legs'});await wait(60);const team=game.players.get(arms.id).team;
  for(const id of ['mountain','forest','campus','mountain']){
   host.emit('start');await wait(100);assert.equal(state.courseId,id);assert.equal(state.phase,'playing');assert.equal(game.sim.climbers.size,1);assert.equal(game.players.get(legs.id).role,'legs');
   if(id==='forest'){host.emit('retryRace');await wait(100);assert.equal(state.courseId,'forest');}
   const c=game.sim.climbers.get(team),F=game.sim.course.finish,p=c.body.translation(),dx=F.x-p.x,dy=F.y+1.1-p.y;
   // Place at the finish to test server lifecycle; traversal is covered in biome-check.
   for(const body of game.sim.parts(c)){const v=body.translation();body.setTranslation({x:v.x+dx,y:v.y+dy,z:0},true);body.setLinvel({x:0,y:0,z:0},true);}game.sim.world.propagateModifiedBodyPositionsToColliders();
   await wait(140);assert.equal(state.phase,'results');
  }
  assert.equal(game.players.get(arms.id).role,'arms');console.log('PASS actual mountain → forest → campus → mountain rotation, forest retry, finish detection and two-phone roles');
 }finally{sockets.forEach(s=>s.disconnect());await game.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
