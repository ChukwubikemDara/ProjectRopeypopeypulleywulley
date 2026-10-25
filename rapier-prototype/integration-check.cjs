const assert=require('node:assert/strict');
const {io}=require('socket.io-client');
const {createServer}=require('./server.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const game=await createServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${game.server.address().port}`,sockets=[];let state,awards;
 try{
  for(let i=0;i<4;i++){const s=io(url,{transports:['websocket']});sockets.push(s);if(!i){s.on('state3d',st=>state=st);s.on('results',a=>awards=a);}await new Promise(r=>s.on('connect',r));s.emit('join',{name:'Test '+i});await wait(30);}
  assert.equal(game.teams.size,2);assert.ok([...game.teams.values()].every(t=>t.members.length===2));
  const p=game.players.get(sockets[0].id);sockets[0].emit('swapRole');await wait(40);assert.equal(p.role,'legs');sockets[0].emit('swapRole');await wait(40);assert.equal(p.role,'arms');console.log('PASS four phones form two teams; role swapping works');
  const first=p.team;sockets[0].emit('newTeam');await wait(40);assert.equal(game.teams.size,3);sockets[0].emit('joinTeam',first);await wait(40);assert.equal(game.teams.size,2);assert.equal(p.team,first);console.log('PASS new-team and explicit team selection preserve roster roles');
  sockets[0].emit('addBot');await wait(40);assert.equal(game.teams.size,3);assert.ok([...game.teams.values()].some(t=>t.bot));
  sockets[0].emit('start');await wait(180);assert.equal(state.phase,'playing');assert.equal(state.climbers.length,3);assert.equal(state.objects.length,1);assert.ok(JSON.stringify(state).includes('cart'));
  const phone=await(await fetch(url+'/phone')).text(),screen=await(await fetch(url+'/screen.html')).text();assert.ok(phone.includes('THE LONG WAY UP')&&screen.includes('Race controls'));assert.ok(!screen.includes('reset slice'));console.log('PASS full game routes, bots, hazards and plain snapshots reach clients');
  sockets[0].emit('tune',{key:'gravity',value:19});await wait(40);assert.equal(game.sim.config.gravity,19);assert.equal(game.sim.world.gravity.y,-19);
  sockets[0].emit('tune',{key:'gravity',value:10000});await wait(40);assert.equal(game.sim.config.gravity,25);
  sockets[0].emit('tune',{key:'notASetting',value:1});await wait(40);assert.equal(game.sim.config.notASetting,undefined);console.log('PASS live physics tuning is bounded and updates Rapier gravity');
  sockets[0].emit('tune',{key:'gravity',value:14});
  const c=game.sim.climbers.get(first);for(const other of game.sim.climbers.values())for(const h of other.hands)if(other===c||h.grip?.id===c.id)game.sim.release(h,'test setup');c.stats.combos=3;c.body.setRotation({x:0,y:0,z:0,w:1},true);c.body.setLinvel({x:0,y:0,z:0},true);c.body.setAngvel({x:0,y:0,z:0},true);c.body.setTranslation({x:49.3,y:16.1,z:0},true);for(const h of c.hands){h.body.setTranslation({x:49.3+h.side*.35,y:16.7,z:0},true);h.body.setLinvel({x:0,y:0,z:0},true);}for(const f of c.feet){f.body.setTranslation({x:49.3+f.side*.2,y:15.1,z:0},true);f.body.setLinvel({x:0,y:0,z:0},true);}
  await wait(180);assert.equal(state.phase,'results');assert.equal(state.winner,first);assert.ok(awards.some(a=>a.val==='summit')&&awards.some(a=>a.title==='In Sync'&&a.val===3));console.log('PASS reaching main finish emits results and earned awards');
  sockets[0].emit('start');await wait(80);assert.equal(state.phase,'playing');assert.ok([...game.sim.climbers.values()].every(c=>c.stats.combos===0));
  sockets[0].emit('endRound');await wait(80);assert.equal(state.phase,'lobby');sockets[0].emit('clearBots');await wait(40);assert.equal(game.teams.size,2);console.log('PASS restart resets stats and hazards; end round and clear bots work');
  sockets[1].disconnect();await wait(80);assert.equal(p.role,'both');console.log('PASS teammate disconnect restores solo controls');
 }finally{sockets.forEach(s=>s.disconnect());await game.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
