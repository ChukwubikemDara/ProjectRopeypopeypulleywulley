// Each prologue obstacle is played with the real controls: the move its narration introduces must
// work, and the obstacle must actually need it (no skipping the lesson with a plain hop).
const assert=require('node:assert/strict');
const {Simulation,progressAt}=require('./physics.cjs');
const {practice}=require('./courses.cjs');
const {Prologue}=require('./prologue.cjs');
const V=(x=0,y=0,z=0)=>({x,y,z});
const tick=(s,n)=>{for(let i=0;i<n;i++)s.step();};
function place(sim,c,x,y){
 for(const h of c.hands)sim.release(h,'section setup');
 c.body.setTranslation(V(x,y),true);c.body.setRotation({x:0,y:0,z:0,w:1},true);c.body.setLinvel(V(),true);c.body.setAngvel(V(),true);
 for(const h of c.hands){h.body.setTranslation(V(x+h.side*.35,y+.6),true);h.body.setLinvel(V(),true);h.noGripUntil=0;}
 for(const f of c.feet){f.body.setTranslation(V(x+f.side*.2,y-1.03),true);f.body.setLinvel(V(),true);}
 c.arms={aim:0,ay:.6,l:false,r:false,brace:true};c.legs={aim:0,ay:.6,brace:true};c.tuck=0;c.lastFoot=c.lastLetGo=c.lastPush=c.lastJump=c.lastCombo=-10;c.pushUntil=0;c.stamina=100;
 sim.world.propagateModifiedBodyPositionsToColliders();
}
const pos=c=>c.body.translation(),at=c=>`(${pos(c).x.toFixed(2)}, ${pos(c).y.toFixed(2)})`;
const hold=(sim,id)=>sim.holds.find(h=>h.id===id);
const gripping=(c,prefix)=>c.hands.some(h=>String(h.grip?.id||'').startsWith(prefix));
function hangFrom(sim,c,h,side=1){place(sim,c,h.x-.45*side,h.y-.8);sim.grab(c.hands[0],h);sim.grab(c.hands[1],h);c.arms={aim:.8*side,ay:.9,l:true,r:true,brace:true};c.legs.aim=.5*side;tick(sim,30);}
// hop while steering toward +x (or -x) for a moment, like a player tilting the arms
function hop(sim,c,side=1,steer=30,after=200){c.arms.aim=.9*side;assert.ok(sim.gesture(c,'flick',1));tick(sim,steer);c.arms.aim=0;tick(sim,after);}
// hop with the hands closed and reaching, to catch something overhead
function reachHop(sim,c,prefix,side=1){c.arms={aim:.6*side,ay:1,l:true,r:true,brace:true};tick(sim,20);sim.gesture(c,'flick',1);for(let i=0;i<150;i++){sim.step();if(gripping(c,prefix))return true;}return false;}
// hang, hop, let go together (the combo), keep reaching, then hop over whatever lip you caught
function climbOut(sim,c,side=1){assert.ok(sim.gesture(c,'flick',1));tick(sim,8);sim.setHand(c,0,false);sim.setHand(c,1,false);c.arms={aim:.9*side,ay:.6,l:false,r:false,brace:true};tick(sim,75);c.arms.aim=0;tick(sim,200);}
(async()=>{
 const sim=await Simulation.create(practice);
 try{
  const a=sim.spawn('left'),b=sim.spawn('right');tick(sim,120);
  assert.ok(pos(a).x<-30&&pos(b).x>30&&sim.grounded(a)&&sim.grounded(b),'one team wakes up in each lane');
  assert.ok(Math.abs(progressAt(-20,4,practice)-progressAt(20,4,practice))<1e-9,'both lanes measure progress the same way');
  sim.removeClimber?.(b.id);
  const c=a;console.log('PASS prologue: one team in each mirrored lane, same progress measure');

  // the ledge: a hop alone falls short; hop + grab + hop from the hang gets you up
  place(sim,c,-22.3,1.05);tick(sim,40);hop(sim,c);
  assert.ok(!(pos(c).x>-21&&pos(c).y>3.8),`a plain hop can't get up the ledge ${at(c)}`);
  place(sim,c,-21.5,1.05);tick(sim,40);assert.ok(reachHop(sim,c,'ledge-lip'),'hop + reach catches the ledge lip');
  hangFrom(sim,c,hold(sim,'ledge-lip'));climbOut(sim,c);
  assert.ok(pos(c).x>-21&&pos(c).y>3.8,`from the lip, a hop gets you on top ${at(c)}`);
  console.log('PASS prologue: the ledge needs arms and legs together');

  // the gap: a hop can't clear it; the bar can be caught, and from the bar you reach the landing
  place(sim,c,-15.5,4.05);tick(sim,40);hop(sim,c);
  assert.ok(!(pos(c).x>-10.5&&pos(c).y>6.3),`a plain hop doesn't clear the gap ${at(c)}`);
  place(sim,c,-15.5,4.05);tick(sim,40);assert.ok(reachHop(sim,c,'gap-bar'),'jump + reach catches the bar over the gap');
  hangFrom(sim,c,hold(sim,'gap-bar'));climbOut(sim,c);
  assert.ok(pos(c).x>-10.5&&pos(c).y>6.3,`from the bar you reach the landing ${at(c)}`);
  console.log('PASS prologue: the gap needs a jump and a reach');

  // fall into the gap: the return ramp lets you hop back up onto the ledge
  place(sim,c,-12.5,2.6);tick(sim,150);assert.ok(pos(c).x<-13.8,`the ramp slides you back toward the ledge ${at(c)}`);hop(sim,c,-1);
  assert.ok(pos(c).x<-15&&pos(c).y>3.8,`the return ramp leads back onto the ledge ${at(c)}`);
  console.log('PASS prologue: a fall in the gap only costs the gap');

  // the wall at the end of the beam: reachable from the beam, a plain hop from the rung falls short, the combo clears it
  place(sim,c,-4.7,6.65);tick(sim,40);assert.ok(reachHop(sim,c,'wall-'),'the wall rungs are reachable from the end of the beam');
  const rung=hold(sim,'wall-high');hangFrom(sim,c,rung);assert.ok(sim.gesture(c,'flick',1));tick(sim,40);sim.setHand(c,0,false);sim.setHand(c,1,false);
  let peak=0;for(let i=0;i<150;i++){sim.step();peak=Math.max(peak,pos(c).y);}
  assert.ok(peak<10.4,`a plain hop from the rung can't reach the platform (peak ${peak.toFixed(2)})`);
  hangFrom(sim,c,rung);c.lastCombo=-10;assert.ok(sim.gesture(c,'flick',1));tick(sim,8);sim.setHand(c,0,false);sim.setHand(c,1,false);assert.equal(c.lastGestureResult,'combo');
  c.arms={aim:.9,ay:.6,l:true,r:true,brace:true};tick(sim,240);
  const onLip=gripping(c,'top-lip');assert.ok(onLip||pos(c).y>10.4,`the combo reaches the lip ${at(c)}`);
  if(onLip){tick(sim,60);c.lastCombo=-10;climbOut(sim,c);}
  assert.ok(pos(c).x>-4&&pos(c).y>10.4,`the combo gets you onto the start platform ${at(c)}`);
  assert.ok(sim.snapshot(c).finished,'the start platform counts as the end of the prologue');
  console.log('PASS prologue: the wall after the beam needs the hop + let-go combo');

  // the right lane is the mirror image
  place(sim,c,21.5,1.05);tick(sim,40);assert.ok(reachHop(sim,c,'ledge-lip-r',-1),'the right lane ledge works the same, mirrored');
  console.log('PASS prologue: the right lane mirrors the left');

  // fall bookkeeping: the section you fell from, landing back at the start, arms and legs pulling apart
  const pr=new Prologue();pr.reset(sim);pr.narrator.introDone=true;place(sim,c,-17,4.05);tick(sim,40);pr.tick(sim.time,progressAt);assert.equal(c.section,'ledge');
  const hush=()=>{pr.narrator.queue.length=0;pr.narrator.played.clear();pr.narrator.lastFallLine=-Infinity;pr.narrator.busyUntil=-Infinity;}; // only the cause is under test here, not the spacing
  hush();  pr.event({type:'fall',id:c.id,m:3,x:-25,y:1},sim.time);assert.equal(pr.narrator.queue[0]?.line.id,'fall-start','falling off the ledge back to the wake-up spot');
  pr.narrator.queue.length=0;c.arms.aim=.8;c.legs.aim=-.8;pr.tick(sim.time+9,progressAt);hush();
  pr.event({type:'fall',id:c.id,m:2,x:-17,y:4},sim.time+9);assert.equal(pr.narrator.queue[0]?.line.id,'fall-opposite','arms and legs leaning opposite ways just before the fall');
  place(sim,c,-34,1.05);c.arms.aim=c.legs.aim=0;tick(sim,40);assert.equal(c.slumped,undefined);pr.spawned(c);tick(sim,60);const slumpY=pos(c).y;pr.input(c,'legs',{aim:.6});tick(sim,90);
  assert.ok(pos(c).y>slumpY+.2,`standing up raises the body (${slumpY.toFixed(2)} -> ${pos(c).y.toFixed(2)})`);
  console.log('PASS prologue: falls are attributed to the right section and cause; the slumped body stands up when the legs move');

  // what counts as a fall: real height lost, not a hop, not a teleport
  place(sim,c,-33,1.05);tick(sim,60);sim.events.length=0;assert.ok(sim.gesture(c,'flick',1.15));tick(sim,200);
  assert.equal(sim.events.filter(e=>e.type==='fall').length,0,'a big hop that lands where it started is not a fall');
  place(sim,c,-17,4.05);tick(sim,60);sim.events.length=0;c.arms.aim=-.9;sim.gesture(c,'flick',1);tick(sim,30);tick(sim,200);
  assert.ok(sim.events.some(e=>e.type==='fall'),'hopping off the ledge to the ground below is a fall');
  place(sim,c,-9.8,6.65);tick(sim,60);sim.events.length=0;sim.practiceStation(c,{x:-33,y:1.05});tick(sim,120);
  assert.equal(sim.events.filter(e=>e.type==='fall').length,0,'a section reset down to a lower spot is not a fall');
  // kicks only count while waiting at the barrier
  const pk=new Prologue();pk.reset(sim);pk.narrator.introDone=true;place(sim,c,-17,4.05);tick(sim,20);pk.event({type:'kick',id:c.id,target:'x'},sim.time);
  assert.equal(pk.narrator.queue.length,0,'a kick on the course is not the waiting-at-the-barrier joke');
  place(sim,c,-2.5,10.85);tick(sim,30);pk.event({type:'kick',id:c.id,target:'x'},sim.time);assert.equal(pk.narrator.queue[0]?.line.id,'kick-wait','a kick at the barrier is');
  console.log('PASS prologue: hops and resets are not falls; real drops are; kicks only count at the barrier');
 }finally{sim.free();}
})().catch(e=>{console.error(e);process.exitCode=1;});
