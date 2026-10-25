// Rivalry between two teams of real phones (each an ARMS and a LEGS socket): kicks, grabbing a rival, betrayal,
// standings, a finish that both teams hear about, awards, and a rival leaving mid-race.
const assert=require('node:assert/strict');
const {io}=require('socket.io-client');
const {createServer}=require('./server.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const V=(x=0,y=0,z=0)=>({x,y,z});
function place(sim,c,x,y){for(const h of c.hands)sim.release(h,'test setup');for(const o of sim.climbers.values())for(const h of o.hands)if(h.grip?.id===c.id)sim.release(h,'test setup');
 const p=c.body.translation(),d={x:x-p.x,y:y-p.y};for(const b of sim.parts(c)){const q=b.translation();b.setTranslation(V(q.x+d.x,q.y+d.y),true);b.setLinvel(V(),true);}c.body.setRotation({x:0,y:0,z:0,w:1},true);c.body.setAngvel(V(),true);c.lastKick=-10;sim.world.propagateModifiedBodyPositionsToColliders();}
(async()=>{
 const game=await createServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${game.server.address().port}`,sockets=[],events=[],results={};let state;
 const connect=async(surface,name)=>{const s=io(url,{transports:['websocket'],auth:{surface}});sockets.push(s);await new Promise(r=>s.on('connect',r));s.on('results',r=>results[name]=r);if(name)s.emit('join',{name});await wait(60);return s;};
 try{
  const host=await connect('spectator');host.on('event',e=>events.push(e));host.on('state3d',s=>state=s);
  const aArms=await connect('phone','A arms'),aLegs=await connect('phone','A legs'),bArms=await connect('phone','B arms'),bLegs=await connect('phone','B legs');
  const P=s=>game.players.get(s.id),A=P(aArms).team,B=P(bArms).team;
  assert.ok(A!==B&&P(aLegs).team===A&&P(bLegs).team===B,'four phones make two teams');
  assert.deepEqual([P(aArms).role,P(aLegs).role,P(bArms).role,P(bLegs).role],['arms','legs','arms','legs'],'each team has an arms and a legs phone');
  host.emit('start');await wait(300);const sim=game.sim,a=sim.climbers.get(A),b=sim.climbers.get(B);
  let aHolding=false; // what team A's arms player is doing with the pads
  const heartbeat=setInterval(()=>{for(const s of [aArms,bArms])s.emit('input',{aim:0,ay:.6,l:s===aArms&&aHolding,r:s===aArms&&aHolding,brace:true});for(const s of [aLegs,bLegs])s.emit('input',{aim:0,ay:.6,brace:true});},150);
  const kick=s=>new Promise(r=>s.timeout(1000).emit('gesture','kick',1,(e,res)=>r(e?'lost':res.result)));
  try{
   console.log('PASS four phones form two teams, each with an ARMS and a LEGS player');
   // kicks across teams
   place(sim,a,2.0,1.05);place(sim,b,3.1,1.05);await wait(300);const vx=b.body.linvel().x;
   assert.equal(await kick(aLegs),'kick','team A legs kick team B');assert.ok(b.body.linvel().x>vx+1,'the rival is shoved away');
   assert.equal(await kick(aArms),'arms cannot use leg actions','an ARMS phone cannot kick');
   assert.equal(await kick(aLegs),'cooldown','kicks have a cooldown');
   place(sim,a,2.0,1.05);place(sim,b,3.1,1.05);await wait(300);assert.equal(await kick(bLegs),'kick','team B can kick back');await wait(200);
   assert.ok(events.some(e=>e.type==='kick'&&e.id===A&&e.target===B)&&events.some(e=>e.type==='kick'&&e.id===B&&e.target===A),'both kicks are announced to the big screen');
   console.log('PASS kicks: either team can kick the other, ARMS cannot, and there is a cooldown');
   // grabbing a rival in the air, carrying them, then betrayal
   aHolding=true;await wait(200);const rung=sim.holds.filter(h=>h.kind==='rung')[5];place(sim,a,rung.x,rung.y-.8);place(sim,b,rung.x-1.05,rung.y-1.55);
   sim.grab(a.hands[0],rung);a.arms.l=true;const ah=a.hands[1].body.translation();b.hands[0].body.setTranslation(V(ah.x+.04,ah.y),true);
   assert.ok(sim.grabClimber(a,a.hands[1]),'team A grabs team B by the hand');a.arms.r=true;await wait(800);
   assert.ok(events.some(e=>e.type==='handhold'&&e.id===A&&e.target===B),'the grab is announced');assert.ok(a.hands[1].grip?.id===B,'and holds');
   aHolding=false;sim.release(a.hands[1]);await wait(150);assert.ok(events.some(e=>e.type==='drop'&&e.id===A&&e.victim===B),'letting a dangling rival go counts as a betrayal');assert.equal(a.stats.drops,1);
   console.log('PASS grabbing a rival mid-air holds them, and letting them drop counts as a betrayal');
   // standings: whoever is further along the route ranks first on the big screen
   place(sim,a,30,16.05);place(sim,b,10,4.5);await wait(400);const ranked=state.climbers.slice().sort((x,y)=>y.progress-x.progress).map(c=>c.id);assert.deepEqual(ranked,[A,B],'standings rank by progress');
   console.log('PASS standings rank teams by how far along the route they are');
   // the finish: team A wins, both teams' phones get the results, with the race awards
   a.stats.kicks=3;const finish=sim.course.finish;place(sim,a,finish.x,finish.y+1.05);await wait(400);
   assert.equal(state.phase,'results');assert.equal(state.winner,A,'the first team to the flag wins');
   for(const name of ['A arms','A legs','B arms','B legs'])assert.ok(results[name]?.some(r=>r.val==='summit'&&r.id===A),`${name} sees who won`);
   assert.ok(results['B legs'].some(r=>r.title==='Kickboxer'&&r.id===A),'rivalry awards are handed out (Kickboxer)');
   console.log('PASS the first team to the flag wins; every phone on both teams sees the result and the awards');
   // next race, then a rival leaves mid-race: the race carries on and their partner plays solo
   host.emit('start');await wait(300);assert.equal(state.phase,'playing');bLegs.disconnect();await wait(200);
   assert.equal(P(bArms).role,'both','the remaining rival plays arms and legs');assert.equal(state.phase,'playing','the race carries on');assert.equal(game.sim.climbers.size,2);
   console.log('PASS a rival leaving mid-race leaves the race running, and their partner plays solo');
  }finally{clearInterval(heartbeat);}
 }finally{sockets.forEach(s=>s.disconnect());await game.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
