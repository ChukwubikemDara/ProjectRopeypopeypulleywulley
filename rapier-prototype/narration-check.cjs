// Narrator edge cases: the wrong line must never play at the wrong time.
const assert=require('node:assert/strict');
const {Narrator,LINES,FALL_LINES,duration,setRecorded}=require('./narration.cjs');
const zones=[{id:'walk',x0:-28,x1:-24,y0:-1,y1:4,still:{x0:-36,x1:-21,y0:-1,y1:3.2}},{id:'ledge',x0:-23.5,x1:-21,y0:-1,y1:2.6,still:{x0:-25,x1:-20.6,y0:-1,y1:4.4}}];
const team=(x,y,o={})=>({x,y,progress:0,moving:false,slumped:false,...o});
// run the narrator from `from` to `to` (s), returning [{id,t}] of everything it said
function run(n,from,to,climbers,step=.1,hooks={}){const said=[];for(let t=from;t<to;t=Math.round((t+step)*1000)/1000){hooks[t]?.();const c=typeof climbers==='function'?climbers(t):climbers;const l=n.tick(t,c,zones);if(l)said.push({id:l.id,t});}return said;}
const ids=said=>said.map(s=>s.id);
// a narrator that has already finished the wake-up speech
function awake(){const n=new Narrator();n.reset(0);run(n,0,40,[team(-33,1)]);assert.ok(n.introDone);return n;}

// --- waking up -------------------------------------------------------------------------------
{const n=new Narrator();n.reset(0);
 const said=run(n,0,60,[team(-33,1,{slumped:true})]);
 assert.deepEqual(ids(said),['wake','roles','stand-up'],'standing still and slumped at spawn: only the wake-up speech, no "silence" line');
 const wake=said[0],roles=said[1];assert.ok(wake.t>=2&&roles.t>=wake.t+duration(LINES.find(l=>l.id==='wake'))+4-.11,'a pause to experiment between the first two lines');
 console.log('PASS idle at spawn while waking up: just the wake-up speech, in order, with the pause');}
{const n=new Narrator();n.reset(0);
 const said=run(n,0,60,t=>[team(-33,1,{slumped:t<5})]);
 assert.deepEqual(ids(said),['wake','roles'],'"Go on. Stand up." is skipped when everyone is already standing');
 console.log('PASS "Go on. Stand up." is skipped if the legs already stood up');}
{const n=new Narrator();n.reset(0);
 // rush ahead during the speech: walk past the walk zone and reach the ledge before the speech ends
 const said=run(n,0,60,t=>[team(t<6?-33:t<9?-26:-22,1,{moving:true})]);
 assert.deepEqual(ids(said),['wake','roles','trust','ledge'],'place lines wait for the speech, and still play while you are around');
 assert.ok(said[2].t>said[1].t,'never in the middle of the wake-up speech');
 console.log('PASS place lines reached during the speech wait their turn, in order');}
{const n=new Narrator();n.reset(0);
 // pass the walk zone during the speech, then climb the ledge before the speech ends: the walk line no longer fits
 const said=run(n,0,60,t=>[team(t<6?-33:t<9?-26:-17,t<9?1:4,{moving:true})]);
 assert.ok(!ids(said).includes('trust'),'a place line is dropped when nobody is there any more');
 console.log('PASS a place line is dropped if everyone has moved on');}
{const n=new Narrator();n.reset(0);
 n.fall({id:'a',m:3,zone:'wake'},3);n.observe({type:'combo'},4);
 assert.deepEqual(ids(run(n,0,40,[team(-33,1,{slumped:true})])),['wake','roles','stand-up'],'falls and combos during the speech are ignored');
 console.log('PASS reactions never interrupt the wake-up speech');}

// --- stalling ----------------------------------------------------------------------------------
{const n=awake(),end=n.busyUntil;
 assert.deepEqual(ids(run(n,40,end+34,[team(-33,1)])),[],'no "silence" line within 35 s of the narrator going quiet');
 const later=run(n,end+34,end+50,[team(-33,1)]);assert.deepEqual(ids(later),['stall'],'standing still long after the speech: the silence line');
 console.log('PASS the silence line needs 35 quiet seconds after the narrator stops, not 35 s from spawn');}
{const n=awake();
 assert.deepEqual(ids(run(n,40,140,[team(-33,1,{moving:true})])),[],'moving around without getting further is not "silence"');
 assert.deepEqual(ids(run(n,140,200,[team(-33,1,{slumped:true})])),[],'still slumped (nobody has picked up the legs yet) is not "silence"');
 assert.deepEqual(ids(run(n,200,300,[team(-2,10,{progress:1})])),[],'waiting at the barrier is not "silence"');
 assert.deepEqual(ids(run(n,300,400,[])),[],'nobody in the game is not "silence"');
 console.log('PASS no silence line while moving, slumped, waiting at the barrier, or with nobody there');}
{const n=awake(),end=n.busyUntil;
 assert.deepEqual(ids(run(n,40,end+200,[team(-33,1)])),['stall'],'the silence line plays once, not every 35 s');
 console.log('PASS the silence line plays only once');}

