// Kick through the real socket path: phone gesture -> server role check -> simulation range/cooldown -> rival physics.
const assert=require('node:assert/strict');
const {io}=require('socket.io-client');
const {createServer}=require('./server.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const kick=s=>new Promise(r=>s.timeout(1000).emit('gesture','kick',1,(err,res)=>r(err?'lost':res.result)));
(async()=>{
 const game=await createServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${game.server.address().port}`,sockets=[0,1,2,3].map(()=>io(url,{transports:['websocket']}));
 try{
  await Promise.all(sockets.map(s=>new Promise(r=>s.on('connect',r))));
  for(const [i,s]of sockets.entries()){s.emit('join',{name:'P'+i});await wait(40);}
  const role=s=>game.players.get(s.id).role,[aArms,aLegs,,bLegs]=sockets;
  assert.equal(role(aArms),'arms');assert.equal(role(aLegs),'legs');
  game.start();await wait(300);
  const team=s=>game.sim.climbers.get(game.players.get(s.id).team),a=team(aLegs),b=team(bLegs);
  const place=(c,x)=>{for(const h of c.hands)game.sim.release(h,'test setup');const t=c.body.translation(),dx=x-t.x;for(const p of [c,...c.feet,...c.hands]){const q=p.body.translation();p.body.setTranslation({x:q.x+dx,y:q.y,z:0},true);p.body.setLinvel({x:0,y:0,z:0},true);}c.lastKick=-10;};
  const side=async gap=>{place(a,1.2);place(b,1.2+gap);await wait(250);};
  await side(1.1);
  assert.equal(await kick(aArms),'arms cannot use leg actions');assert.ok(Math.abs(b.body.linvel().x)<.5,'arms kick must not move the rival');
  console.log('PASS ARMS cannot trigger a kick');
  assert.equal(await kick(aLegs),'kick');assert.ok(b.body.linvel().x>1,'kicked rival is shoved away');
  console.log('PASS LEGS kick a rival standing beside them (1.1 m apart)');
  assert.equal(await kick(aLegs),'cooldown');console.log('PASS kick cooldown blocks an immediate second kick');
  await side(2.5);assert.equal(await kick(aLegs),'no rival nearby');assert.ok(Math.abs(b.body.linvel().x)<.5);
  console.log('PASS out-of-range kick reports "no rival nearby"');
 }finally{sockets.forEach(s=>s.disconnect());await game.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
