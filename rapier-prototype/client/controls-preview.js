// "How to play" card on the phone: an animated phone shows each move for your role, the way games do it.
// Shown when the prologue starts, before your first race if you skipped the prologue, and from settings.
(()=>{
 if(!document.body.classList.contains('phone'))return;
 const STEPS={
  tilt:{demo:'tilt',title:'TILT',text:'Tilt the phone to move your hands. In the air, it steers.'},
  hold:{demo:'hold',title:'HOLD',text:'Hold a pad to grab. Let go to drop.'},
  flick:{demo:'flick',title:'FLICK UP',text:'Flick the phone up to jump. Only you can jump.'},
  lean:{demo:'tilt',title:'LEAN',text:'Lean the phone to swing your feet.'},
  drag:{demo:'drag',title:'DRAG TO AIM',text:'Drag the aim pad to move your hands. In the air, it steers.'},
  draglegs:{demo:'drag',title:'DRAG TO LEAN',text:'Drag the aim pad sideways to swing your feet.'},
  tapjump:{demo:'tap',title:'TAP JUMP',text:'Tap Jump when you have footing or a grip. Only you can jump.'},
  // the combo: hanging from something, the legs hop at the same moment the arms let go of both pads
  comboArms:{demo:'release',title:'LET GO',text:'Hanging from something? Let go of both pads at the exact moment your legs hop. Together, you fly.'},
  comboLegs:{demo:'flick',title:'HOP',text:'Hanging from something? Hop at the exact moment your arms let go of both pads. Together, you fly.'},
  comboLegsTouch:{demo:'tap',title:'TAP JUMP',text:'Hanging from something? Tap Jump at the exact moment your arms let go of both pads. Together, you fly.'},
  comboSolo:{demo:'combo',title:'HOP + LET GO',text:'Hanging from something? Hop and lift both thumbs off the pads at the same moment. You fly.'},
 };
 const COMBO={arms:['comboArms'],legs:['comboLegs'],both:['comboSolo']},COMBO_TOUCH={arms:['comboArms'],legs:['comboLegsTouch'],both:['comboSolo']};
 // kicking is the on-screen Kick button, so it isn't one of the motion moves shown here
 const ROLES={arms:['tilt','hold'],legs:['flick','lean'],both:['tilt','hold','flick']};
 const TOUCH_ROLES={arms:['drag','hold'],legs:['tapjump','draglegs'],both:['drag','hold','tapjump']};
 const NAMES={arms:'ARMS',legs:'LEGS',both:'ARMS + LEGS'};
 const STEP_MS=3200;
 // a chunky phone with motion marks; CSS animates it per move
 const PHONE=`<svg viewBox="0 0 160 150" aria-hidden="true">
  <g class="marks marks-tilt"><path d="M22 70 A60 60 0 0 1 40 30"/><path d="M138 70 A60 60 0 0 0 120 30"/><path d="M34 24 l6 6 -9 2z" class="head"/><path d="M126 24 l-6 6 9 2z" class="head"/></g>
  <g class="marks marks-flick"><path d="M64 140 v-14"/><path d="M80 146 v-18"/><path d="M96 140 v-14"/></g>
  <g class="phone"><rect x="52" y="20" width="56" height="100" rx="12" class="body"/><rect x="58" y="32" width="44" height="72" rx="5" class="screen"/><rect x="72" y="25" width="16" height="3" rx="1.5" class="slot"/>
   <circle cx="80" cy="62" r="9" class="tap-target"/><circle cx="64" cy="94" r="7" class="thumb thumb-l"/><circle cx="96" cy="94" r="7" class="thumb thumb-r"/></g>
 </svg>`;
 const make=(tag,cls,html)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(html!==undefined)e.innerHTML=html;return e;};
 const card=make('section','controls-preview');card.hidden=true;card.setAttribute('role','dialog');card.setAttribute('aria-label','How to play');
 const head=make('div','cp-head'),who=make('span','cp-you','YOU ARE THE'),role=make('b','cp-role');head.append(who,role);
 const stage=make('div','cp-stage',PHONE),move=make('b','cp-move'),text=make('p','cp-text'),dots=make('div','cp-dots');
 const go=make('button','cp-go','Got it');go.type='button';
 card.append(head,stage,move,text,dots,go);document.body.append(card);
 let steps=[],at=0,timer=null,shownFor=null,comboFor=null;
 function render(){const s=STEPS[steps[at]];stage.dataset.demo=s.demo;move.textContent=s.title;text.textContent=s.text;[...dots.children].forEach((d,i)=>d.classList.toggle('on',i===at));}
 // which: 'controls' (your moves) or 'combo' (the team move, shown when the prologue reaches the combo wall)
 function show(which='controls'){
  const r=Net.role||'both',touch=!!window.PhoneInput?.touchMode,moves=which==='combo'?(touch?COMBO_TOUCH:COMBO):touch?TOUCH_ROLES:ROLES;steps=moves[r]||moves.both;at=0;card.dataset.role=r;card.dataset.mode=touch?'touch':'motion';
  card.dataset.kind=which;who.textContent=which==='combo'?'TEAM MOVE':'YOU ARE THE';role.textContent=which==='combo'?'THE COMBO':NAMES[r]||NAMES.both;
  dots.replaceChildren(...steps.map(()=>make('i')));render();card.hidden=false;
  clearInterval(timer);let shown=0;timer=setInterval(()=>{at=(at+1)%steps.length;render();if(++shown>=steps.length*2)close();},STEP_MS);
 }
 function close(){card.hidden=true;clearInterval(timer);timer=null;}
 go.onclick=close;
 // replay from settings
 const again=make('button','ghost cp-again','Show controls');again.type='button';again.onclick=()=>{document.getElementById('debug')?.classList.add('hidden');show();};
 document.getElementById('debug')?.insertBefore(again,document.getElementById('closeDebug'));
 // automatically: when the prologue starts, and before your first race if you never saw it
 let seen=false;try{seen=sessionStorage.getItem('tethered-controls-seen')==='1';}catch{}
 setInterval(()=>{
  const playing=Net.phase==='playing'&&Net.calibrated&&Net.level,key=playing&&`${Net.level.id}:${Net.level.revision}:${Net.role}:${!!window.PhoneInput?.touchMode}`;
  if(!playing){if(Net.phase!=='playing')close();return;}
  // the combo card: when your body reaches the beam before the combo wall in the prologue (once per prologue)
  const comboKey=`${Net.level.id}:${Net.level.revision}`,zone=Net.level.zones?.find(z=>z.id==='beam'),me=Net.sample()?.climbers.find(c=>c.id===Net.me);
  if(zone&&me&&comboFor!==comboKey){const x=Net.level.mirror?-Math.abs(me.x):me.x;if(x>=zone.x0&&x<=zone.x1&&me.y>=zone.y0&&me.y<=zone.y1){comboFor=comboKey;show('combo');}}
  if(shownFor===key)return;shownFor=key;
  if(Net.level.kind==='practice'||!seen||!card.hidden){seen=true;try{sessionStorage.setItem('tethered-controls-seen','1');}catch{}show();}
 },250);
 window.ControlsPreview={show,close,get open(){return !card.hidden;},get step(){return steps[at];},get kind(){return card.dataset.kind;}};
})();
