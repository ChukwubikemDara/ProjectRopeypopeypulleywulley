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

 const queue=[];let playing=null,sound=null,timer=null,retry=null;
 // One audio element for every line. Safari (Mac and iPhone) only lets an element play sound once a click or
 // tap has started it; a fresh element per line got the first line through and silently blocked the rest.
 // The first click/tap/key anywhere unlocks this element (and the speech voice) for the whole session.
 const player=new Audio();player.preload='auto';let unlocked=false;
 function unlock(){
  if(unlocked)return;unlocked=true;
  if(!sound){player.muted=true;player.src='/lab/narration/_unlock.mp3';const p=player.play();if(p?.then)p.then(()=>{player.pause();player.muted=false;if(retry)retry();},()=>{player.muted=false;unlocked=false;});else player.muted=false;}
  if(canSpeak&&!synth.speaking)try{const u=new SpeechSynthesisUtterance('');u.volume=0;synth.speak(u);}catch{}
  if(toggle.classList.contains('needs-tap')){toggle.classList.remove('needs-tap');label();}
 }
 for(const type of ['pointerdown','click','touchend','keydown'])document.addEventListener(type,unlock,{capture:true});
 function stopSound(){if(sound){player.onended=player.onerror=null;player.pause();sound=null;}retry=null;if(canSpeak)synth.cancel();}
 function finish(){clearTimeout(timer);playing=null;retry=null;bar.classList.remove('show');timer=setTimeout(next,350);}
 function speak(line,done){
  if(!canSpeak)return done(false);
  const u=new SpeechSynthesisUtterance(line.text);u.lang='en-US';u.rate=.95;u.pitch=.9;u.onend=()=>done(true);u.onerror=e=>{if(e?.error==='not-allowed')blocked();done(false);};synth.cancel();synth.speak(u);
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
  const done=()=>{sound=null;retry=null;soundDone=true;maybeFinish();};
  const playRecording=()=>{
   sound=line;player.onended=done;player.onerror=()=>{sound=null;fallback();};player.src=line.audio;
   const p=player.play();if(p?.catch)p.catch(err=>{sound=null;
    // blocked: show the hint, and play this line as soon as someone clicks; meanwhile the caption carries on
    if(err?.name==='NotAllowedError'){blocked();unlocked=false;soundDone=true;maybeFinish();retry=()=>{retry=null;if(playing===line){soundDone=false;playRecording();}};}
    else fallback();});
  };
  if(line.audio)playRecording();else fallback();
 }
 // `keepEssential`: the release line finishes even though the race map loads right after it
 function clear(keepEssential){queue.length=0;if(keepEssential&&playing?.essential)return;stopSound();clearTimeout(timer);playing=null;bar.classList.remove('show');bar.hidden=true;}
 Net.socket.on('narrate',line=>{
  if(!line?.text||playing?.id===line.id||queue.some(q=>q.id===line.id))return;
  queue.push(line);
  // too much waiting: drop the oldest optional line, never an essential one
  while(queue.length>3){const i=queue.findIndex(q=>!q.essential);if(i<0)break;queue.splice(i,1);}
  next();
 });
 Net.on('level',()=>clear(true));Net.on('disconnect',()=>clear(false));
 Net.on('phase',p=>{if(p!=='playing')clear(false);});
 // browsers block sound until the page is touched: say so on the big screen, and unlock on the first click
 function blocked(){if(!phone&&voiced){toggle.textContent='🔇 Click for sound';toggle.classList.add('needs-tap');}}

 document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')stopSound();});
 setInterval(()=>{const prologue=Net.level?.kind==='practice'&&Net.phase==='playing';document.body.classList.toggle('practice-mode',prologue);back.hidden=!phone||!prologue||!Net.calibrated;},250);
 window.Narration={get voiced(){return voiced;},get playing(){return playing;},queue,player};
})();
