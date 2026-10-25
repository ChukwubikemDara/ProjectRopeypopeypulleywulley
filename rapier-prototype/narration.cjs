// The prologue narrator. One voice for everyone: lines queue and never overlap.
// Triggers:
//   start      seconds after the prologue begins
//   after      when another line finishes (plus a pause, `gap`)
//   zone       the first time any climber reaches a place (zones live in the course)
//   moment     something happened: combo, kick, stall, fall-*, arrive-*, release
// A `\n` in the text splits it into separate captions; one recording covers the whole line.
//
// Rules that keep the voice from saying the wrong thing at the wrong time:
//  - The wake-up speech (wake -> roles -> stand-up) always plays first and in order. Until it has
//    finished, nothing reacts to falls, combos or stalls. "Go on. Stand up." is skipped if everyone is up.
//  - Each line has a freshness limit: a reaction that had to wait too long is dropped, never played late.
//  - A place line only plays if someone is still around that place when its turn comes.
//  - Stalling means nobody got further AND nobody moved for a while, counted from when the narrator
//    last stopped talking. Waking up, listening and waiting at the barrier never count as stalling.
//  - At least LINE_GAP seconds of silence after every line.
//  - Falls only sometimes get a reaction: the narrator has to have been quiet for a while, and there's a
//    long gap between fall reactions. A fall that gets no reaction is still counted (for "same spot" etc).
//  - Once the release line starts, the narrator says nothing else.
// To use a recording, drop <id>.mp3 (or .m4a / .wav / .ogg) into client/narration/.
// Set `duration` (seconds) on a line when its recording runs longer than the text suggests.
const LINES=[
 // waking up under the sign
 {id:'wake',at:{start:2},text:"Ah. You finally made it. Feels strange, doesn't it?\nLegs not listening? Arms pursuing their own interests?\nDon't worry. There's a perfectly reasonable explanation.\nYour friend."},
 {id:'roles',at:{after:'wake',gap:4},text:"One of you has the arms. The other has the legs. Between you, that's almost an entire competent person."},
 {id:'stand-up',at:{after:'roles',gap:1},text:'Go on. Stand up.'},
 {id:'trust',at:{zone:'walk'},text:"Have you ever wondered how much you can really trust your friends?\nOf course you have. But usually the consequences involve a bad haircut or lending someone twenty dollars."},
 {id:'ledge',at:{zone:'ledge'},text:"Arms, grab the ledge. Legs, give them a little help.\nYou may find it useful to explain what you're doing before you do it. An exciting departure from most friendships."},
 {id:'gap',at:{zone:'gap'},text:'A little jump. A little reach. Ideally at roughly the same time.'},
 {id:'beam',at:{zone:'beam'},text:"Take your time here. Trust is knowing someone will catch you.\nTeamwork is mentioning that you're about to let go."},
 {id:'combo',at:{moment:'combo'},text:"Look at that. Communication. Somebody write it down. Not me, I'm busy."},
 // reaching the start platform
 {id:'other-two',at:{moment:'arrive-first'},text:"Oh, yes. The other two.\nThey've been given exactly the same arrangement. So whatever happens next should be a fair and deeply personal disappointment."},
 {id:'nobody-else',at:{moment:'arrive-alone'},text:"Oh. Nobody else came. Somehow, you've still managed to make it a competition."},
 {id:'early',at:{moment:'arrive-early'},text:"You're early. Use this time to reflect on everything your friend has ever done to you."},
 {id:'no-falls',at:{moment:'arrive-clean'},text:"No falls at all. Which means you haven't learned anything yet. The mountain will fix that."},
 {id:'kick-wait',at:{moment:'kick'},text:"Ah. You've found something you can both agree on. Making someone else's day worse."},
 {id:'release',at:{moment:'release'},essential:true,text:"Get to the top before they do.\nAnd remember: you chose this friend.\nI think that's important."},
 // falls: one reaction per fall at most, with room for the blaming in between
 {id:'fall-first',at:{moment:'fall-first'},text:"Good. You've established whose fault it was. Now you can try establishing a method."},
 {id:'fall-again',at:{moment:'fall-again'},repeat:120,text:"You're getting very good at this part. Unfortunately, this part is falling."},
 {id:'fall-same',at:{moment:'fall-same'},repeat:120,text:'Ah. Testing it again. Sensible. One failure could have been a misunderstanding.'},
 {id:'fall-opposite',at:{moment:'fall-opposite'},repeat:120,text:'You both seem to have a plan. That appears to be the problem.'},
 {id:'fall-big',at:{moment:'fall-big'},text:'From up there, it almost looked deliberate.'},
 {id:'fall-start',at:{moment:'fall-start'},text:"Ah, the beginning. You've been here before. Fond memories? No?"},
 {id:'stall',at:{moment:'stall'},text:'Silence. Either deep concentration, or a very quiet argument.'},
];
const STALL_AFTER=45;   // s with nobody getting further...
const STALL_STILL=8;    // ...and nobody moving at all for the last few of them
const FALL_QUIET=25;    // s after a fall reaction before another fall gets one
const FALL_NEEDS_QUIET=6; // s the narrator must have been silent before reacting to a fall
const LINE_GAP=4;       // s of silence after every line (the wake-up speech keeps its own pauses)
const BIG_FALL=4;       // m
// how long a line may wait in the queue before it's stale (s), by what triggered it
// (place lines never go stale by time: they stay as long as someone is still at that place)
const FRESH={zone:Infinity,fall:5,combo:6,kick:6,arrive:25,stall:4,release:Infinity,start:Infinity,after:Infinity};
const INTRO=['wake','roles','stand-up'];

