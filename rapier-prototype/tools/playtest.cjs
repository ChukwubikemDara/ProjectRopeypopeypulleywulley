// Playtest: four "phones" join a real server as two teams (each an ARMS socket and a LEGS socket) and play every map
// in real time, like people would: the arms reach toward the next hold on the route and grip it, the legs hop, and when
// hanging they try a combo (the arms let go after a human-sized reaction delay, so some combos miss). When the other
// team is close they get competitive: the legs kick, the arms sometimes grab a rival's hand and let go later (betrayal).
//
//   node tools/playtest.cjs                    every map (prologue, Snowbound, Forest, Campus), 120 s each
//   node tools/playtest.cjs mountain 60        one map, 60 s
//
// Prints a report per map: how far each team got, where they got stuck, and every rivalry interaction.
const {io}=require('socket.io-client');
const {createServer}=require('../server.cjs');
const {progressAt}=require('../physics.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const rand=(a,b)=>a+Math.random()*(b-a);

async function playMap(game,url,mapId,seconds){
 const sockets=[],state={s:null,level:null},events=[],narration=[],results=[];
 const connect=async(surface)=>{const s=io(url,{transports:['websocket'],auth:{surface}});sockets.push(s);await new Promise(r=>s.on('connect',r));return s;};
 const host=await connect('spectator');host.on('state3d',st=>state.s=st);host.on('level',l=>state.level=l);host.on('event',e=>events.push({...e,t:Date.now()}));host.on('narrate',l=>narration.push(l.id));host.on('results',r=>results.push(r));
 const phones=[];for(const name of ['A arms','A legs','B arms','B legs']){const s=await connect('phone');s.emit('join',{name});await wait(60);phones.push(s);}
 const role=s=>game.players.get(s.id)?.role,team=s=>game.players.get(s.id)?.team;
 const teams=[{arms:phones[0],legs:phones[1]},{arms:phones[2],legs:phones[3]}];
 for(const t of teams){t.id=team(t.arms);t.ok=team(t.legs)===t.id&&role(t.arms)==='arms'&&role(t.legs)==='legs';}
 if(mapId==='practice')host.emit('practice');else{await new Promise(r=>host.emit('selectCourse',mapId,r));host.emit('start');}
 await wait(500);
 const L=()=>state.level,me=t=>state.s?.climbers.find(c=>c.id===t.id),rival=t=>state.s?.climbers.find(c=>c.id!==t.id);
 for(const t of teams)Object.assign(t,{target:null,targetUntil:0,open:0,nextHop:Date.now()+rand(600,1400),best:0,bestAt:Date.now(),stuck:[],combosTried:0,kicksTried:0,grabbed:0,lastKick:0,finishAt:null});
 const t0=Date.now();
 const brain=setInterval(()=>{
  const now=Date.now(),level=L();if(!level||!state.s)return;
  for(const t of teams){
   const c=me(t);if(!c)continue;const prog=c.progress??progressAt(c.x,c.y,level);
   if(prog>t.best+.01){t.best=prog;t.bestAt=now;}else if(now-t.bestAt>12000){t.stuck.push({x:+c.x.toFixed(1),y:+c.y.toFixed(1),progress:+prog.toFixed(2)});t.bestAt=now;}
   if(c.finished&&!t.finishAt)t.finishAt=(now-t0)/1000;
   // the arms look for the nearest hold further along the route (what a player sees on the big screen)
   if(!t.target||now>t.targetUntil||progressAt(t.target.x,t.target.y,level)<=prog){
    t.target=level.holds.filter(h=>!(state.s.broken||[]).includes(h.id)&&Math.hypot(h.x-c.x,h.y-c.y)<3.4&&progressAt(h.x,h.y,level)>prog+.004).sort((a,b)=>Math.hypot(a.x-c.x,a.y-c.y)-Math.hypot(b.x-c.x,b.y-c.y))[0]||null;t.targetUntil=now+3500;}
   const r=rival(t),near=r&&Math.hypot(r.x-c.x,r.y-c.y)<1.4;
   const dx=t.target?t.target.x-c.x:(level.mirror&&c.x>0?-1.5:1.5),dy=t.target?t.target.y-c.y:.5;
   // rivalry: now and then the arms grab a dangling rival's hand instead of a hold, and let go a few seconds later
   const grabRival=near&&r&&!r.grounded&&now>(t.noRivalGrab||0)&&Math.random()<.02;if(grabRival){t.grabRivalUntil=now+rand(1500,3500);t.noRivalGrab=now+15000;t.grabbed++;}
   const aimAt=now<(t.grabRivalUntil||0)&&r?{x:r.x-c.x,y:r.y+.4-c.y}:{x:dx,y:dy};
   const closed=now>t.open;
   t.arms.emit('input',{aim:clamp(aimAt.x/1.5,-1,1)*.8,ay:clamp(aimAt.y/1.2,-1,1),l:closed,r:closed,brace:true});
   t.legs.emit('input',{aim:clamp(dx/2,-1,1),ay:.6,brace:true});
   if(near&&now-t.lastKick>1600&&Math.random()<.15){t.lastKick=now;t.kicksTried++;t.legs.emit('gesture','kick',1);}
   if(now>=t.nextHop){t.nextHop=now+rand(1300,2100);
    t.legs.emit('gesture','flick',rand(.85,1.15));
    // hanging: try the combo, letting go after a human reaction (sometimes too slow, then it's a plain hop)
    if(c.gripping){t.combosTried++;const delay=rand(60,450);setTimeout(()=>{t.open=Date.now()+300;},delay);}
   }
  }
 },66);
 await wait(seconds*1000);clearInterval(brain);
 const rel=e=>((e.t-t0)/1000).toFixed(1);
 const byTeam=(type,id)=>events.filter(e=>e.type===type&&e.id===id).length;
 const report={map:mapId,seconds,teamsFormedCorrectly:teams.every(t=>t.ok),teams:teams.map((t,i)=>({team:'AB'[i],best:+t.best.toFixed(2),finishedAt:t.finishAt,stuck:t.stuck.slice(0,6),combosTried:t.combosTried,combos:byTeam('combo',t.id),falls:byTeam('fall',t.id),slips:byTeam('slip',t.id),kicksTried:t.kicksTried,kicksLanded:byTeam('kick',t.id),kickedBy:events.filter(e=>e.type==='kick'&&e.target===t.id).length,rivalGrabs:t.grabbed,handholds:byTeam('handhold',t.id)+byTeam('grabbed',t.id),drops:byTeam('drop',t.id),saves:byTeam('save',t.id),boosts:byTeam('boost',t.id),bonks:byTeam('bonk',t.id),scootered:events.filter(e=>e.type==='bonk'&&e.by==='scooter'&&e.id===t.id).length,snaps:byTeam('snap',t.id)})),
  winner:state.s?.winner?('AB'[teams.findIndex(t=>t.id===state.s.winner)]):null,phaseAtEnd:state.s?.phase,results:results.at(-1)||null,narration,
  firstEvents:events.filter(e=>['win','release','scooter'].includes(e.type)).map(e=>`${rel(e)}s ${e.type}`)};
 for(const s of sockets)s.disconnect();await wait(300);
 return report;
}

(async()=>{
 const only=process.argv[2],seconds=Number(process.argv[3]||120);
 const maps=only?[only]:['practice','mountain','forest','campus'];
 const game=await createServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${game.server.address().port}`;
 const reports=[];
 try{for(const m of maps){process.stderr.write(`playing ${m} for ${seconds}s...\n`);reports.push(await playMap(game,url,m,seconds));process.stdout.write(JSON.stringify(reports.at(-1))+'\n');
   await wait(800);}} // the phones disconnected; the server cleans up their teams and returns to the lobby
 finally{await game.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
