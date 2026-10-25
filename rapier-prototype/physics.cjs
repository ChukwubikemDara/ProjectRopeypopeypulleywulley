// Rapier 3D adaptation of main’s complete course and gameplay rules.
const R = require('@dimforge/rapier3d-compat');
const {CONFIG}=require('./main-config.cjs'); // main 8f94284 mechanics, scaled for the 3D model mass
const {mountain:course}=require('./courses.cjs');
const V = (x=0,y=0,z=0)=>({x,y,z});
const add=(a,b)=>V(a.x+b.x,a.y+b.y,a.z+b.z);
const sub=(a,b)=>V(a.x-b.x,a.y-b.y,a.z-b.z);
const mul=(a,k)=>V(a.x*k,a.y*k,a.z*k);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>V(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const len=a=>Math.hypot(a.x,a.y,a.z);
const norm=a=>mul(a,1/(len(a)||1));
const limit=(a,m)=>mul(a,Math.min(1,m/(len(a)||1)));
const rotate=(v,q)=>add(v,mul(cross(V(q.x,q.y,q.z),add(cross(V(q.x,q.y,q.z),v),mul(v,q.w))),2));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function progressAt(x,y,definition=course){
 if(definition.mirror)x=-Math.abs(x); // mirrored lanes share one racing line
 let total=0,best={d:Infinity,at:0};
 for(let i=0;i<definition.path.length-1;i++){
  const [ax,ay] =definition.path[i],[bx,by]=definition.path[i+1],L=Math.hypot(bx-ax,by-ay),t=clamp(((x-ax)*(bx-ax)+(y-ay)*(by-ay))/(L*L),0,1),d=Math.hypot(x-ax-(bx-ax)*t,y-ay-(by-ay)*t);
  if(d<best.d)best={d,at:total+L*t};total+=L;
 }
 return clamp((best.at-(definition.progressTolerance==null?0:Math.max(0,best.d-definition.progressTolerance)*3))/total,0,1);
}
const stats=()=>({drops:0,saves:0,biggestFall:0,boosts:0,combos:0,kicks:0,pushes:0});
class Simulation {
  static async create(definition=course){await R.init();return new Simulation(definition);}
  constructor(definition=course){
    this.course=definition;this.floorY=Math.min(...definition.terrain.flatMap(t=>t.pts.map(p=>p[1])))-.35;
    this.world=new R.World(V(0,-14,0));this.world.timestep=1/90;this.world.numSolverIterations=8;this.world.maxCcdSubsteps=4;this.time=0;this.events=[];this.contactEvents=new R.EventQueue(true);this.footStates=new Map();this.holdShapes=new Map();this.climbers=new Map();this.terrainColliders=[];this.owners=new Map();this.holds=definition.holds.map(h=>({...h,loadMs:0,brokenUntil:0}));this.objects=[];this.config={...CONFIG};
    for(const t of definition.terrain){
      const vertices=[];for(const z of [-definition.depth/2,definition.depth/2])for(const [x,y]of t.pts)vertices.push(x,y,z);
      const desc=R.ColliderDesc.convexHull(new Float32Array(vertices));
      if(desc)this.terrainColliders.push(this.world.createCollider(desc.setFriction(t.friction??.8).setCollisionGroups((1<<16)|22)));
    }
    // Feet may land on a hold, but an ascending foot must pass through its underside.
    this.hooks={filterContactPair:(a,b)=>{
      if(this.owners.has(a)&&this.owners.get(a)===this.owners.get(b))return null;
      const hold=this.holdShapes.get(a)||this.holdShapes.get(b),foot=this.footStates.get(a)||this.footStates.get(b);
      return hold&&foot&&(foot.vy>.1||foot.y<hold.y+.025)?null:R.SolverFlags.COMPUTE_IMPULSE;
    },filterIntersectionPair:()=>true};
    for(const h of this.holds){
      if(h.objectId)continue;
      const collider=this.world.createCollider(R.ColliderDesc.ball(.11).setTranslation(h.x,h.y,0).setFriction(1.2).setCollisionGroups((8<<16)|16).setActiveHooks(R.ActiveHooks.FILTER_CONTACT_PAIRS));
      this.holdShapes.set(collider.handle,h);h.collider=collider;
    }
    for(const data of definition.objects){
      const body=this.world.createRigidBody((data.kind==='dummy'?R.RigidBodyDesc.dynamic().enabledTranslations(true,true,false).setLinearDamping(2).setAngularDamping(3).setCcdEnabled(true):R.RigidBodyDesc.kinematicPositionBased()).setTranslation(data.x0,data.y,0));
      const collider=this.world.createCollider((data.kind==='dummy'?R.ColliderDesc.capsule(.2,.3).setMass(2).setCollisionGroups((2<<16)|19):R.ColliderDesc.cuboid(data.w/2,data.h/2,1.2).setCollisionGroups((1<<16)|22)).setFriction(.9),body);
      const o={...data,body,collider,direction:1};this.objects.push(o);
      for(const h of this.holds)if(h.objectId===o.id)h.body=body;
    }
    // Solid catch floor below the complete route; original walls remain in the course data.
    this.terrainColliders.push(this.world.createCollider(R.ColliderDesc.cuboid((definition.bounds.x1-definition.bounds.x0)/2+1,.3,5).setTranslation((definition.bounds.x0+definition.bounds.x1)/2,this.floorY,0).setCollisionGroups((1<<16)|22)));
    this.world.step();
  }
  spawn(id){
    // courses with several spawns (the prologue's two lanes) alternate teams between them
    const spawns=this.course.spawns||[this.course.spawn],area=spawns[this.climbers.size%spawns.length],slot=Math.floor(this.climbers.size/spawns.length)%8;
    const body=this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(area.x0+(area.x1-area.x0)*(slot+.5)/8,area.y+1.05,0).enabledTranslations(true,true,false).setLinearDamping(.9).setAngularDamping(3).setCanSleep(false).setCcdEnabled(true));
    const torso=this.world.createCollider(R.ColliderDesc.capsule(.22,.28).setMass(5).setFriction(.9).setCollisionGroups((2<<16)|19).setActiveHooks(R.ActiveHooks.FILTER_CONTACT_PAIRS),body);this.owners.set(torso.handle,id);
    const head=this.world.createCollider(R.ColliderDesc.ball(.22).setTranslation(0,.51,0).setMass(0).setCollisionGroups((2<<16)|19).setActiveHooks(R.ActiveHooks.FILTER_CONTACT_PAIRS),body);this.owners.set(head.handle,id);
    const c={id,body,collider:torso,stats:stats(),carry:0,braced:false,overSince:null,holdingSince:null,savedCounted:false,airPeak:null,arms:{aim:0,ay:.6,l:false,r:false,brace:true},legs:{aim:0,ay:.6,brace:true},assist:true,lastJump:-10,lastFoot:-10,lastPush:-10,lastLetGo:-10,lastCombo:-10,letGoHanging:false,pushHanging:false,pushUntil:0,pushSpeed:0,pushDir:V(0,1,0),stamina:100,lastGestureResult:'ready',tuck:0,hands:[],feet:[],peak:0,safeSpawn:V(body.translation().x,body.translation().y,0),recoveries:0};
    for(const side of [-1,1]){
      const hand=this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(body.translation().x+side*.35,body.translation().y+.85,0).enabledTranslations(true,true,false).setGravityScale(1).setLinearDamping(2.5).setAngularDamping(6).setCanSleep(false).setCcdEnabled(true));
      this.world.createCollider(R.ColliderDesc.ball(.12).setMass(.35).setFriction(.6).setCollisionGroups((4<<16)|1),hand);
      const reachJoint=this.world.createImpulseJoint(R.JointData.rope(CONFIG.upperArm+CONFIG.foreArm,V(side*CONFIG.shoulderX,CONFIG.shoulderY,0),V()),body,hand,true);
      c.hands.push({body:hand,owner:id,reachJoint,grip:null,target:null,side});
    }
    for(const side of [-1,1]){
      const foot=this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(body.translation().x+side*.2,body.translation().y-.94,0).enabledTranslations(true,true,false).setLinearDamping(.8).setCanSleep(false).setCcdEnabled(true));
      const collider=this.world.createCollider(R.ColliderDesc.ball(.1).setMass(.28).setFriction(1.2).setCollisionGroups((16<<16)|11).setActiveHooks(R.ActiveHooks.FILTER_CONTACT_PAIRS),foot);this.owners.set(collider.handle,id);
      const reachJoint=this.world.createImpulseJoint(R.JointData.rope(CONFIG.thigh+CONFIG.shin,V(side*CONFIG.hipX,-CONFIG.hipY,0),V()),body,foot,true);
      c.feet.push({body:foot,collider,reachJoint,side,planted:false});
    }
    this.climbers.set(id,c);return c;
  }
  parts(c){return[c.body,...c.hands.map(h=>h.body),...c.feet.map(f=>f.body)];}
  courseGrips(c){return c.hands.filter(h=>h.grip?.kind==='hold').length;}
  anchored(c){return this.courseGrips(c)>0||this.grounded(c);}
  heldBy(o,except){return [...this.climbers.values()].some(c=>c!==o&&c!==except&&c.hands.some(h=>h.grip?.kind==='climber'&&h.grip.id===o.id));}
  linked(c){const ids=new Set(c.hands.filter(h=>h.grip?.kind==='climber').map(h=>h.grip.id));for(const o of this.climbers.values())if(o!==c&&o.hands.some(h=>h.grip?.kind==='climber'&&h.grip.id===c.id))ids.add(o.id);return ids;}
  dangling(c){const seen=new Set([c.id]),stack=[c];let n=0;while(stack.length)for(const id of this.linked(stack.pop())){if(seen.has(id))continue;seen.add(id);const o=this.climbers.get(id);if(!o||this.anchored(o)||this.below(o))continue;n++;stack.push(o);}return n;}
  below(c,anchoredOnly=false){const p=c.body.translation();for(const o of this.climbers.values())if(o!==c&&(!anchoredOnly||this.anchored(o))){const q=o.body.translation();if(q.y<p.y-.1&&(len(sub(p,q))<this.config.radius*2+.25||c.feet.some(f=>len(sub(f.body.translation(),q))<this.config.radius+.2)))return o;}return null;}
  release(h,reason){
    const g=h.grip;if(!g)return;
    this.world.removeImpulseJoint(g.joint,true);if(g.ownsAnchor)this.world.removeRigidBody(g.anchor);h.grip=null;h.noGripUntil=this.time+(reason?.4:.12);
    const c=this.climbers.get(h.owner),o=g.kind==='climber'&&this.climbers.get(g.id);
    if(!reason&&c&&o&&!this.anchored(o)&&!this.below(o)&&!this.heldBy(o,c)){c.stats.drops++;this.events.push({type:'drop',id:c.id,victim:o.id});}
  }
  releaseAll(c,reason,lock=.4){let any=false;for(const h of c.hands)if(h.grip){this.release(h,reason);h.noGripUntil=this.time+lock;any=true;}if(any)this.events.push({type:'slip',id:c.id,reason});}
  grab(h,hold){
    if(h.grip||hold.brokenUntil>this.time)return;
    const p=V(hold.x,hold.y,hold.z||0);h.body.setTranslation(p,true);h.body.setLinvel(hold.body?.linvel()||V(),true);
    const anchor=hold.body||this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(p.x,p.y,p.z));
    const joint=this.world.createImpulseJoint(R.JointData.spherical(hold.body?hold.local:V(),V()),anchor,h.body,true);
    h.grip={kind:'hold',id:hold.id,anchor,joint,hold,ownsAnchor:!hold.body};h.since=this.time;this.events.push({type:'grab',id:h.owner});
  }
  grabClimber(c,h){
    const hp=h.body.translation();for(const o of this.climbers.values())if(o!==c){
      const otherHand=o.hands.find(oh=>len(sub(hp,oh.body.translation()))<this.config.handRadius*2+this.config.climberGrab);
      const target=otherHand?.body||(len(sub(hp,o.body.translation()))<this.config.radius+this.config.climberGrab?o.body:null);
      if(!target)continue;
      const inv=target.rotation(),local=rotate(sub(hp,target.translation()),{x:-inv.x,y:-inv.y,z:-inv.z,w:inv.w});
      const joint=this.world.createImpulseJoint(R.JointData.spherical(local,V()),target,h.body,true);
      h.grip={kind:'climber',id:o.id,anchor:target,joint,ownsAnchor:false};h.since=this.time;this.events.push({type:otherHand?'handhold':'grabbed',id:c.id,target:o.id});return true;
    }return false;
  }
  remove(id){const c=this.climbers.get(id);if(!c)return;for(const o of this.climbers.values())for(const h of o.hands)if(h.grip?.kind==='climber'&&h.grip.id===id)this.release(h,'left');for(const h of c.hands){this.release(h,'left');this.world.removeRigidBody(h.body);}for(const f of c.feet){this.footStates.delete(f.collider.handle);this.owners.delete(f.collider.handle);this.world.removeRigidBody(f.body);}for(const [handle,owner]of this.owners)if(owner===id)this.owners.delete(handle);this.world.removeRigidBody(c.body);this.climbers.delete(id);}
  reset(){for(const id of [...this.climbers.keys()])this.remove(id);this.events.length=0;for(const h of this.holds){h.loadMs=0;h.brokenUntil=0;h.collider?.setEnabled(true);}for(const o of this.objects){o.direction=1;o.body.setTranslation(V(o.x0,o.y,0),true);if(o.kind!=='dummy')o.body.setNextKinematicTranslation(V(o.x0,o.y,0));else{o.body.setLinvel(V(),true);o.body.setAngvel(V(),true);o.body.setRotation({x:0,y:0,z:0,w:1},true);}}this.world.step(this.contactEvents,this.hooks);}
  tune(key,value){this.config[key]=value;if(key==='gravity')this.world.gravity=V(0,-value,0);}
  dynamicState(){return{objects:this.objects.map(o=>({id:o.id,...o.body.translation(),rotation:o.body.rotation()})),broken:this.holds.filter(h=>h.brokenUntil>this.time).map(h=>h.id),strain:this.holds.filter(h=>h.breakMs&&h.loadMs>0).map(h=>[h.id,h.loadMs/h.breakMs])};}
  results(winner){const list=[...this.climbers.values()],out=winner?[{title:'King of the Mountain',id:winner,val:'summit'}]:[];for(const [key,title]of Object.entries({combos:'In Sync',kicks:'Kickboxer',drops:'Backstabber',pushes:'Leg Day',boosts:'Stepping Stool',biggestFall:'Biggest Fall'})){const top=list.slice().sort((a,b)=>b.stats[key]-a.stats[key])[0];if(top?.stats[key]>0)out.push({title,id:top.id,val:key==='biggestFall'?Math.round(top.stats[key])+'m':top.stats[key]});}return out;}
  checkpoint(c,where='pipe'){
    for(const h of c.hands)this.release(h);
    const p=V(10.2,4.0,0);
    c.body.setTranslation(p,true);c.body.setLinvel(V(),true);c.body.setAngvel(V(),true);c.body.setRotation({x:0,y:0,z:0,w:1},true);
    for(const [i,h]of c.hands.entries()){
      const candidates=this.holds.filter(a=>a.kind==='handle');if(!candidates.length)return;
      candidates.sort((a,b)=>len(sub(a,add(p,V(h.side*.4,.9,0))))-len(sub(b,add(p,V(h.side*.4,.9,0)))));
      this.grab(h,candidates[Math.min(i,candidates.length-1)]);
    }
    for(const f of c.feet){f.body.setTranslation(V(p.x+f.side*.2,p.y-.9,0),true);f.body.setLinvel(V(),true);}
    c.lastFoot=-10;c.lastPush=-10;c.lastLetGo=-10;c.pushUntil=0;c.lastJump=-10;
    c.arms.l=c.arms.r=true;
  }
  footSupport(f){
    const p=f.body.translation();
    const hit=this.world.castRayAndGetNormal(new R.Ray(p,V(0,-1,0)),.17,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC);
    return hit&&hit.normal.y>.5&&!(this.holdShapes.has(hit.collider.handle)&&f.body.linvel().y>.1)?hit:null;
  }
  support(c){
    for(const f of c.feet){const hit=this.footSupport(f);if(hit)return {...hit,height:f.body.translation().y-hit.timeOfImpact};}
    const p=c.body.translation();
    const hit=this.world.castRayAndGetNormal(new R.Ray(p,V(0,-1,0)),.55,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC);
    return hit&&hit.normal.y>.5?{...hit,height:p.y-hit.timeOfImpact}:null;
  }
  grounded(c){return !!this.support(c);}
  setHand(c,i,closed){
    c.arms[i?'r':'l']=closed;const h=c.hands[i];
    if(!closed&&h.grip){
      const hanging=(h.grip.kind==='hold'||this.courseGrips(c)>0)&&!this.grounded(c);this.release(h);
      if(!c.hands.some(h=>h.grip)){
        c.lastLetGo=this.time;c.letGoHanging=hanging;
        if(hanging&&c.pushHanging&&this.time-c.lastPush<this.config.comboWindow)this.launch(c);
      }
    }
  }
  pushDirection(c){
    const p=c.body.translation(),fx=c.feet.reduce((n,f)=>n+f.body.translation().x,0)/2;
    return norm(V(Math.sin((c.legs.aim||0)*Math.PI/6)*.6+clamp((p.x-fx)*.4,-.3,.3),1,0));
  }
  launch(c){
    if(this.time-c.lastCombo<this.config.comboCooldown||c.stamina<this.config.comboCost)return false;
    for(const h of c.hands){this.release(h,'dyno');h.noGripUntil=this.time+.18;}
    c.stats.combos++;c.lastCombo=this.time;c.stamina=Math.max(0,c.stamina-this.config.comboCost);
    c.pushUntil=this.time+.22;c.pushDir=this.pushDirection(c);c.pushSpeed=this.config.legPushSpeed+this.config.comboBonus;c.lastGestureResult='combo';
    this.events.push({type:'combo',id:c.id});return true;
  }
  jumpState(c,grounded=this.grounded(c)){
    const cooldown=Math.max(0,.4-(this.time-c.lastJump));
    const justReleased=!c.hands.some(h=>h.grip)&&this.time-c.lastLetGo<this.config.comboWindow;
    const footing=grounded||this.time-c.lastFoot<.25||this.courseGrips(c)>0||!!this.below(c,true)||justReleased;
    const comboAvailable=this.time-c.lastCombo>=this.config.comboCooldown&&c.stamina>=this.config.comboCost;
    const hanging=this.courseGrips(c)>0&&!grounded;
    return {ready:cooldown===0&&footing,cooldown,reason:cooldown>0?'cooldown':footing?'ready':'no footing',hanging,
      combo:comboAvailable&&(hanging||justReleased&&c.letGoHanging),
      releaseNow:comboAvailable&&hanging&&c.pushHanging&&this.time-c.lastPush<this.config.comboWindow,
      hopNow:comboAvailable&&justReleased&&c.letGoHanging};
  }
  // Nearest kicker foot to the target's torso or feet. Measuring only to the torso missed rivals standing right beside you.
  kickReach(c,target){const parts=[target,...(target.feet||[])];return Math.min(...c.feet.flatMap(f=>parts.map(p=>len(sub(f.body.translation(),p.body.translation())))));}
  gesture(c,g,power=1){
    if(g==='flick'||g==='push'){
      const jump=this.jumpState(c),justReleased=!c.hands.some(h=>h.grip)&&this.time-c.lastLetGo<this.config.comboWindow;
      if(!jump.ready){c.lastGestureResult=jump.reason;return false;}
      c.lastJump=this.time;c.lastPush=this.time;c.pushHanging=this.courseGrips(c)>0&&!this.grounded(c);c.stats.pushes++;
      if(justReleased&&c.letGoHanging&&this.launch(c))return true;
      c.pushUntil=this.time+.16;c.pushDir=this.pushDirection(c);c.pushSpeed=this.config.legPushSpeed*clamp(Number.isFinite(power)?power:1,.6,1.15)*(1+(Math.random()*2-1)*this.config.flickJank);const booster=c.hands.some(h=>h.grip)?null:this.below(c,true);if(booster){c.pushSpeed*=this.config.boostMult;c.stats.boosts++;booster.body.applyImpulse(V(0,-c.pushSpeed*.15*booster.body.mass(),0),true);this.events.push({type:'boost',id:c.id,by:booster.id});}c.lastGestureResult='pushed';
      this.events.push({type:'push',id:c.id});return true;
    }
    if(g==='yank'||g==='tuck'){c.tuck=this.time+.7;c.lastGestureResult='tuck';return true;}
    if(g==='kick'){
      if(this.time-(c.lastKick??-10)<this.config.kickCooldown){c.lastGestureResult='cooldown';return false;}
      c.lastKick=this.time;c.lastGestureResult='no rival nearby';
      // every kick swings a real leg, so it shows on screen even when it whiffs: toward the nearest rival, else where you're leaning or heading
      const me=c.body.translation(),near=[...this.climbers.values()].filter(o=>o!==c).map(o=>({o,dx:o.body.translation().x-me.x})).filter(r=>Math.abs(r.dx)<2.5).sort((a,b)=>Math.abs(a.dx)-Math.abs(b.dx))[0];
      c.kickDir=near?Math.sign(near.dx)||1:Math.abs(c.legs.aim||0)>.2?Math.sign(c.legs.aim):c.heading||(this.course.mirror&&me.x>0?-1:1);c.kickUntil=this.time+.25;c.kickFoot=c.feet.find(f=>f.side===c.kickDir)||c.feet[0];
      for(const other of this.climbers.values())if(other!==c&&this.kickReach(c,other)<this.config.kickRange){
        const d=norm(sub(other.body.translation(),c.body.translation()));other.body.applyImpulse(mul(add(d,V(0,.3,0)),this.config.kickImpulse*other.body.mass()),true);const held=!(this.courseGrips(other)&&!other.braced);if(!held){this.release(other.hands.find(h=>h.grip?.kind==='hold'),'kicked');this.events.push({type:'slip',id:other.id,reason:'kicked'});}else other.stamina=Math.max(0,other.stamina-20);c.stats.kicks++;c.lastGestureResult='kick';this.events.push({type:'kick',id:c.id,target:other.id,held});
      }
      for(const dummy of this.objects)if(dummy.kind==='dummy'&&this.kickReach(c,dummy)<this.config.kickRange){
        const direction=norm(add(sub(dummy.body.translation(),c.body.translation()),V(0,.4,0)));dummy.body.applyImpulse(mul(direction,this.config.kickImpulse*dummy.body.mass()),true);c.lastGestureResult='kick';c.stats.kicks++;this.events.push({type:'kick',id:c.id,target:dummy.id,practice:true});
      }
      return true;
    }
    return false;
  }
  visibleHold(from,hold){
    const d=sub(hold,from),distance=len(d);
    if(distance<.12)return true;
    // Static terrain only: ignore the character and the hold's own support collider.
    return !this.world.castRay(new R.Ray(from,norm(d)),Math.max(0,distance-.12),true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,0xffff0001);
  }
  recover(c){
    c.airPeak=null;c.supportY=null; // a teleport is not a fall
    for(const h of c.hands)this.release(h,'recovered');
    for(const o of this.climbers.values())for(const h of o.hands)if(h.grip?.kind==='climber'&&h.grip.id===c.id)this.release(h,'recovered');
    const p=c.safeSpawn||V(1,1.05,0);
    c.body.setTranslation(V(p.x,p.y+.12,0),true);c.body.setLinvel(V(),true);c.body.setAngvel(V(),true);c.body.setRotation({x:0,y:0,z:0,w:1},true);
    for(const h of c.hands){h.target=null;h.body.setTranslation(V(p.x+h.side*.35,p.y+.8,0),true);h.body.setLinvel(V(),true);h.body.setAngvel(V(),true);}
    for(const f of c.feet){f.body.setTranslation(V(p.x+f.side*.2,p.y-.9,0),true);f.body.setLinvel(V(),true);f.body.setAngvel(V(),true);}
    c.arms.l=c.arms.r=false;c.pushUntil=0;c.lastFoot=-10;c.recoveries++;
  }
  step(){
    this.time+=this.world.timestep;this.moveObjects();this.strainTwigs();
    for(const c of this.climbers.values()){
      const initial=c.body.translation();
      if(![initial.x,initial.y,initial.z].every(Number.isFinite)||initial.y<this.floorY-.65||initial.x<this.course.bounds.x0||initial.x>this.course.bounds.x1){this.recover(c);continue;}
      if(c.bot)this.botThink(c);
      c.braced=c.arms.brace!==false&&c.hands.some(h=>h.grip)&&c.stamina>0;
      const p=c.body.translation(),q=c.body.rotation(),velocity=c.body.linvel();
      c.body.resetForces(true);c.body.resetTorques(true);
      let held=0;
      const normal=V(0,0,1);
      const weight=(c.body.mass()+c.hands.reduce((n,h)=>n+h.body.mass(),0)+c.feet.reduce((n,f)=>n+f.body.mass(),0))*this.config.gravity;
      for(const [i,h]of c.hands.entries()){
        const hand=h.body;hand.resetForces(true);hand.resetTorques(true);
        const closed=i?c.arms.r:c.arms.l;
        if(!closed&&h.grip)this.setHand(c,i,false);
        const shoulder=add(p,rotate(V(h.side*this.config.shoulderX,this.config.shoulderY,0),q));
        const offset=limit(V(c.arms.aim*this.config.reach+h.side*this.config.handSpread,c.arms.ay*this.config.reach,0),this.config.reach);
        const aimTarget=add(shoulder,offset);h.aimTarget=aimTarget;
        // As on main, tilt chooses a point; nearby holds never steer an open hand.
        const relative=sub(hand.linvel(),velocity);
        const force=limit(sub(mul(sub(aimTarget,hand.translation()),this.config.armK*4),mul(relative,this.config.armD*4)),this.config.armStrength*weight*(h.grip?1:.35));
        hand.addForce(force,true);c.body.addForceAtPoint(mul(force,-1),shoulder,true);
        let best=null,bestDistance=this.config.grabRadius;
        for(const a of this.holds){
          if(a.brokenUntil>this.time||Math.abs(a.x-shoulder.x)>1.5)continue;
          const d=len(sub(a,hand.translation()));
          if(d<bestDistance&&len(sub(a,shoulder))<1.25&&this.visibleHold(shoulder,a)){best=a;bestDistance=d;}
        }
        h.target=best;
        if(closed&&!h.grip&&this.time>(h.noGripUntil||0)){if(best)this.grab(h,best);else this.grabClimber(c,h);}
        if(h.grip)held++;
      }
      for(const f of c.feet){
        f.body.resetForces(true);f.body.resetTorques(true);
        const hip=add(p,rotate(V(f.side*this.config.hipX,-this.config.hipY,0),q));
        const tucked=this.time<c.tuck,reach=this.config.legReach*(tucked?.4:1),angle=(c.legs.aim||0)*this.config.legAimDeg*Math.PI/180;
        let target=add(hip,V(Math.sin(angle)*reach+f.side*.1,-Math.cos(angle)*reach+(tucked?.15:0),0));
           const kicking=f===c.kickFoot&&this.time<c.kickUntil;if(kicking)target=add(hip,V(c.kickDir*this.config.legReach*1.1,-this.config.legReach*.25,0));
        f.planted=!!this.footSupport(f);
        const force=limit(sub(mul(sub(target,f.body.translation()),300),mul(sub(f.body.linvel(),velocity),15)),this.config.legStrength*weight*(f.planted||kicking?1:.4));
        f.body.addForce(force,true);c.body.addForceAtPoint(mul(force,-1),hip,true);
      }
      const feetDown=this.grounded(c);
      if(feetDown)c.lastFoot=this.time;
      if(!held&&!feetDown){
        const parts=[c.body,...c.hands.map(h=>h.body),...c.feet.map(f=>f.body)];
        const mass=parts.reduce((m,b)=>m+b.mass(),0),vx=parts.reduce((m,b)=>m+b.mass()*b.linvel().x,0)/mass;
        const dv=(c.arms.aim*this.config.airSpeed-vx)*Math.min(1,this.config.airGrip*this.world.timestep);
        for(const b of parts){const v=b.linvel();b.setLinvel(V(v.x+dv,v.y,0),true);}
      }
      if(this.time<c.pushUntil){
        const v=c.body.linvel(),speed=dot(v,c.pushDir);
        if(speed<c.pushSpeed)c.body.setLinvel(add(v,mul(c.pushDir,c.pushSpeed-speed)),true);
      }
      if(c.assist){
        const up=rotate(V(0,1,0),q),front=rotate(V(0,0,1),q);
        c.body.addTorque(sub(add(mul(cross(up,V(0,1,0)),24),mul(cross(front,normal),7)),mul(c.body.angvel(),3)),true);
      }
      c.peak=Math.max(c.peak,p.x);{const vx=c.body.linvel().x;if(Math.abs(vx)>.5)c.heading=Math.sign(vx);}const supported=held>0||feetDown||this.below(c);
      // a fall is height actually lost since you last stood or hung on something; a hop that lands back where it started isn't one
      if(!supported)c.airPeak=Math.max(c.airPeak??p.y,p.y);else{const fall=(c.supportY??p.y)-p.y;if(c.airPeak!==null&&fall>(this.course.fallEvent??3)){c.stats.biggestFall=Math.max(c.stats.biggestFall,fall);this.events.push({type:'fall',id:c.id,m:Math.round(fall*10)/10,x:p.x,y:p.y});}c.airPeak=null;c.supportY=p.y;}
      const support=this.support(c);
      if(support&&Math.abs(velocity.y)<2&&!this.terrainColliders.some(t=>t.containsPoint(p)))c.safeSpawn=V(p.x,support.height+1.05,0);
    }
    for(const c of this.climbers.values())for(const f of c.feet)this.footStates.set(f.collider.handle,{y:f.body.translation().y,vy:f.body.linvel().y});
    this.world.step(this.contactEvents,this.hooks);
    for(const h of this.holds)if(h.body){const p=h.body.translation();h.x=p.x+h.local.x;h.y=p.y+h.local.y;}
    // CCD handles fast falls; this guard recovers invalid/embedded states without losing the team.
    for(const c of this.climbers.values()){
      const p=c.body.translation();
      if(p.y<this.floorY-.65||![p.x,p.y,p.z].every(Number.isFinite)||this.terrainColliders.some(t=>t.containsPoint(p)))this.recover(c);
      this.bonk(c);this.carryStep(c);
    }
  }
  moveObjects(){
    for(const o of this.objects){const p=o.body.translation();if(o.kind==='dummy'){o.body.resetForces(true);o.body.resetTorques(true);if(p.y<this.floorY||Math.abs(p.x-o.x0)>3){o.body.setTranslation(V(o.x0,o.y,0),true);o.body.setLinvel(V(),true);}const up=rotate(V(0,1,0),o.body.rotation());o.body.addTorque(sub(mul(cross(up,V(0,1,0)),8),mul(o.body.angvel(),1)),true);continue;}if(p.x>=o.x1)o.direction=-1;else if(p.x<=o.x0)o.direction=1;o.body.setNextKinematicTranslation(V(clamp(p.x+o.speed*o.direction*this.world.timestep,o.x0,o.x1),o.y,0));}
    for(const h of this.holds)if(h.objectId){const o=this.objects.find(o=>o.id===h.objectId),p=o.body.translation();h.x=p.x+h.local.x;h.y=p.y+h.local.y;}
  }
  strainTwigs(){
    const dt=this.world.timestep;
    for(const h of this.holds)if(h.breakMs){
      if(h.brokenUntil>this.time)continue;
      h.collider?.setEnabled(true);
      const on=[...this.climbers.values()].flatMap(c=>c.hands.filter(hand=>hand.grip?.kind==='hold'&&hand.grip.id===h.id).map(hand=>({c,hand})));
      h.loadMs=on.length?h.loadMs+dt*1000:Math.max(0,h.loadMs-dt*500);
      if(h.loadMs>=h.breakMs){for(const {hand}of on)this.release(hand,'snapped');h.brokenUntil=this.time+h.regrowMs/1000;h.loadMs=0;h.collider?.setEnabled(false);this.events.push({type:'snap',id:on[0]?.c.id,hold:h.id});}
    }
  }
  bonk(c){
    if(this.time<(c.cdBonk||0))return;
    for(const o of this.objects){if(o.kind==='dummy')continue;let touching=false;this.world.contactPair(c.collider,o.collider,m=>{if(m.numSolverContacts()>0)touching=true;});if(!touching)continue;const away=Math.sign(c.body.translation().x-o.body.translation().x)||o.direction;for(const b of this.parts(c))b.setLinvel(add(b.linvel(),V(away*4.5,3.5,0)),true);c.cdBonk=this.time+.8;this.events.push({type:'bonk',id:c.id});break;}
  }
  carryStep(c){
    const dt=this.world.timestep,n=c.hands.filter(h=>h.grip).length,feet=this.grounded(c);
    if(!n){c.carry=0;c.overSince=null;c.holdingSince=null;c.stamina=Math.min(100,c.stamina+this.config.staminaRegen*dt*(feet?1:.5));return;}
    const carry=this.anchored(c)?this.dangling(c):0;c.carry=carry;
    if(carry>(c.braced?this.config.maxCarryBraced:this.config.maxCarryFidgeting)){c.overSince??=this.time;if(this.time-c.overSince>.5){c.overSince=null;this.releaseAll(c,'ripped');return;}}else c.overSince=null;
    const drain=carry*this.config.staminaDrain+(n===1&&!feet&&!this.below(c)?this.config.oneHandDrain:0);
    if(drain>0){c.stamina=Math.max(0,c.stamina-drain*dt);if(!c.stamina){this.releaseAll(c,'exhausted',1.2);return;}}else c.stamina=Math.min(100,c.stamina+this.config.staminaRegen*dt);
    if(carry&&c.braced){c.holdingSince??=this.time;if(this.time-c.holdingSince>1.5&&!c.savedCounted){c.stats.saves++;c.savedCounted=true;this.events.push({type:'save',id:c.id});}}else{c.holdingSince=null;c.savedCounted=false;}
  }
  botThink(c){
    if(c.releaseAt&&this.time>=c.releaseAt){for(let i=0;i<2;i++)this.setHand(c,i,false);c.openUntil=this.time+.3;c.releaseAt=0;}
    const p=c.body.translation(),progress=progressAt(p.x,p.y,this.course);
    if(!c.botTarget||this.time>c.targetUntil||c.botTarget.brokenUntil>this.time||progressAt(c.botTarget.x,c.botTarget.y,this.course)<=progress){c.botTarget=this.holds.filter(h=>h.brokenUntil<=this.time&&Math.hypot(h.x-p.x,h.y-p.y)<3.2&&progressAt(h.x,h.y,this.course)>progress+.004).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];c.targetUntil=this.time+3.5;}
    const dx=c.botTarget?c.botTarget.x-p.x:1.5,dy=c.botTarget?c.botTarget.y-p.y:.5;c.arms.aim=clamp(dx/1.5,-1,1)*.8;c.arms.ay=clamp(dy/1.2,-1,1);c.legs.aim=clamp(dx/2,-1,1);c.arms.brace=true;
    for(let i=0;i<2;i++){const h=c.hands[i];if(h.grip?.kind==='climber'&&this.time-h.since>2.5)c.openUntil=this.time+.8;this.setHand(c,i,this.time>(c.openUntil||0));}
    if(this.time<(c.nextMove??(c.nextMove=this.time+.8)))return;c.nextMove=this.time+1.6;
    this.gesture(c,'flick',1);if(this.courseGrips(c))c.releaseAt=this.time+.12;
  }
  practiceStation(c,stage){
    if(this.course.kind!=='practice')return false;
    const point=typeof stage==='object'&&stage?stage:this.course.stations[stage]||Object.values(this.course.stations)[0];
    const closed=[c.arms.l,c.arms.r];c.safeSpawn=V(point.x,point.y,0);this.recover(c);for(const h of c.hands)h.noGripUntil=0;[c.arms.l,c.arms.r]=closed;c.lastJump=c.lastPush=c.lastLetGo=-10;c.stamina=100;
    // Closed pads still have to catch real holds; the station never awards a grip or combo.
    return true;
  }
  snapshot(c){
    const p=c.body.translation(),q=c.body.rotation(),vel=c.body.linvel();
    const hands=c.hands.map(h=>{
      const hp=h.body.translation(),shoulder=add(p,rotate(V(h.side*.24,.17,0),q));
      const e=add(mul(add(shoulder,hp),.5),V(0,-.08,.13));
      return {...hp,ex:e.x,ey:e.y,ez:e.z,closed:h.side<0?c.arms.l:c.arms.r,grip:!!h.grip,onClimber:h.grip?.kind==='climber',target:h.target?{id:h.target.id,x:h.target.x,y:h.target.y,z:h.target.z}:null};
    });
    const ground=this.grounded(c);
    const legs=c.feet.map(f=>{const foot=f.body.translation(),hip=add(p,rotate(V(f.side*this.config.hipX,-this.config.hipY,0),q));const knee=add(mul(add(hip,foot),.5),V(f.side*.05,.02,.14));return{kx:knee.x,ky:knee.y,kz:knee.z,fx:foot.x,fy:foot.y,fz:foot.z,planted:!!this.footSupport(f)};});
    return {id:c.id,...p,assist:c.assist,grounded:ground,rotation:q,velocity:vel,angular:c.body.angvel(),stamina:c.stamina,actions:{jump:this.jumpState(c,ground),kick:{cooldown:Math.max(0,this.config.kickCooldown-(this.time-(c.lastKick??-10)))}},carry:c.carry,stats:{...c.stats},lastAction:c.lastGestureResult,braced:c.braced,air:!ground&&!hands.some(h=>h.grip),hands,legs,gripping:hands.some(h=>h.grip),progress:progressAt(p.x,p.y,this.course),finished:p.x>=this.course.finish.zoneX&&p.y>=this.course.finish.y-.3};
  }
  free(){for(const id of [...this.climbers.keys()])this.remove(id);this.contactEvents.free();this.world.free();}
}
module.exports={Simulation,course,progressAt};
