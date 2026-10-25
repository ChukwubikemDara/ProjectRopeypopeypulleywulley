(()=>{
 const link=document.createElement('a');link.className='lab-link';link.href='/screen';link.target='_blank';link.textContent='3D spectator ↗';document.body.append(link);
 const dot=document.createElement('span');dot.className='race-dot mine';document.getElementById('raceRail').append(dot);
 document.querySelector('.stamina-wrap').hidden=false;
 const feedback=document.createElement('div');feedback.className='role-feedback';feedback.hidden=true;feedback.setAttribute('role','status');document.body.append(feedback);let feedbackUntil=0;
 function showFeedback(text){feedback.textContent=text;feedback.hidden=false;feedbackUntil=performance.now()+1800;}
 Net.on('event',e=>{if(e.id!==Net.me)return;const text={combo:'TEAMWORK COMBO!',snap:'Twig snapped! Catch another hold.',bonk:'CART HIT!',boost:'TEAM BOOST!',save:'FRIEND SAVED!',slip:'Grip lost · '+(e.reason||'catch a hold')};if(text[e.type])showFeedback(text[e.type]);});
 const sensor=window.LabSensors;document.getElementById('debug').append(document.getElementById('lagbox'));
 const sensorCard=document.createElement('div');sensorCard.className='card sensor-card';
 const heading=document.createElement('b');heading.textContent='Phone motion check';
 const sensorText=document.createElement('p');sensorText.className='sensor-status';sensorText.setAttribute('role','status');
 const enable=document.createElement('button');enable.className='ghost';enable.textContent='Enable motion';
 enable.onclick=async()=>{skipSensors=false;const ok=await Motion.enable();if(ok)PhoneControls.setTouchMode(false);permissionError=ok?'':'Safari has not granted motion access. Check this site’s permission, then retry.';sensorText.textContent=ok?'Permission accepted. Tilt the phone gently to check delivery.':'Permission was not granted. Check Safari motion permission, then try again.';};
 const skip=document.createElement('button');skip.className='ghost';skip.textContent='Continue with touch controls';
 let skipSensors=false,permissionError='';
 skip.onclick=()=>{skipSensors=true;PhoneControls.setTouchMode(true);document.getElementById('startBtn').click();};
 sensorCard.append(heading,sensorText,enable,skip);document.getElementById('lobby').insertBefore(sensorCard,document.getElementById('startBtn'));
 const recalibrate=document.createElement('button');recalibrate.className='ghost';recalibrate.textContent='Recalibrate motion';recalibrate.onclick=()=>{
  document.getElementById('debug').classList.add('hidden');
  Net.calibrated=false;
  document.getElementById('hud').classList.add('hidden');document.getElementById('lobby').classList.remove('hidden');
  Net.socket.emit('input',{aim:0,ay:.6,l:false,r:false,brace:true});
 };
 document.getElementById('debug').insertBefore(recalibrate,document.getElementById('closeDebug'));
 const emit=Net.socket.emit.bind(Net.socket);
 Net.socket.emit=(event,...args)=>{
  if(event==='start'&&!Net.calibrated){
   if(sensor.phone()&&!skipSensors&&!sensor.ready()){
    sensorText.textContent=window.isSecureContext?'Waiting for tilt and acceleration samples. Tap Enable motion and tilt gently, or choose touch / keyboard.':'This address uses HTTP. Open the game using trusted HTTPS for iPhone motion, or choose touch / keyboard.';
    return Net.socket;
   }
   Motion.center();Net.completeCalibration();
   if(Net.phase==='playing')return Net.socket;
  }
  if(event==='gesture'){
   sensor.lastGesture=args[0];sensor.lastGestureAt=performance.now();if(!Net.calibrated)return Net.socket;
   const originalAck=args[2];args[2]=(...reply)=>{if(typeof originalAck==='function')originalAck(...reply);const r=reply.length>1?reply[1]:reply[0];const text={pushed:'JUMP!',combo:'TEAMWORK COMBO!',tuck:'KNEES UP','no footing':'Find footing or grab a hold before hopping',cooldown:'Give your legs a moment','arms cannot jump':'Your legs teammate controls jumping','no rival nearby':'No rival in kicking reach',kick:'KICK!'}[r?.result];if(text)showFeedback(text);};
  }
  if(event==='input'){
   if(!Net.calibrated)args[0]={...args[0],aim:0,ay:.6,l:false,r:false,brace:true};
  }
  return emit(event,...args);
 };
 Net.on('disconnect',()=>{Net.calibrated=false;document.getElementById('hud').classList.add('hidden');if(Net.me)document.getElementById('lobby').classList.remove('hidden');});
 setInterval(()=>{
  const r=sensor.report();
  if(!sensor.phone())sensorText.textContent='Desktop test mode. Touch pads and keyboard are available; physical phone sensors have not been verified.';
  else if(!r.secure)sensorText.textContent='HTTP blocks iPhone motion. Use trusted HTTPS. Touch controls remain available.';
  else if(!r.enabled)sensorText.textContent=permissionError||'Tap Enable motion and allow Safari sensor access.';
  else if(!r.ready)sensorText.textContent=`Waiting for live sensors · tilt samples ${r.orientation} · acceleration samples ${r.acceleration}`;
  else sensorText.textContent=`LIVE SENSORS · tilt ${r.orientation} · acceleration ${r.acceleration} · aim ${r.aim.toFixed(2)}, ${r.ay.toFixed(2)} · last gesture: ${r.lastGesture}`;
  document.getElementById('startBtn').textContent=Net.phase==='playing'?'Calibrate & join round':'Calibrate & start race';
  if(Net.me)emit('motion-report',r);
 },500);
 Net.on('results',awards=>{const win=awards.find(a=>a.val==='summit');if(win)document.getElementById('winnerName').textContent=Net.nameOf(win.id)+' finished the race';});
 Net.on('you',()=>queueMicrotask(()=>{
  const legs=Net.role==='legs';
  document.getElementById('roleHow').textContent=legs?'Lean to swing your feet. Hop to jump from footing. While hanging, hop as your arms teammate releases for a combo. Squat to tuck; shove or tap Kick to nudge nearby rivals. Jump and tuck buttons are available in settings.':Net.role==='arms'?'Tilt to position your hands. Hold each pad to grab a nearby hold; release to let go. Your legs teammate hops to jump. While hanging, release together with their hop for a combo.':'Tilt aims your hands; hold the pads to grip. Hop to jump from footing. Hanging? Hop and release the pads together for a combo. Travel stays centered.';
  document.getElementById('hint').textContent=legs?'Lean swings feet · hop jumps · hop + arms release = combo':'Tilt positions hands · hold pads to grip · legs hop to jump';
 }));
 function tick(){requestAnimationFrame(tick);const s=Net.sample(),c=s?.climbers.find(c=>c.id===Net.me);document.body.classList.toggle('lab-playing',Net.calibrated&&s?.phase==='playing'&&!!c);
 if(performance.now()>feedbackUntil)feedback.hidden=true;
 if(c){dot.style.bottom=`${c.progress*100}%`;dot.style.setProperty('--team',Net.colorOf(c.id));document.getElementById('height').textContent=Math.round(c.progress*100);document.querySelector('.height small').textContent='%';document.getElementById('hudName').textContent=Net.nameOf(c.id);document.getElementById('hudRole').textContent=(Net.role==='both'?'ARMS + LEGS':(Net.role||'climber').toUpperCase());}
 }
 tick();
 Net.on('phase',p=>{if(p==='lobby'&&Net.me){document.getElementById('hud').classList.add('hidden');document.getElementById('results').classList.add('hidden');document.getElementById('lobby').classList.remove('hidden');}});
})();
