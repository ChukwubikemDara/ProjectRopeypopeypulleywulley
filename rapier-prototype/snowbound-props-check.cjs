// The odd things on Snowbound are real handholds: each pipe prop can be caught from the pipe floor, the frying
// pan gets you over the crate, and the ski on the end of the overhang gets you from the ladder onto the beam.
const assert=require('node:assert/strict');
const {Simulation}=require('./physics.cjs');
const {mountain}=require('./courses.cjs');
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
const gripping=(c,h)=>c.hands.some(x=>x.grip?.id===h.id);
function hangFrom(sim,c,h,side=1){place(sim,c,h.x-.45*side,h.y-.8);sim.grab(c.hands[0],h);sim.grab(c.hands[1],h);c.arms={aim:.8*side,ay:.9,l:true,r:true,brace:true};c.legs.aim=.5*side;tick(sim,30);}
function reachHop(sim,c,h,aim=0){c.arms={aim,ay:1,l:true,r:true,brace:true};tick(sim,20);sim.gesture(c,'flick',1);for(let i=0;i<160;i++){sim.step();if(gripping(c,h))return true;}return false;}
function combo(sim,c,side,steer=75){c.lastCombo=-10;assert.ok(sim.gesture(c,'flick',1));tick(sim,8);sim.setHand(c,0,false);sim.setHand(c,1,false);c.arms={aim:.9*side,ay:.8,l:true,r:true,brace:true};tick(sim,steer);c.arms.aim=0;}
(async()=>{
 const sim=await Simulation.create(mountain);
 try{
  const c=sim.spawn('props');tick(sim,60);
  const P=mountain.pipe,props=sim.holds.filter(h=>h.prop&&h.prop!=='ski');
  assert.equal(props.length,6,'six odd things in the pipe instead of ten identical hoops');
  assert.ok(props.every((h,i)=>!i||Math.hypot(h.x-props[i-1].x,h.y-props[i-1].y)>1.9),'spaced out: nearly two metres or more apart');
  const gaps=props.slice(1).map((h,i)=>Math.hypot(h.x-props[i].x,h.y-props[i].y).toFixed(2));assert.ok(new Set(gaps).size>3,'and unevenly');
  // each prop can be caught from the pipe floor right below it (the pan hangs over the crate: from on top of it)
  for(const h of props){
   let caught=0;for(let t=0;t<5&&!caught;t++){const back=h.prop==='pan'?1.5:1,fx=h.x-P.normal[0]*2.3-P.dir[0]*back,fy=(fx-P.f0[0])*P.dir[1]/P.dir[0]+P.f0[1];place(sim,c,fx,fy+1.1);tick(sim,50);if(reachHop(sim,c,h,.6))caught=1;}
   assert.ok(caught,`the ${h.prop} can be caught from below it`);
  }
  console.log('PASS pipe: six odd props, unevenly spaced, each catchable with a hop and a reach from the floor');
  // the frying pan hangs over the crate: from it you get past the crate
  const pan=props.find(h=>h.prop==='pan');hangFrom(sim,c,pan);combo(sim,c,1);tick(sim,200);
  const s=(pos(c).x-P.f0[0])*P.dir[0]+(pos(c).y-P.f0[1])*P.dir[1];
  assert.ok(s>10.3,`from the pan you get past the crate (now ${s.toFixed(2)} m along the pipe, crate ends at 10.3)`);
  console.log('PASS pipe: the frying pan gets you over the crate');
  // the ski: swing out from the top of the ladder to its tip, then haul up onto the overhang
  const ski=sim.holds.find(h=>h.prop==='ski'),top=sim.holds.filter(h=>h.kind==='rung').sort((a,b)=>b.y-a.y)[1];
  let onSki=false;for(let t=0;t<4&&!onSki;t++){hangFrom(sim,c,top,-1);c.lastCombo=-10;sim.gesture(c,'flick',1);tick(sim,8);sim.setHand(c,0,false);sim.setHand(c,1,false);c.arms={aim:-.9,ay:1,l:true,r:true,brace:true};for(let i=0;i<160&&!onSki;i++){sim.step();onSki=gripping(c,ski);}}
  assert.ok(onSki,'from the top of the ladder, a hop + let go swing catches the ski');
  const onBeam=()=>pos(c).x>23.4&&pos(c).x<25.9&&pos(c).y>17.3,onLedge=()=>pos(c).x>27.6&&pos(c).y>15.6&&pos(c).y<17.6;
  let up=false;for(let t=0;t<4&&!up;t++){hangFrom(sim,c,ski,1);combo(sim,c,1,30);tick(sim,200);up=onBeam()||onLedge();}
  assert.ok(up,`from the ski you get onto the overhang ${at(c)}`);
  // the overhang stops short of the wall: hop across onto the top ledge (keep steering, or drop back to the checkpoint)
  let across=false;for(let t=0;t<4&&!across;t++){place(sim,c,25,17.75);tick(sim,60);c.arms.aim=.9;sim.gesture(c,'flick',1);tick(sim,80);c.arms.aim=0;tick(sim,160);across=onLedge();}
  assert.ok(across,`a committed hop gets you from the overhang onto the top ledge ${at(c)}`);
  console.log('PASS overhang: the ski gets you onto the overhang, and a hop gets you across to the top ledge');
  // the overhang's post hangs above the checkpoint ledge: you can walk underneath it from the pipe to the twig wall
  place(sim,c,23.2,9.05);tick(sim,60);let walked=0;for(let k=0;k<8;k++){c.arms.aim=.6;sim.gesture(c,'flick',.7);tick(sim,25);c.arms.aim=0;tick(sim,70);walked=Math.max(walked,pos(c).x);}
  assert.ok(walked>26.3,`the checkpoint ledge is walkable past the overhang's post (got to ${walked.toFixed(2)})`);
  console.log('PASS checkpoint: you can walk under the overhang from the pipe to the twig wall');
  // the twig wall: the overhang no longer covers it, so the twig combo lands on the ledge (no stones needed)
  const twig=sim.holds.find(h=>h.kind==='twig');let landed=false;
  for(let t=0;t<4&&!landed;t++){place(sim,c,twig.x-.4,twig.y-.75);twig.loadMs=0;sim.grab(c.hands[0],twig);sim.grab(c.hands[1],twig);c.arms={aim:.3,ay:.9,l:true,r:true,brace:true};c.legs.aim=.4;tick(sim,35);c.lastCombo=-10;sim.gesture(c,'flick',1);tick(sim,10);sim.setHand(c,0,false);sim.setHand(c,1,false);c.arms={aim:0,ay:.6,l:false,r:false,brace:true};tick(sim,25);c.arms.aim=.9;tick(sim,235);landed=onLedge()||pos(c).x>27.6&&pos(c).y>15.6;}
  assert.ok(landed,`the twig combo lands you on the top ledge ${at(c)}`);
  assert.equal(sim.holds.filter(h=>h.kind==='knob').length,0,'no stones left anywhere on Snowbound');
  console.log('PASS wall: the twig combo lands on the top ledge without any stones');
  // the bus: too tall to hop over, so ride it to the raised finish
  const bus=sim.objects[0],rails=sim.holds.filter(h=>h.objectId===bus.id);bus.speed=0;bus.body.setTranslation({x:40,y:bus.y,z:0},true);tick(sim,2);
  // hop at it as hard as you like: you never end up past it or on its roof (hopping into it just gets you bonked back)
  for(let t=0;t<4;t++){place(sim,c,37.9,16.05);tick(sim,20);c.arms.aim=.9;sim.gesture(c,'flick',1.15);tick(sim,60);c.arms.aim=0;tick(sim,200);
   const b=bus.body.translation();assert.ok(!(pos(c).x>b.x+bus.w/2)&&!(pos(c).y>b.y+bus.h/2),`the bus is too tall to hop over ${at(c)}`);}
  let onRail=false;for(let t=0;t<6&&!onRail;t++){place(sim,c,40-1.6,16.05);tick(sim,10);c.arms={aim:.6,ay:1,l:true,r:true,brace:true};tick(sim,10);sim.gesture(c,'flick',1);for(let i=0;i<150&&!onRail;i++){sim.step();onRail=c.hands.some(h=>rails.some(r=>r.id===h.grip?.id));}}
  assert.ok(onRail,'a roof rail can be caught from the ledge');
  bus.speed=2.6;bus.direction=1;let rode=0;for(let i=0;i<500;i++){sim.step();rode=Math.max(rode,pos(c).x);}
  assert.ok(c.hands.some(h=>h.grip)&&rode>bus.x1-2,`hanging on, the bus carries you to the far end (got to ${rode.toFixed(1)})`);
  let finished=false;for(let t=0;t<4&&!finished;t++){bus.speed=0;bus.body.setTranslation({x:bus.x1-.3,y:bus.y,z:0},true);tick(sim,2);const r=sim.holds.find(h=>h.id===rails.at(-1).id);hangFrom(sim,c,r);combo(sim,c,1,70);tick(sim,200);finished=sim.snapshot(c).finished;}bus.speed=2.6;
  assert.ok(finished,`from the bus you reach the raised finish ${at(c)}`);
  console.log('PASS finish: the bus is too tall to hop, you ride it by its roof rails, and hop off onto the raised finish');
 }finally{sim.free();}
})().catch(e=>{console.error(e);process.exitCode=1;});
