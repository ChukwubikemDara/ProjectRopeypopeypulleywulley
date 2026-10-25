const assert=require('node:assert/strict');
const {Simulation,course}=require('./physics.cjs');
const R=require('@dimforge/rapier3d-compat');
const tick=(sim,n)=>{for(let i=0;i<n;i++)sim.step();};
function hangOpen(sim,c){
 for(const h of c.hands)sim.release(h);
 c.body.setTranslation({x:1,y:5,z:0},true);c.body.setLinvel({x:0,y:0,z:0},true);c.body.setAngvel({x:0,y:0,z:0},true);c.body.setRotation({x:0,y:0,z:0,w:1},true);
 for(const f of c.feet){f.body.setTranslation({x:1+f.side*.2,y:4.1,z:0},true);f.body.setLinvel({x:0,y:0,z:0},true);}
 for(const [i,h]of c.hands.entries())sim.grab(h,{id:'open-'+i,x:1+h.side*.35,y:6,z:0});
 c.arms={aim:0,ay:.6,l:true,r:true,brace:true};c.legs={aim:0,ay:.6};c.lastFoot=c.lastPush=c.lastLetGo=c.lastJump=c.lastCombo=-10;c.pushUntil=0;c.stamina=100;
}
(async()=>{
 const sim=await Simulation.create();
 try{
  const c=sim.spawn('mechanics');
  assert.ok(c.feet?.length===2&&c.feet.every(f=>f.body),'Legs must have physical feet rather than visual-only endpoints');
  tick(sim,180);assert.ok(sim.grounded(c),'Physical feet establish footing');
  console.log('PASS physical feet establish footing');
  const foot0=c.feet[0].body.translation().x-c.body.translation().x;
  c.legs.aim=.8;tick(sim,35);const foot1=c.feet[0].body.translation().x-c.body.translation().x;
  assert.ok(foot1-foot0>.12,'Leg lean moves physical feet');console.log('PASS leg lean swings feet');
  sim.recover(c);tick(sim,180);c.legs.aim=0;
  const y=c.body.translation().y;c.arms.aim=.8;c.arms.ay=1;
  let peak=y;for(let i=0;i<180;i++){sim.step();peak=Math.max(peak,c.body.translation().y);}
  assert.ok(peak-y<.5,'Arm aiming alone must not provide a jump');console.log('PASS arm aim does not supply a jump');
  sim.recover(c);c.arms.aim=0;c.arms.ay=.6;c.legs.aim=0;tick(sim,180);
  const start=c.body.translation().y;
  assert.ok(sim.gesture(c,'flick',1),'Grounded legs hop accepted');
  let hop=start;for(let i=0;i<70;i++){sim.step();hop=Math.max(hop,c.body.translation().y);}
  assert.ok(hop-start>1,'Leg hop must produce an actual jump');console.log('PASS legs hop launches the body');
  sim.recover(c);tick(sim,150);const vy=c.body.linvel().y;sim.gesture(c,'yank',1);tick(sim,10);
  assert.ok(c.tuck>sim.time,'Squat tucks the legs');console.log('PASS squat tucks physical feet');
  for(const order of ['hop-first','release-first']){
   hangOpen(sim,c);tick(sim,20);
   assert.ok(!sim.grounded(c),'Combo setup hangs without footing');
   if(order==='hop-first'){sim.gesture(c,'flick',1);tick(sim,10);sim.setHand(c,0,false);sim.setHand(c,1,false);}
   else{sim.setHand(c,0,false);sim.setHand(c,1,false);tick(sim,10);sim.gesture(c,'flick',1);}
   assert.equal(c.lastGestureResult,'combo',`${order} within .4 seconds should launch a combo`);
   tick(sim,12);assert.ok(c.body.linvel().y>8,'Combo is stronger than the normal hop');
   assert.ok(c.hands.every(h=>!h.grip),'Combo releases hands');
   console.log('PASS '+order+' combo launches and releases hands');
  }
  hangOpen(sim,c);tick(sim,20);
  sim.setHand(c,0,false);sim.setHand(c,1,false);tick(sim,50);
  assert.equal(sim.gesture(c,'flick',1),false,'Late hop in midair must not create another jump');console.log('PASS no air jump after the release window');
  assert.ok(Number.isFinite(c.body.translation().y));
  const hold={x:-20,y:5,z:0};
  const support=sim.world.createCollider(R.ColliderDesc.ball(.11).setTranslation(hold.x,hold.y,0).setCollisionGroups((8<<16)|16).setActiveHooks(R.ActiveHooks.FILTER_CONTACT_PAIRS));sim.holdShapes.set(support.handle,hold);
  const probe=sim.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(hold.x,hold.y-.45,0).setGravityScale(0));
  const col=sim.world.createCollider(R.ColliderDesc.ball(.1).setMass(.28).setCollisionGroups((16<<16)|8),probe);
  probe.setLinvel({x:0,y:6,z:0},true);
  for(let i=0;i<20;i++){sim.footStates.set(col.handle,{y:probe.translation().y,vy:probe.linvel().y});sim.world.step(sim.contactEvents,sim.hooks);}
  assert.ok(probe.translation().y>hold.y+.4&&probe.linvel().y>5,'An ascending foot must not snag a hold');
  probe.setTranslation({x:hold.x,y:hold.y+.65,z:0},true);probe.setLinvel({x:0,y:-2,z:0},true);probe.setGravityScale(1,true);
  for(let i=0;i<180;i++){sim.footStates.set(col.handle,{y:probe.translation().y,vy:probe.linvel().y});sim.world.step(sim.contactEvents,sim.hooks);}
  assert.ok(probe.translation().y>hold.y+.15&&probe.translation().y<hold.y+.3,'A descending foot can stand on the hold');
  sim.footStates.delete(col.handle);sim.world.removeRigidBody(probe);
  console.log('PASS feet pass upward through holds and land on top');
 }finally{sim.free();}
})().catch(e=>{console.error(e);process.exitCode=1;});
