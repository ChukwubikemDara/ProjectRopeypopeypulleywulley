// The prologue narrator. One voice for everyone: lines queue and never overlap.
// Triggers:
//   start      seconds after the prologue begins
//   after      when another line finishes (plus a pause, `gap`)
//   zone       the first time any climber reaches a place (zones live in the course)
//   moment     something happened: combo, kick, stall, fall-*, arrive-*, release
// A `\n` in the text splits it into separate captions; one recording covers the whole line.
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
 {id:'fall-again',at:{moment:'fall-again'},repeat:60,text:"You're getting very good at this part. Unfortunately, this part is falling."},
 {id:'fall-same',at:{moment:'fall-same'},repeat:60,text:'Ah. Testing it again. Sensible. One failure could have been a misunderstanding.'},
 {id:'fall-opposite',at:{moment:'fall-opposite'},repeat:60,text:'You both seem to have a plan. That appears to be the problem.'},
 {id:'fall-big',at:{moment:'fall-big'},text:'From up there, it almost looked deliberate.'},
 {id:'fall-start',at:{moment:'fall-start'},text:"Ah, the beginning. You've been here before. Fond memories? No?"},
 {id:'stall',at:{moment:'stall'},text:'Silence. Either deep concentration, or a very quiet argument.'},
];
const STALL_AFTER=35;   // seconds without anyone getting further
const STALE_AFTER=8;    // a place line still waiting this long is dropped: the moment has passed
const FALL_QUIET=8;     // seconds between fall reactions
const BIG_FALL=4;       // metres

const duration=line=>line.duration??1.4+line.text.split(/\s+/).length*.38+line.text.split('\n').length*.4;

class Narrator{
 constructor(lines=LINES){this.lines=lines;this.reset(0);}
 reset(time){this.played=new Map();this.queue=[];this.later=[];this.busyUntil=time;this.startedAt=time;this.best=0;this.bestAt=time;this.lastFallLine=-Infinity;this.teams=new Map();this.arrivals=0;}
 can(line,time){const last=this.played.get(line.id);return last===undefined||(line.repeat!==undefined&&time-last>=line.repeat);}
 enqueue(line,time,urgent){
  if(!line||!this.can(line,time)||this.queue.some(q=>q.line===line))return false;
  const item={line,since:time};urgent?this.queue.unshift(item):this.queue.push(item);
  // too much to say: drop the newest optional line (the release line is never optional)
  while(this.queue.length>3){const i=this.queue.findLastIndex(q=>!q.line.essential);if(i<0)break;this.queue.splice(i,1);}
  return this.queue.includes(item);
 }
 moment(kind,time,urgent=true){return this.enqueue(this.lines.find(l=>l.at.moment===kind&&this.can(l,time)),time,urgent);}
 team(id){if(!this.teams.has(id))this.teams.set(id,{falls:0,lastZone:null,arrived:false});return this.teams.get(id);}
 // physics events
 observe(ev,time){
  if(ev.type==='combo')this.moment('combo',time);
  else if(ev.type==='kick'&&!ev.practice)this.moment('kick',time);
 }
 // a fall: {id, m, zone (where it started), opposite (arms and legs were pulling different ways), toStart}
 fall(f,time){
  const t=this.team(f.id),same=f.zone&&f.zone===t.lastZone;t.falls++;t.lastZone=f.zone||t.lastZone;
  if(time-this.lastFallLine<FALL_QUIET)return null;
  const order=[f.opposite&&'fall-opposite',same&&'fall-same',f.m>=BIG_FALL&&'fall-big',f.toStart&&'fall-start','fall-first','fall-again'].filter(Boolean);
  for(const kind of order)if(this.moment(kind,time)){this.lastFallLine=time;return kind;}
  return null;
 }
 // a team reached the start platform: {id, teams (how many are racing), waiting (others still climbing)}
 arrive(a,time){
  const t=this.team(a.id);if(t.arrived)return;t.arrived=true;this.arrivals++;
  if(this.arrivals===1)this.moment(a.teams>1?'arrive-first':'arrive-alone',time,false);
  else if(a.waiting)this.moment('arrive-early',time,false);
  if(t.falls===0)this.moment('arrive-clean',time,false);
 }
 // climbers: [{x,y,progress}] (x already folded onto the left lane for mirrored courses). Returns the line to say now, or null.
 tick(time,climbers,zones=[]){
  const start=this.lines.find(l=>l.at.start!==undefined);
  if(start&&time-this.startedAt>=start.at.start)this.enqueue(start,time);
  for(const later of this.later.filter(l=>time>=l.at))this.enqueue(later.line,time);
  this.later=this.later.filter(l=>time<l.at);
  for(const z of zones)if(climbers.some(c=>c.x>=z.x0&&c.x<=z.x1&&c.y>=z.y0&&c.y<=z.y1))this.enqueue(this.lines.find(l=>l.at.zone===z.id),time);
  const best=Math.max(0,...climbers.map(c=>c.progress||0));
  if(best>this.best+.01){this.best=best;this.bestAt=time;}
  // waiting at the barrier isn't stalling
  else if(climbers.length&&this.best<.99&&time-this.bestAt>STALL_AFTER){this.bestAt=time;this.moment('stall',time,false);}
  this.queue=this.queue.filter(q=>q.line.at.zone===undefined||time-q.since<STALE_AFTER);
  if(time<this.busyUntil||!this.queue.length)return null;
  const {line}=this.queue.shift();this.played.set(line.id,time);this.busyUntil=time+duration(line);
  for(const next of this.lines.filter(l=>l.at.after===line.id))this.later.push({line:next,at:this.busyUntil+(next.at.gap||0)});
  return line;
 }
 get speaking(){return this.queue.length>0||this.later.length>0;}
}
module.exports={Narrator,LINES,duration};
