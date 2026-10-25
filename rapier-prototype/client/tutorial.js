// Shared, skippable practice captions. Voice is opt-in per device and never blocks play.
(()=>{
 const phone=document.body.classList.contains('phone');
 const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
 const panel=make('section','practice-card');panel.id='practiceCard';panel.hidden=true;panel.setAttribute('aria-label','Shared practice tutorial');
 const top=make('div','practice-heading'),eyebrow=make('small',null,'BASE CAMP · PRACTICE'),count=make('span','practice-count','0 / 5');top.append(eyebrow,count);
 const team=make('select','practice-team');team.setAttribute('aria-label','Team to follow in practice');team.hidden=phone;
 const progress=make('div','practice-progress');progress.setAttribute('aria-hidden','true');for(let i=0;i<5;i++)progress.append(make('i'));
 const lesson=make('div','practice-lesson');lesson.setAttribute('aria-live','polite');lesson.setAttribute('aria-atomic','true');
 const title=make('h2'),instruction=make('p','practice-instruction'),caption=make('p','practice-caption');lesson.append(title,instruction,caption);
 const actions=make('div','practice-actions'),audio=make('button',null,'Enable voice'),hide=make('button',null,'Skip tips'),reset=make('button',null,'Reset stance'),race=make('button','practice-race','Start race');
 for(const b of [audio,hide,reset,race])b.type='button';actions.append(audio,hide,reset,race);reset.hidden=!phone;
 const note=make('small','practice-note','No completion gate. Keep practicing or start the race when ready.');panel.append(top,team,progress,lesson,actions,note);document.body.append(panel);
 const show=make('button','practice-restore','Show practice tips');show.type='button';show.hidden=true;document.body.append(show);
 const synth=window.speechSynthesis,canSpeak=!!synth&&typeof window.SpeechSynthesisUtterance==='function';let voiced=false,hiddenTips=false,lastLine='',currentLine='',active=false;
 audio.disabled=!canSpeak;audio.textContent=canSpeak?'Enable voice':'Captions only';audio.setAttribute('aria-pressed','false');
 function silence(){if(canSpeak)synth.cancel();lastLine='';}
 function speak(line){if(!canSpeak||!voiced||!line||document.visibilityState!=='visible')return;synth.cancel();const utterance=new SpeechSynthesisUtterance(line);utterance.lang='en-US';utterance.rate=1.02;utterance.pitch=1.05;utterance.onerror=e=>{if(!['canceled','interrupted'].includes(e.error)){voiced=false;audio.textContent='Voice unavailable';audio.disabled=true;audio.setAttribute('aria-label','Voice unavailable; captions remain on');audio.setAttribute('aria-pressed','false');}};synth.speak(utterance);}
 audio.onclick=()=>{voiced=!voiced;audio.textContent=voiced?'Mute voice':'Enable voice';audio.setAttribute('aria-pressed',String(voiced));if(voiced)speak(currentLine);else silence();};
 hide.onclick=()=>{hiddenTips=true;silence();render();};show.onclick=()=>{hiddenTips=false;render();};reset.onclick=()=>Net.socket.emit('practiceReset');race.onclick=()=>Net.socket.emit('start');
 Net.on('level',()=>{hiddenTips=false;silence();});Net.on('disconnect',()=>{silence();panel.hidden=show.hidden=true;});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')silence();});
 Net.on('roster',rows=>{if(phone)return;const before=team.value;team.replaceChildren();for(const c of rows.filter(c=>!c.bot)){const o=document.createElement('option');o.value=c.id;o.textContent=c.name;team.append(o);}if(rows.some(c=>c.id===before))team.value=before;});
 const text=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
 function render(){
  const state=Net.sample();active=Net.level?.kind==='practice'&&state?.phase==='playing'&&(!phone||Net.calibrated);
  document.body.classList.toggle('practice-mode',!!active);panel.hidden=!active||hiddenTips;show.hidden=!active||!hiddenTips;
  if(!active){if(lastLine)silence();return;}
  const c=state.climbers.find(c=>c.id===(phone?Net.me:team.value))||(!phone?state.climbers[0]:null),t=c?.tutorial;
  if(!t){panel.hidden=true;return;}
  const role=phone?(Net.role||'both'):'both';text(title,t.lesson.title);text(instruction,t.lesson[role]||t.lesson.both);text(caption,t.line);
  text(count,`${t.done.length} / ${t.total}`);[...progress.children].forEach((dot,i)=>dot.classList.toggle('done',t.done.includes(['aim','grip','hop','combo','kick'][i])));
  const host=Net.session?.host===Net.player;race.disabled=!host;race.hidden=phone&&!host;text(race,host?'Start race':'Host starts the race');
  text(note,t.step==='combo'?(phone?'For a retry: hold your hand pads, then tap Reset stance.':'On your phone, hold the pads and tap Reset stance for a retry.'):'No completion gate. Start the race whenever you are ready.');
  currentLine=t.line;const key=`${c.id}:${t.step}:${t.line}`;if(!hiddenTips&&key!==lastLine){lastLine=key;speak(currentLine);}
 }
 setInterval(render,150);
})();
