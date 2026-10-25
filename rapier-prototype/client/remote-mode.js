// Remote mode, the default: the phone is only a controller and the laptop's big screen shows the game.
// The phone never loads the 3D view, so its processor goes to reading the sensors and sending input smoothly.
// Settings can turn the 3D view back on for this phone (for playing without a big screen); it reloads to apply.
(()=>{
 const KEY='tethered-phone-view';
 let showGame=false;try{showGame=localStorage.getItem(KEY)==='on';}catch{}
 document.body.classList.toggle('remote',!showGame);
 if(showGame)import('/lab/render.js');

 // the settings switch
 const row=document.createElement('label');row.className='control-option remote-option';
 const copy=document.createElement('span'),title=document.createElement('b'),help=document.createElement('small'),box=document.createElement('input');
 title.textContent='Show the game on this phone';help.textContent='Off: the phone is just the remote and the big screen shows the game. Smoother and kinder to your battery.';
 box.type='checkbox';box.id='showGameOnPhone';box.checked=showGame;copy.append(title,help);row.append(copy,box);
 box.onchange=()=>{try{localStorage.setItem(KEY,box.checked?'on':'off');}catch{}location.reload();};
 const settings=document.getElementById('debug');settings?.insertBefore(row,document.getElementById('closeDebug'));

 // with no 3D view behind the controls, the middle of the screen says who you are and where to look
 if(showGame)return;
 const stage=document.createElement('div');stage.className='remote-stage';stage.setAttribute('aria-hidden','true');
 const role=document.createElement('b'),look=document.createElement('span');look.textContent='Watch the big screen';stage.append(role,look);
 document.getElementById('hud')?.append(stage);
 const NAMES={arms:'ARMS',legs:'LEGS',both:'ARMS + LEGS'};
 setInterval(()=>{const text=NAMES[Net.role]||'';if(role.textContent!==text)role.textContent=text;stage.dataset.role=Net.role||'both';},500);
 window.RemoteMode={get on(){return !showGame;}};
})();
