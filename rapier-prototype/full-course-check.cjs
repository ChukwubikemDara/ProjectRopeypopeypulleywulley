const assert=require('node:assert/strict');
const {Simulation,course,progressAt}=require('./physics.cjs');
const source=require('./course-source.cjs');
const V=(x=0,y=0,z=0)=>({x,y,z});
const tick=(sim,n)=>{for(let i=0;i<n;i++)sim.step();};
function place(sim,c,x,y){
 for(const h of c.hands)sim.release(h,'test setup');
 c.body.setTranslation(V(x,y),true);c.body.setLinvel(V(),true);c.body.setAngvel(V(),true);c.body.setRotation({x:0,y:0,z:0,w:1},true);
 for(const h of c.hands){h.body.setTranslation(V(x+h.side*.35,y+.6),true);h.body.setLinvel(V(),true);h.noGripUntil=0;}
 for(const f of c.feet){f.body.setTranslation(V(x+f.side*.2,y-1.03),true);f.body.setLinvel(V(),true);}
 c.arms={aim:0,ay:.6,l:false,r:false,brace:true};c.legs={aim:0,ay:.6,brace:true};c.lastFoot=c.lastLetGo=c.lastPush=c.lastJump=c.lastCombo=-10;c.pushUntil=0;c.stamina=100;
 sim.world.propagateModifiedBodyPositionsToColliders();
}
(async()=>{
 const sim=await Simulation.create();try{
 assert.deepEqual(course.terrain,source.terrain);assert.deepEqual(course.path,source.path);assert.deepEqual(course.finish,source.finish);
 assert.equal(course.holds.length,source.holds.length+2);assert.ok(course.holds.some(h=>h.kind==='twig')&&course.holds.some(h=>h.kind==='rung'));
 assert.ok(progressAt(49.5,19.4)>.98&&progressAt(49,16)<.95&&progressAt(26.5,9)<.75); // the flag is on the raised deck nowconsole.log('PASS complete main terrain, holds, cart, racing line and finish');
 const a=sim.spawn('A'),b=sim.spawn('B'),twig=sim.holds.find(h=>h.kind==='twig');
 place(sim,a,twig.x-.4,twig.y-.75);sim.grab(a.hands[0],twig);sim.grab(a.hands[1],twig);a.arms={aim:.3,ay:.9,l:true,r:true,brace:true};a.legs.aim=.4;
 tick(sim,35);assert.ok(!sim.grounded(a),'Wall contact cannot be footing');assert.ok(a.hands.some(h=>h.grip?.id===twig.id));
 assert.ok(sim.gesture(a,'flick',1));tick(sim,10);sim.setHand(a,0,false);sim.setHand(a,1,false);assert.equal(a.lastGestureResult,'combo');
 let peak=0;for(let i=0;i<130;i++){sim.step();peak=Math.max(peak,...a.hands.map(h=>h.body.translation().y));}
 assert.ok(peak>14.8,`Twig combo must reach wall lip, got ${peak}`);console.log('PASS real twig combo reaches the wall top; wall is not footing');
 place(sim,a,twig.x-.4,twig.y-.75);twig.loadMs=0;sim.grab(a.hands[0],twig);a.arms.l=true;tick(sim,240);
 assert.ok(twig.brokenUntil>sim.time&&a.hands.every(h=>h.grip?.id!==twig.id));assert.equal(twig.collider.isEnabled(),false);assert.ok(sim.events.some(e=>e.type==='snap'));
 tick(sim,560);assert.ok(twig.brokenUntil<=sim.time&&twig.collider.isEnabled());console.log('PASS twig strains, snaps, releases hands and regrows');
 const cart=sim.objects[0],handle=sim.holds.find(h=>h.objectId===cart.id),start=cart.body.translation().x;
 place(sim,a,start+handle.local.x-.45,handle.y-.8);sim.grab(a.hands[0],handle);a.arms.l=true;tick(sim,100); // hang beside the bus from its roof rail
 const hp=a.hands[0].body.translation(),cp=cart.body.translation();assert.ok(Math.abs(hp.x-(cp.x+handle.local.x))<.08);assert.ok(Math.abs(cp.x-start)>1);assert.equal(a.hands[0].grip.anchor,cart.body);
 for(let i=0;i<1500;i++){sim.step();const x=cart.body.translation().x;assert.ok(x>=cart.x0-.01&&x<=cart.x1+.01);}
 console.log('PASS cart reverses inside course limits and real grip joints ride its moving handles');
 // Place a body in the cart's path and wait for an actual Rapier contact, not a distance-only hit.
 place(sim,b,cart.body.translation().x+cart.direction*1.7,16.05);const eventAt=sim.events.length;tick(sim,180);
 assert.ok(sim.events.slice(eventAt).some(e=>e.type==='bonk'&&e.id===b.id));console.log('PASS moving cart physically contacts and bonks a rival');
 // Isolated open-air handhold, anchored to a ladder rung above the ledge.
 const rung=sim.holds.filter(h=>h.kind==='rung')[5];place(sim,a,rung.x,rung.y-.8);place(sim,b,rung.x-1.05,rung.y-1.55);
 sim.grab(a.hands[0],rung);a.arms.l=true;
 const ah=a.hands[1].body.translation();b.hands[0].body.setTranslation(V(ah.x+.04,ah.y),true);
 assert.ok(sim.grabClimber(a,a.hands[1]));a.arms.r=true;
 a.braced=true;const energy=a.stamina;tick(sim,180);assert.equal(a.carry,1);assert.ok(a.stamina<energy-15);assert.equal(a.stats.saves,1);
 b.lastFoot=b.lastLetGo=-10;assert.equal(sim.gesture(b,'flick',1),false,'A midair handhold cannot create footing');
 sim.release(a.hands[1]);assert.ok(sim.events.some(e=>e.type==='drop'&&e.id===a.id&&e.victim===b.id));console.log('PASS holding hands, carrying drain, betrayal and no airborne leapfrog exploit');
 // The anchored carrier can support a boost from above, but a floating rival cannot.
 place(sim,a,1,1.05);tick(sim,150);place(sim,b,a.body.translation().x,a.body.translation().y+.95);sim.world.step(sim.contactEvents,sim.hooks);
 assert.equal(sim.below(b,true),a);assert.ok(sim.gesture(b,'flick',1));assert.equal(b.stats.boosts,1);assert.ok(b.pushSpeed>sim.config.legPushSpeed*1.4);console.log('PASS jumping from a supported climber gives a team boost');
 // Unsteady carrier overload uses the same half-second grace period as main.
 place(sim,a,rung.x,rung.y-.8);place(sim,b,rung.x-1.05,rung.y-1.55);sim.grab(a.hands[0],rung);a.arms.l=true;
 const point=a.hands[1].body.translation();b.hands[0].body.setTranslation(V(point.x+.03,point.y),true);sim.grabClimber(a,a.hands[1]);a.arms.r=true;a.braced=false;
 for(let i=0;i<50;i++){sim.time+=1/90;sim.carryStep(a);}
 assert.ok(a.hands.every(h=>!h.grip));assert.ok(sim.events.some(e=>e.type==='slip'&&e.reason==='ripped'));console.log('PASS shaky carrying rips grips after the grace period');
 // Lifecycle cleanup must remove incoming joints before removing the target rigid body.
 place(sim,a,8,15);place(sim,b,8.8,14.2);b.hands[0].body.setTranslation(a.hands[1].body.translation(),true);assert.ok(sim.grabClimber(b,b.hands[0]));sim.remove(a.id);assert.ok(b.hands.every(h=>!h.grip));
 place(sim,b,49.5,19.25);assert.ok(sim.snapshot(b).finished&&sim.snapshot(b).progress>.98);b.stats.combos=2;assert.ok(sim.results(b.id).some(a=>a.title==='In Sync'&&a.val===2));console.log('PASS disconnect releases incoming grips; full finish and stat awards work');
 sim.reset();assert.equal(sim.holds.find(h=>h.kind==='twig').loadMs,0);assert.equal(sim.objects[0].body.translation().x,31);
 for(let i=0;i<4;i++){const c=sim.spawn('bot'+i);c.bot=true;}
 tick(sim,2700);for(const c of sim.climbers.values()){const snap=sim.snapshot(c);assert.ok([snap.x,snap.y,snap.z,...Object.values(snap.rotation)].every(Number.isFinite));assert.ok(Math.abs(snap.z)<1e-5);}
 console.log('PASS reset restores course hazards; four bots remain finite for 30 seconds');
 }finally{sim.free();}
})().catch(e=>{console.error(e);process.exitCode=1;});
