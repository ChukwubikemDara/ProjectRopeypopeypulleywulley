// Old Main's top roof: a student on an e-scooter waits past the flag, launches a quarter-second after you reach the
// roof and flings you off. A well-timed hop gets you over them; hanging off the edge lets them pass.
const assert=require('node:assert/strict');
const {Simulation}=require('./physics.cjs');
const {campus}=require('./courses.cjs');
const V=(x=0,y=0,z=0)=>({x,y,z});
const tick=(s,n)=>{for(let i=0;i<n;i++)s.step();};
function place(sim,c,x,y){for(const h of c.hands)sim.release(h,'s');c.body.setTranslation(V(x,y),true);c.body.setRotation({x:0,y:0,z:0,w:1},true);c.body.setLinvel(V(),true);c.body.setAngvel(V(),true);for(const h of c.hands){h.body.setTranslation(V(x+h.side*.35,y+.6),true);h.body.setLinvel(V(),true);h.noGripUntil=0;}for(const f of c.feet){f.body.setTranslation(V(x+f.side*.2,y-1.03),true);f.body.setLinvel(V(),true);}c.arms={aim:0,ay:.6,l:false,r:false,brace:true};c.legs={aim:0,ay:.6};c.tuck=0;c.lastJump=c.lastPush=c.lastLetGo=c.lastCombo=-10;c.stamina=100;sim.world.propagateModifiedBodyPositionsToColliders();}
const P=c=>c.body.translation();
(async()=>{
 const sim=await Simulation.create(campus);
 try{
  const c=sim.spawn('a'),sc=sim.objects.find(o=>o.kind==='scooter');tick(sim,60);
  assert.ok(Math.abs(sc.body.translation().x-sc.x1)<.01&&sc.state==='parked','the scooter waits past the flag until someone reaches the roof');
  assert.ok(campus.finish.x-campus.terrain.find(t=>t.id==='tower-high').pts[0][0]>9,'the top roof is long enough to need a dash across');
  place(sim,c,37.5,18.05);const t0=sim.time;let hitAt=null;for(let i=0;i<300;i++){sim.step();if(hitAt===null&&sim.events.some(e=>e.type==='bonk'&&e.by==='scooter'))hitAt=sim.time-t0;}
  assert.ok(hitAt!==null&&hitAt<1.4,`it comes almost instantly (hit ${hitAt?.toFixed(2)} s after arriving)`);assert.ok(P(c).y<16.5,'and flings you off the roof');
  console.log(`PASS scooter: launches as you arrive and flings you off ${hitAt.toFixed(2)} s later`);
  let survived=0;for(let t=0;t<3;t++){tick(sim,700);sim.events.length=0;place(sim,c,38,18.05);let hopped=false;for(let i=0;i<300;i++){sim.step();if(!hopped&&sc.state==='dash'&&sc.body.translation().x-P(c).x<2.8){sim.gesture(c,'flick',1.15);hopped=true;}}if(P(c).y>16.5)survived++;}
  assert.ok(survived>=2,`a well-timed hop gets you over it (${survived}/3)`);
  tick(sim,700);const lip=sim.holds.find(h=>h.id==='tower-high-lip'),d=sim.spawn('b');place(sim,c,lip.x-.45,lip.y-.8);sim.grab(c.hands[0],lip);sim.grab(c.hands[1],lip);c.arms={aim:.5,ay:.9,l:true,r:true,brace:true};tick(sim,10);
  place(sim,d,40,18.05);tick(sim,250);assert.ok(c.hands.some(h=>h.grip),'hanging off the edge, it passes over you');
  console.log('PASS scooter: a well-timed hop clears it, and hanging off the edge lets it pass');
  tick(sim,800);assert.equal(sc.state,'parked','it rolls back and parks again');
 }finally{sim.free();}
})().catch(e=>{console.error(e);process.exitCode=1;});
