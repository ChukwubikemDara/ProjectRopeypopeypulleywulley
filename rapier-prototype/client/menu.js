// Lobby presentation only. Existing server events remain authoritative.
(()=>{
 const $=id=>document.getElementById(id),make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
 const menu=make('section','main-menu');menu.setAttribute('aria-label','Main menu');
 const eyebrow=make('p','menu-eyebrow','A little trust. A long way up.');
 const logo=make('h1','menu-logo','TETHERED'),tag=make('p','menu-tag','Two phones. One body. Zero trust.');
 const prologue=make('button','menu-button prologue');prologue.type='button';prologue.append(make('b',null,'PROLOGUE'),make('small',null,'Two people required · learn to climb together'));
 const race=make('button','menu-button race');race.type='button';race.append(make('b',null,'RACE'),make('small','menu-race-map',''));
 const maps=make('div','menu-maps');maps.setAttribute('role','radiogroup');maps.setAttribute('aria-label','Race map');
 const sceneLabel=make('p','menu-scene'),note=make('p','menu-note','');note.setAttribute('aria-live','polite');
 menu.append(eyebrow,logo,tag,prologue,race,maps,sceneLabel,note);document.body.append(menu);
 const back=make('button','menu-back','☰ Menu');back.type='button';back.hidden=true;document.body.append(back);
 prologue.onclick=()=>Net.socket.emit('practice');race.onclick=()=>Net.socket.emit('start');back.onclick=()=>{if(Net.phase==='results')Net.socket.emit('selectCourse',Net.session?.selected,r=>{if(!r?.ok)back.textContent=r?.error||'Could not return to menu';});else Net.socket.emit('endRound');};
 const host=()=>Net.session?.host===Net.player;let catalogKey='';
 function render(){
  const lobby=Net.phase!=='playing'&&Net.phase!=='results',s=Net.session;
  menu.hidden=!lobby;document.body.classList.toggle('menu-open',lobby);back.hidden=lobby||!host();
  if(!s)return;
  const races=s.catalog.filter(c=>c.kind==='race'&&c.available),key=races.map(c=>c.id+':'+c.name).join('|');
  // Keep map controls mounted: periodic roster updates must not steal keyboard focus.
  if(key!==catalogKey){catalogKey=key;maps.replaceChildren(...races.map(c=>{const b=make('button','menu-map',c.name.split(' · ')[0]);b.type='button';b.dataset.course=c.id;b.setAttribute('role','radio');
   b.onclick=()=>Net.socket.emit('selectCourse',c.id,r=>{if(!r?.ok)note.textContent=r?.error||'Could not pick that map.';});return b;}));}
  for(const b of maps.children){const selected=b.dataset.course===s.selected;b.classList.toggle('on',selected);b.setAttribute('aria-checked',String(selected));b.disabled=!host();}
  const course=s.catalog.find(c=>c.id===s.selected),biome=course?.biome||'snow';document.body.dataset.biome=biome;
  document.title='Tethered · '+(course?.name.split(' · ')[0]||'Join the climb');
  race.querySelector('.menu-race-map').textContent=(course?.name.split(' · ').slice(1).join(' · ')||'Climb together')+' · first to the flag';
  sceneLabel.textContent={snow:'SNOWBOUND / Fresh powder. Questionable teamwork.',forest:'FOREST / Take the scenic root.',campus:'OLD MAIN / Office hours: uphill.'}[biome]||'';
  prologue.disabled=race.disabled=!host();
  const phones=(Net.roster||[]).filter(r=>!r.bot).reduce((n,r)=>n+r.members.length,0);
  const text=!host()?'The host chooses when to begin.':phones?`${phones} phone${phones===1?'':'s'} connected · ready when you are`:'Scan the QR with your phone to join';
  if(note.textContent!==text)note.textContent=text;
 }
 for(const ev of ['phase','session','roster'])Net.on(ev,render);setInterval(render,500);render();
})();