// --- falls -------------------------------------------------------------------------------------
{const n=awake();let t=50;
 const fall=(o,at)=>{const kind=n.fall({id:'a',m:2,zone:'ledge',...o},at);const said=run(n,at,at+15,[team(-20,4,{moving:true})]);return[kind,ids(said)];};
 assert.deepEqual(fall({zone:'wake'},t),['fall-first',['fall-first']]);
 t=n.busyUntil-1;assert.equal(n.fall({id:'a',m:2,zone:'gap'},t),null,'no reaction while one is still being said');
 t=n.busyUntil+3;assert.equal(n.fall({id:'a',m:2,zone:'gap'},t),null,'and none in the quiet right after it');
 t=n.busyUntil+9;assert.deepEqual(fall({zone:'gap'},t),['fall-same',['fall-same']],'same section twice in a row');
 t=n.busyUntil+9;assert.deepEqual(fall({zone:'beam',opposite:true},t),['fall-opposite',['fall-opposite']],'pulling in opposite directions wins');
 t=n.busyUntil+9;assert.deepEqual(fall({zone:'ledge',m:5},t),['fall-big',['fall-big']]);
 t=n.busyUntil+9;assert.deepEqual(fall({zone:'gap',toStart:true},t),['fall-start',['fall-start']]);
 t=n.busyUntil+9;assert.deepEqual(fall({zone:'beam'},t),['fall-again',['fall-again']]);
 t=n.busyUntil+9;assert.equal(fall({zone:'ledge'},t)[0],null,'every reaction used up (the repeatable ones wait a minute)');
 console.log('PASS one fitting reaction per fall, never overlapping, with quiet after each');}
{const n=awake();n.moment('combo',50);n.fall({id:'a',m:2,zone:'gap'},50.05);
 // the combo line is being said; the fall reaction waits, and goes stale before it gets a turn
 const said=run(n,50,70,[team(-20,4,{moving:true})]);assert.deepEqual(ids(said),['fall-first']);
 const n2=awake();n2.busyUntil=60;n2.fall({id:'a',m:2,zone:'gap'},50);assert.deepEqual(ids(run(n2,50,70,[team(-20,4,{moving:true})])),[],'a fall reaction that waited too long is dropped');
 console.log('PASS a stale fall reaction is dropped instead of played late');}

// --- arrivals, kicks, release ------------------------------------------------------------------
{const early=new Narrator();early.reset(0);early.arrive({id:'fast',teams:1,waiting:false},5);
 const said=ids(run(early,0,60,[team(-2,10,{progress:1})],.1,Object.fromEntries(Array.from({length:550},(_,i)=>[Math.round((5+i*.1)*1000)/1000,()=>early.arrive({id:'fast',teams:1,waiting:false},5+i*.1)]))));
 assert.deepEqual(said.slice(0,2),['wake','roles']);assert.ok(said.includes('nobody-else'),'arriving during the wake-up speech still gets its line afterwards');
 console.log('PASS a team that arrives during the wake-up speech still gets its arrival line');}
{const n=awake();n.team('messy').falls=3;n.arrive({id:'messy',teams:2,waiting:true},50);n.arrive({id:'clean',teams:2,waiting:false},51);n.arrive({id:'messy',teams:2,waiting:true},52);
 assert.deepEqual(ids(run(n,50,90,[team(-2,10,{progress:1})])),['other-two','no-falls'],'each team arrives once; first arrival reveals the other team; no falls gets told off');
 const solo=awake();solo.team('only').falls=1;solo.arrive({id:'only',teams:1,waiting:false},50);assert.deepEqual(ids(run(solo,50,70,[team(-2,10,{progress:1})])),['nobody-else']);
 console.log('PASS arrival lines play once per team');}
{const n=awake();n.moment('combo',50);n.moment('kick',50);n.moment('stall',50);n.moment('release',50,false);n.moment('arrive-early',50,false);
 const said=ids(run(n,50,120,[team(-2,10,{progress:1})]));assert.ok(said.includes('release'),'the release line is never dropped, however busy the narrator is');
 assert.equal(said.at(-1),'release','and nothing is said after it');
 n.fall({id:'a',m:5,zone:'beam'},121);n.moment('combo',121);assert.deepEqual(ids(run(n,121,140,[team(-2,10,{progress:1})])),[]);
 console.log('PASS the release line always plays, and the narrator stays quiet after it');}

// --- recordings, races, the script -------------------------------------------------------------
{setRecorded({'fall-big':9.5});assert.equal(duration(LINES.find(l=>l.id==='fall-big')),9.5,'a recording\'s real length paces the next line');setRecorded({});
 const n=awake();n.moment('stall',50,false);setRecorded({stall:12});const said=run(n,50,80,[team(-33,1)]);setRecorded({});n.moment('combo',said[0].t+5);
 assert.ok(n.busyUntil-said[0].t>=12-.11,'the narrator waits for the full recording');
 console.log('PASS recording lengths pace the narrator');}
{const race=new Narrator(FALL_LINES);race.reset(0);assert.ok(race.introDone,'races have no wake-up speech');
 assert.equal(race.fall({id:'a',m:3.5},5),'fall-first');assert.deepEqual(ids(run(race,5,20,[])),['fall-first']);
 assert.ok(FALL_LINES.every(l=>l.id.startsWith('fall-'))&&FALL_LINES.length===6,'races reuse exactly the six fall reactions');
 console.log('PASS races reuse the fall reactions with the same rules');}
{assert.ok(LINES.every(l=>l.id&&l.text&&l.at),'every line has an id, text and trigger');
 assert.equal(new Set(LINES.map(l=>l.id)).size,LINES.length,'line ids are unique (they name the recordings)');
 console.log('PASS the script is well formed');}
