import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {createAlpineCharacter} from '/js/alpine-character.js';
const phone=document.body.classList.contains('phone');
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(phone?48:40,innerWidth/innerHeight,.1,320);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,phone?1.5:2));
window.Render3D={renderer,fps:60};
const MAX_RATIO=Math.min(devicePixelRatio||1,phone?1.5:2),MIN_RATIO=phone?.6:1;
const perf={frames:0,since:performance.now(),goodFor:0};let frameNo=0;
function adaptQuality(now){
 perf.frames++;if(now-perf.since<1000)return;const fps=Math.round(perf.frames*1000/(now-perf.since));perf.frames=0;perf.since=now;window.Render3D.fps=fps;
 const r=renderer.getPixelRatio();if(fps<45&&r>MIN_RATIO){renderer.setPixelRatio(Math.max(MIN_RATIO,r-.2));perf.goodFor=0;}else if(fps>=57&&r<MAX_RATIO&&++perf.goodFor>=2){renderer.setPixelRatio(Math.min(MAX_RATIO,r+.1));perf.goodFor=0;}
 renderer.shadowMap.autoUpdate=!(fps<45&&renderer.getPixelRatio()<=MIN_RATIO);
}
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.getElementById('game').append(renderer.domElement);
scene.background=new THREE.Color('#b9d9e5');scene.fog=new THREE.Fog('#c2dae3',100,280);
scene.add(new THREE.HemisphereLight('#c3e6ff','#837078',1.7));
const sun=new THREE.DirectionalLight('#ffe0b5',2.7);sun.position.set(16,42,24);sun.target.position.set(25,8,0);scene.add(sun.target);sun.castShadow=true;sun.shadow.mapSize.set(phone?1024:2048,phone?1024:2048);Object.assign(sun.shadow.camera,{left:-40,right:40,top:30,bottom:-25,near:1,far:110});sun.shadow.normalBias=.025;scene.add(sun);
const rim=new THREE.DirectionalLight('#a1d8f2',1.2);rim.position.set(25,15,-15);scene.add(rim);
const mat=color=>new THREE.MeshStandardMaterial({color,roughness:.85});
const rock=mat('#8d99a4'),snow=mat('#f4f3e9'),metal=mat('#77a5af'),rust=mat('#df9476'),dark=mat('#435d70'),wood=mat('#bb9271');
const holdMats=['#3db8aa','#ed907a','#84b5d5'].map(mat);
const terrainGroup=new THREE.Group();scene.add(terrainGroup);
function mesh(geo,material,pos,parent=terrainGroup){const m=new THREE.Mesh(geo,material);if(pos)m.position.set(...pos);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
const ball=new THREE.SphereGeometry(1,24,18);
function puff(pos,scale,material=snow){const m=mesh(ball,material,pos);m.scale.set(...scale);return m;}
function box(pos,scale,material){return mesh(new RoundedBoxGeometry(...scale,3,.08),material,pos);}
function prism(points,depth,material){const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false});g.translate(0,0,-depth/2);return mesh(g,material);}
let level=null,flag=null;const holdModels=new Map(),objectModels=new Map();
function build(L){
 if(level)return;level=L;
 for(const t of L.terrain)prism(t.pts,L.depth,t.kind==='pipe'?metal:t.kind==='crate'?rust:t.kind==='ridge'?dark:rock);
 const P=L.pipe,R=P.gap/2+P.slab/2,angle=Math.atan2(P.dir[1],P.dir[0]);
 // Open shell reveals the physical course. Its floor and roof match the source data.
 const center=[P.f0[0]+P.dir[0]*P.length/2+P.normal[0]*P.gap/2,P.f0[1]+P.dir[1]*P.length/2+P.normal[1]*P.gap/2];
 const shell=mesh(new THREE.CylinderGeometry(R,R,P.length,40,1,true,Math.PI/2,Math.PI),metal,[...center,0]);shell.rotation.z=angle-Math.PI/2;shell.material=metal.clone();shell.material.side=THREE.DoubleSide;
 for(const s of [0,P.length*.33,P.length*.66,P.length]){
  const cx=P.f0[0]+P.dir[0]*s+P.normal[0]*P.gap/2,cy=P.f0[1]+P.dir[1]*s+P.normal[1]*P.gap/2;
  const points=[];for(let i=0;i<=32;i++){const t=i/32*Math.PI;points.push(new THREE.Vector3(cx+P.normal[0]*(R+.06)*Math.cos(t),cy+P.normal[1]*(R+.06)*Math.cos(t),-(R+.06)*Math.sin(t)));}
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),32,.065,8,false),rust);
 }

 for(const [i,h]of L.holds.entries()){
   let shape;
   if(h.kind==='handle'){shape=mesh(new THREE.TorusGeometry(.14,.035,8,20),holdMats[i%3],[h.x,h.y,h.z]);shape.rotation.y=Math.PI/2;}
   else if(h.kind==='rung')shape=box([h.x,h.y,h.z],[.65,.09,.18],wood);
   else if(h.kind==='twig'){shape=box([h.x,h.y,h.z],[.65,.12,.18],wood.clone());shape.rotation.z=.12;}
   else shape=puff([h.x,h.y,h.z],[.17,.13,.14],holdMats[i%3]);
   holdModels.set(h.id,{mesh:shape,data:h});
 }
 // Ladder ropes make the alternate route visible from the checkpoint.
 for(const x of [24.31,24.89])box([x,13.85,-.05],[.045,4.95,.045],wood);
 box([25,-3.35,0],[56,.6,10],snow);
 for(let x=-1;x<4;x+=1.3)puff([x,-.08,-1.7],[1.2,.22,1.7]);
 for(const [x0,x1,y]of [[22,27.5,8],[28.2,50,15]])for(let x=x0;x<x1;x+=1.3){puff([x,y+.02,-1.7],[1.1,.13,.6]);puff([x,y+.02,1.7],[1.1,.13,.6]);}
 for(const o of L.objects){
  const group=new THREE.Group();group.position.set(o.x0,o.y,0);scene.add(group);
  const body=box([0,0,0],[o.w,o.h,2.4],rust);terrainGroup.remove(body);group.add(body);
  const wheels=[];for(const x of [-o.w*.32,o.w*.32])for(const z of [-1.22,1.22]){const wheel=mesh(new THREE.CylinderGeometry(.2,.2,.13,16),dark,[x,-o.h/2,z],group);wheel.rotation.x=Math.PI/2;wheels.push(wheel);}
  for(const [x,y]of o.handles){const bar=mesh(new THREE.TorusGeometry(.14,.035,8,20),dark,[x,y,0],group);bar.rotation.y=Math.PI/2;}
  objectModels.set(o.id,{root:group,wheels,previousX:o.x0});
 }
 // Unequal masses, trees and distant ridges separate foreground, route and background.
 for(let i=0;i<19;i++){const x=i*3-2,y=x<22?Math.max(0,(x-5)*.47)-2:x<27.5?6:13;const m=puff([x,y,-3.2],[2.2,2.1,2.3],i%2?rock:mat('#a7a79e'));m.rotation.z=Math.sin(i)*.2;puff([x,y+1.6,-3.2],[2.3,.35,2.3]);}
 function pine(x,y,z,size){const pts=[];for(let i=0;i<=40;i++){const t=i/40;pts.push(new THREE.Vector2(Math.max(.008,(1-t)*size*.32*(.8+.2*Math.cos(t*Math.PI*8))),t*size));}const g=new THREE.LatheGeometry(pts,20);const p=g.attributes.position,n=g.attributes.normal,cols=[];for(let i=0;i<p.count;i++){const c=new THREE.Color('#477b77').lerp(new THREE.Color('#edf3ed'),THREE.MathUtils.smoothstep(n.getY(i),.1,.75));cols.push(c.r,c.g,c.b);}g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}),[x,y,z]);}
 pine(1,0,-4,4);pine(4,0,-4.5,2.8);pine(26,8,-3.2,3.5);pine(23,8,-4.2,2);pine(33,15,-4.2,3.8);pine(46,15,-4.5,3);pine(39,15,-4,2.7);
 for(let layer=0;layer<3;layer++){
  const shape=new THREE.Shape();shape.moveTo(-50,-5);for(let i=0;i<17;i++){shape.lineTo(-50+i*10,5+layer*3);shape.lineTo(-45+i*10,17+Math.sin(i*2+layer)*6+layer*3);}shape.lineTo(120,-5);shape.closePath();const m=mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:['#91b3c3','#afcbd6','#c8dde5'][layer]}),[0,0,-25-layer*17]);m.castShadow=false;
 }
 const pole=mesh(new THREE.CylinderGeometry(.035,.035,2,8),dark,[L.finish.x,L.finish.y+1,0]);flag=mesh(new THREE.PlaneGeometry(1,.5,12,4),rust.clone(),[L.finish.x+.5,L.finish.y+1.7,0]);flag.material.side=THREE.DoubleSide;flag.userData.base=new Float32Array(flag.geometry.attributes.position.array);
 // Small signs carry main's route cues without filling the phone HUD with instructions.
 for(const sign of L.signs){const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff9e9';ctx.fillRect(0,0,768,192);ctx.fillStyle='#385567';ctx.font='800 54px system-ui';ctx.textAlign='center';ctx.fillText(sign.text,384,76);ctx.font='26px system-ui';ctx.fillText(sign.sub,384,132);const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;const m=mesh(new THREE.PlaneGeometry(4.8,1.2),new THREE.MeshBasicMaterial({map:tex}),[sign.x,sign.y,2]);m.castShadow=false;}

 terrainGroup.traverse(o=>{o.updateMatrix();o.matrixAutoUpdate=false;});for(const {mesh:m,data:h}of holdModels.values())if(h.objectId||h.kind==='twig')m.matrixAutoUpdate=true;terrainGroup.updateMatrixWorld(true);
}
Net.on('level',build);if(Net.level)build(Net.level);
const models=new Map(),targets=new Map(),tempQ=new THREE.Quaternion();
const controls=phone?null:new OrbitControls(camera,renderer.domElement);if(controls){controls.enableDamping=true;controls.target.set(25,8,0);}
window.LabSetView=view=>{
 window.LabView=view;
 if(view==='overview'&&controls){
  const d=Math.max(60,46/(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));
  controls.target.set(25,8,0);camera.position.set(29,8+d*.16,d);controls.update();
 }
};
window.LabSetView(Net.phase==='playing'?'follow':'overview');
Net.on('phase',p=>{if(!phone&&p==='playing')window.LabSetView('follow');});
let previous=performance.now();
renderer.setAnimationLoop(now=>{
 adaptQuality(now);if(!renderer.shadowMap.autoUpdate&&frameNo++%2===0)renderer.shadowMap.needsUpdate=true;
 const dt=Math.min(.05,(now-previous)/1000);previous=now;const s=Net.sample(),seen=new Set();
 if(s){
  const broken=new Set(s.broken||[]),strain=new Map(s.strain||[]);
  for(const [id,{mesh:m,data:h}]of holdModels){m.visible=!broken.has(id);if(h.kind==='twig'){m.rotation.z=.12-(strain.get(id)||0)*.5;}}
  for(const o of s.objects||[]){const m=objectModels.get(o.id);if(!m)continue;m.root.position.set(o.x,o.y,o.z);for(const w of m.wheels)w.rotation.y+=(o.x-m.previousX)/.2;m.previousX=o.x;for(const {mesh:h,data}of holdModels.values())if(data.objectId===o.id)h.position.set(o.x+data.local.x,o.y+data.local.y,o.z);}
 }

 if(s)for(const c of s.climbers){
  seen.add(c.id);let m=models.get(c.id);if(!m){m=createAlpineCharacter(Net.colorOf(c.id));models.set(c.id,m);scene.add(m.root);}
  // Quaternion interpolation follows the shortest rotational arc.
  if(!m.rotation)m.rotation=new THREE.Quaternion(c.rotation.x,c.rotation.y,c.rotation.z,c.rotation.w);
  tempQ.set(c.rotation.x,c.rotation.y,c.rotation.z,c.rotation.w);m.rotation.slerp(tempQ,1-Math.exp(-dt*18));
  m.pose({...c,rotation:m.rotation},dt,now/1000);
  if(phone&&c.id===Net.me){
   c.hands.forEach((h,i)=>{const key=c.id+':'+i;let target=targets.get(key);if(!target){target=mesh(new THREE.TorusGeometry(.21,.018,6,24),holdMats[i],null,scene);targets.set(key,target);}target.visible=!h.grip&&!!h.target?.id;if(h.target)target.position.set(h.target.x,h.target.y,h.target.z+.06);});
  }
 }
 for(const [id,m]of models)if(!seen.has(id)){scene.remove(m.root);m.dispose();models.delete(id);for(const [key,target]of targets)if(key.startsWith(id+':')){scene.remove(target);target.geometry.dispose();targets.delete(key);}}
 if(phone){
  const c=s?.climbers.find(c=>c.id===Net.me)||s?.climbers[0];
  const target=c?new THREE.Vector3(c.x+.65,c.y+.3,c.z):new THREE.Vector3(4,2,0);
  const distance=7.3*Math.max(1,.62/camera.aspect);
  const offset=new THREE.Vector3(1.6,1.4,distance);
  camera.position.lerp(target.clone().add(offset),1-Math.exp(-dt*5));camera.lookAt(target);
 }else if(window.LabView==='follow'&&s?.climbers.length){
  const cs=s.climbers,xs=cs.map(c=>c.x),ys=cs.map(c=>c.y);const center=new THREE.Vector3((Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2+.8,0);
  const spreadX=Math.max(...xs)-Math.min(...xs)+9,spreadY=Math.max(...ys)-Math.min(...ys)+6,tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));const d=Math.max(12,spreadX/(2*tan*camera.aspect),spreadY/(2*tan));
  controls.target.lerp(center,1-Math.exp(-dt*3));camera.position.lerp(center.clone().add(new THREE.Vector3(3,4,d)),1-Math.exp(-dt*3));controls.update();
 }else controls?.update();
 if(flag){const p=flag.geometry.attributes.position,base=flag.userData.base;for(let i=0;i<p.count;i++){const x=base[i*3]+.5;p.setZ(i,Math.sin(now/220-x*4)*.12*x);}p.needsUpdate=true;flag.geometry.computeVertexNormals();}
 const focus=phone?(s?.climbers.find(c=>c.id===Net.me)||s?.climbers[0]):null;
 const lightTarget=phone?new THREE.Vector3(focus?.x||0,focus?.y||1,0):controls.target;
 sun.target.position.copy(lightTarget);sun.position.copy(lightTarget).add(new THREE.Vector3(-9,30,18));
 const ext=phone?9:Math.min(40,Math.max(10,camera.position.distanceTo(lightTarget)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*Math.max(1,camera.aspect)));
 Object.assign(sun.shadow.camera,{left:-ext,right:ext,top:ext,bottom:-ext});sun.shadow.camera.updateProjectionMatrix();
 renderer.render(scene,camera);
});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
