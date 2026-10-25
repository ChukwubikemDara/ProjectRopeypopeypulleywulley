// Adapter: keep phone.js and motion.js using their existing event/input vocabulary.
(()=>{
 const requiresCalibration=document.body?.classList.contains('phone')??true;
 const listeners={};let current=null,previous=null,at=0,interval=1000/45;
 const Net={socket:io({auth:{surface:requiresCalibration?'phone':'spectator'}}),me:null,player:null,role:null,roster:[],level:null,session:null,config:{},tunables:{},phase:'lobby',phaseKnown:false,clockOffset:null,snapAge:0,calibrated:!requiresCalibration,
 on(type,fn){(listeners[type]??=[]).push(fn);},fire(type,data){if(type==='phase'&&data==='playing'&&!this.calibrated)return;if(type==='event'&&data?.type==='start'&&!this.calibrated)return;for(const fn of listeners[type]||[])fn(data);},
 nameOf(id){return this.roster.find(c=>c.id===id)?.name||'Climber';},colorOf(id){return this.roster.find(c=>c.id===id)?.color||'#42b9ab';},
 completeCalibration(){this.calibrated=true;this.fire('phase',this.phase);},
 progress(x,y=0){const P=this.level?.path;if(!P)return 0;let total=0,best={d:Infinity,at:0};for(let i=0;i<P.length-1;i++){const [ax,ay]=P[i],[bx,by]=P[i+1],L=Math.hypot(bx-ax,by-ay),t=Math.max(0,Math.min(1,((x-ax)*(bx-ax)+(y-ay)*(by-ay))/(L*L))),d=Math.hypot(x-ax-(bx-ax)*t,y-ay-(by-ay)*t);if(d<best.d)best={d,at:total+L*t};total+=L;}return Math.max(0,Math.min(1,(best.at-(this.level.progressTolerance==null?0:Math.max(0,best.d-this.level.progressTolerance)*3))/total));},
 sample(){
  if(!current)return null;
  const k=Math.min(1,(performance.now()-at)/interval),old=new Map((previous?.climbers||[]).map(c=>[c.id,c]));
  const point=(a,b,keys)=>{const o={...b};for(const key of keys)if(Number.isFinite(a?.[key])&&Number.isFinite(b[key]))o[key]=a[key]+(b[key]-a[key])*k;return o;};
  const prevObjects=new Map((previous?.objects||[]).map(o=>[o.id,o]));
  return{...current,objects:(current.objects||[]).map(o=>point(prevObjects.get(o.id),o,['x','y','z'])),climbers:current.climbers.map(c=>{const a=old.get(c.id);return{...point(a,c,['x','y','z']),hands:c.hands.map((h,i)=>point(a?.hands[i],h,['x','y','z','ex','ey','ez'])),legs:c.legs.map((l,i)=>point(a?.legs[i],l,['kx','ky','kz','fx','fy','fz']))};})};
 }};
 const s=Net.socket;
 s.on('connect',()=>Net.fire('connect'));
 s.on('you',id=>{Net.player=id;});
 s.on('level',l=>{previous=current=null;at=0;Net.level=l;Net.fire('level',l);});
 s.on('session',data=>{Net.session=data;Net.fire('session',data);});
 s.on('config',d=>{Net.config=d.CONFIG;Net.tunables=d.TUNABLE;Net.fire('config',d.CONFIG);});
 s.on('roster',r=>{Net.roster=r;const c=r.find(c=>c.members.some(p=>p.id===Net.player));Net.me=c?.id||null;Net.role=c?.members.find(p=>p.id===Net.player)?.role||null;Net.fire('roster',r);Net.fire('you',{climber:Net.me,role:Net.role});if(Net.me&&Net.phase==='playing')Net.fire('phase','playing');});
 s.on('phase',phase=>{Net.phaseKnown=true;if(phase!==Net.phase){Net.phase=phase;Net.fire('phase',phase);}});
 s.on('state3d',st=>{if(Net.level?.revision!=null&&st.revision!==Net.level.revision)return;if(Net.clockOffset!==null)Net.snapAge+=((Date.now()+Net.clockOffset-st.t)-Net.snapAge)*.1;previous=current;current=st;const now=performance.now();interval=at?Math.max(8,Math.min(100,now-at)):1000/45;at=now;Net.phaseKnown=true;if(st.phase!==Net.phase){Net.phase=st.phase;Net.fire('phase',st.phase);}});
 s.on('event',e=>Net.fire('event',e));s.on('results',r=>Net.fire('results',r));s.on('disconnect',()=>Net.fire('disconnect'));
 window.Net=Net;
})();
