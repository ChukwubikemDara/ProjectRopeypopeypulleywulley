const assert=require('node:assert/strict');
const {Simulation,progressAt}=require('./physics.cjs');
const {harness}=require('./calibration-check.cjs');
const {all,forest,campus,nextRace}=require('./courses.cjs');
const V=(x=0,y=0,z=0)=>({x,y,z});
function place(sim,c,x,y,vy=0){
 for(const h of c.hands)sim.release(h,'section setup');
 c.body.setTranslation(V(x,y),true);c.body.setRotation({x:0,y:0,z:0,w:1},true);c.body.setLinvel(V(0,vy),true);c.body.setAngvel(V(),true);
 for(const h of c.hands){h.body.setTranslation(V(x+h.side*.35,y+.6),true);h.body.setLinvel(V(0,vy),true);h.noGripUntil=0;}
 for(const f of c.feet){f.body.setTranslation(V(x+f.side*.2,y-1.03),true);f.body.setLinvel(V(0,vy),true);}
 c.arms={aim:0,ay:.6,l:false,r:false,brace:true};c.legs={aim:0,ay:.6,brace:true};c.lastFoot=c.lastLetGo=c.lastPush=c.lastJump=c.lastCombo=-10;c.pushUntil=0;c.stamina=100;
 sim.world.propagateModifiedBodyPositionsToColliders();
}
const tick=(s,n)=>{for(let i=0;i<n;i++)s.step();};
(async()=>{
 assert.deepEqual(all.filter(c=>c.kind==='race').map(c=>c.id),['mountain','forest','campus']);
 assert.equal(nextRace('mountain'),'forest');assert.equal(nextRace('forest'),'campus');assert.equal(nextRace('campus'),'mountain');
 for(const course of [forest,campus]){
  const client=harness();client.inbound('level',{...course,revision:1});for(const [x,y]of [...course.path,[course.finish.x,1]])assert.ok(Math.abs(client.ctx.Net.progress(x,y)-progressAt(x,y,course))<1e-9);
  assert.deepEqual(course.routes.main.path,course.path);assert.equal(course.routes.shortcut.holdIds.length,2,'shortcut: one hold to start, one combo-only twig');
  assert.ok(course.path.some((p,i)=>i&&p[0]===course.path[i-1][0]));assert.ok(course.path.some((p,i)=>i&&p[1]===course.path[i-1][1]));assert.ok(course.path.some((p,i)=>i&&p[0]!==course.path[i-1][0]&&p[1]!==course.path[i-1][1]));
  assert.ok(progressAt(course.finish.x,1,course)<.9,'Running underneath an elevated finish must not count as finishing the route');
  const sim=await Simulation.create(course);try{
   const c=sim.spawn('section-check');tick(sim,150);assert.ok(sim.grounded(c),'Starting lawn/root floor supports actual feet');assert.ok(sim.gesture(c,'flick',1),'Existing legs hop works');let peak=0;for(let i=0;i<100;i++){sim.step();peak=Math.max(peak,c.body.translation().y);}assert.ok(peak>2.2);
   // Exercise each vertical section with a real spherical grip and coordinated release.
   // Each wall has one odd prop instead of a ladder: it can be caught from the floor, and a real combo from it clears the lip.
   const walls=sim.holds.filter(h=>h.wall);assert.ok(walls.length>=2,'every wall has a prop to grab');assert.equal(course.holds.filter(h=>h.kind==='rung').length,0,'no ladders left');
   for(const prop of walls){
    let caught=0;for(let t=0;t<6&&!caught;t++){const base=sim.course.terrain.filter(t=>Math.max(...t.pts.map(p=>p[0]))>=prop.x-.9&&Math.min(...t.pts.map(p=>p[0]))<=prop.x-.9&&Math.max(...t.pts.map(p=>p[1]))<prop.y).reduce((y,t)=>Math.max(y,Math.max(...t.pts.map(p=>p[1]))),0);
     place(sim,c,prop.x-.9,base+1.06);tick(sim,40);c.arms={aim:.6,ay:1,l:true,r:true,brace:true};tick(sim,20);sim.gesture(c,'flick',1);for(let i=0;i<160&&!caught;i++){sim.step();caught=c.hands.some(h=>h.grip?.id===prop.id);}}
    assert.ok(caught,`${course.id}/${prop.prop} can be caught with a hop and a reach from the floor`);
    place(sim,c,prop.x-.45,prop.y-.8);sim.grab(c.hands[0],prop);sim.grab(c.hands[1],prop);c.arms={aim:.8,ay:.9,l:true,r:true,brace:true};c.legs.aim=.5;tick(sim,15);
    assert.ok(c.hands.some(h=>h.grip),'the prop holds you');assert.ok(!sim.grounded(c),'Vertical wall is not jump footing');assert.ok(sim.gesture(c,'flick',1));tick(sim,8);sim.setHand(c,0,false);sim.setHand(c,1,false);assert.equal(c.lastGestureResult,'combo');
    let maxY=0,maxX=0;for(let i=0;i<150;i++){sim.step();maxY=Math.max(maxY,c.body.translation().y);maxX=Math.max(maxX,c.body.translation().x);}
    assert.ok(maxY>prop.y+1.5&&maxX>prop.x+.4,`${course.id}/${prop.prop} combo must clear the lip`);
   }
   // The shortcut is combo-only: its first hold can be caught from the ground, but only hop + let go together reaches the twig.
   const [startId,twigId]=course.routes.shortcut.holdIds,start=sim.holds.find(h=>h.id===startId),twig=sim.holds.find(h=>h.id===twigId);
   const attempt=mode=>{place(sim,c,start.x-.45,start.y-.8);sim.grab(c.hands[0],start);sim.grab(c.hands[1],start);c.arms={aim:.8,ay:.9,l:true,r:true,brace:true};c.legs.aim=.5;tick(sim,30);c.lastCombo=-10;twig.loadMs=0;twig.brokenUntil=0;
    sim.gesture(c,'flick',1);tick(sim,mode==='combo'?8:45);sim.setHand(c,0,false);sim.setHand(c,1,false);tick(sim,4);c.arms={aim:.9,ay:1,l:true,r:true,brace:true};for(let i=0;i<170;i++){sim.step();if(c.hands.some(h=>h.grip?.id===twig.id))return true;}return false;};
   let combo=0,plain=0;for(let t=0;t<4;t++){if(attempt('combo'))combo++;if(attempt('plain'))plain++;}
   assert.ok(combo>=2,`${course.id} shortcut: a combo reaches the twig (${combo}/4)`);assert.equal(plain,0,`${course.id} shortcut: a plain hop never reaches the twig`);
   console.log(`PASS ${course.id}: legs hop; every wall prop can be caught from the floor and a combo from it clears the lip`);
   for(const t of course.terrain.filter(t=>!['grass','moss','boundary'].includes(t.kind))){
    const top=t.pts.slice(2),x=(top[0][0]+top[1][0])/2,y=(top[0][1]+top[1][1])/2,baseline=c.recoveries;
    place(sim,c,x,y+(t.id==='catch-bough'?2:4),-45);tick(sim,300);const p=c.body.translation();assert.ok(p.y>0&&[p.x,p.y,p.z].every(Number.isFinite));assert.equal(c.recoveries,baseline,`${course.id}/${t.id} catches fast falls without recovery masking tunneling`);
   }
   console.log(`PASS ${course.id}: fast falls on every root/branch/roof/ledge stay on solid terrain without automatic recovery`);
   const brittle=sim.holds.find(h=>h.breakMs);place(sim,c,brittle.x,brittle.y-.8);sim.grab(c.hands[0],brittle);c.arms.l=true;tick(sim,240);assert.ok(brittle.brokenUntil>sim.time);tick(sim,600);assert.ok(brittle.brokenUntil<=sim.time);
   place(sim,c,course.finish.x,course.finish.y+1.05);assert.ok(sim.snapshot(c).finished&&sim.snapshot(c).progress>.98);
   place(sim,c,course.finish.x,1);assert.equal(sim.snapshot(c).finished,false);
   console.log(`PASS ${course.id}: shortcut strains, snaps and regrows; finish requires reaching the correct elevation`);
  }finally{sim.free();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
