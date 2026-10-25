import * as THREE from 'three';
// Small visual details share the course root and its lifetime; none create colliders.
export function addWorldDetails(L,{root,mesh,puff,box,mat,phone}){
 const animated=[],updates=[];
 const parent=(object,group)=>{object.parent?.remove(object);group.add(object);return object;};
 const ball=(group,pos,scale,material)=>{const m=parent(puff(pos,scale,material),group);m.castShadow=false;return m;};
 const group=pos=>{const g=new THREE.Group();g.position.set(...pos);root.add(g);return g;};
 const ink=mat('#354b50'),cream=mat('#f8e5bf'),wood=mat('#9b7a58'),leaf=mat('#72a080');
 function flowers(places){
  const petalGeometry=new THREE.SphereGeometry(1,8,6),colors=['#eaa2a0','#e9cd76','#b3a5cf'],matrix=new THREE.Matrix4(),q=new THREE.Quaternion();
  const count=phone?Math.ceil(places.length/2):places.length,clusters=places.slice(0,count);
  const instanced=(geometry,material,n)=>{const m=new THREE.InstancedMesh(geometry,material,n);m.castShadow=false;root.add(m);return m;};
  const petals=colors.map((c,i)=>instanced(petalGeometry,mat(c),clusters.filter((_,j)=>j%3===i).length*5)),indices=[0,0,0];
  const centers=instanced(petalGeometry,cream,count),stems=instanced(new THREE.CylinderGeometry(.014,.018,1,5),leaf,count);
  clusters.forEach(([x,y,z],i)=>{const h=.22+(i%3)*.045;
   matrix.compose(new THREE.Vector3(x,y+h/2,z),q,new THREE.Vector3(1,h,1));stems.setMatrixAt(i,matrix);
   for(let j=0;j<5;j++){const a=j*Math.PI*2/5;matrix.compose(new THREE.Vector3(x+Math.cos(a)*.095,y+h+Math.sin(a)*.095,z),q,new THREE.Vector3(.095,.072,.035));petals[i%3].setMatrixAt(indices[i%3]++,matrix);}
   matrix.compose(new THREE.Vector3(x,y+h,z+.025),q,new THREE.Vector3(.05,.05,.035));centers.setMatrixAt(i,matrix);
  });
  for(const m of [...petals,centers,stems]){m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();}
 }
 if(L.biome==='forest'){
  const places=[];
  for(let i=0;i<30;i++){const x=10.5+(i%10)*.58,y=x<13?3:6.4;places.push([x,y+.04,-2.1-Math.floor(i/10)*.3]);}
  for(let i=0;i<12;i++)places.push([18+i*.32,6.45,-2.05-(i%3)*.23]);flowers(places);
  // A small hare sits on the broad branch behind the playable plane.
  const hare=group([15.6,6.45,-2.25]),fur=mat('#dfd7ba'),pink=mat('#dcae9e');hare.name='forest-hare';
  ball(hare,[0,.28,0],[.33,.29,.25],fur);ball(hare,[-.19,.56,.06],[.23,.22,.2],fur);ball(hare,[.31,.29,-.02],[.12,.12,.12],cream);
  for(const x of [-.34,-.12]){ball(hare,[x,.05,.12],[.13,.06,.12],fur);const ear=new THREE.Group();ear.position.set(x,.7,.025);hare.add(ear);ball(ear,[0,.17,0],[.065,.24,.07],fur);ball(ear,[0,.18,.055],[.033,.17,.015],pink);animated.push(ear);updates.push(t=>ear.rotation.z=Math.sin(t*1.1+x)*.075);}
  for(const x of [-.28,-.1])ball(hare,[x,.59,.245],[.021,.025,.018],ink);ball(hare,[-.2,.51,.26],[.03,.025,.025],pink);
  // One little songbird follows a short, bounded flight: scenery, never a moving hold.
  const bird=group([9.8,12.6,-2.4]),orange=mat('#d69a67');bird.name='forest-songbird';
  ball(bird,[0,0,0],[.19,.14,.13],orange);ball(bird,[.15,.08,0],[.12,.12,.1],cream);ball(bird,[.23,.1,.075],[.018,.02,.016],ink);
  const beak=mesh(new THREE.ConeGeometry(.045,.13,6),orange,[.3,.06,0],bird);beak.rotation.z=-Math.PI/2;beak.castShadow=false;
  const wings=[];for(const side of [-1,1]){const wing=ball(bird,[-.05,.025,side*.14],[.22,.035,.18],orange);wings.push(wing);animated.push(wing);}animated.push(bird);
  updates.push(t=>{bird.position.x=9.8+Math.sin(t*.26)*1.7;bird.position.y=12.6+Math.sin(t*.52)*.55;wings.forEach((wing,i)=>wing.rotation.x=Math.sin(t*5)*(i?1:-1)*.65);});
  // Broad little fern fans add a different silhouette from round canopy puffs.
  for(const [x,y]of [[11.2,3],[16.2,6.4],[20.5,6.4]])for(let i=0;i<5;i++){const frond=puff([x+(i-2)*.08,y+.14,-2.45],[.06,.33,.035],leaf);frond.rotation.z=(i-2)*.3;frond.castShadow=false;}
 }else if(L.biome==='campus'){
  const metal=mat('#526973'),stone=mat('#d7c6a6'),gold=mat('#d4ad67'),navy=mat('#536f85');
  const towerX=(L.bounds.x0+L.bounds.x1)/2-10,towerZ=-17.19,glass=mat('#8fb6c4');
  for(const x of [-1.55,1.55])box([towerX+x,8.3,towerZ],[.13,15.1,.07],cream).castShadow=false;
  for(const y of [7.2,10.5])for(const x of [-.82,.82]){
   box([towerX+x,y,towerZ+.04],[.72,1.35,.1],cream).castShadow=false;
   box([towerX+x,y,towerZ+.1],[.52,1.12,.06],glass).castShadow=false;
   box([towerX+x,y,towerZ+.15],[.045,1.12,.025],cream).castShadow=false;
   box([towerX+x,y,towerZ+.16],[.52,.045,.025],cream).castShadow=false;
  }
  // Benches, lanterns and planted tubs read as a university quad rather than anonymous blocks.
  for(const x of [4.2,20,29]){
   const bench=group([x,.2,-7.5]);for(let i=0;i<3;i++)parent(box([0,.45+i*.11,-.16],[1.5,.07,.07],wood),bench);parent(box([0,.27,.1],[1.65,.08,.48],wood),bench);
   for(const side of [-1,1])parent(box([side*.57,.1,.1],[.08,.35,.35],metal),bench);
  }
  const lampGlass=new THREE.MeshStandardMaterial({color:'#f7e7ac',emissive:'#d4a65f',emissiveIntensity:.28,roughness:.65});
  for(const x of [3.2,24.7,35.7]){
   mesh(new THREE.CylinderGeometry(.05,.085,3.2,8),metal,[x,1.6,-6]).castShadow=false;box([x,3.25,-6],[.36,.5,.36],metal).castShadow=false;box([x,3.27,-5.8],[.25,.32,.025],lampGlass).castShadow=false;
   const cap=mesh(new THREE.ConeGeometry(.32,.25,4),metal,[x,3.61,-6]);cap.rotation.y=Math.PI/4;cap.castShadow=false;
  }
  for(const [x,y]of [[7.6,1.5],[10.2,1.5],[16.5,4.8],[22.6,4.8]]){
   box([x,y+.16,-2.45],[.85,.32,.55],stone);for(let j=-1;j<=1;j++)puff([x+j*.2,y+.43,-2.45],[.24,.23,.21],leaf).castShadow=false;
  }
  flowers(Array.from({length:18},(_,i)=>[16.2+(i%9)*.09,5.28,-2.23-Math.floor(i/9)*.2]));
  // Drainpipes, roof vents and stone quoins give the existing building a human scale.
  for(const [x,top]of [[14.7,4.65],[34.8,12.85],[38.8,16.85]]){
   mesh(new THREE.CylinderGeometry(.035,.035,top,8),metal,[x,top/2,1.76]).castShadow=false;
   for(let y=.65;y<top;y+=1.05)box([x-.16,y,1.77],[.4,.18,.055],stone).castShadow=false;
  }
  for(const x of [18.2,21.4]){box([x,5.05,-3],[.6,.4,.6],metal).castShadow=false;box([x,5.3,-3],[.85,.1,.8],navy).castShadow=false;}
  // Banners move in the breeze; their cloth never participates in collision or grip targeting.
  for(const x of [12.6,20.5]){
   const g=new THREE.PlaneGeometry(.68,1.25,5,8),banner=mesh(g,navy,[x,3.2,1.82]);banner.name='campus-banner';banner.material=navy.clone();banner.material.side=THREE.DoubleSide;banner.castShadow=false;
   box([x,3.87,1.84],[.95,.045,.045],gold).castShadow=false;
   const base=new Float32Array(g.attributes.position.array);updates.push(t=>{const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,base[i*3+2]+Math.sin(t*1.6+base[i*3]*4)*.06*(.65-base[i*3+1]));p.needsUpdate=true;});
   const badge=mesh(new THREE.CircleGeometry(.15,5),cream,[x,3.22,1.9]);badge.castShadow=false;
  }
 }else{
  // A few icicles along background outcrops, safely behind all reachable holds.
  const ice=mat('#c5e1e6');for(let i=0;i<(phone?8:16);i++){const x=L.bounds.x0+(i%8)*7+.3*(Math.floor(i/8)?1:-1),y=5.3+(i%8%3)*3;const m=mesh(new THREE.ConeGeometry(.055,.4+(i%3)*.12,7),ice,[x,y,-7.1]);m.rotation.z=Math.PI;m.castShadow=false;}
 }
 let lastTime=NaN;
 return {animated,update(t){if(t===lastTime)return;lastTime=t;for(const update of updates)update(t);}};
}
