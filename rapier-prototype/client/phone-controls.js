// Phone-only presentation and button adapters. All actions use the original gesture path.
(()=>{
 const $=id=>document.getElementById(id);
 const hud=$('hud'),settings=$('debug');
 const create=(tag,id,cls,text)=>{const el=document.createElement(tag);if(id)el.id=id;if(cls)el.className=cls;if(text)el.textContent=text;return el;};
 const text=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
 const status=create('div','movementStatus','movement-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
 const stance=create('strong','stanceLabel'),hint=create('span','stanceHint');status.append(stance,hint);hud.append(status);
 const dock=create('div','actionDock','action-dock');dock.setAttribute('role','group');dock.setAttribute('aria-label','Leg actions');
 const buttons={};
 for(const [g,label,icon]of [['flick','Jump','↑'],['yank','Tuck','↓'],['kick','Kick','↗']]){
  const button=create('button','action-'+g,'action-button '+g);button.type='button';button.setAttribute('aria-label',label);button.setAttribute('aria-describedby','stanceHint');
  const glyph=create('span',null,'action-icon',icon);glyph.setAttribute('aria-hidden','true');
  const body=create('span',null,'action-copy'),title=create('b',null,null,label),sub=create('small',null,null,'');body.append(title,sub);button.append(glyph,body);dock.append(button);
  button.onclick=()=>{if(!button.disabled)PhoneInput.gesture(g);};buttons[g]={button,sub};
 }
 hud.append(dock);
 const preferences=create('div','controlPreferences','control-preferences');
 const heading=create('b',null,null,'Button controls');preferences.append(heading);
 function option(id,label,description){const row=create('label',null,'control-option'),copy=create('span'),title=create('b',null,null,label),help=create('small',null,null,description),input=create('input',id);input.type='checkbox';copy.append(title,help);row.append(copy,input);preferences.append(row);return input;}
 const attribute=(el,key,value)=>{if(el.getAttribute(key)!==String(value))el.setAttribute(key,String(value));};
 // Kick stays available alongside motion; Jump and Tuck buttons belong to touch mode.
 const touch=option('touchAiming','Use touch controls','No motion sensors? Drag to aim and tap Jump, Tuck and Kick.');
 settings.insertBefore(preferences,$('closeDebug'));
 const aimPanel=create('div','touchAim','touch-aim');
 const aimPad=create('div','touchAimPad','touch-aim-pad');aimPad.setAttribute('role','group');aimPad.setAttribute('aria-label','Drag or use arrow keys to aim hands or lean feet');aimPad.tabIndex=0;
 const aimDot=create('span','touchAimDot','touch-aim-dot');aimPad.append(create('small','touchAimLabel',null,'Drag to aim'),aimDot);
 const center=create('button','centerTouch','touch-center','Center');center.type='button';center.onclick=()=>PhoneInput.setAim(0,.6);aimPanel.append(aimPad,center);hud.append(aimPanel);
 let pointer=null;
 const aim=e=>{const r=aimPad.getBoundingClientRect();PhoneInput.setAim((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);};
 aimPad.onpointerdown=e=>{if(pointer!==null)return;e.preventDefault();pointer=e.pointerId;aimPad.setPointerCapture(pointer);aim(e);};
 aimPad.onpointermove=e=>{if(e.pointerId===pointer){e.preventDefault();aim(e);}};
 aimPad.onpointerup=aimPad.onpointercancel=aimPad.onlostpointercapture=()=>{pointer=null;};
 aimPad.onkeydown=e=>{const delta={ArrowLeft:[-.15,0],ArrowRight:[.15,0],ArrowUp:[0,.15],ArrowDown:[0,-.15]}[e.key];if(delta){e.preventDefault();PhoneInput.setAim(PhoneInput.aim.aim+delta[0],PhoneInput.aim.ay+delta[1]);}else if(e.key==='Home'){e.preventDefault();PhoneInput.setAim(0,.6);}};
 touch.onchange=()=>setTouchMode(touch.checked);
 function setTouchMode(on){touch.checked=!!on;PhoneInput.setTouchMode(on);}
 window.PhoneControls={setTouchMode};
 // iOS Safari zooms on a quick second tap or a pinch no matter what the viewport says. Swallow both
 // (text fields excepted, so typing a name still works). The pads use touchstart/touchend themselves, so they keep working.
 let lastTouchEnd=0;
 document.addEventListener('touchend',e=>{const now=performance.now();if(now-lastTouchEnd<350&&!e.target.closest?.('input,select,textarea'))e.preventDefault();lastTouchEnd=now;},{passive:false});
 for(const type of ['gesturestart','gesturechange','gestureend','dblclick'])document.addEventListener(type,e=>e.preventDefault(),{passive:false});
 const feet=[$('footL'),$('footR')];
 const footLabels=feet.map((foot,i)=>{foot.replaceChildren();const side=create('b',null,null,i?'R FOOT':'L FOOT'),state=create('small',null,'foot-state','Free');foot.append(side,state);return state;});
 let previous='';
 function frame(){
  requestAnimationFrame(frame);
  const st=Net.sample(),c=st?.climbers.find(c=>c.id===Net.me),active=!!c&&Net.calibrated&&st.phase==='playing';
  const legs=Net.role==='legs',arms=Net.role==='arms',manual=PhoneInput.touchMode;
  const jump=c?.actions?.jump,kick=c?.actions?.kick,locked=PhoneInput.lockout>0;
  const courseGrip=c?.hands.some(h=>h.grip&&!h.onClimber),planted=c?.legs.some(l=>l.planted);
  document.body.classList.toggle('touch-controls',manual);document.body.classList.toggle('legs-role',legs);document.body.classList.toggle('arms-role',arms);
  dock.hidden=!active||arms;aimPanel.hidden=!active||!manual;
  buttons.flick.button.hidden=buttons.yank.button.hidden=!manual;
  buttons.flick.button.disabled=!active||arms||locked||!jump?.ready;
  buttons.yank.button.disabled=buttons.kick.button.disabled=!active||arms||locked;
  if(kick?.cooldown>0)buttons.kick.button.disabled=true;
  text(buttons.flick.sub,jump?.cooldown>0?`Wait ${jump.cooldown.toFixed(1)}s`:jump?.ready?'Tap or hop':'Need footing');
  text(buttons.yank.sub,'Tap or squat');const kicked=PhoneInput.kickResult,recent=kicked&&performance.now()-kicked.at<900;
  text(buttons.kick.sub,recent?({kick:'Hit!','no rival nearby':'Too far',cooldown:'Recharging',lost:'No signal'}[kicked.text]||kicked.text||''):kick?.cooldown>0?`Wait ${kick.cooldown.toFixed(1)}s`:'Tap or shove');buttons.kick.button.dataset.result=recent?kicked.text:'';
  status.hidden=!active;
  // Says what is true right now, never when to let go or hop: timing the combo is the challenge.
  let label='IN THE AIR',tone='air';
  if(jump?.cooldown>0){label='RECHARGING';tone='wait';}
  else if(jump?.ready){label=planted?'FEET PLANTED':c.grounded?'STANDING':courseGrip?'HANGING':'READY';tone='ready';}
  else if(c?.hands.some(h=>h.onClimber)){label='ON A CLIMBER';}
  else if(courseGrip){label='HANGING';}
  const detail='';
  const signature=label+'|'+detail;if(signature!==previous){text(stance,label);text(hint,detail);previous=signature;}status.dataset.tone=tone;
  for(const [i,pad]of [$('padL'),$('padR')].entries()){
   const hand=c?.hands[i],state=hand?.onClimber?'climber':hand?.grip?'gripped':hand?.target?'reachable':pad.classList.contains('closed')?'searching':'open';
   pad.dataset.state=state;pad.classList.toggle('reachable',state==='reachable');
   const description={climber:'Holding a climber',gripped:'Gripped',reachable:'Hold is in reach',searching:'Searching for a hold',open:'Open'}[state];
   attribute(pad,'aria-label',(i?'Right':'Left')+' hand · '+description);attribute(pad,'aria-pressed',pad.classList.contains('closed'));
  }
  for(let i=0;i<2;i++){const planted=!!c?.legs[i]?.planted;text(footLabels[i],planted?'Planted':'Free');attribute(feet[i],'aria-label',(i?'Right':'Left')+' foot · '+(planted?'planted':'free'));}
  const push=$('pushText');if(!push.parentElement.classList.contains('fire'))text(push,jump?.cooldown>0?'WAIT':jump?.ready?'READY':'NO FOOTING');push.parentElement.dataset.state=jump?.cooldown>0?'wait':jump?.ready?'ready':'none';
  text($('touchAimLabel'),legs?'Drag to lean':'Drag to aim');
  const input=PhoneInput.aim;aimDot.style.left=`${50+input.aim*44}%`;aimDot.style.top=`${50-input.ay*44}%`;
 }
 frame();
})();
