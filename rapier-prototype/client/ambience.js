import * as THREE from 'three';
import {createAlpineCharacter} from '/js/alpine-character.js';
// Visual-only scenery. No physics objects or input handlers belong in this module.
export function createAmbience(L,{mesh,puff,box,mat,phone,root}){
 const animated=[],clouds=[],sways=[];
 const forest=L.biome==='forest',campus=L.biome==='campus',span=L.bounds.x1-L.bounds.x0,cx=(L.bounds.x0+L.bounds.x1)/2;
 const canvas=document.createElement('canvas');canvas.width=2;canvas.height=256;
 const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,256);
 const colors=forest?['#6faaa7','#bad7bc','#e7e5bd']:campus?['#8abbd9','#d2e3eb','#f4e2bd']:['#78b8d9','#c8e4ef','#f5ead7'];
 colors.forEach((color,i)=>gradient.addColorStop(i/2,color));ctx.fillStyle=gradient;ctx.fillRect(0,0,2,256);
 const sky=new THREE.CanvasTexture(canvas);sky.colorSpace=THREE.SRGBColorSpace;
 const white=mat(forest?'#e8ecce':'#fff6e6'),stone=mat('#8b9fac'),grass=mat(forest?'#769e74':'#a6ba80');
 const group=pos=>{const g=new THREE.Group();g.position.set(...pos);return g;};
 const attach=g=>root.add(g);
 function cloud(x,y,z,size,phase){const root=group([x,y,z]);attach(root);for(let i=0;i<5;i++){const p=puff([0,0,0],[size*(.7+i%2*.25),size*(.3+i%3*.09),size*.55],white);p.parent.remove(p);root.add(p);p.position.set((i-2)*size*.65,Math.sin(i*2)*size*.12,0);p.castShadow=p.receiveShadow=false;}clouds.push({root,x,phase});animated.push(root);}
 for(let i=0;i<(phone?4:7);i++)cloud(cx-36+i*12,20+(i%3)*5,-30-(i%2)*18,2.2+(i%3)*.6,i*1.7);
 // Broad background banks continue past the playable silhouette, making the course part of a world.
 for(let i=0;i<7;i++){const x=cx-42+i*14,y=-5+(i%3),m=puff([x,y,-16-i%2*14],[12,forest?6:4,8],forest||campus?grass:mat(i%2?'#cbdde1':'#e8e8dd'));m.castShadow=false;}
 if(!forest&&!campus){
  const mountainMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
  for(let i=0;i<10;i++){
   const h=17+(i%3)*5,r=10+(i%2)*4,pts=[];for(let j=0;j<=18;j++){const t=j/18;pts.push(new THREE.Vector2(Math.max(.015,r*Math.pow(1-t,.66)*(1+.06*Math.sin(t*15+i))),t*h));}
   const geo=new THREE.LatheGeometry(pts,32),p=geo.attributes.position,colors=[];
   for(let j=0;j<p.count;j++){const y=p.getY(j),a=Math.atan2(p.getZ(j),p.getX(j)),k=1+.08*Math.sin(a*5+i)*Math.sin(y*.28);p.setX(j,p.getX(j)*k);p.setZ(j,p.getZ(j)*k);const color=new THREE.Color(i%2?'#8faebd':'#a9c4cc');color.lerp(new THREE.Color('#f6f2e5'),THREE.MathUtils.smoothstep(y/h+.035*Math.sin(a*7),.64,.76));colors.push(color.r,color.g,color.b);}
   geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();const m=mesh(geo,mountainMat,[cx-40+i*9,-2,-27-(i%3)*14]);m.castShadow=false;
  }
  for(let i=0;i<8;i++){const x=L.bounds.x0+i*7,y=3+(i%3)*3,z=-9;const m=puff([x,y,z],[2.3,3.7,2],stone);m.rotation.z=Math.sin(i)*.2;const cap=mesh(new THREE.SphereGeometry(1,24,12,0,Math.PI*2,0,Math.PI*.34),white,[x,y+.035,z]);cap.scale.set(2.34,3.74,2.04);cap.rotation.copy(m.rotation);}
 }else if(forest){
  const greens=['#44796c','#6e9c7d','#9aba85'].map(mat);
  for(let i=0;i<(phone?6:11);i++){
   const x=cx-26+i*5.2,z=-10-i%3*7,h=16+i%4*2,root=group([x,0,z]);attach(root);
   const trunk=mesh(new THREE.CylinderGeometry(.4,.8,h,12),mat('#8c7555'),[0,h/2,0],root);trunk.castShadow=false;
   for(let j=0;j<4;j++){const p=puff([0,0,0],[2.3+j%2,1.4,2],greens[(i+j)%3]);p.parent.remove(p);root.add(p);p.position.set(Math.sin(j*2+i)*2,h-2+j*.8,Math.cos(j*2)*1.5);p.castShadow=false;}
   sways.push({root,phase:i,amplitude:.009});animated.push(root);
  }
  // Sunlit canopy edges, positioned well behind the interaction plane.
  for(let i=0;i<7;i++)puff([cx-27+i*9,25+(i%2)*2,-17],[6,2.8,3.5],greens[i%3]).castShadow=false;
 }else{
  const cream=mat('#d8c4a3'),trim=mat('#f5e5c7'),slate=mat('#6b8190'),glass=mat('#91b9c5');
  for(let i=0;i<5;i++){
   const x=cx-34+i*16,z=-22-(i%2)*7,h=4+i%3*1.2;box([x,h/2,z],[10,h,5],cream).castShadow=false;const roof=mesh(new THREE.ConeGeometry(7,2,4),slate,[x,h+1,z]);roof.rotation.y=Math.PI/4;roof.castShadow=false;
   box([x,h-.2,z+2.55],[10.3,.3,.25],trim).castShadow=false;for(let j=-3;j<=3;j+=2)box([x+j,h*.53,z+2.55],[.8,1.3,.1],glass).castShadow=false;
  }
  // A distant academic clock tower keeps the campus identity visible beside the menu.
  const tx=cx-10,tz=-19;box([tx,8.5,tz],[3.5,17,3.5],cream).castShadow=false;
  for(const y of [4,10,15.8])box([tx,y,tz],[3.9,.2,3.9],trim).castShadow=false;
  const dial=mesh(new THREE.CircleGeometry(.95,32),trim,[tx,14,tz+1.79]);dial.castShadow=false;
  for(let i=0;i<12;i++){const a=i*Math.PI/6,m=box([tx+Math.sin(a)*.78,14+Math.cos(a)*.78,tz+1.82],[.05,.13,.025],slate);m.rotation.z=-a;m.castShadow=false;}
  const hand=box([tx-.2,14.25,tz+1.85],[.06,.7,.025],slate);hand.rotation.z=-.65;box([tx+.3,14.1,tz+1.87],[.65,.05,.025],slate);
  for(const x of [-1.2,1.2])for(const z of [-1.2,1.2])mesh(new THREE.CylinderGeometry(.1,.13,2,8),trim,[tx+x,17.9,tz+z]).castShadow=false;
  const roof=mesh(new THREE.ConeGeometry(3,1.7,4),slate,[tx,19.5,tz]);roof.rotation.y=Math.PI/4;roof.castShadow=false;
  const foliage=['#d7b461','#b1bb7a','#c58b66'].map(mat);
  for(let i=0;i<8;i++){const x=cx-31+i*9,z=-10-(i%2)*6,h=3.8+(i%3),root=group([x,0,z]);attach(root);mesh(new THREE.CylinderGeometry(.13,.24,h,10),cream,[0,h/2,0],root).castShadow=false;for(let j=0;j<3;j++){const p=puff([0,0,0],[1.5,1.7,1.3],foliage[(i+j)%3]);p.parent.remove(p);root.add(p);p.position.set((j-1)*.8,h+.5+j%2*.5,0);p.castShadow=false;}sways.push({root,phase:i,amplitude:.012});animated.push(root);}
  // A quiet string of pennants across the distant lawn; no collision/hold implication.
  const rope=mat('#b8a27e'),colors=['#63b1bb','#e99173','#edd186'].map(mat);
  for(let i=0;i<12;i++){const x=cx-19+i*3,y=7-Math.sin(i/11*Math.PI)*1.3;box([x,y,-10],[3.1,.025,.025],rope).castShadow=false;const f=mesh(new THREE.ConeGeometry(.35,.65,3),colors[i%3],[x,y-.34,-10]);f.rotation.z=Math.PI;f.castShadow=false;sways.push({root:f,phase:i,amplitude:.1});animated.push(f);}
 }
 const count=phone?40:100,positions=new Float32Array(count*3),seeds=[];
 for(let i=0;i<count;i++){const seed={x:L.bounds.x0-12+(i*.61803398875%1)*(span+24),y:(i*.41421356237%1)*30,z:-3-(i*.73205080757%1)*18,speed:.2+(i%5)*.09};seeds.push(seed);positions.set([seed.x,seed.y,seed.z],i*3);}
 const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));const dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:forest?'#e8db9b':campus?'#d8a166':'#fff9ee',size:forest?.065:campus?.1:.075,sizeAttenuation:true,transparent:true,opacity:forest?.55:.75,depthWrite:false}));attach(dust);animated.push(dust);
 // Decorative lobby climbers use the existing character model, never simulated players.
 const hero=new THREE.Group(),actors=phone?[]:['#42b7ad','#e99478'].map(createAlpineCharacter);
 hero.position.set(L.biome==='campus'?15.5:13,L.biome==='campus'?8.8:9,4);hero.scale.setScalar(1.9);actors.forEach(a=>hero.add(a.root));
 const cord=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,14,8),mat('#d9b981'));cord.position.set(-.4,7.75,0);hero.add(cord);
 function pose(t){actors.forEach((a,i)=>{const x=i*.85+Math.sin(t*.7+i)*.035,y=-i*1.6+Math.sin(t*.8+i)*.055;a.pose({x,y,z:0,air:false,hands:[{x:i?.6:-.4,y:i?-.4:.85,z:0,ex:x-.4,ey:y+.4,grip:true,closed:true},{x:x+.6,y:y-.35,z:0,ex:x+.6,ey:y+.05,closed:false}],legs:[{kx:x-.25,ky:y-.5,fx:x-.4,fy:y-.76},{kx:x+.3,ky:y-.5,fx:x+.45,fy:y-.72}]},1/60,t);});}
 pose(0);let frozen=false,lastTime=null,elapsed=0;
 return {sky,hero,activate(){animated.forEach(o=>{o.matrixAutoUpdate=true;});},update(time,{reduced,lobby}){
  if(!reduced&&lastTime!==null)elapsed+=Math.min(.1,Math.max(0,time-lastTime))*(lobby?1:.3);lastTime=time;
  const t=elapsed,amount=1;
  for(const {root,x,phase}of clouds)root.position.x=x+Math.sin(t*.035+phase)*3*amount;
  for(const {root,phase,amplitude}of sways)root.rotation.z=Math.sin(t*.65+phase)*amplitude*amount;
  dust.visible=!reduced;const p=dustGeo.attributes.position;if(!reduced){for(let i=0;i<count;i++){const seed=seeds[i];p.setXYZ(i,seed.x+Math.sin(t*.25+i)*.35,30-((30-seed.y+t*seed.speed*amount)%30),seed.z);}p.needsUpdate=true;}
  hero.visible=lobby;if(lobby){if(!reduced||!frozen)pose(t);frozen=reduced;}else frozen=false;
 },dispose(){sky.dispose();actors.forEach(a=>a.dispose());cord.geometry.dispose();cord.material.dispose();}};
}
