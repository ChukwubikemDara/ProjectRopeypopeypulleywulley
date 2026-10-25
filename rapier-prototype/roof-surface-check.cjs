// Regression: a second roof extrusion once drew a coplanar top, producing z-fighting.
// Exercise the actual renderer's terrain call site with real Three.js geometry.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),THREE=require('three');
const {campus}=require('./courses.cjs');
const source=fs.readFileSync(path.join(__dirname,'client/render.js'),'utf8');
const prismSource=source.slice(source.indexOf('function prism('),source.indexOf('\nlet level='));
const terrainSource=source.slice(source.indexOf(' for(const t of L.terrain.filter'),source.indexOf(' if(L.pipe)'));
const scene=new THREE.Group(),materials=Object.fromEntries(['metal','rust','rock','dark','wood','snow'].map(key=>[key,new THREE.MeshBasicMaterial()]));
try{
 vm.runInNewContext(prismSource+'\n'+terrainSource,{THREE,L:campus,...materials,mat:()=>new THREE.MeshBasicMaterial(),mesh:(geometry,material)=>{const m=new THREE.Mesh(geometry,material);scene.add(m);return m;}});
 scene.updateMatrixWorld(true);
 for(const x of [24.1,27,29.9,30.1,31.5,32.9])for(const z of [-1.6,0,1.6]){
  const top=x<30?4.8+(x-24)*.7:9,ray=new THREE.Raycaster(new THREE.Vector3(x,top+1,z),new THREE.Vector3(0,-1,0));
  const hits=ray.intersectObjects(scene.children,false).filter(h=>Math.abs(h.point.y-top)<.001&&h.face.normal.y>.1);
  assert.equal(new Set(hits.map(h=>h.object.uuid)).size,1,`Roof at x=${x}, z=${z} must have one visible top surface, without overlapping roof skins`);
  assert.equal(hits[0].object.material[hits[0].face.materialIndex],materials.dark,'Top remains the dark roof material');
 }
 const facade=new THREE.Raycaster(new THREE.Vector3(27,2,8),new THREE.Vector3(0,0,-1)).intersectObjects(scene.children,false)[0];assert.equal(facade.object.material[facade.face.materialIndex],materials.rock,'Front facade remains cream stone');
 console.log('PASS campus ramp and landing have a single render surface across their full width');
}finally{scene.traverse(o=>o.geometry?.dispose());Object.values(materials).forEach(m=>m.dispose());}