// Recordings can run longer than the text suggests; the server fills this from client/narration/durations.json.
let recorded={};
const setRecorded=map=>{recorded=map&&typeof map==='object'?map:{};};
const duration=line=>recorded[line.id]??line.duration??1.4+line.text.split(/\s+/).length*.38+line.text.split('\n').length*.4;
const triggerOf=line=>line.at.zone!==undefined?'zone':line.at.start!==undefined?'start':line.at.after!==undefined?'after':line.at.moment==='release'?'release':String(line.at.moment).startsWith('fall')?'fall':String(line.at.moment).startsWith('arrive')?'arrive':line.at.moment;
const inside=(c,z,pad=0)=>c.x>=z.x0-pad&&c.x<=z.x1+pad&&c.y>=z.y0-pad&&c.y<=z.y1+pad;

class Narrator{
 constructor(lines=LINES){this.lines=lines;this.intro=lines.some(l=>INTRO.includes(l.id));this.reset(0);}
 reset(time){
  this.played=new Map();this.queue=[];this.later=[];this.busyUntil=time;this.startedAt=time;this.closed=false;this.introDone=!this.intro;
  this.best=0;this.progressAt=time;this.movedAt=time;this.lastFallLine=-Infinity;this.teams=new Map();this.arrivals=0;
 }
 can(line,time){const last=this.played.get(line.id);return last===undefined||(line.repeat!==undefined&&time-last>=line.repeat);}
 enqueue(line,time,urgent){
  if(!line||this.closed||!this.can(line,time)||this.queue.some(q=>q.line===line))return false;
  const kind=triggerOf(line);
  // during the wake-up speech, only the speech itself (and the place lines, which wait their turn) may queue
  if(!this.introDone&&!['start','after','zone'].includes(kind))return false;
  const item={line,since:time,kind};urgent?this.queue.unshift(item):this.queue.push(item);
  // too much to say: drop the newest optional line (the wake-up speech and the release line are never optional)
  while(this.queue.length>3){const i=this.queue.findLastIndex(q=>!q.line.essential&&!['start','after'].includes(q.kind));if(i<0)break;this.queue.splice(i,1);}
  return this.queue.includes(item);
 }
 moment(kind,time,urgent=true){return this.enqueue(this.lines.find(l=>l.at.moment===kind&&this.can(l,time)),time,urgent);}
 team(id){if(!this.teams.has(id))this.teams.set(id,{falls:0,lastZone:null,arrived:false});return this.teams.get(id);}
 // physics events (the caller decides which kicks count)
 observe(ev,time){
  if(ev.type==='combo')this.moment('combo',time);
  else if(ev.type==='kick'&&!ev.practice)this.moment('kick',time);
 }
 // a fall: {id, m, zone (where it started), opposite (arms and legs were pulling different ways), toStart}
 fall(f,time){
  const t=this.team(f.id),same=!!f.zone&&f.zone===t.lastZone;t.falls++;if(f.zone)t.lastZone=f.zone;
  if(!this.introDone||this.closed||time-this.lastFallLine<FALL_QUIET||(this.played.size>0&&time-this.busyUntil<FALL_NEEDS_QUIET)||this.queue.some(q=>q.kind==='fall'))return null;
  const order=[f.opposite&&'fall-opposite',same&&'fall-same',f.m>=BIG_FALL&&'fall-big',f.toStart&&'fall-start','fall-first','fall-again'].filter(Boolean);
  for(const kind of order)if(this.moment(kind,time))return kind;
  return null;
 }
 // a team reached the start platform: {id, teams (how many are racing), waiting (others still climbing)}
 arrive(a,time){
  // the caller repeats this every tick while the team is up there, so an arrival during the wake-up speech is just counted later
  if(!this.introDone||this.closed)return;
  const t=this.team(a.id);if(t.arrived)return;t.arrived=true;this.arrivals++;
  if(this.arrivals===1)this.moment(a.teams>1?'arrive-first':'arrive-alone',time,false);
  else if(a.waiting)this.moment('arrive-early',time,false);
  if(t.falls===0)this.moment('arrive-clean',time,false);
 }
 // climbers: [{x,y,progress,moving,slumped}] (x folded onto the left lane for mirrored courses).
 // zones: [{id,x0,x1,y0,y1,still?}] where `still` is the area that keeps the line relevant.
 // Returns the line to say now, or null.
 tick(time,climbers,zones=[]){
  if(this.closed)return null;
  const start=this.lines.find(l=>l.at.start!==undefined);
  if(start&&time-this.startedAt>=start.at.start)this.enqueue(start,time);
  // chained lines go straight to the front: the speech they continue isn't finished yet
  for(const later of this.later.filter(l=>time>=l.at))this.enqueue(later.line,time,true);
  this.later=this.later.filter(l=>time<l.at);
  for(const z of zones)if(climbers.some(c=>inside(c,z)))this.enqueue(this.lines.find(l=>l.at.zone===z.id),time);
  // stalling: nobody further along, nobody moving, nobody waking up, nobody waiting at the barrier, narrator quiet
  const best=Math.max(0,...climbers.map(c=>c.progress||0));
  if(best>this.best+.01){this.best=best;this.progressAt=time;}
  if(climbers.some(c=>c.moving||c.slumped))this.movedAt=time;
  const quietSince=Math.max(this.progressAt,this.busyUntil);
  if(this.introDone&&climbers.length&&this.best<.99&&time-quietSince>STALL_AFTER&&time-this.movedAt>STALL_STILL){this.progressAt=time;this.moment('stall',time,false);}
  // drop what's no longer worth saying
  this.queue=this.queue.filter(q=>{
   if(time-q.since>(q.line.fresh??FRESH[q.kind]??8))return false;
   if(q.kind==='zone'){const z=zones.find(z=>z.id===q.line.at.zone);if(z&&!climbers.some(c=>inside(c,z.still||z,z.still?0:1.5)))return false;}
   if(q.line.id==='stand-up'&&climbers.length&&climbers.every(c=>!c.slumped))return false;
   return true;
  });
  if(!this.introDone&&!this.queue.some(q=>q.kind==='start'||q.kind==='after')&&!this.later.length&&this.played.has('wake')&&time>=this.busyUntil)this.introDone=true;
  if(time<this.busyUntil||!this.queue.length)return null;
  // until the wake-up speech is over, only its own lines may play (even in its pauses)
  const at=this.introDone?0:this.queue.findIndex(q=>q.kind==='start'||q.kind==='after');
  if(at<0)return null;
  // breathing room between lines, so the players get to react to each other
  if(this.introDone&&this.played.size>0&&time<this.busyUntil+LINE_GAP)return null;
  const [{line,kind}]=this.queue.splice(at,1);this.played.set(line.id,time);this.busyUntil=time+duration(line);
  if(kind==='fall')this.lastFallLine=this.busyUntil; // quiet counts from the end of the reaction
  if(line.id==='release')this.closed=true;
  for(const next of this.lines.filter(l=>l.at.after===line.id))this.later.push({line:next,at:this.busyUntil+(next.at.gap||0)});
  // a skipped chain link still lets the rest of the speech continue
  return line;
 }
}
// the fall reactions on their own, for races
const FALL_LINES=LINES.filter(l=>String(l.at.moment).startsWith('fall-'));
const TIMING={STALL_AFTER,STALL_STILL,FALL_QUIET,FALL_NEEDS_QUIET,LINE_GAP};
module.exports={Narrator,LINES,FALL_LINES,duration,setRecorded,triggerOf,TIMING};
