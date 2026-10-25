// Each prologue section is played with the real controls: the move it teaches must work, and the
// section must actually need it (no skipping the lesson with a plain hop).
const assert=require('node:assert/strict');
const {Simulation}=require('./physics.cjs');
const {practice}=require('./courses.cjs');
const V=(x=0,y=0,z=0)=>({x,y,z});
const tick=(s,n)=>{for(let i=0;i<n;i++)s.step();};
function place(sim,c,x,y){
 for(const h of c.hands)sim.release(h,'section setup');
 c.body.setTranslation(V(x,y),true);c.body.setRotation({x:0,y:0,z:0,w:1},true);c.body.setLinvel(V(),true);c.body.setAngvel(V(),true);
 for(const h of c.hands){h.body.setTranslation(V(x+h.side*.35,y+.6),true);h.body.setLinvel(V(),true);h.noGripUntil=0;}
 for(const f of c.feet){f.body.setTranslation(V(x+f.side*.2,y-1.03),true);f.body.setLinvel(V(),true);}
 c.arms={aim:0,ay:.6,l:false,r:false,brace:true};c.legs={aim:0,ay:.6,brace:true};c.lastFoot=c.lastLetGo=c.lastPush=c.lastJump=c.lastCombo=-10;c.pushUntil=0;c.stamina=100;
 sim.world.propagateModifiedBodyPositionsToColliders();
}
const pos=c=>c.body.translation();
const hold=(sim,id)=>sim.holds.find(h=>h.id===id);
function hangFrom(sim,c,h){place(sim,c,h.x-.45,h.y-.8);sim.grab(c.hands[0],h);sim.grab(c.hands[1],h);c.arms={aim:.8,ay:.9,l:true,r:true,brace:true};c.legs.aim=.5;tick(sim,30);}
(async()=>{
 const sim=await Simulation.create(practice);
 try{
  const c=sim.spawn('prologue');tick(sim,120);
  assert.ok(sim.grounded(c)&&pos(c).x<3,'spawns standing in the meadow');
  console.log('PASS prologue: spawn standing in the meadow');

  // 1. the step: one hop, steering toward it with the arms tilt
  place(sim,c,6.5,1.05);tick(sim,60);c.arms.aim=.9;assert.ok(sim.gesture(c,'flick',1));tick(sim,30);c.arms.aim=0;tick(sim,150);
  assert.ok(pos(c).x>7.1&&pos(c).y>2.1,`a hop lands on the step (at ${pos(c).x.toFixed(2)}, ${pos(c).y.toFixed(2)})`);
  console.log('PASS prologue: one hop gets you up the step');

  // 2. the trench: a hop alone can't get out, the wall knob + a hop from the hang can
  place(sim,c,12.6,-.75);tick(sim,60);c.arms.aim=.9;sim.gesture(c,'flick',1);tick(sim,30);c.arms.aim=0;tick(sim,300);
  assert.ok(!(pos(c).x>14&&pos(c).y>2),`a plain hop does not get you out of the trench (at ${pos(c).x.toFixed(2)}, ${pos(c).y.toFixed(2)})`);
  const lip=hold(sim,'trench-lip');hangFrom(sim,c,lip);assert.ok(c.hands.some(h=>h.grip),'the trench lip knob holds you');
  assert.ok(sim.gesture(c,'flick',1));tick(sim,8);sim.setHand(c,0,false);sim.setHand(c,1,false);tick(sim,180);
  assert.ok(pos(c).x>14.1&&pos(c).y>2,`hang + hop + let go climbs out onto the shelf (at ${pos(c).x.toFixed(2)}, ${pos(c).y.toFixed(2)})`);
  console.log('PASS prologue: the trench needs a grip to climb out');

  // 3. the monkey bars over the trench can be caught from the step
  place(sim,c,9.75,2.45);tick(sim,60);c.arms={aim:.6,ay:1,l:true,r:true,brace:true};tick(sim,20);sim.gesture(c,'flick',1);
  let caught=false;for(let i=0;i<120&&!caught;i++){sim.step();caught=c.hands.some(h=>h.grip?.id?.startsWith?.('bar-')||String(h.grip?.id||'').startsWith('bar-'));}
  assert.ok(caught,'hop + reach catches the first monkey bar');
  console.log('PASS prologue: the monkey bars are reachable from the step');

  // 4. the wall: a plain hop from the high rung falls short, the combo clears the lip
  const rung=hold(sim,'wall-high');
  hangFrom(sim,c,rung);c.lastCombo=-10;assert.ok(sim.gesture(c,'flick',1));tick(sim,40);sim.setHand(c,0,false);sim.setHand(c,1,false);
  let plainPeak=0;for(let i=0;i<150;i++){sim.step();plainPeak=Math.max(plainPeak,pos(c).y);}
  assert.ok(plainPeak<6.2,`a plain hop from the rung can't reach the top (peak ${plainPeak.toFixed(2)})`);
  hangFrom(sim,c,rung);c.lastCombo=-10;assert.ok(sim.gesture(c,'flick',1));tick(sim,8);sim.setHand(c,0,false);sim.setHand(c,1,false);assert.equal(c.lastGestureResult,'combo');
  c.arms={aim:.9,ay:.6,l:true,r:true,brace:true};tick(sim,240);
  const onLip=c.hands.some(h=>String(h.grip?.id).includes('lip')||String(h.grip?.id).includes('summit'));
  assert.ok(onLip||pos(c).y>6,`the combo reaches the lip (at ${pos(c).x.toFixed(2)}, ${pos(c).y.toFixed(2)})`);
  if(onLip){tick(sim,60);c.lastCombo=-10;assert.ok(sim.gesture(c,'flick',1));tick(sim,8);sim.setHand(c,0,false);sim.setHand(c,1,false);c.arms.aim=.9;tick(sim,40);c.arms.aim=0;tick(sim,200);}
  assert.ok(pos(c).x>18.2&&pos(c).y>6,`the combo gets you onto the summit (at ${pos(c).x.toFixed(2)}, ${pos(c).y.toFixed(2)})`);
  console.log('PASS prologue: the wall needs the hop + let-go combo');

  // 5. the snowpal at the top takes a kick; the flag finishes the prologue
  const dummy=sim.objects.find(o=>o.kind==='dummy');const d=dummy.body.translation();
  place(sim,c,d.x-.8,6.65);tick(sim,60);assert.ok(sim.gesture(c,'kick',1));assert.equal(c.lastGestureResult,'kick');tick(sim,5);
  assert.ok(dummy.body.linvel().x>.1,'the snowpal gets kicked');
  place(sim,c,practice.finish.x,6.65);assert.ok(sim.snapshot(c).finished,'reaching the flag finishes the prologue');
  console.log('PASS prologue: snowpal kick and the summit flag');
 }finally{sim.free();}
})().catch(e=>{console.error(e);process.exitCode=1;});
