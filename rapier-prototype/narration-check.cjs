// Narrator rules for the prologue script: chained wake-up speech, places once, one reaction per fall,
// the right fall line for the situation, and the arrival lines.
const assert=require('node:assert/strict');
const {Narrator,LINES,duration}=require('./narration.cjs');
const zones=[{id:'walk',x0:-28,x1:-24,y0:-1,y1:4}];
const at=(x,y,progress=0)=>[{x,y,progress}];
// run the narrator until it says something (or give up), returning [line, time]
function next(n,from,climbers=at(-33,1),until=from+60){for(let t=from;t<until;t+=.1){const line=n.tick(t,climbers,zones);if(line)return[line,t];}return[null,until];}

const n=new Narrator();n.reset(0);
assert.equal(n.tick(1,at(-33,1)),null,'quiet for a moment after waking up');
let [line,t]=next(n,1);assert.equal(line.id,'wake');
[line,t]=next(n,t+.1);assert.equal(line.id,'roles');
[line,t]=next(n,t+.1);assert.equal(line.id,'stand-up');
console.log('PASS the wake-up speech plays in order, with a pause to experiment');
[line,t]=next(n,t+.1,at(-26,1,.1));assert.equal(line.id,'trust');
assert.equal(next(n,t+.1,at(-26,1,.1),t+20)[0],null,'a place line plays once');
console.log('PASS place lines play the first time anyone gets there');

const f=new Narrator();f.reset(0);f.busyUntil=0;f.played.set('wake',0);
const fall=(o,time)=>{const kind=f.fall({id:'a',m:2,zone:'ledge',...o},time);if(kind)f.tick(time,at(-20,4,.3));f.busyUntil=0;return kind;};
assert.equal(fall({zone:'wake'},10),'fall-first');
assert.equal(fall({zone:'gap'},12),null,'only one reaction while the last one is still fresh');
assert.equal(fall({zone:'gap'},25),'fall-same','falling off the same section again');
assert.equal(fall({zone:'beam',opposite:true},40),'fall-opposite','pulling in opposite directions wins');
assert.equal(fall({zone:'ledge',m:5},55),'fall-big');
assert.equal(fall({zone:'gap',toStart:true},70),'fall-start');
assert.equal(fall({zone:'beam'},85),'fall-again');
console.log('PASS falls get one fitting reaction each, with silence in between');

const a=new Narrator();a.reset(0);a.played.set('wake',0);a.team('clean');a.team('messy').falls=3;
a.arrive({id:'messy',teams:2,waiting:true},5);a.arrive({id:'clean',teams:2,waiting:false},6);
const said=[];for(let t=6;t<80;t+=.1){const l=a.tick(t,at(-2,10,1));if(l)said.push(l.id);}
assert.deepEqual(said,['other-two','no-falls'],'first arrival reveals the other team; a team with no falls gets told off');
const solo=new Narrator();solo.reset(0);solo.played.set('wake',0);solo.team('only').falls=1;solo.arrive({id:'only',teams:1,waiting:false},1);
assert.equal(next(solo,1.1,at(-2,10,1))[0].id,'nobody-else');
const early=new Narrator();early.reset(0);early.played.set('wake',0);early.played.set('other-two',0);early.team('x').falls=1;early.team('y').falls=1;
early.arrive({id:'x',teams:3,waiting:true},1);early.arrive({id:'y',teams:3,waiting:true},2);assert.equal(next(early,2.1,at(-2,10,1))[0].id,'early');
console.log('PASS arrival lines: the other two, nobody else, early, and no falls');

assert.ok(LINES.every(l=>l.id&&l.text&&l.at),'every line has an id, text and trigger');
assert.equal(new Set(LINES.map(l=>l.id)).size,LINES.length,'line ids are unique (they name the recordings)');
assert.ok(duration(LINES.find(l=>l.id==='wake'))>duration(LINES.find(l=>l.id==='stand-up')),'longer speeches stay up longer');
console.log('PASS the script is well formed');
