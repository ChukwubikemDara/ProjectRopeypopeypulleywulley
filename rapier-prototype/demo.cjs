// Drives the running lab through the same Socket.IO controller messages as phones.
const {io}=require('socket.io-client');
const url=process.env.LAB_URL||'http://localhost:3010';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const arms=io(url,{transports:['websocket']}),legs=io(url,{transports:['websocket']});
let roster=[],state=null,team=null,timer,stopped=false;
let a={aim:0,ay:.6,l:false,r:false},l={aim:0,ay:.6};
arms.on('roster',r=>roster=r);arms.on('state3d',s=>state=s);
function stop(){if(stopped)return;stopped=true;clearInterval(timer);arms.disconnect();legs.disconnect();}
process.on('SIGINT',()=>{stop();process.exit(0);});
async function stage(name,seconds,apply){
 console.log(name);apply();
 const end=Date.now()+seconds*1000;
 while(Date.now()<end&&!stopped)await wait(100);
 const c=state?.climbers.find(c=>c.id===team);
 if(c)console.log(JSON.stringify({x:+c.x.toFixed(2),y:+c.y.toFixed(2),z:+c.z.toFixed(2),grips:c.hands.map(h=>h.grip),rotation:c.rotation}));
}
(async()=>{
 const info=await fetch(url+'/lab-info').then(r=>r.json());if(!info.debug)throw Error('Scripted checkpoints require LAB_DEBUG=1 npm run lab:3d. Normal play has no checkpoint controls.');
 await Promise.all([arms,legs].map(s=>new Promise((resolve,reject)=>{s.on('connect',resolve);s.on('connect_error',reject);})));
 arms.emit('join',{name:'Demo arms'});await wait(150);arms.emit('newTeam');await wait(150);
 team=roster.find(c=>c.members.some(m=>m.id===arms.id))?.id;if(!team)throw Error('Demo team unavailable');
 legs.emit('join',{name:'Demo legs'});await wait(150);legs.emit('joinTeam',team);await wait(150);
 arms.emit('start');await wait(150);
 timer=setInterval(()=>{arms.emit('input',a);legs.emit('input',l);},50);
 for(let round=0;round<2;round++){
  await stage('Pipe checkpoint · two physical grips',3,()=>{a={aim:0,ay:.6,l:true,r:true};l={aim:0,ay:.6};arms.emit('lab',{action:'checkpoint',where:'pipe'});});
  await stage('One-hand swing · free body rotation',3,()=>{a.r=false;a.aim=.55;l.aim=.5;});
  await stage('Release both · falling under gravity',2,()=>{a.l=false;a.r=false;a.aim=0;l.aim=0;});
  await stage('Reach again along the centered pipe',3,()=>{a={aim:.65,ay:.7,l:true,r:true};l.aim=.4;});
  await stage('Release and land',2,()=>{a.l=a.r=false;a.aim=0;l.aim=0;});
 }
 stop();console.log('LIVE DEMO COMPLETE');
})().catch(e=>{console.error(e.message);stop();process.exitCode=1;});
