import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {createAmbience} from './ambience.js';
import {decorateBiome} from './biomes.js';
import {createAlpineCharacter} from '/js/alpine-character.js';
const phone=document.body.classList.contains('phone');
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(phone?48:40,innerWidth/innerHeight,.1,320);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,phone?1.5:2));
renderer.domElement.setAttribute('role','img');renderer.domElement.setAttribute('aria-label','Live 3D climbing world');
window.Render3D={renderer,fps:60};
const MAX_RATIO=Math.min(devicePixelRatio||1,phone?1.5:2),MIN_RATIO=phone?.6:1;
const perf={frames:0,since:performance.now(),goodFor:0};let frameNo=0;
function adaptQuality(now){
 perf.frames++;if(now-perf.since<1000)return;const fps=Math.round(perf.frames*1000/(now-perf.since));perf.frames=0;perf.since=now;window.Render3D.fps=fps;renderer.domElement.dataset.fps=String(fps);renderer.domElement.dataset.drawCalls=String(renderer.info.render.calls);renderer.domElement.dataset.geometries=String(renderer.info.memory.geometries);
 const r=renderer.getPixelRatio();if(fps<45&&r>MIN_RATIO){renderer.setPixelRatio(Math.max(MIN_RATIO,r-.2));perf.goodFor=0;}else if(fps>=57&&r<MAX_RATIO&&++perf.goodFor>=2){renderer.setPixelRatio(Math.min(MAX_RATIO,r+.1));perf.goodFor=0;}
 renderer.shadowMap.autoUpdate=!(fps<45&&renderer.getPixelRatio()<=MIN_RATIO);
}
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.getElementById('game').append(renderer.domElement);
scene.background=new THREE.Color('#b9d9e5');scene.fog=new THREE.Fog('#c2dae3',100,280);
const hemisphere=new THREE.HemisphereLight('#c3e6ff','#837078',1.7);scene.add(hemisphere);
const sun=new THREE.DirectionalLight('#ffe0b5',2.7);sun.position.set(16,42,24);sun.target.position.set(25,8,0);scene.add(sun.target);sun.castShadow=true;sun.shadow.mapSize.set(phone?1024:2048,phone?1024:2048);Object.assign(sun.shadow.camera,{left:-40,right:40,top:30,bottom:-25,near:1,far:110});sun.shadow.normalBias=.025;scene.add(sun);
const rim=new THREE.DirectionalLight('#a1d8f2',1.2);rim.position.set(25,15,-15);scene.add(rim);
const mat=color=>new THREE.MeshStandardMaterial({color,roughness:.85});
const rock=mat('#8d99a4'),snow=mat('#f4f3e9'),metal=mat('#77a5af'),rust=mat('#df9476'),dark=mat('#435d70'),wood=mat('#bb9271');
const holdMats=['#3db8aa','#ed907a','#84b5d5'].map(mat);
const terrainGroup=new THREE.Group();scene.add(terrainGroup);
const cueGroup=new THREE.Group();scene.add(cueGroup);const cues=[];let barrier=null;const roleTags=new Map();
function mesh(geo,material,pos,parent=terrainGroup){const m=new THREE.Mesh(geo,material);if(pos)m.position.set(...pos);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
const ball=new THREE.SphereGeometry(1,24,18);
function puff(pos,scale,material=snow){const m=mesh(ball,material,pos);m.scale.set(...scale);return m;}
function box(pos,scale,material){return mesh(new RoundedBoxGeometry(...scale,3,.08),material,pos);}
function prism(points,depth,material){const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false});g.translate(0,0,-depth/2);return mesh(g,material);}
let level=null,flag=null,ambience=null;const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');const holdModels=new Map(),objectModels=new Map();
const models=new Map(),targets=new Map(),tempQ=new THREE.Quaternion();
const persistentMaterials=new Set([rock,snow,metal,rust,dark,wood,...holdMats]);
function clearLevel(){
 if(ambience){scene.remove(ambience.hero);ambience.dispose();ambience=null;}
 const geometries=new Set(),materials=new Set(),textures=new Set();
 const roots=[terrainGroup,...[...objectModels.values()].map(o=>o.root)];
 for(const root of roots){root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry&&o.geometry!==ball)geometries.add(o.geometry);for(const m of [o.material].flat().filter(Boolean))if(!persistentMaterials.has(m)){materials.add(m);if(m.map)textures.add(m.map);}});if(root!==terrainGroup)scene.remove(root);}
 terrainGroup.clear();holdModels.clear();objectModels.clear();flag=null;
 cueGroup.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();if(o.material&&!persistentMaterials.has(o.material))o.material.dispose();});cueGroup.clear();cues.length=0;barrier=null;
 for(const g of geometries)g.dispose();for(const t of textures)t.dispose();for(const m of materials)m.dispose();
 for(const m of models.values()){scene.remove(m.root);m.dispose();}models.clear();
 for(const target of targets.values()){scene.remove(target);target.geometry.dispose();}targets.clear();
 renderer.renderLists.dispose();renderer.shadowMap.needsUpdate=true;
}
function build(L){
 if(level&&level.revision===L.revision&&level.id===L.id)return;if(level)clearLevel();level=L;
 const palettes={snow:['#b9d9e5','#c2dae3','#8d99a4','#f4f3e9','#bb9271','#ffe0b5','#c3e6ff','#837078'],forest:['#b5cec2','#b5cec2','#9b805e','#9cba7b','#a68a64','#fff0c6','#d3e8d3','#6f806a'],campus:['#c8dce5','#c8dce5','#d8c4a4','#a8bc87','#d9c39f','#ffe4bd','#dce9f1','#938a82']};
 const palette=palettes[L.biome]||palettes.snow;scene.background=new THREE.Color(palette[0]);scene.fog.color.set(palette[1]);rock.color.set(palette[2]);snow.color.set(palette[3]);wood.color.set(palette[4]);sun.color.set(palette[5]);hemisphere.color.set(palette[6]);hemisphere.groundColor.set(palette[7]);scene.fog.near=48;scene.fog.far=170;
 document.querySelector('.lab-title span')?.replaceChildren(document.createTextNode(L.kind==='practice'?'TETHERED / PROLOGUE':'TETHERED / '+({forest:'FOREST',campus:'OLD MAIN'}[L.biome]||'SNOWBOUND')));
 document.querySelector('.lab-title h1')?.replaceChildren(document.createTextNode(L.kind==='practice'?'Two people required.':({forest:'Branch management.',campus:'Old Main. New heights.'}[L.biome]||'The long way through.')));
 document.querySelector('.lab-title p')?.replaceChildren(document.createTextNode(L.kind==='practice'?'Two of you. One body. Listen to the narrator.':'Two phones. One climber. Make it to the flag.'));
 for(const t of L.terrain.filter(t=>(L.biome==='snow'||t.kind!=='boundary')&&t.kind!=='barrier'))prism(t.pts,L.depth,t.kind==='pipe'?metal:t.kind==='crate'?rust:t.kind==='roof'&&L.biome==='campus'?[rock,dark]:t.kind==='ridge'||t.kind==='roof'?dark:t.kind==='bark'?wood:t.kind==='grass'||t.kind==='moss'?snow:rock);
 // One extrusion per roof: cream front/back faces and dark edge faces, without coplanar skins.
 if(L.pipe){
 const P=L.pipe,R=P.gap/2+P.slab/2,angle=Math.atan2(P.dir[1],P.dir[0]);
 // Open shell reveals the physical course. Its floor and roof match the source data.
 const center=[P.f0[0]+P.dir[0]*P.length/2+P.normal[0]*P.gap/2,P.f0[1]+P.dir[1]*P.length/2+P.normal[1]*P.gap/2];
 const shell=mesh(new THREE.CylinderGeometry(R,R,P.length,40,1,true,Math.PI/2,Math.PI),metal,[...center,0]);shell.rotation.z=angle-Math.PI/2;shell.material=metal.clone();shell.material.side=THREE.DoubleSide;
 for(const s of [0,P.length*.33,P.length*.66,P.length]){
  const cx=P.f0[0]+P.dir[0]*s+P.normal[0]*P.gap/2,cy=P.f0[1]+P.dir[1]*s+P.normal[1]*P.gap/2;
  const points=[];for(let i=0;i<=32;i++){const t=i/32*Math.PI;points.push(new THREE.Vector3(cx+P.normal[0]*(R+.06)*Math.cos(t),cy+P.normal[1]*(R+.06)*Math.cos(t),-(R+.06)*Math.sin(t)));}
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),32,.065,8,false),rust);
 }

 }
 // Odd things people lost on the mountain, used as handholds. Built at the grab point, with local +y pointing
 // to whatever they're stuck to (the pipe roof); the grab point is always the part a hand would hold.
 function prop(h){
  const g=new THREE.Group(),c=k=>mat({mitten:'#5a8fd6',cuff:'#f4f3e9',plunger:'#d9473f',stick:'#c99a62',duck:'#f2c94c',beak:'#ef8a2e',pan:'#3d4752',fish:'#8fb3c4',fin:'#5f8597',canopy:'#e8664a',stripe:'#f4f3e9',shaft:'#3d4752',ski:'#e8664a',skiTop:'#f4f3e9',string:'#7a6a58',frisbee:'#ef5f8d',boot:'#f2c94c',sole:'#3d4752',bag:'#2f5d9e',bagFlap:'#5ab7c9',tyre:'#22304a',frame:'#e8664a',hand:'#2b2b2b',gold:'#c9a24a'}[k]);
  const add=(geo,material,[x,y,z]=[0,0,0],[rx,ry,rz]=[0,0,0],[sx,sy,sz]=[1,1,1])=>{const m=mesh(geo,material,[x,y,z],g);m.rotation.set(rx,ry,rz);m.scale.set(sx,sy,sz);return m;};
  // drawn larger than life so they read from the big screen, scaled around the grab point (so where you grab is unchanged);
  // `roof` is in the scaled units, so whatever is stuck to the pipe roof still touches it
  const size=h.prop==='ski'?1.2:h.wall?1.5:1.8,rod=(len,r)=>new THREE.CylinderGeometry(r,r,len,8),roof=(h.roof??.35)/size,wall=.22/size;
  const string=()=>add(rod(roof,.012),c('string'),[0,roof/2,0]);
  switch(h.prop){
   case 'mitten':string();add(ball,c('mitten'),[0,-.08,0],[0,0,.2],[.13,.19,.09]);add(ball,c('mitten'),[.11,-.02,0],[0,0,-.5],[.05,.09,.06]);add(rod(.07,.11),c('cuff'),[0,.1,0]);break;
   case 'plunger':add(new THREE.SphereGeometry(.17,16,8,0,Math.PI*2,0,Math.PI/2),c('plunger'),[0,roof,0],[Math.PI,0,0]);add(rod(roof,.025),c('stick'),[0,roof/2-.05,0]);break;
   case 'duck':add(ball,c('duck'),[0,roof-.13,0],[0,0,0],[.2,.13,.14]);add(ball,c('duck'),[.15,roof-.26,0],[0,0,0],[.1,.1,.1]);add(new THREE.ConeGeometry(.045,.1,8),c('beak'),[.26,roof-.26,0],[0,0,-Math.PI/2]);add(rod(roof-.2,.03),c('beak'),[-.12,(roof-.2)/2,0]);break;
   case 'pan':add(rod(.04,.24),c('pan'),[0,roof-.02,0]);add(rod(roof+.05,.03),c('pan'),[-.05,roof/2-.05,0],[0,0,.2]);break;
   case 'fish':string();add(ball,c('fish'),[0,-.22,0],[0,0,0],[.09,.24,.07]);add(new THREE.ConeGeometry(.1,.14,4),c('fin'),[0,-.02,0],[0,Math.PI/4,0]);add(ball,c('fin'),[.04,-.36,.05],[0,0,0],[.025,.025,.025]);break;
   case 'umbrella':add(new THREE.ConeGeometry(.36,.18,8),c('canopy'),[0,roof-.09,0],[Math.PI,0,0]);add(rod(roof,.018),c('shaft'),[0,roof/2,0]);add(new THREE.TorusGeometry(.06,.016,6,12,Math.PI),c('shaft'),[.06,-.02,0],[0,0,Math.PI]);break;
   // wall props: built with the wall to the right (+x), `wall` metres away, and +y up
   case 'frisbee':add(rod(.035,.22),c('frisbee'),[wall,0,0],[Math.PI/2,0,0]);add(new THREE.TorusGeometry(.2,.02,6,24),c('frisbee'),[wall,0,0]);break;
   case 'boot':add(rod(.06,.015),c('sole'),[wall-.03,.06,0],[0,0,Math.PI/2]);add(rod(.42,.085),c('boot'),[wall*.4,-.2,0]);add(new THREE.BoxGeometry(.26,.12,.16),c('boot'),[wall*.4-.1,-.42,0]);add(new THREE.BoxGeometry(.28,.04,.17),c('sole'),[wall*.4-.1,-.49,0]);break;
   case 'backpack':add(new THREE.TorusGeometry(.08,.018,6,14,Math.PI),c('bagFlap'),[wall*.5,.02,0]);add(rod(.06,.015),c('sole'),[wall-.03,.08,0],[0,0,Math.PI/2]);add(new RoundedBoxGeometry(.32,.38,.2,2,.07),c('bag'),[wall*.5,-.24,0]);add(new RoundedBoxGeometry(.33,.14,.21,2,.05),c('bagFlap'),[wall*.5,-.1,0]);break;
   case 'bike':for(const y of [-.15,-.75])add(new THREE.TorusGeometry(.2,.035,6,20),c('tyre'),[wall-.28,y,0]);add(rod(.6,.02),c('frame'),[wall-.28,-.45,0]);add(rod(.36,.02),c('frame'),[wall-.18,-.4,0],[0,0,.5]);add(rod(.3,.02),c('frame'),[0,0,0],[0,0,Math.PI/2]);add(rod(.1,.02),c('sole'),[wall-.05,-.45,0],[0,0,Math.PI/2]);break;
   case 'clockhand':add(new THREE.BoxGeometry(wall+.75,.08,.05),c('hand'),[(wall-.75)/2,0,0]);add(new THREE.ConeGeometry(.1,.2,3),c('hand'),[-.82,0,0],[0,0,Math.PI/2]);add(rod(.06,.07),c('gold'),[wall,0,0],[Math.PI/2,0,0]);break;
   case 'ski':add(new THREE.BoxGeometry(1.6,.07,.2),c('ski'),[.62,-.02,0],[0,0,-.1]);add(new THREE.BoxGeometry(1.2,.02,.08),c('skiTop'),[.68,.03,0],[0,0,-.1]);add(new THREE.TorusGeometry(.12,.035,8,14,Math.PI/2),c('ski'),[-.16,.1,0],[0,0,Math.PI/2]);add(rod(.5,.02),c('shaft'),[.35,-.28,.12],[0,0,.35]);break;
  }
  g.position.set(h.x,h.y,h.z||0);g.scale.setScalar(size);
  // pipe props hang off the pipe's roof, which is tilted with the pipe
  if(!h.wall&&h.prop!=='ski'&&L.pipe)g.rotation.z=Math.atan2(L.pipe.normal[1],L.pipe.normal[0])-Math.PI/2;
  g.traverse(o=>{o.castShadow=o.receiveShadow=true;});terrainGroup.add(g);return g;
 }
 for(const [i,h]of L.holds.entries()){
   let shape;
   if(h.prop)shape=prop(h);
   else if(h.kind==='handle'){shape=mesh(new THREE.TorusGeometry(.14,.035,8,20),holdMats[i%3],[h.x,h.y,h.z]);shape.rotation.y=Math.PI/2;}
   else if(h.kind==='rung')shape=box([h.x,h.y,h.z],[.65,.09,.18],wood);
   else if(h.kind==='twig'){shape=box([h.x,h.y,h.z],[.65,.12,.18],wood.clone());shape.rotation.z=.12;}
   else shape=puff([h.x,h.y,h.z],[.17,.13,.14],holdMats[i%3]);
   holdModels.set(h.id,{mesh:shape,data:h});
 }
 // Build support scenery from the active course, never from another map's coordinates.
 const rungXs=[...new Set(L.holds.filter(h=>h.kind==='rung').map(h=>h.x))];
 for(const x of rungXs){const ys=L.holds.filter(h=>h.kind==='rung'&&h.x===x).map(h=>h.y),lo=Math.min(...ys)-.3,hi=Math.max(...ys)+.3;for(const side of [-1,1])box([x+side*.29,(lo+hi)/2,-.05],[.045,hi-lo,.045],wood);}
 const floor=Math.min(...L.terrain.flatMap(t=>t.pts.map(p=>p[1])))-.35;
 box([(L.bounds.x0+L.bounds.x1)/2,floor,0],[L.bounds.x1-L.bounds.x0+2,.6,10],snow);
 for(const t of L.terrain)if(t.kind==='rock'){
  const top=Math.max(...t.pts.map(p=>p[1]));if(top>L.bounds.y1)continue;
  const xs=t.pts.filter(p=>p[1]===top).map(p=>p[0]);if(xs.length<2)continue;
  if(L.kind==='practice')box([(Math.min(...xs)+Math.max(...xs))/2,top+.015,0],[Math.max(...xs)-Math.min(...xs),.03,L.depth],snow);
  for(let x=Math.min(...xs);x<Math.max(...xs);x+=1.3){const width=Math.min(1.3,Math.max(...xs)-x);for(const z of [-L.depth/2,L.depth/2])puff([x+width/2,top+.02,z],[width/2,.13,.6]);}
 }
 for(const o of L.objects){
  const group=new THREE.Group();group.position.set(o.kind==='scooter'?o.x1:o.x0,o.y,0);scene.add(group);
  if(o.kind==='dummy'){
   const make=(g,m,p)=>mesh(g,m,p,group);make(new THREE.SphereGeometry(.22,20,14),snow,[0,.65,0]);make(new RoundedBoxGeometry(.6,.8,.5,2,.08),rust,[0,0,0]);
   for(const x of [-.08,.08])make(new THREE.SphereGeometry(.025,8,8),dark,[x,.69,.21]);
   make(new THREE.TorusGeometry(.17,.025,8,24),snow,[0,.05,.27]);make(new THREE.CylinderGeometry(.26,.26,.08,18),metal,[0,.9,0]);
   objectModels.set(o.id,{root:group,wheels:[],previousX:o.x0});continue;
  }
  if(o.look==='scooter'){
   // a student on an e-scooter, headphones on, absolutely not looking where they're going. Faces the way it moves.
   const make=(g,m,p,r=[0,0,0],sc=[1,1,1])=>{const k=mesh(g,m,p,group);k.rotation.set(...r);k.scale.set(...sc);return k;},b=-o.h/2;
   const deck=mat('#2b2f36'),grip=mat('#4a4f57'),hoodie=mat('#1e3a6e'),jeans=mat('#3e5b86'),skin=mat('#f1c9a5'),shoe=mat('#f6f4ee'),pack=mat('#e8664a'),phones=mat('#22304a'),light=new THREE.MeshBasicMaterial({color:'#bff3ff'});
   make(new RoundedBoxGeometry(.95,.07,.22,2,.03),deck,[0,b+.14,0]);
   const wheels=[];for(const x of [-.42,.42]){const w=make(new THREE.CylinderGeometry(.1,.1,.08,14),grip,[x,b+.1,0],[Math.PI/2,0,0]);wheels.push(w);}
   make(new THREE.CylinderGeometry(.025,.025,1.0,8),grip,[-.42,b+.62,0],[0,0,-.12]);make(new THREE.CylinderGeometry(.02,.02,.5,8),grip,[-.36,b+1.1,0],[Math.PI/2,0,0]);
   make(new THREE.SphereGeometry(.05,10,8),light,[-.5,b+.55,0]);
   for(const z of [-.08,.08]){make(new THREE.CylinderGeometry(.075,.065,.62,10),jeans,[.05,b+.5,z],[0,0,.08]);make(new RoundedBoxGeometry(.2,.08,.1,2,.03),shoe,[0,b+.21,z]);}
   make(new RoundedBoxGeometry(.36,.52,.28,3,.1),hoodie,[0,b+1.04,0],[0,0,-.18]);
   make(new RoundedBoxGeometry(.24,.32,.18,2,.06),pack,[.2,b+1.06,0],[0,0,-.18]);
   for(const z of [-.12,.12])make(new THREE.CylinderGeometry(.05,.045,.4,8),hoodie,[-.2,b+1.06,z],[0,0,1.1]);
   make(new THREE.SphereGeometry(.17,16,12),skin,[-.1,b+1.43,0]);make(new THREE.SphereGeometry(.18,16,12,0,Math.PI*2,0,Math.PI/2),hoodie,[-.08,b+1.47,0]);
   make(new THREE.TorusGeometry(.18,.025,6,16,Math.PI),phones,[-.1,b+1.45,0],[Math.PI/2,0,0]);for(const z of [-.18,.18])make(new THREE.CylinderGeometry(.06,.06,.05,12),phones,[-.1,b+1.43,z],[Math.PI/2,0,0]);
   objectModels.set(o.id,{root:group,wheels,previousX:o.x1,faces:true});continue;
  }
  if(o.look==='bus'){
   // the White Loop: Penn State's free campus bus, which has clearly taken a wrong turn. White body, blue skirt,
   // a row of windows and the route sign on both sides; the roof rails are the grab bars.
   const white=mat('#f6f4ee'),blue=mat('#2f5d9e'),glass=mat('#2a3a4d'),D=2.2,make=(g,m,p)=>mesh(g,m,p,group);
   make(new RoundedBoxGeometry(o.w,o.h,D,3,.14),white,[0,0,0]);
   make(new RoundedBoxGeometry(o.w+.02,.2,D+.02,2,.05),blue,[0,-o.h/2+.24,0]);
   for(const z of [-1,1]){
    const rows=o.h>2?[o.h*.3,o.h*.02]:[.17]; // a double-decker gets two rows of windows
    for(const y of rows)for(let i=0;i<4;i++)make(new RoundedBoxGeometry(o.w*.17,.34,.04,2,.04),glass,[-o.w*.36+i*o.w*.21,y,z*(D/2+.01)]);
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#151a22';ctx.fillRect(0,0,512,96);ctx.fillStyle='#ffb43a';ctx.font='900 64px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('WHITE LOOP',256,50);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
    const sign=make(new THREE.PlaneGeometry(o.w*.62,o.w*.62*96/512),new THREE.MeshBasicMaterial({map:tex}),[0,o.h>2?-o.h*.2:-.2,z*(D/2+.012)]);sign.rotation.y=z<0?Math.PI:0;sign.castShadow=false;
   }
   for(const x of [-1,1])for(const y of o.h>2?[o.h*.3,o.h*.02]:[.17])make(new RoundedBoxGeometry(.04,.3,D*.7,2,.02),glass,[x*(o.w/2+.01),y,0]);
   const wheels=[];for(const x of [-o.w*.32,o.w*.32])for(const z of [-1.1,1.1]){const wheel=mesh(new THREE.CylinderGeometry(.26,.26,.16,18),glass,[x,-o.h/2,z],group);wheel.rotation.x=Math.PI/2;wheels.push(wheel);}
   for(const [x,y]of o.handles){const bar=mesh(new THREE.TorusGeometry(.14,.035,8,20),glass,[x,y,0],group);bar.rotation.y=Math.PI/2;}
   const drift=mesh(ball,snow,[0,o.h/2,0],group);drift.scale.set(o.w*.34,.08,.8);
   objectModels.set(o.id,{root:group,wheels,previousX:o.x0});continue;
  }
  const body=box([0,0,0],[o.w,o.h,2.4],rust);terrainGroup.remove(body);group.add(body);
  const wheels=[];for(const x of [-o.w*.32,o.w*.32])for(const z of [-1.22,1.22]){const wheel=mesh(new THREE.CylinderGeometry(.2,.2,.13,16),dark,[x,-o.h/2,z],group);wheel.rotation.x=Math.PI/2;wheels.push(wheel);}
  for(const [x,y]of o.handles){const bar=mesh(new THREE.TorusGeometry(.14,.035,8,20),dark,[x,y,0],group);bar.rotation.y=Math.PI/2;}
  objectModels.set(o.id,{root:group,wheels,previousX:o.x0});
 }
 if(L.biome==='snow'){
 // Rounded banks and trees sit behind the route; the foreground remains readable.
 const surface=x=>{let y=L.spawn.y;for(const t of L.terrain)if(t.kind==='rock'){const xs=t.pts.map(p=>p[0]),top=Math.max(...t.pts.map(p=>p[1]));if(x>=Math.min(...xs)&&x<=Math.max(...xs)&&top<=L.bounds.y1)y=Math.max(y,top);}if(L.pipe&&x>=L.pipe.f0[0]&&x<=L.pipe.f1[0])y=Math.max(y,(x-L.pipe.f0[0])*L.pipe.dir[1]/L.pipe.dir[0]);return y;};
 for(let x=L.bounds.x0;x<L.bounds.x1;x+=3){const y=surface(x)-2,m=puff([x,y,-3.2],[2.2,2.1,2.3],rock);m.rotation.z=Math.sin(x)*.2;puff([x,y+1.6,-3.2],[2.3,.35,2.3]);}
 function pine(x,y,z,size){const pts=[];for(let i=0;i<=40;i++){const t=i/40;pts.push(new THREE.Vector2(Math.max(.008,(1-t)*size*.32*(.8+.2*Math.cos(t*Math.PI*8))),t*size));}const g=new THREE.LatheGeometry(pts,20),p=g.attributes.position,n=g.attributes.normal,cols=[];for(let i=0;i<p.count;i++){const c=new THREE.Color('#477b77').lerp(new THREE.Color('#edf3ed'),THREE.MathUtils.smoothstep(n.getY(i),.1,.75));cols.push(c.r,c.g,c.b);}g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}),[x,y,z]);}
 for(const x of [L.spawn.x0,L.spawn.x1+1.5,L.finish.x-3,L.finish.x-9])pine(x,surface(x),-4.5,3+Math.sin(x)*.7);
 }
 decorateBiome(L,{mesh,puff,box,prism,mat,rock,snow,wood,dark});
 ambience=createAmbience(L,{mesh,puff,box,mat,phone,root:terrainGroup});scene.background=ambience.sky;scene.add(ambience.hero);
 const pole=mesh(new THREE.CylinderGeometry(.035,.035,2,8),dark,[L.finish.x,L.finish.y+1,0]);flag=mesh(new THREE.PlaneGeometry(1,.5,12,4),rust.clone(),[L.finish.x+.5,L.finish.y+1.7,0]);flag.material.side=THREE.DoubleSide;flag.userData.base=new Float32Array(flag.geometry.attributes.position.array);
 // Signs stand behind the climbers (z 0) so they never hide anyone. A sign printed on solid rock sits on its front face instead: nobody can stand inside rock.
 const inside=(pts,x,y)=>pts.every((a,i)=>{const b=pts[(i+1)%pts.length];return (b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0])>=0;});
 const signDepth=sign=>[[-2.4,-.6],[2.4,-.6],[2.4,.6],[-2.4,.6]].every(([dx,dy])=>L.terrain.some(t=>inside(t.pts,sign.x+dx,sign.y+dy)))?L.depth/2+.02:-L.depth/2+.3;
 // Prologue cues: a pulsing ring where the arms can grab, a bobbing arrow where the legs should jump,
 // and the wooden start barrier that rises when the race begins.
 for(const h of L.holds.filter(h=>h.hint==='grab')){const ring=new THREE.Mesh(new THREE.TorusGeometry(.3,.04,8,32),new THREE.MeshBasicMaterial({color:'#f2c94c'}));ring.position.set(h.x,h.y,(h.z||0)+.1);cueGroup.add(ring);cues.push({mesh:ring,kind:'grab'});}
 for(const m of L.markers||[]){const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');ctx.font='900 110px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=14;ctx.strokeStyle='#22304a';ctx.strokeText('↑',64,68);ctx.fillStyle='#f2c94c';ctx.fillText('↑',64,68);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;const arrow=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthWrite:false}));arrow.scale.set(.9,.9,1);arrow.position.set(m.x,m.y,.3);cueGroup.add(arrow);cues.push({mesh:arrow,kind:'jump',y:m.y});}
 // Direction arrows: small chevrons every few metres along the racing line, behind the climbers (z < 0) so they
 // never cover anyone, pulsing gently the way to go. Spots that would sit inside rock are skipped.
 {const chevron=new THREE.Shape([[-.2,.26],[.06,0],[-.2,-.26],[-.05,-.26],[.21,0],[-.05,.26]].map(([x,y])=>new THREE.Vector2(x,y)));
  const fill=new THREE.MeshBasicMaterial({color:'#f2c94c',transparent:true,opacity:.85,depthWrite:false}),edge=new THREE.MeshBasicMaterial({color:'#22304a',transparent:true,opacity:.7,depthWrite:false});
  const front=new THREE.ShapeGeometry(chevron),back=front.clone();back.scale(1.28,1.22,1);
  const solid=(x,y)=>L.terrain.some(t=>inside(t.pts,x,y)&&inside(t.pts,x+.3,y)&&inside(t.pts,x-.3,y));
  for(const lane of L.mirror?[1,-1]:[1]){
   let carry=2.5;
   for(let i=0;i<L.path.length-1;i++){
    const [ax,ay]=L.path[i],[bx,by]=L.path[i+1],len=Math.hypot(bx-ax,by-ay),angle=Math.atan2(by-ay,(bx-ax)*lane);
    for(let d=carry;d<len;d+=4){
     const x=(ax+(bx-ax)*d/len)*lane,y=ay+(by-ay)*d/len;if(solid(x,y))continue;
     const g=new THREE.Group();g.position.set(x,y,-L.depth/2+.2);g.rotation.z=angle;
     const outline=new THREE.Mesh(back,edge);outline.position.z=-.01;const arrow=new THREE.Mesh(front,fill);g.add(outline,arrow);cueGroup.add(g);
     cues.push({mesh:g,kind:'arrow',x,y,dx:Math.cos(angle),dy:Math.sin(angle),phase:(x+y)*.4});
    }
    carry=(carry-len)%4;if(carry<0)carry+=4;
   }
  }}
 const gate=L.terrain.find(t=>t.kind==='barrier');
 if(gate){const xs=gate.pts.map(p=>p[0]),ys=gate.pts.map(p=>p[1]),w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);
  const panel=new THREE.Mesh(new THREE.BoxGeometry(w,h,L.depth*.9),wood);panel.position.set((Math.max(...xs)+Math.min(...xs))/2,(Math.max(...ys)+Math.min(...ys))/2,0);panel.castShadow=panel.receiveShadow=true;cueGroup.add(panel);barrier={mesh:panel,rise:0,raising:false};}
 // Small signs carry main's route cues without filling the phone HUD with instructions.
 for(const sign of L.signs){const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff9e9';ctx.fillRect(0,0,768,192);ctx.fillStyle='#385567';ctx.font='800 54px system-ui';ctx.textAlign='center';ctx.fillText(sign.text,384,76);ctx.font='26px system-ui';ctx.fillText(sign.sub,384,132);const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;const m=mesh(new THREE.PlaneGeometry(4.8,1.2),new THREE.MeshBasicMaterial({map:tex}),[sign.x,sign.y,signDepth(sign)]);m.castShadow=false;}

 terrainGroup.traverse(o=>{o.updateMatrix();o.matrixAutoUpdate=false;});for(const {mesh:m,data:h}of holdModels.values())if(h.objectId||h.kind==='twig')m.matrixAutoUpdate=true;terrainGroup.updateMatrixWorld(true);ambience.activate();window.LabSetView?.(Net.phase==='playing'?'follow':'menu');
}
Net.on('level',build);if(Net.level)build(Net.level);
const isLobby=()=>Net.phase!=='playing'&&Net.phase!=='results';let menuCameraReady=false;
function menuShot(){const portrait=camera.aspect<1,focus={snow:[14,10],forest:[14,10.5],campus:[17,10]}[level?.biome]||[14,10];return {target:new THREE.Vector3(focus[0]+(portrait?0:2),focus[1]+(portrait?2:0),-2),distance:portrait?40:31};}
const controls=phone?null:new OrbitControls(camera,renderer.domElement);
// screen.html?camera exposes the camera for lining up screenshots; never in normal play
if(new URLSearchParams(location.search).has('camera'))window.LabCamera={camera,controls,THREE};if(controls){controls.enableDamping=true;controls.target.set(25,8,0);}
window.LabSetView=view=>{
 window.LabView=view;
 if(view==='menu'&&controls&&!menuCameraReady){const {target,distance}=menuShot();controls.target.copy(target);camera.position.copy(target).add(new THREE.Vector3(2,3,distance));camera.lookAt(target);menuCameraReady=true;}
 if(view==='overview'&&controls){
  const b=level?.bounds||{x0:-2,x1:52,y0:-1,y1:20},width=b.x1-b.x0,height=b.y1-b.y0,cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2,tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
  const d=Math.max(12,(width+Math.max(10,width*.7))/(2*tan*camera.aspect),(height+4)/(2*tan));
  controls.target.set(cx,cy,0);camera.position.set(cx+4,cy+d*.16,d);controls.update();
 }
};
window.LabSetView(Net.phase==='playing'?'follow':isLobby()?'menu':'overview');
Net.on('phase',p=>{if(!phone)window.LabSetView(p==='playing'?'follow':p==='results'?'overview':'menu');});
let previous=performance.now();
const SUN_OFFSET=new THREE.Vector3(-9,30,18),shadowToLight=new THREE.Matrix4().lookAt(SUN_OFFSET,new THREE.Vector3(),new THREE.Vector3(0,1,0)),lightToShadow=shadowToLight.clone().invert(),tempV=new THREE.Vector3();
renderer.setAnimationLoop(now=>{
 adaptQuality(now);const scenicLobby=!phone&&isLobby()&&window.LabView==='menu';
 // Slow lobby motion does not need a full shadow-map pass every frame.
 renderer.shadowMap.autoUpdate=!(scenicLobby||window.Render3D.fps<45&&renderer.getPixelRatio()<=MIN_RATIO);
 if(!renderer.shadowMap.autoUpdate&&frameNo++%(scenicLobby?4:2)===0)renderer.shadowMap.needsUpdate=true;
 const dt=Math.min(.05,(now-previous)/1000);previous=now;const s=Net.sample(),seen=new Set();
 if(s){
  const broken=new Set(s.broken||[]),strain=new Map(s.strain||[]);
  for(const [id,{mesh:m,data:h}]of holdModels){m.visible=!broken.has(id);if(h.kind==='twig'){m.rotation.z=.12-(strain.get(id)||0)*.5;}}
  for(const o of s.objects||[]){const m=objectModels.get(o.id);if(!m)continue;m.root.position.set(o.x,o.y,o.z);if(o.rotation)m.root.quaternion.set(o.rotation.x,o.rotation.y,o.rotation.z,o.rotation.w);for(const w of m.wheels)w.rotation.y+=(o.x-m.previousX)/.2;if(m.faces&&Math.abs(o.x-m.previousX)>.002)m.root.scale.x=o.x<m.previousX?1:-1;m.previousX=o.x;for(const {mesh:h,data}of holdModels.values())if(data.objectId===o.id)h.position.set(o.x+data.local.x,o.y+data.local.y,o.z);}
 }

 if(s)for(const c of s.climbers){
  seen.add(c.id);let m=models.get(c.id);if(!m){m=createAlpineCharacter(Net.colorOf(c.id));models.set(c.id,m);scene.add(m.root);}
  // Quaternion interpolation follows the shortest rotational arc.
  if(!m.rotation)m.rotation=new THREE.Quaternion(c.rotation.x,c.rotation.y,c.rotation.z,c.rotation.w);
  tempQ.set(c.rotation.x,c.rotation.y,c.rotation.z,c.rotation.w);m.rotation.slerp(tempQ,1-Math.exp(-dt*18));
  m.root.visible=phone||!isLobby()||window.LabView!=='menu';if(m.root.visible)m.pose({...c,rotation:m.rotation},dt,now/1000);
  if(phone&&c.id===Net.me){
   c.hands.forEach((h,i)=>{const key=c.id+':'+i;let target=targets.get(key);if(!target){target=mesh(new THREE.TorusGeometry(.21,.018,6,24),holdMats[i],null,scene);targets.set(key,target);}target.visible=!h.grip&&h.target?.id!=null;if(h.target)target.position.set(h.target.x,h.target.y,h.target.z+.06);});
  }
 }
 for(const [id,m]of models)if(!seen.has(id)){scene.remove(m.root);m.dispose();models.delete(id);for(const [key,target]of targets)if(key.startsWith(id+':')){scene.remove(target);target.geometry.dispose();targets.delete(key);}}
 if(phone){
  const c=s?.climbers.find(c=>c.id===Net.me)||s?.climbers[0];
  const target=c?new THREE.Vector3(c.x+.65,c.y+.3,c.z):new THREE.Vector3(4,2,0);
  const distance=7.3*Math.max(1,.62/camera.aspect);
  const offset=new THREE.Vector3(1.6,1.4,distance);
  camera.position.lerp(target.clone().add(offset),1-Math.exp(-dt*5));camera.lookAt(target);
 }else if(isLobby()&&window.LabView==='menu'){
  const t=reducedMotion.matches?0:now/1000,wave=Math.sin(t*.09)*.55,{target,distance}=menuShot(),blend=reducedMotion.matches?1:1-Math.exp(-dt*4);target.x+=wave;
  controls.enabled=false;controls.target.lerp(target,blend);camera.position.lerp(target.clone().add(new THREE.Vector3(2+wave,3,distance)),blend);camera.lookAt(controls.target);
 }else if(window.LabView==='follow'&&s?.climbers.length){
  controls.enabled=true;
  const cs=s.climbers,xs=cs.map(c=>c.x),ys=cs.map(c=>c.y);const center=new THREE.Vector3((Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2+.8,0);
  const spreadX=Math.max(...xs)-Math.min(...xs)+9,spreadY=Math.max(...ys)-Math.min(...ys)+6,tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));const d=Math.max(12,spreadX/(2*tan*camera.aspect),spreadY/(2*tan));
  controls.target.lerp(center,1-Math.exp(-dt*3));camera.position.lerp(center.clone().add(new THREE.Vector3(3,4,d)),1-Math.exp(-dt*3));controls.update();
 }else if(controls){controls.enabled=true;if(window.LabView==='follow'){window.LabSetView('overview');window.LabView='follow';}controls.update();}
 ambience?.update(now/1000,{reduced:reducedMotion.matches,lobby:!phone&&isLobby()&&window.LabView==='menu'});
 if(flag&&!reducedMotion.matches){const p=flag.geometry.attributes.position,base=flag.userData.base;for(let i=0;i<p.count;i++){const x=base[i*3]+.5;p.setZ(i,Math.sin(now/220-x*4)*.12*x);}p.needsUpdate=true;flag.geometry.computeVertexNormals();}
 const focus=phone?(s?.climbers.find(c=>c.id===Net.me)||s?.climbers[0]):null;
 const lightTarget=phone?new THREE.Vector3(focus?.x||0,focus?.y||1,0):controls.target;
 // Shadows crawl and shimmer when the shadow box slides or resizes smoothly with the camera, so its size moves in 4 m steps and its centre snaps to whole shadow texels.
 const ext=phone?9:Math.min(40,Math.max(12,Math.ceil(camera.position.distanceTo(lightTarget)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*Math.max(1,camera.aspect)/4)*4));
 const texel=2*ext/sun.shadow.mapSize.x;tempV.copy(lightTarget).applyMatrix4(lightToShadow);tempV.x=Math.round(tempV.x/texel)*texel;tempV.y=Math.round(tempV.y/texel)*texel;tempV.applyMatrix4(shadowToLight);
 sun.target.position.copy(tempV);sun.position.copy(tempV).add(SUN_OFFSET);
 if(sun.shadow.camera.right!==ext){Object.assign(sun.shadow.camera,{left:-ext,right:ext,top:ext,bottom:-ext});sun.shadow.camera.updateProjectionMatrix();}
 // Wake-up: the big screen labels who is the arms and who is the legs of each body for the first moments of the prologue.
 if(!phone){const show=level?.kind==='practice'&&s?.phase==='playing'&&s.elapsed<28,seenTags=new Set();
  if(show)for(const c of s.climbers){seenTags.add(c.id);let tag=roleTags.get(c.id);if(!tag){tag=document.createElement('div');tag.className='role-tag';document.body.append(tag);roleTags.set(c.id,tag);}
   const team=Net.roster.find(r=>r.id===c.id),text=(team?.members||[]).map(m=>`${m.role==='both'?'ARMS + LEGS':m.role.toUpperCase()} · ${m.name}`).join('\n');if(tag.textContent!==text)tag.textContent=text;
   tempV.set(c.x,c.y+1.5,c.z||0).project(camera);tag.style.transform=`translate(-50%,-100%) translate(${(tempV.x+1)/2*innerWidth}px,${(1-tempV.y)/2*innerHeight}px)`;tag.hidden=tempV.z>1;}
  for(const [id,tag]of roleTags)if(!seenTags.has(id)){tag.remove();roleTags.delete(id);}}
 const pulse=now/1000;for(const cue of cues){if(cue.kind==='grab'){const k=1+Math.sin(pulse*4)*.15;cue.mesh.scale.set(k,k,k);}else if(cue.kind==='arrow'){const nudge=(Math.sin(pulse*2.4-cue.phase)+1)*.08;cue.mesh.position.x=cue.x+cue.dx*nudge;cue.mesh.position.y=cue.y+cue.dy*nudge;}else cue.mesh.position.y=cue.y+Math.sin(pulse*3)*.12;}
 if(barrier?.raising&&barrier.rise<4.5){const step=Math.min(4.5-barrier.rise,dt*2.2);barrier.rise+=step;barrier.mesh.position.y+=step;}
 renderer.render(scene,camera);
});
Net.on('event',e=>{if(e.type==='release'&&barrier)barrier.raising=true;});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);if(!phone&&window.LabView==='overview')window.LabSetView('overview');});
