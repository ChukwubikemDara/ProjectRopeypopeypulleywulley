// Runs the prologue around the narrator: the wake-up slump, which section each team is in, falls,
// arrivals at the start platform, and the barrier that releases everyone into the race.
// RaceVoice reuses the fall reactions during races.
const {Narrator,FALL_LINES,duration}=require('./narration.cjs');
const OPPOSED_WINDOW=1.5; // s: arms and legs pulling different ways this recently counts as "opposite"
const WAIT_LIMIT=40;      // s after the first team arrives before the barrier goes up anyway
const MOVING=.35;         // m/s: slower than this counts as standing still

// arms tilting one way while the legs lean the other
function trackOpposition(c,time){if(Math.abs(c.arms.aim||0)>.35&&Math.abs(c.legs.aim||0)>.35&&Math.sign(c.arms.aim)!==Math.sign(c.legs.aim))c.opposedAt=time;}
const opposed=(c,time)=>time-(c.opposedAt??-10)<OPPOSED_WINDOW;

class Prologue{
 constructor(narrator=new Narrator()){this.narrator=narrator;this.reset(null);}
 reset(sim){this.sim=sim;this.narrator.reset(sim?.time||0);this.firstArrival=null;this.releasing=false;this.releaseEndsAt=null;this.raceStarted=false;}
 fold(x){return this.sim.course.mirror?-Math.abs(x):x;}
 // the section a position belongs to: the last section start at or behind it
 section(x){const stations=Object.entries(this.sim.course.stations||{}).sort((a,b)=>a[1].x-b[1].x),fx=this.fold(x);return(stations.filter(([,s])=>s.x<=fx+.5).at(-1)||stations[0])?.[0];}
 // everyone wakes up slumped under the sign until the legs move
 spawned(c){c.slumped=true;c.tuck=Infinity;}
 standUp(c){if(c.slumped){c.slumped=false;c.tuck=0;}}
 input(c,role,m){if(role!=='arms'&&Math.abs(m.aim||0)>.3)this.standUp(c);}
 gesture(c,role){if(role!=='arms')this.standUp(c);}
 climbers(){return[...this.sim.climbers.values()].filter(c=>!c.bot);}
 finished(c){const p=c.body.translation(),f=this.sim.course.finish;return p.y>=f.y-.3&&Math.abs(p.x)<=Math.abs(f.zoneX);}
 // events from the physics step
 event(ev,time){
  if(ev.type==='kick'){const c=this.sim.climbers.get(ev.id);if(c&&this.finished(c))this.narrator.observe(ev,time);return;} // kicking only means something while waiting at the barrier
  this.narrator.observe(ev,time);
  if(ev.type!=='fall')return;
  const c=this.sim.climbers.get(ev.id);if(!c||c.bot)return;
  const from=c.section,landed=this.section(ev.x);
  this.narrator.fall({id:c.id,m:ev.m,zone:from,opposite:opposed(c,time),toStart:landed==='wake'&&!!from&&from!=='wake'},time);
 }
 // called every server tick while the prologue is playing; returns what the server should do
 tick(time,progressAt){
  const out={say:null,release:false,startRace:false},climbers=this.climbers();
  for(const c of climbers){
   const p=c.body.translation();
   if(this.sim.grounded(c)||c.hands.some(h=>h.grip))c.section=this.section(p.x);
   trackOpposition(c,time);
   if(this.finished(c)){
    this.firstArrival??=time;
    this.narrator.arrive({id:c.id,teams:climbers.length,waiting:climbers.some(o=>o!==c&&!this.finished(o))},time);
   }
  }
  const everyone=climbers.length>0&&climbers.every(c=>this.finished(c));
  if(!this.releasing&&this.firstArrival!==null&&(everyone||time-this.firstArrival>WAIT_LIMIT))this.releasing=true;
  if(this.releasing&&this.releaseEndsAt===null)this.narrator.moment('release',time,false); // no-op while it's already queued
  const line=this.narrator.tick(time,climbers.map(c=>{const p=c.body.translation(),v=c.body.linvel();
   return{x:this.fold(p.x),y:p.y,progress:progressAt(p.x,p.y,this.sim.course),moving:Math.hypot(v.x,v.y)>MOVING,slumped:!!c.slumped};}),this.sim.course.zones);
  if(line){out.say=line;if(line.id==='release'){out.release=true;this.releaseEndsAt=time+duration(line);}}
  if(this.releaseEndsAt!==null&&!this.raceStarted&&time>=this.releaseEndsAt+.8){this.raceStarted=true;out.startRace=true;}
  return out;
 }
}

// During races the narrator only reacts to falls, with the same rules (one at a time, quiet in between).
class RaceVoice{
 constructor(){this.narrator=new Narrator(FALL_LINES);this.reset(null);}
 reset(sim){this.sim=sim;this.narrator.reset(sim?.time||0);}
 event(ev,time,progressAt){
  if(ev.type!=='fall')return;
  const c=this.sim?.climbers.get(ev.id);if(!c||c.bot)return;
  this.narrator.fall({id:c.id,m:ev.m,zone:null,opposite:opposed(c,time),toStart:progressAt(ev.x,ev.y,this.sim.course)<.06},time);
 }
 tick(time){for(const c of this.sim.climbers.values())if(!c.bot)trackOpposition(c,time);return this.narrator.tick(time,[],[]);}
}
module.exports={Prologue,RaceVoice};
