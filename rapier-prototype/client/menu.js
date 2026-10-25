// Big-screen main menu: shown between rounds. Prologue or Race (on the chosen map); phones join
// from the QR on the side panel. A small Menu button during play takes everyone back here.
(()=>{
 const $=id=>document.getElementById(id);
 const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
 const menu=make('section','main-menu');menu.setAttribute('aria-label','Main menu');
 const logo=make('h1','menu-logo','TETHERED'),tag=make('p','menu-tag','Two phones. One body. Zero trust.');
 const prologue=make('button','menu-button prologue');prologue.type='button';prologue.append(make('b',null,'PROLOGUE'),make('small',null,'The foot of the mountain · learn to climb together'));
 const race=make('button','menu-button race');race.type='button';race.append(make('b',null,'RACE'),make('small','menu-race-map',''));
 const maps=make('div','menu-maps');maps.setAttribute('role','radiogroup');maps.setAttribute('aria-label','Race map');
 const note=make('p','menu-note','');
 menu.append(logo,tag,prologue,race,maps,note);document.body.append(menu);
 const back=make('button','menu-back','☰ Menu');back.type='button';back.hidden=true;document.body.append(back);

 prologue.onclick=()=>Net.socket.emit('practice');
 race.onclick=()=>Net.socket.emit('start');
 back.onclick=()=>Net.socket.emit('endRound');
 const host=()=>Net.session?.host===Net.player;
 function render(){
  const lobby=Net.phase!=='playing'&&Net.phase!=='results',s=Net.session;
  menu.hidden=!lobby;document.body.classList.toggle('menu-open',lobby);back.hidden=lobby||!host();
  if(!s)return;
  const races=s.catalog.filter(c=>c.kind==='race'&&c.available),players=Net.roster?.filter(r=>!r.bot).length||0;
  maps.replaceChildren(...races.map(c=>{const b=make('button','menu-map'+(c.id===s.selected?' on':''),c.name.split(' · ')[0]);b.type='button';b.setAttribute('role','radio');b.setAttribute('aria-checked',String(c.id===s.selected));b.disabled=!host();
   b.onclick=()=>Net.socket.emit('selectCourse',c.id,r=>{if(!r?.ok)note.textContent=r?.error||'Could not pick that map.';});return b;}));
  race.querySelector('.menu-race-map').textContent=(s.catalog.find(c=>c.id===s.selected)?.name||'')+' · first to the flag';
  prologue.disabled=race.disabled=!host();
  note.textContent=!host()?'The host screen picks what to play.':players?`${players} climber${players>1?'s':''} ready · phones can pick too`:'Scan the code to join with your phone';
 }
 for(const ev of ['phase','session','roster'])Net.on(ev,render);setInterval(render,500);render();
})();
