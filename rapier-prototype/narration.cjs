// The prologue narrator. Lines fire when any climber first reaches a place (zone) or has a moment
// (first grip, a fall, a combo, a stall...). One voice for everyone: lines queue, never overlap.
//
// THE TEXT BELOW IS PLACEHOLDER. Replace it with the real script. To use a recording, drop
// <id>.mp3 (or .m4a / .wav / .ogg) into client/narration/ — it plays instead of the synthesized voice.
// Set `duration` (seconds) on a line when its recording runs longer than the text suggests.
const LINES=[
 {id:'intro',at:{start:2},text:'Two of you. One body. This is going to go wonderfully.'},
 {id:'step',at:{zone:'step'},text:'Look at that. Up one whole step. The mountain is trembling.'},
 {id:'first-grip',at:{moment:'grip'},text:'Hands are for holding on. Remember that feeling. You will miss it.'},
 {id:'trench',at:{zone:'trench'},text:'Ah. The trench. Everyone visits the trench.'},
 {id:'shelf',at:{zone:'shelf'},text:'Out of the hole. Most people stop here and call it a career.'},
 {id:'wall',at:{zone:'wall'},text:'Too tall to hop. Too smooth to climb. You will have to agree on something.'},
 {id:'first-combo',at:{moment:'combo'},text:'There it is. Two minds, one moment. Do not get used to it.'},
 {id:'first-fall',at:{moment:'fall',min:2},text:'Falling is just climbing in the other direction.'},
 {id:'big-fall',at:{moment:'fall',min:4},text:'That one had a lot of conviction behind it.'},
 {id:'betrayal',at:{moment:'drop'},text:'And so a friendship ends, as they always do: with gravity.'},
 {id:'snowpal',at:{moment:'kick'},text:'The snowpal had a family. Probably. Keep going.'},
 {id:'summit',at:{zone:'summit'},text:'The top of the foot of the mountain. The rest of it is waiting.'},
 {id:'finish',at:{moment:'finish'},text:'That is the prologue. Everything after this is harder, and somehow funnier.'},
 // played when nobody makes progress for a while; each at most once, in order
 {id:'stall-1',at:{moment:'stall'},text:'Take your time. The mountain has nowhere to be.'},
 {id:'stall-2',at:{moment:'stall'},text:'Sometimes the hardest part of climbing is talking to each other.'},
 {id:'stall-3',at:{moment:'stall'},text:'I would help, but I am only a voice.'},
];
const STALL_AFTER=35;  // seconds without anyone getting further
const STALE_AFTER=8;   // a place line still waiting this long is dropped: the moment has passed

const duration=line=>line.duration??1.4+line.text.split(/\s+/).length*.38;

class Narrator{
 constructor(lines=LINES){this.lines=lines;this.reset(0);}
 reset(time){this.played=new Set();this.queue=[];this.busyUntil=time;this.startedAt=time;this.best=0;this.bestAt=time;}
 enqueue(line,time,urgent){
  if(!line||this.played.has(line.id)||this.queue.some(q=>q.line===line))return;
  const item={line,since:time};urgent?this.queue.unshift(item):this.queue.push(item);this.queue.length=Math.min(this.queue.length,3);
 }
 moment(kind,time,value,urgent=true){
  // the biggest threshold this moment clears wins, so a huge fall gets the huge-fall line
  const fits=this.lines.filter(l=>l.at.moment===kind&&!this.played.has(l.id)&&!this.queue.some(q=>q.line===l)&&(value??0)>=(l.at.min??0));
  this.enqueue(fits.sort((a,b)=>(b.at.min??0)-(a.at.min??0))[0],time,urgent);
 }
 // physics events -> moments
 observe(ev,time){
  if(ev.type==='grab')this.moment('grip',time);
  else if(ev.type==='combo')this.moment('combo',time);
  else if(ev.type==='fall')this.moment('fall',time,ev.m);
  else if(ev.type==='drop')this.moment('drop',time);
  else if(ev.type==='kick'&&ev.practice)this.moment('kick',time);
 }
 // climbers: [{x,y,progress,finished}]; zones from the course. Returns the line to say now, or null.
 tick(time,climbers,zones=[]){
  if(time-this.startedAt>=(this.lines.find(l=>l.at.start!==undefined)?.at.start??Infinity))this.enqueue(this.lines.find(l=>l.at.start!==undefined),time);
  for(const z of zones)if(climbers.some(c=>c.x>=z.x0&&c.x<=z.x1&&c.y>=z.y0&&c.y<=z.y1))this.enqueue(this.lines.find(l=>l.at.zone===z.id),time);
  if(climbers.some(c=>c.finished))this.moment('finish',time);
  const best=Math.max(0,...climbers.map(c=>c.progress||0));
  if(best>this.best+.01){this.best=best;this.bestAt=time;}
  else if(climbers.length&&time-this.bestAt>STALL_AFTER){this.bestAt=time;this.moment('stall',time,0,false);}
  this.queue=this.queue.filter(q=>q.line.at.zone===undefined||time-q.since<STALE_AFTER);
  if(time<this.busyUntil||!this.queue.length)return null;
  const {line}=this.queue.shift();this.played.add(line.id);this.busyUntil=time+duration(line);
  return line;
 }
}
module.exports={Narrator,LINES,duration};
