const express=require('express'),http=require('http'),https=require('https'),fs=require('fs'),path=require('path'),os=require('os');
const {Server}=require('socket.io');
const QR=require('qrcode');
const {Simulation,progressAt}=require('./physics.cjs');
const Courses=require('./courses.cjs');
const {duration,setRecorded}=require('./narration.cjs');
const {Prologue,RaceVoice}=require('./prologue.cjs');
// Reset in the prologue puts a team back at the start of the section they're in (a pit counts as the section before it).
const sectionStart=(c,course)=>{const real=c.body.translation().x,x=course.mirror?-Math.abs(real):real,flip=course.mirror&&real>0,stations=Object.values(course.stations||{}).sort((a,b)=>a.x-b.x);const at=stations.filter(s=>s.x<=x+.5).at(-1)||stations[0];return flip?{...at,x:-at.x}:at;};
// A recording in client/narration/<id>.<ext> replaces the synthesized voice for that line.
// Lengths of the recordings (seconds, by line id), written when recordings are added, so lines never overlap.
function loadRecordings(){try{setRecorded(JSON.parse(fs.readFileSync(path.join(__dirname,'client','narration','durations.json'),'utf8')));}catch{setRecorded({});}}
function narrationAudio(id){for(const ext of ['mp3','m4a','wav','ogg'])if(fs.existsSync(path.join(__dirname,'client','narration',`${id}.${ext}`)))return`/lab/narration/${id}.${ext}`;return null;}
const {TUNABLE}=require('./main-config.cjs');
async function createServer({courses=Courses.all}={}){
 let sim=await Simulation.create(courses.find(c=>c.kind==='race'));const prologue=new Prologue(),raceVoice=new RaceVoice();let revision=1,selected=sim.course.id,host=null,mode='race';
 const app=express(),server=http.createServer(app),io=new Server(server);
 const teams=new Map(),players=new Map();let phase='lobby',started=0,serial=0,winner=null;
 const colors=['#42b9ab','#ef8b79','#83b7d6','#dcb56b','#b09bd7','#e5a9c0','#b0c887','#dfaa76'];
 const pub=path.join(__dirname,'../public');
 app.use('/lab',express.static(path.join(__dirname,'client')));
 app.use('/lib/three/addons',express.static(path.join(__dirname,'../node_modules/three/examples/jsm')));
 app.use('/lib/three',express.static(path.join(__dirname,'../node_modules/three/build')));
 app.get('/',(_,res)=>res.redirect('/screen'));
 app.get(['/screen','/screen.html'],(_,res)=>res.sendFile(path.join(__dirname,'client/screen.html')));
 app.get(['/phone','/index.html'],(_,res)=>{
   let html=fs.readFileSync(path.join(pub,'index.html'),'utf8');
   html=html.replace('<script type="module" src="/js/render3d.js"></script>','<script src="/lab/remote-mode.js"></script>'); // the phone loads the 3D view only if asked (remote mode is the default)
   html=html.replace('/js/net.js','/lab/net.js').replace('/js/render3d.js','/lab/render.js').replace('/js/phone.js','/lab/phone.js').replace('<script src="/js/presentation.js"></script>','<script src="/lab/sensor-status.js"></script><script src="/lab/phone-controls.js"></script><script src="/lab/phone-lab.js"></script><script src="/lab/narration.js"></script><script src="/lab/controls-preview.js"></script>');
   html=html.replace('SNOWBOUND · PARTY CLIMBING','SNOWBOUND · THE LONG WAY UP');
   html=html.replace('<div id="comboFlash">COMBO!</div>','<div id="comboFlash">COMBO!</div><div id="hopFlash">HOP</div><div id="lagbox"></div>');
   html=html.replace('</head>','<link rel="stylesheet" href="/lab/lab.css"><link rel="stylesheet" href="/lab/controls.css"><link rel="stylesheet" href="/lab/tutorial.css"><link rel="stylesheet" href="/lab/game-hud.css"><link rel="stylesheet" href="/lab/narration.css"><link rel="stylesheet" href="/lab/controls-preview.css"></head>');
   res.send(html);
 });
 app.get('/qr.svg',async(req,res)=>{try{res.type('svg').send(await QR.toString(String(req.query.url||'').slice(0,400),{type:'svg',margin:1}));}catch{res.sendStatus(400);}});
 app.get('/lab-info',(req,res)=>{
   const ip=Object.values(os.networkInterfaces()).flat().find(a=>a.family==='IPv4'&&!a.internal)?.address;
   const origin=process.env.PUBLIC_URL?.replace(/\/$/,'')||app.locals.secureOrigin||(req.secure?`https://${req.headers.host}`:ip?`http://${ip}:${server.address()?.port||3010}`:`http://${req.headers.host}`);
   res.json({phone:origin+'/phone',secure:origin.startsWith('https:'),course:sim.course.name,debug:process.env.LAB_DEBUG==='1'});
 });
 app.use(express.static(pub));
 const roster=()=>[...teams.values()].filter(t=>mode!=='practice'||!t.bot).map(t=>({id:t.id,name:t.bot?t.name:t.members.map(id=>players.get(id)?.name).filter(Boolean).join(' + ')||'Climber',color:t.color,bot:!!t.bot,members:t.members.map(id=>({id,name:players.get(id).name,role:players.get(id).role}))}));
 function publish(){io.emit('roster',roster());}
 function roles(t){const c=sim.climbers.get(t.id);if(c){sim.releaseAll(c,'roles');c.arms={aim:0,ay:.6,l:false,r:false,brace:true};c.legs={aim:0,ay:.6,brace:true};}t.members.forEach((id,i)=>players.get(id).role=t.members.length===1?'both':i?'legs':'arms');}
 function leave(p){const t=teams.get(p.team);if(!t)return;t.members=t.members.filter(id=>id!==p.id);if(!t.members.length){teams.delete(t.id);sim.remove(t.id);}else roles(t);}
 function join(p,t){t.members.push(p.id);p.team=t.id;roles(t);if(!sim.climbers.has(t.id))sim.spawn(t.id);}
 function newTeam(){const id='c'+(++serial),t={id,members:[],color:colors.find(color=>![...teams.values()].some(t=>t.color===color))||colors[(serial-1)%colors.length]};teams.set(id,t);return t;}
 function narrate(line){io.emit('narrate',{id:line.id,text:line.text,audio:narrationAudio(line.id),duration:duration(line),essential:!!line.essential});}
 function level(){return{...sim.course,revision};}
 function session(){return{host,selected,mode,revision,catalog:Courses.catalog(courses),next:Courses.nextRace(selected,courses)};}
 function publishSession(){io.emit('session',session());}
 function spawnTeams(){for(const t of teams.values()){if(mode==='practice'&&t.bot)continue;const c=sim.spawn(t.id);c.bot=!!t.bot;}}
 function loadCourse(id){
  const definition=courses.find(c=>c.id===id);if(!definition)return false;
  const config={...sim.config};sim.free();sim=new Simulation(definition);for(const [key,value]of Object.entries(config))sim.tune(key,value);
  mode=definition.kind==='practice'?'practice':'race';revision++;winner=null;started=sim.time;spawnTeams();loadRecordings();prologue.reset(mode==='practice'?sim:null);raceVoice.reset(mode==='race'?sim:null);if(mode==='practice')for(const c of sim.climbers.values())prologue.spawned(c);
  io.emit('level',level());publish();publishSession();return true;
 }
 function start(options={}){
  if(!teams.size)return false;
  if(options.practice){if(!loadCourse('practice'))return false;}
  else{
   if(phase==='results'&&!options.retry)selected=Courses.nextRace(selected,courses);
   loadCourse(selected);
  }
  phase='playing';started=sim.time;io.emit('phase',phase);io.emit('event',{type:'start'});publishSession();return true;
 }
 function endRound(){if(phase!=='playing')return;phase='lobby';winner=null;if(mode==='practice')loadCourse(selected);else for(const c of sim.climbers.values())sim.releaseAll(c,'round ended');io.emit('phase',phase);publishSession();}
 const number=(v,otherwise=0)=>typeof v==='number'&&Number.isFinite(v)?Math.max(-1,Math.min(1,v)):otherwise;
 io.on('connection',s=>{
   if(!host||s.handshake.auth?.surface==='spectator'&&io.sockets.sockets.get(host)?.handshake.auth?.surface!=='spectator')host=s.id;
   s.emit('you',s.id);s.emit('level',level());s.emit('config',{CONFIG:sim.config,TUNABLE});s.emit('roster',roster());s.emit('phase',phase);publishSession();
   s.on('join',m=>{if(players.has(s.id))return;const p={id:s.id,name:String(m?.name||'Climber').slice(0,14),team:null,role:'both',lastInput:Date.now()};players.set(s.id,p);join(p,[...teams.values()].find(t=>!t.bot&&t.members.length===1)||newTeam());publish();});
   s.on('start',m=>{if(!players.has(s.id)&&s.id!==host)return;if(mode==='practice'&&s.id!==host)return;if(m?.practice&&phase==='playing'&&s.id!==host)return;start({practice:!!m?.practice});});
   s.on('practice',()=>{if(s.id===host||phase==='lobby'&&players.has(s.id))start({practice:true});});
   s.on('retryRace',()=>{if(s.id===host)start({retry:true});});
   s.on('selectCourse',(id,ack)=>{let error=null;const target=courses.find(c=>c.id===id&&c.kind==='race');if(s.id!==host)error='Only the host can choose a course';else if(phase==='playing')error='End the round before changing maps';else if(!target)error='That course is not available yet';else{selected=id;phase='lobby';loadCourse(id);io.emit('phase',phase);}if(typeof ack==='function')ack({ok:!error,error});});
   s.on('practiceReset',()=>{const p=players.get(s.id),c=p&&sim.climbers.get(p.team);if(mode!=='practice'||phase!=='playing'||!c||Date.now()-(p.lastPracticeReset||0)<1000)return;p.lastPracticeReset=Date.now();sim.practiceStation(c,sectionStart(c,sim.course));});
   s.on('endRound',()=>{if(s.id===host)endRound();});
   s.on('addBot',()=>{if(mode==='practice'||teams.size>=12)return;const t=newTeam();t.bot=true;t.name='Bot '+serial;const c=sim.spawn(t.id);c.bot=true;publish();});
   s.on('clearBots',()=>{for(const [id,t]of teams)if(t.bot){teams.delete(id);sim.remove(id);}publish();});
   s.on('tune',m=>{if(!m||!Object.hasOwn(TUNABLE,m.key)||typeof m.value!=='number'||!Number.isFinite(m.value))return;const [lo,hi]=TUNABLE[m.key];sim.tune(m.key,Math.min(hi,Math.max(lo,m.value)));io.emit('config',{CONFIG:sim.config,TUNABLE});});
   s.on('input',m=>{
     const p=players.get(s.id),c=p&&sim.climbers.get(p.team);if(!c||!m)return;p.lastInput=Date.now();
     if(p.role!=='legs'){Object.assign(c.arms,{aim:number(m.aim),ay:number(m.ay,.6),brace:m.brace!==false});sim.setHand(c,0,!!m.l);sim.setHand(c,1,!!m.r);}
     if(p.role!=='arms')Object.assign(c.legs,{aim:number(m.aim),ay:number(m.ay,.6),brace:m.brace!==false});
     if(mode==='practice')prologue.input(c,p.role,{aim:number(m.aim)});
   });
   s.on('motion-report',m=>{
     const p=players.get(s.id);if(!p||!m)return;
     p.motion={secure:!!m.secure,enabled:!!m.enabled,ready:!!m.ready,orientation:Math.max(0,Number(m.orientation)||0),acceleration:Math.max(0,Number(m.acceleration)||0),aim:number(m.aim),ay:number(m.ay),energy:Math.max(0,Number(m.energy)||0),lastGesture:['none','flick','yank','kick'].includes(m.lastGesture)?m.lastGesture:'none',at:Date.now()};
     io.emit('motion-status',{id:p.id,name:p.name,role:p.role,...p.motion});
   });
   s.on('gesture',(g,power,ack)=>{const p=players.get(s.id),c=p&&sim.climbers.get(p.team);if(mode==='practice'&&phase==='playing'&&c)prologue.gesture(c,p.role);const result=phase==='playing'&&c&&p.role!=='arms'?sim.gesture(c,g,typeof power==='number'?power:1):false;if(typeof ack==='function')ack({ok:!!result,result:!p?'not joined':phase!=='playing'?'not playing':p.role==='arms'?'arms cannot use leg actions':c?.lastGestureResult||'not playing'});});
   // Checkpoint injection is for the command-line simulation only, never player controls.
   s.on('lab',m=>{if(process.env.LAB_DEBUG!=='1'||m?.action!=='checkpoint')return;const p=players.get(s.id),c=p&&sim.climbers.get(p.team);if(c)sim.checkpoint(c);});
   s.on('swapRole',()=>{const p=players.get(s.id),t=p&&teams.get(p.team);if(t?.members.length===2){t.members.reverse();roles(t);publish();}});
   s.on('joinTeam',id=>{const p=players.get(s.id),t=teams.get(id);if(!p||!t||t.bot||t.members.length>=2||p.team===id)return;leave(p);join(p,t);publish();});
   s.on('switchTeam',()=>{const p=players.get(s.id),old=p&&teams.get(p.team);if(!p)return;const t=[...teams.values()].find(t=>!t.bot&&t!==old&&t.members.length===1);if(!t&&old?.members.length===1)return;leave(p);join(p,t||newTeam());publish();});
   s.on('newTeam',()=>{const p=players.get(s.id),t=p&&teams.get(p.team);if(!p||t?.members.length===1)return;leave(p);join(p,newTeam());publish();});
   s.on('disconnect',()=>{const p=players.get(s.id);if(p){leave(p);players.delete(s.id);publish();}if(host===s.id){host=[...io.sockets.sockets.values()].sort((a,b)=>Number(b.handshake.auth?.surface==='spectator')-Number(a.handshake.auth?.surface==='spectator'))[0]?.id||null;publishSession();}if(!teams.size&&phase==='playing')endRound();});
   s.on('rtt',ack=>{if(typeof ack==='function')ack(Date.now());});
 });
 let accumulator=0,last=performance.now(),ticks=0;
 const timer=setInterval(()=>{
   const now=performance.now();accumulator+=Math.min(.08,(now-last)/1000);last=now;
   for(const p of players.values())if(Date.now()-p.lastInput>1200){const c=sim.climbers.get(p.team);if(c){if(p.role!=='legs')Object.assign(c.arms,{l:false,r:false,aim:0});if(p.role!=='arms'){c.legs={aim:0,ay:.6};}}}
   while(accumulator>=1/90){if(phase==='playing')sim.step();accumulator-=1/90;ticks++;}
   for(const ev of sim.events.splice(0)){if(phase==='playing'){if(mode==='practice')prologue.event(ev,sim.time);else if(!winner)raceVoice.event(ev,sim.time,progressAt);}io.emit('event',ev);}
   if(mode==='practice'&&phase==='playing'){
     const step=prologue.tick(sim.time,progressAt);
     if(step.say)narrate(step.say);
     if(step.release)io.emit('event',{type:'release'});
     if(step.startRace)start();
   }
   if(mode==='race'&&phase==='playing'&&!winner){const line=raceVoice.tick(sim.time);if(line)narrate(line);}
   if(ticks>=Math.max(1,Math.round(90/sim.config.sendRate))){ticks=0;const climbers=[...sim.climbers.values()].map(c=>sim.snapshot(c));
     if(phase==='playing'&&mode==='race'&&!winner){const win=climbers.find(c=>c.finished);if(win){winner=win.id;phase='results';io.emit('phase',phase);io.emit('event',{type:'win',id:winner});io.emit('results',sim.results(winner));}}
     io.emit('state3d',{t:Date.now(),revision,courseId:sim.course.id,mode,climbers,...sim.dynamicState(),phase,winner,elapsed:Math.max(0,sim.time-started),assist:true});
   }
 },1000/120);
 return{app,server,io,get sim(){return sim;},get session(){return session();},teams,players,start,prologue,close:async()=>{clearInterval(timer);await new Promise(r=>io.close(r));sim.free();}};
}
if(require.main===module)createServer().then(({app,server,io})=>{
 const port=Number(process.env.PORT||3010);server.listen(port,()=>console.log(`Rapier lab: http://localhost:${port}/screen · phone: /phone`));
 const cert=process.env.TLS_CERT||path.join(__dirname,fs.existsSync(path.join(__dirname,'certs/server.pem'))?'certs/server.pem':'../certs/server.pem'),key=process.env.TLS_KEY||path.join(__dirname,fs.existsSync(path.join(__dirname,'certs/server.key'))?'certs/server.key':'../certs/server.key');
 if(fs.existsSync(cert)&&fs.existsSync(key)){const secure=https.createServer({cert:fs.readFileSync(cert),key:fs.readFileSync(key)},app);io.attach(secure);const port=Number(process.env.HTTPS_PORT||3450);
  const ip=Object.values(os.networkInterfaces()).flat().find(a=>a.family==='IPv4'&&!a.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(a.address))?.address;
  if(ip)app.locals.secureOrigin=`https://${ip.replace(/\./g,'-')}.local-ip.sh:${port}`;
  secure.listen(port,()=>console.log('HTTPS phone: '+(app.locals.secureOrigin||`https://localhost:${port}`)+'/phone'));}
}).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={createServer};
