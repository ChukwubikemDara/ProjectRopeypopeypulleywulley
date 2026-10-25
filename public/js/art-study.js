import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createAlpineCharacter } from './alpine-character.js';
import { createAlpineSection } from './alpine-section.js';

const scene = new THREE.Scene();
const skyCanvas = document.createElement('canvas'); skyCanvas.width = 16; skyCanvas.height = 256;
const ctx = skyCanvas.getContext('2d'), gradient = ctx.createLinearGradient(0, 0, 0, 256);
gradient.addColorStop(0, '#76b3d0'); gradient.addColorStop(0.65, '#d5e6ec'); gradient.addColorStop(1, '#f5eee1');
ctx.fillStyle = gradient; ctx.fillRect(0, 0, 16, 256);
const skyTexture = new THREE.CanvasTexture(skyCanvas); skyTexture.colorSpace = THREE.SRGBColorSpace; scene.background = skyTexture;
scene.fog = new THREE.Fog('#ccdee7', 70, 160);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1;
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,.1,200);
const controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=false;controls.minDistance=2;controls.maxDistance=65;controls.maxPolarAngle=Math.PI*.52;
scene.add(new THREE.HemisphereLight('#c5e8ff','#786b80',2));
const key=new THREE.DirectionalLight('#ffe0af',3.4);key.position.set(-7,13,10);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.normalBias=.025;
Object.assign(key.shadow.camera,{left:-15,right:15,top:18,bottom:-10,near:1,far:60});scene.add(key);
const rim=new THREE.DirectionalLight('#acdcff',2);rim.position.set(8,9,-5);scene.add(rim);
const section=createAlpineSection(12,12);scene.add(section);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshStandardMaterial({color:'#b0d1dd',roughness:.55}));ground.rotation.x=-Math.PI/2;ground.position.y=-.65;ground.receiveShadow=true;scene.add(ground);
const backgroundRidges = new THREE.Group(); scene.add(backgroundRidges);
// Background ridges have multiple unequal summits and atmospheric separation.
for(let layer=0;layer<3;layer++) {
 const outline = new THREE.Shape(); outline.moveTo(-90,-8);
 const crests=[];
 for(let i=0;i<13;i++) crests.push({x:-90+i*15,y:12+Math.sin(i*2.3+layer)*6+layer*3});
 outline.lineTo(crests[0].x,crests[0].y);
 for(let i=1;i<crests.length;i++) {
   const a=crests[i-1],b=crests[i];
   outline.lineTo((a.x+b.x)/2,Math.min(a.y,b.y)-7);
   outline.lineTo(b.x,b.y);
 }
 outline.lineTo(90,-8);outline.closePath();
 const ridge=new THREE.Mesh(new THREE.ShapeGeometry(outline),new THREE.MeshBasicMaterial({color:['#9fb9c9','#b3cbd6','#c9dce3'][layer]}));
 ridge.position.z=-28-layer*19;backgroundRidges.add(ridge);
 for(let i=1;i<crests.length-1;i++) {
   const c=crests[i], cap=new THREE.Shape();cap.moveTo(c.x-3,c.y-4);cap.lineTo(c.x,c.y);cap.lineTo(c.x+3,c.y-4);cap.lineTo(c.x+1.2,c.y-3.3);cap.lineTo(c.x,c.y-4.4);cap.lineTo(c.x-.8,c.y-3.2);cap.closePath();
   const snowcap=new THREE.Mesh(new THREE.ShapeGeometry(cap),new THREE.MeshBasicMaterial({color:'#eaf3f5'}));snowcap.position.z=ridge.position.z+.05;backgroundRidges.add(snowcap);
 }
}
const climber=createAlpineCharacter('#3eafa5');scene.add(climber.root);
const holdMaterials=['#36b1ab','#e88b70','#87bcd4'].map(color=>new THREE.MeshStandardMaterial({color,roughness:.7}));
const holds=new THREE.Group();scene.add(holds);
for(let row=0;row<5;row++)for(let col=0;col<5;col++){
 const h=new THREE.Mesh(new THREE.SphereGeometry(1,20,14),holdMaterials[(row+col)%3]);
 h.scale.set(.22,.17,.14);h.position.set((col-2)*2+Math.sin(row+col)*.4,1.9+row*2.1,.015);h.rotation.z=Math.sin(col+row)*.5;h.castShadow=true;holds.add(h);
}
const poseHold=new THREE.Mesh(new THREE.SphereGeometry(1,20,14),holdMaterials[0]);
poseHold.position.set(-.45,3.4,.015);poseHold.scale.set(.22,.17,.14);poseHold.castShadow=true;holds.add(poseHold);
let view='character';
function setView(name){
 view=name;document.querySelectorAll('button[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
 section.visible=view!=='character';holds.visible=view!=='character';backgroundRidges.visible=view!=='character';
 scene.background = view==='character' ? new THREE.Color('#e5edf0') : skyTexture;
 if(view==='character'){camera.position.set(2.3,1.85,4.7);controls.target.set(0,1.08,0);}
 else if(view==='mountain'){const distance = Math.max(24, 10 / (Math.tan(Math.PI / 10) * camera.aspect)); camera.position.set(distance * .32,10,distance);controls.target.set(0,4.4,0);}
 else{camera.position.set(3.1,3.7,7.5);controls.target.set(0,2.7,0);}
 controls.update();
}
document.querySelectorAll('button[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));setView(view);
const studioFloor=new THREE.Mesh(new THREE.CircleGeometry(5,64),new THREE.MeshStandardMaterial({color:'#edf0e8',roughness:.9}));studioFloor.rotation.x=-Math.PI/2;studioFloor.position.y=0;studioFloor.receiveShadow=true;scene.add(studioFloor);
let last=performance.now();
renderer.setAnimationLoop(now=>{
 const dt=Math.min(.05,(now-last)/1000);last=now;const t=now/1000;
 studioFloor.visible=view==='character';
 const climbing=view==='climbing', y=climbing?2.5:.96;
 climber.pose({x:0,y,air:false,hands:climbing?[
 {x:-.45,y:3.4,ex:-.5,ey:2.95,grip:true,closed:true},
 {x:.62,y:3.12,ex:.55,ey:2.8,grip:false,closed:false}]:[
 {x:-.43,y:.7,ex:-.38,ey:.98,closed:false},
 {x:.43,y:.7,ex:.38,ey:.98,closed:false}],legs:climbing?[
 {kx:-.32,ky:2.13,fx:-.45,fy:1.7,planted:false},
 {kx:.39,ky:2.2,fx:.48,fy:1.92,planted:true}]:[
 {kx:-.16,ky:.48,fx:-.19,fy:.12,planted:true},
 {kx:.16,ky:.48,fx:.19,fy:.12,planted:true}]},dt,t);
 climber.root.visible=view!=='mountain';controls.update();renderer.render(scene,camera);
});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
