const assert=require('node:assert/strict');
const {Simulation,course}=require('./physics.cjs');
(async()=>{
 const sim=await Simulation.create();
 try{
  const c=sim.spawn('route-check');
  assert.equal(c.body.translation().z,0,'Climber must spawn on the center line');
  assert.ok(course.holds.every(h=>h.z===0),'All usable holds must share the center line');
  c.depth=1;c.legs.ay=-1;c.body.applyImpulse({x:0,y:0,z:50},true);
  for(let i=0;i<180;i++)sim.step();
  assert.ok(Math.abs(c.body.translation().z)<1e-5,'Tilt or impulses must not move the body into depth lanes');
  assert.ok(c.hands.every(h=>Math.abs(h.body.translation().z)<1e-5),'Hands stay centered');
  console.log('PASS centered travel ignores depth input and impulses');
  // a hold inside the pipe must not be targeted from on top of its roof
  const P=course.pipe,knob=course.holds.find(h=>h.prop==='mitten');
  const inside={x:knob.x+P.normal[0]*1.3,y:knob.y+P.normal[1]*1.3,z:0};
  assert.equal(sim.visibleHold(inside,knob),false,'A hold inside the pipe must not be targeted through its roof');
  console.log('PASS holds behind solid terrain cannot be targeted');
  // Test genuine acquisition through targeting/forces, not a direct grab helper.
  const hold=course.holds.find(h=>h.kind==='handle'&&h.x>9);
  c.body.setTranslation({x:hold.x,y:hold.y-1,z:0},true);c.body.setLinvel({x:0,y:0,z:0},true);
  c.body.setRotation({x:0,y:0,z:0,w:1},true);c.body.setAngvel({x:0,y:0,z:0},true);
  c.arms={aim:0,ay:.6,l:true,r:true,brace:true};c.legs={aim:0,ay:.6};
  for(const h of c.hands){h.body.setTranslation({x:hold.x+h.side*.12,y:hold.y-.22,z:0},true);h.body.setLinvel({x:0,y:0,z:0},true);}
  for(const f of c.feet){f.body.setTranslation({x:hold.x+f.side*.2,y:hold.y-1.9,z:0},true);f.body.setLinvel({x:0,y:0,z:0},true);}
  for(let i=0;i<180;i++)sim.step();
  assert.ok(c.hands.some(h=>h.grip),'Closed hands must catch a reachable intended hold');
  let drift=0;
  for(let i=0;i<900;i++){sim.step();for(const h of c.hands)if(h.grip){const p=h.body.translation(),a=h.grip.hold;drift=Math.max(drift,Math.hypot(p.x-a.x,p.y-a.y,p.z-a.z));}}
  assert.ok(drift<.08,`Grips must stay stable; max drift ${drift}`);
  console.log('PASS targeted holds acquire and remain stable for 10 seconds');
  c.arms.l=c.arms.r=false;sim.step();assert.ok(c.hands.every(h=>!h.grip));
  console.log('PASS releasing pads removes anchors immediately');
  // High-speed falls and rotations across floor, roof, ledge joins and route endpoints.
  let minimum=Infinity;
  for(const x of [0,4.8,5.1,10,15,21.8,22.1,24,27]){
   const recoveryCount=c.recoveries;
   c.body.setTranslation({x,y:19,z:0},true);c.body.setLinvel({x:0,y:-55,z:0},true);
   c.body.setRotation({x:0,y:0,z:Math.sin(.3),w:Math.cos(.3)},true);c.body.setAngvel({x:2,y:1,z:3},true);
   c.arms={aim:0,ay:.6,l:false,r:false,brace:true};c.legs={aim:0,ay:.6};
   for(const h of c.hands){h.body.setTranslation({x:x+h.side*.3,y:19.5,z:0},true);h.body.setLinvel({x:0,y:-55,z:0},true);}
   for(const f of c.feet){f.body.setTranslation({x:x+f.side*.2,y:18.1,z:0},true);f.body.setLinvel({x:0,y:-55,z:0},true);}
   for(let i=0;i<360;i++){sim.step();const p=c.body.translation();minimum=Math.min(minimum,p.y);assert.ok(p.y>.1&&Number.isFinite(p.x),'High-speed fall must not pass through solid course or apron');}
   assert.equal(c.recoveries,recoveryCount,`Fast fall at x=${x} must be caught by collisions, without recovery masking tunneling`);
  }
  console.log(`PASS nine high-speed falls stay above map floor (lowest torso ${minimum.toFixed(2)}m)`);
  c.body.setTranslation({x:12,y:-9,z:0},true);sim.step();
  assert.ok(c.body.translation().y>0,'Out-of-map state recovers to safe terrain');
  assert.equal(sim.climbers.get(c.id),c,'Recovery preserves the player/team object');
  console.log('PASS recovery preserves the player and clears invalid position');
 }finally{sim.free();}
})().catch(e=>{console.error(e);process.exitCode=1;});
