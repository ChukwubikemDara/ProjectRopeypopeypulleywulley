import * as THREE from 'three';
// All props belong to the level root, so course changes dispose their GPU resources.
export function decorateBiome(L,{mesh,puff,box,prism,mat,rock,snow,wood,dark}){
 const cylinder=(a,b,r,material)=>{const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),m=mesh(new THREE.CylinderGeometry(r*.75,r,A.distanceTo(B),12),material,A.clone().add(B).multiplyScalar(.5).toArray());m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),B.sub(A).normalize());return m;};
 if(L.biome!=='snow')for(const t of L.terrain.filter(t=>t.kind==='boundary')){const x=t.id==='finish-stop'?t.pts[0][0]:t.pts[1][0],top=t.pts[2][1];box([x,top-.9,0],[.18,1.8,L.depth],wood);for(const z of [-L.depth/2,L.depth/2])box([x,top-.6,z],[.25,2.4,.25],wood);}
 const leaf=mat('#79a681'),leafLight=mat('#a5c88c'),bark=mat('#8a6954');
 function tree(x,y,z,h,scale=1){
  cylinder([x,y,z],[x+.25,y+h,z],.65*scale,bark);
  for(let i=0;i<4;i++){const side=i%2?1:-1,by=y+h*.48+i*h*.11,bx=x+side*(1.5+i*.35)*scale;cylinder([x,by,z],[bx,by+1.5*scale,z],.24*scale,bark);puff([bx,by+2*scale,z],[2.4*scale,1.5*scale,1.8*scale],i%2?leaf:leafLight);}
  puff([x,y+h,z],[2.5*scale,2*scale,2.2*scale],leaf);
 }
 if(L.biome==='forest'){
  const distant=mat('#86a8a0'),mid=mat('#68958b');
  for(let layer=0;layer<2;layer++)for(let i=0;i<12;i++){
   const x=-12+i*5+layer*2,z=-18-layer*14,h=22+Math.sin(i*2.3)*5,m=mesh(new THREE.CylinderGeometry(.4,.75,h,8),layer?distant:mid,[x,h/2-2,z]);m.castShadow=false;
   puff([x,h-1,z],[4,3,3],layer?distant:mid).castShadow=false;
  }
  for(const [x,y,h,s]of [[0,-1,13,.8],[13,0,15,1.3],[23,2,15,1],[33,7,14,1.2],[40,0,17,1]])tree(x,y,-4.5,h,s);
  // The same continuous contour becomes one enormous root-and-bough system.
  for(const t of L.terrain)if(t.kind==='bark'){
   const top=t.pts.slice(2).reverse();const [a,b]=top;
   cylinder([a[0],a[1]-.22,-.6],[b[0],b[1]-.22,-.6],.43,wood);
   for(let x=Math.min(a[0],b[0])+.4;x<Math.max(a[0],b[0]);x+=1.6){const y=a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);puff([x,y-.04,-1.5],[.8,.11,.42],leafLight);}
   // Bark seams add depth without putting false holds on the playable face.
   const topY=Math.min(a[1],b[1]),bottomY=Math.max(t.pts[0][1],t.pts[1][1]);for(let x=Math.min(a[0],b[0])+.7;x<Math.max(a[0],b[0]);x+=1.5)cylinder([x,bottomY+.12,1.73],[x+.12,Math.max(bottomY+.2,topY-.2),1.73],.025,bark);
  }
  const vine=mat('#507c67');for(const h of L.holds.filter(h=>h.id.startsWith('vine-')))cylinder([h.x-.5,h.y+2,-2.3],[h.x,h.y,-.15],.035,vine);
  for(let i=0;i<22;i++){const x=-1+i*1.8,y=0;for(const side of [-1,1]){const m=puff([x+side*.22,y+.17,2.5],[.12,.45,.06],i%2?leaf:leafLight);m.rotation.z=side*.65;}}
  const glow=mesh(new THREE.PlaneGeometry(1.8,30),new THREE.MeshBasicMaterial({color:'#fff6c4',transparent:true,opacity:.055,depthWrite:false,side:THREE.DoubleSide}),[15,14,-12]);glow.rotation.z=-.32;glow.castShadow=glow.receiveShadow=false;
 }else if(L.biome==='campus'){
  const stone=mat('#ead8b4'),trim=mat('#fff0ce'),windowMat=mat('#7daabb'),navy=mat('#4f6477'),gold=mat('#d9ad69');
  box([21,2.7,-4],[32,5.4,4],stone);
  for(let x=7;x<36;x+=2.6)for(const y of [1.4,3.8]){box([x,y,-1.94],[.95,1.5,.12],navy);box([x,y,-1.84],[.73,1.28,.12],windowMat);box([x,y,-1.74],[.06,1.3,.04],trim);box([x,y,-1.73],[.76,.05,.04],trim);}
  for(const y of [.3,4.7,5.5])box([21,y,-2.2],[33,.22,1],trim);
  // A portico and central clock pavilion evoke Old Main without copying its facade.
  for(const x of [7.2,9.6,12,14.4]){cylinder([x,.2,-1.9],[x,4.4,-1.9],.27,trim);box([x,.25,-1.9],[.8,.24,.8],stone);box([x,4.45,-1.9],[.8,.22,.8],stone);}
  const pediment=prism([[6,4.65],[15.5,4.65],[10.75,6.6]],.5,trim);pediment.position.z=-2.2;
  box([10.75,4.45,-1.45],[4.7,.48,.1],navy);
  const roof=prism([[15,5.6],[35,5.6],[30,9],[24,9]],3.5,navy);roof.position.z=-4;
  box([35,10,-4],[7,12,4],stone);for(const y of [9,13,16.4])box([35,y,-2.4],[7.5,.28,1],trim);
  for(const x of [33,35,37])box([x,11.4,-1.91],[.85,1.7,.12],windowMat);
  const face=mesh(new THREE.CylinderGeometry(1.25,1.25,.12,40),navy,[35,14.65,-1.82]);face.rotation.x=Math.PI/2;
  mesh(new THREE.CircleGeometry(1.08,40),trim,[35,14.65,-1.73]);
  for(let i=0;i<12;i++){const a=i*Math.PI/6,m=box([35+Math.sin(a)*.88,14.65+Math.cos(a)*.88,-1.65],[.065,.16,.04],navy);m.rotation.z=-a;}
  cylinder([35,14.65,-1.6],[34.55,15.05,-1.6],.035,navy);cylinder([35,14.65,-1.58],[35.65,15.15,-1.58],.025,navy);
  for(const x of [32.5,34.2,35.8,37.5])cylinder([x,16.6,-3],[x,18.5,-3],.15,trim);
  const cupola=mesh(new THREE.ConeGeometry(4,2,4),navy,[35,19.4,-3]);cupola.rotation.y=Math.PI/4;cylinder([35,20.4,-3],[35,21.7,-3],.05,gold);puff([35,21.6,-3],[.15,.15,.15],gold);
  // Stone joints and sill bands follow the collision silhouette, including the roof climb.
  for(const t of L.terrain)if(t.kind==='stone'){
   const x0=t.pts[0][0],x1=t.pts[1][0],top=t.pts[2][1];box([(x0+x1)/2,top-.12,1.73],[x1-x0,.18,.12],trim);
   for(let y=1;y<top-.4;y+=1.1)box([(x0+x1)/2,y,1.72],[x1-x0,.018,.025],stone);
   for(let x=x0+1;x<x1-.5;x+=2.2)for(let y=1.7;y<top-1;y+=2.6){box([x,y,1.77],[.88,1.25,.12],trim);box([x,y,1.85],[.67,1.05,.08],windowMat);box([x,y,1.91],[.055,1.05,.035],trim);box([x,y,1.92],[.67,.045,.035],trim);}
  }
  const route=L.routes.shortcut.path,curve=new THREE.CatmullRomCurve3(route.map(([x,y])=>new THREE.Vector3(x,y,-.35)));mesh(new THREE.TubeGeometry(curve,40,.025,6,false),gold);
  for(let i=1;i<route.length-1;i++){const [x,y]=route[i],m=mesh(new THREE.ConeGeometry(.23,.5,3),i%2?navy:gold,[x,y-.35,-.5]);m.rotation.z=Math.PI;}
  for(let i=0;i<10;i++){const h=4+(i%3)*1.4;box([-9+i*7,h/2,-23],[4.5,h,4],mat(i%2?'#b7c6cd':'#abbac6'));}
  for(const x of [0,4,20,29,42])tree(x,0,-9,5,.7);
 }else{
  // Extra rock faces turn the distant sawtooth silhouettes into layered alpine peaks.
  const shades=['#9eb9c5','#afc8d0','#c3d7dc'];
  for(let i=0;i<9;i++){const x=-10+i*9,h=12+Math.sin(i*2)*5,z=-14-(i%3)*8,r=5+(i%3),m=mesh(new THREE.ConeGeometry(r,h,9),mat(shades[i%3]),[x,h/2+3,z]);m.rotation.y=i*.7;const cap=mesh(new THREE.ConeGeometry(r*.37,h*.37,9),snow,[x,3+h*.815,z]);cap.rotation.y=m.rotation.y;}
 }
}
