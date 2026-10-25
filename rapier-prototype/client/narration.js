// Prologue narration: the server decides what is said and when; this plays it.
// Lines queue and never overlap. A recording (line.audio) plays when there is one, otherwise the
// browser's synthesized voice reads the placeholder text. Captions always show.
// Voice starts ON on the big screen and OFF on phones (several phones in one room would echo);
// each device can switch it in its own settings.
(()=>{
 const phone=document.body.classList.contains('phone');
 const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
 const bar=make('div','narration');bar.setAttribute('role','status');bar.setAttribute('aria-live','polite');bar.hidden=true;
 const caption=make('p','narration-text');bar.append(caption);document.body.append(bar);
 const synth=window.speechSynthesis,canSpeak=!!synth&&typeof window.SpeechSynthesisUtterance==='function';
 const KEY=phone?'tethered-voice-phone':'tethered-voice-screen';
 let voiced=!phone;try{const saved=localStorage.getItem(KEY);if(saved!==null)voiced=saved==='true';}catch{}
 // the voice switch: a chip on the big screen, a row in settings on the phone
 const toggle=make('button','narration-toggle');toggle.type='button';
 const label=()=>{toggle.textContent=phone?(voiced?'Narrator voice: on':'Narrator voice: off'):(voiced?'🔊 Narrator':'🔇 Narrator');toggle.setAttribute('aria-pressed',String(voiced));};label();
 toggle.onclick=()=>{voiced=!voiced;try{localStorage.setItem(KEY,String(voiced));}catch{}label();if(!voiced)stopSound();};
 if(phone){const settings=document.getElementById('debug');settings?.insertBefore(toggle,document.getElementById('closeDebug'));}else document.body.append(toggle);
 // phones in the prologue can drop back to the start of their section if the body gets stuck
 const back=make('button','narration-back','↺ Section start');back.type='button';back.hidden=true;back.onclick=()=>Net.socket.emit('practiceReset');
 if(phone)document.body.append(back);

 const queue=[];let playing=null,sound=null,timer=null;
 function stopSound(){if(sound){sound.onended=sound.onerror=null;sound.pause();sound=null;}if(canSpeak)synth.cancel();}
 function finish(){clearTimeout(timer);playing=null;bar.classList.remove('show');timer=setTimeout(next,350);}
 function speak(line,done){
  if(!canSpeak)return done(false);
  const u=new SpeechSynthesisUtterance(line.text);u.lang='en-US';u.rate=.95;u.pitch=.9;u.onend=()=>done(true);u.onerror=()=>done(false);synth.cancel();synth.speak(u);
 }
 function next(){
  if(playing||!queue.length)return;
  const line=playing=queue.shift();bar.hidden=false;bar.classList.add('show');
  // a long speech is split into captions (one per line of the script), timed by their share of the words
  const parts=line.text.split('\n'),words=parts.map(p=>p.split(/\s+/).length),total=words.reduce((a,b)=>a+b,0),span=(line.duration||3)*1000;
  caption.textContent=parts[0];let offset=0;parts.forEach((part,i)=>{if(i)setTimeout(()=>{if(playing===line)caption.textContent=part;},offset);offset+=span*words[i]/total;});
  // the caption stays up at least as long as the server's pacing, longer if the recording runs over
  let minDone=false,soundDone=!voiced||document.visibilityState!=='visible';
  const maybeFinish=()=>{if(minDone&&soundDone&&playing===line)finish();};
  setTimeout(()=>{minDone=true;maybeFinish();},Math.max(1500,(line.duration||3)*1000));
  if(soundDone)return;
  const fallback=()=>speak(line,()=>{soundDone=true;maybeFinish();});
  if(line.audio){sound=new Audio(line.audio);sound.onended=()=>{sound=null;soundDone=true;maybeFinish();};sound.onerror=()=>{sound=null;fallback();};sound.play().catch(()=>{sound=null;fallback();});}
  else fallback();
 }
 function clear(){queue.length=0;stopSound();clearTimeout(timer);playing=null;bar.classList.remove('show');bar.hidden=true;}
 Net.socket.on('narrate',line=>{if(!line?.text)return;queue.push(line);if(queue.length>3)queue.shift();next();});
 Net.on('level',clear);Net.on('disconnect',clear);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')stopSound();});
 setInterval(()=>{const prologue=Net.level?.kind==='practice'&&Net.phase==='playing';document.body.classList.toggle('practice-mode',prologue);back.hidden=!phone||!prologue||!Net.calibrated;if(!prologue&&(queue.length||playing))clear();},250);
 // Waking up in the prologue: each phone gets a big card saying which half of the body it is.
 const card=make('div','role-card-flash');card.hidden=true;card.setAttribute('role','status');const cardRole=make('b'),cardHow=make('small');card.append(make('span',null,'YOU ARE THE'),cardRole,cardHow);
 if(phone)document.body.append(card);let cardFor=null;
 setInterval(()=>{if(!phone)return;const prologue=Net.level?.kind==='practice'&&Net.phase==='playing'&&Net.calibrated;
  if(prologue&&cardFor!==Net.level.revision){cardFor=Net.level.revision;const role=Net.role||'both';
   cardRole.textContent={arms:'ARMS',legs:'LEGS',both:'ARMS + LEGS'}[role];cardHow.textContent={arms:'Tilt to reach. Hold a pad to grab.',legs:'Lean to swing. Hop to jump.',both:'Tilt, grab and hop. All of it. Alone.'}[role];
   card.dataset.role=role;card.hidden=false;setTimeout(()=>{card.hidden=true;},6000);}
  if(!prologue)card.hidden=true;},250);
 window.Narration={get voiced(){return voiced;},get playing(){return playing;},queue};
})();
