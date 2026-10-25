// Real Three.js scene objects, without a GPU: test ambient motion, budgets and cleanup.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const threeUrl=pathToFileURL(path.join(path.dirname(require.resolve('three')),'three.module.js')).href;
 const THREE=await import(threeUrl),characterUrl=pathToFileURL(path.join(__dirname,'../public/js/alpine-character.js')).href;
 const source=fs.readFileSync(path.join(__dirname,'client/ambience.js'),'utf8').replace("'three'",JSON.stringify(threeUrl)).replace("'/js/alpine-character.js'",JSON.stringify(characterUrl));
 const {createAmbience}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 global.document={createElement:()=>({getContext:()=>({createLinearGradient:()=>({addColorStop(){}}),fillRect(){}})})};
 function build(course,phone){
  const root=new THREE.Group(),ball=new THREE.SphereGeometry(1,8,6),mat=color=>new THREE.MeshStandardMaterial({color});
  const mesh=(geo,material,pos,parent=root)=>{const m=new THREE.Mesh(geo,material);if(pos)m.position.set(...pos);parent.add(m);return m;};
  const puff=(pos,scale,material)=>{const m=mesh(ball,material,pos);m.scale.set(...scale);return m;},box=(pos,scale,material)=>mesh(new THREE.BoxGeometry(...scale),material,pos);
  const ambience=createAmbience(course,{mesh,puff,box,mat,phone,root});root.traverse(o=>{o.updateMatrix();o.matrixAutoUpdate=false;});ambience.activate();
  return {root,ambience,ball};
 }
 const {mountain,forest,campus}=require('./courses.cjs');
 const positions=root=>{const result=[];root.traverse(o=>result.push(...o.position.toArray(),...o.rotation.toArray().slice(0,3)));return result;};
 for(const course of [mountain,forest,campus]){
  const desktop=build(course,false),phone=build(course,true);
  try{
   const A=desktop.ambience;A.update(1,{reduced:false,lobby:true});const before=positions(desktop.root);A.update(25,{reduced:false,lobby:true});assert.notDeepEqual(positions(desktop.root),before,'Ambient props must actually move');
   assert.ok(desktop.root.children.some(o=>o.matrixAutoUpdate),'Animated transforms must opt out of the renderer static freeze');
   A.update(40,{reduced:true,lobby:true});const still=positions(desktop.root),stillActors=positions(A.hero);A.update(80,{reduced:true,lobby:true});assert.deepEqual(positions(desktop.root),still,'Reduced-motion scenery must remain still');assert.deepEqual(positions(A.hero),stillActors,'Reduced-motion actors remain still too');
   const particles=desktop.root.children.find(o=>o.isPoints),mobileParticles=phone.root.children.find(o=>o.isPoints);assert.equal(particles.visible,false);assert.equal(particles.geometry.attributes.position.count,100);assert.equal(mobileParticles.geometry.attributes.position.count,40);
   assert.equal(phone.ambience.hero.children.length,1,'Phones do not allocate decorative character models');A.update(90,{reduced:false,lobby:false});assert.equal(A.hero.visible,false,'Menu actors must disappear for races/prologue');
   let disposed=false;A.sky.addEventListener('dispose',()=>disposed=true);A.dispose();assert.ok(disposed,'Sky texture is disposed between maps');
   console.log(`PASS ${course.id}: real scene animation, static-freeze opt-out, reduced motion, capped mobile particles, lobby-only actors and sky cleanup`);
  }finally{
   phone.ambience.dispose();for(const item of [desktop,phone]){const geos=new Set(),mats=new Set();item.root.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)mats.add(o.material);});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());item.root.clear();item.ball.dispose();}
  }
 }
 delete global.document;
})().catch(e=>{console.error(e);process.exitCode=1;});
