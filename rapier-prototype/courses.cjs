// Course definitions are plain data. Physics and renderers consume the same validated geometry.
const source=require('./course-source.cjs');
function prepareCourse(data){
 const course=structuredClone(data);course.depth??=3.4;course.centered=true;course.objects??=[];course.signs??=[];
 course.holds=course.holds.map(h=>({...h,z:h.z??0}));
 for(const o of course.objects)for(const [i,[x,y]]of (o.handles||[]).entries())course.holds.push({id:`${o.id}:${i}`,x:o.x0+x,y:o.y+y,z:0,kind:'handle',objectId:o.id,local:{x,y,z:0}});
 if(course.kind==='race'){course.routes??={};course.routes.main={name:'Main route',path:structuredClone(course.path)};}
 validateCourse(course);return course;
}
function validateCourse(c){
 if(!c.id||!c.name||!Array.isArray(c.path)||c.path.length<2||!c.terrain?.length)throw Error('Course needs an id, name, terrain and racing path');
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 if(![c.spawn?.x0,c.spawn?.x1,c.spawn?.y,c.bounds?.x0,c.bounds?.x1,c.bounds?.y0,c.bounds?.y1,c.finish?.x,c.finish?.y,c.finish?.zoneX,c.depth].every(finite)||c.bounds.x0>=c.bounds.x1||c.bounds.y0>=c.bounds.y1||c.depth<=0)throw Error('Invalid course bounds/spawn/finish');
 for(const t of c.terrain)if(t.pts.length<3||t.pts.some(p=>p.length!==2||!p.every(finite)))throw Error('Invalid terrain polygon');
 for(const t of c.terrain){let direction=0;for(let i=0;i<t.pts.length;i++){const a=t.pts[i],b=t.pts[(i+1)%t.pts.length],d=t.pts[(i+2)%t.pts.length],cross=(b[0]-a[0])*(d[1]-b[1])-(b[1]-a[1])*(d[0]-b[0]);if(Math.abs(cross)<1e-8)continue;const sign=Math.sign(cross);if(direction&&sign!==direction)throw Error('Terrain pieces must be convex');direction=sign;}if(!direction)throw Error('Terrain polygon has zero area');}
 for(let i=0;i<c.path.length;i++){const p=c.path[i];if(!p.every(finite)||p.length!==2||i&&Math.hypot(p[0]-c.path[i-1][0],p[1]-c.path[i-1][1])===0)throw Error('Invalid racing path');}
 const ids=new Set();for(const h of c.holds){if(ids.has(h.id)||![h.x,h.y,h.z].every(finite))throw Error('Invalid or duplicate hold');ids.add(h.id);}
 for(const o of c.objects)if(![o.x0,o.x1,o.y,o.w,o.h,o.speed].every(finite)||o.x1<o.x0||o.w<=0||o.h<=0)throw Error('Invalid course object');
 if(c.routes?.shortcut){const r=c.routes.shortcut;if(!r.id||r.path?.length<2||!Array.isArray(r.holdIds)||r.holdIds.some(id=>!ids.has(id)))throw Error('Shortcut needs a path, and its holds (if any) must exist');}
 return c;
}
const mountain=prepareCourse({...source,id:'mountain',biome:'snow',kind:'race',name:'Snowbound · The Long Way Up',source:'main 8f94284 / complete course',routes:{shortcut:{id:'pipe-roof',name:'Over the pipe',holdIds:[],path:[[4,1],[7,5],[20,11],[25,9.2]]}}});
// The prologue: a short narrated climb that teaches by doing. Each section needs the move it introduces;
// falling only ever drops you back a section, never to the start.
// The prologue, built around the script. Two mirrored lanes (left team, right team) climb toward a
// shared start platform in the middle, marked with a flag, where they wait for the race. A plain hop lifts
// the feet about 2.5 m, so each obstacle is sized to need the move its narration introduces:
// the 3 m ledge needs a grab, the gap needs the bar, the wall at the end of the beam needs the combo.
const mirrorX=pts=>pts.map(([x,y])=>[-x,y]).reverse();
const lane={
 terrain:[
  {id:'wake',kind:'rock',pts:[[-36,-4],[-21,-4],[-21,0],[-36,0]]},                 // wake-up spot + the flat walk
  {id:'ledge',kind:'rock',pts:[[-21,-4],[-15,-4],[-15,3],[-21,3]]},                // too high to hop: arms grab, legs push
  {id:'return-ramp',kind:'rock',pts:[[-15,-4],[-10.5,-4],[-10.5,2],[-15,1.4]]},     // fall in the gap: it slides you back to the ledge
  {id:'landing',kind:'rock',pts:[[-10.5,-4],[-9,-4],[-9,5.6],[-10.5,5.6]]},
  {id:'beam',kind:'bark',pts:[[-9,5.3],[-4,5.3],[-4,5.6],[-9,5.6]]},
  {id:'under-beam',kind:'rock',pts:[[-9,-4],[-4,-4],[-4,2.6],[-9,2.6]]},
  {id:'edge',kind:'boundary',pts:[[-37,-4],[-36,-4],[-36,16],[-37,16]]}],
 holds:[
  {id:'ledge-lip',x:-20.95,y:3.08,kind:'knob',hint:'grab'},
  {id:'gap-bar',x:-13.2,y:6.4,kind:'handle'},
  {id:'wall-low',x:-4.15,y:7.3,kind:'rung'},{id:'wall-high',x:-4.15,y:8.1,kind:'rung'},
  {id:'top-lip',x:-3.9,y:9.88,kind:'knob'}],
 markers:[{x:-15.6,y:4.9,kind:'jump'}],
 signs:[{x:-31,y:3.2,text:'TWO PEOPLE REQUIRED.',sub:'ONE PERSON PROVIDED.'}],
};
const both=(list,map)=>[...list,...list.map(map)];
const practice=prepareCourse({id:'practice',biome:'snow',kind:'practice',name:'Prologue · Two People Required',mirror:true,fallEvent:1.2,
 bounds:{x0:-37,x1:37,y0:-4,y1:16},spawn:{x0:-33.5,x1:-31.5,y:0},spawns:[{x0:-33.5,x1:-31.5,y:0},{x0:31.5,x1:33.5,y:0}],finish:{x:0,y:9.8,zoneX:-4},
 terrain:[...both(lane.terrain,t=>({...t,id:t.id+'-r',pts:mirrorX(t.pts)})),
  {id:'start-platform',kind:'rock',pts:[[-4,-4],[4,-4],[4,9.8],[-4,9.8]]}],          // a flag in the middle marks the end of the prologue
 holds:both(lane.holds,h=>({...h,id:h.id+'-r',x:-h.x})),
 markers:both(lane.markers,m=>({...m,x:-m.x})),
 signs:both(lane.signs,s=>({...s,x:-s.x})),
 objects:[],
 // left-lane coordinates; the right lane is measured as its mirror image
 path:[[-33,1],[-21.5,1],[-18,4],[-12.8,5.6],[-9.7,6.6],[-4.6,6.6],[-3,10.8]],
 // section reset: back to the start of the section you're in
 stations:{wake:{x:-33,y:1.05},ledge:{x:-17,y:4.05},landing:{x:-9.8,y:6.65},platform:{x:-2.5,y:10.85}},
 // where each place line triggers, and `still`: where someone has to be for it to still make sense when its turn comes
 zones:[
  {id:'walk',x0:-28,x1:-24,y0:-1,y1:4,still:{x0:-36,x1:-4,y0:-1,y1:9}}, // 'trust' is a general musing: it still fits anywhere on the lane
  {id:'ledge',x0:-23.5,x1:-21,y0:-1,y1:2.6,still:{x0:-25,x1:-20.6,y0:-1,y1:4.4}},
  {id:'gap',x0:-18,x1:-15,y0:2.8,y1:8,still:{x0:-21,x1:-11.5,y0:1,y1:8}},
  {id:'beam',x0:-9.5,x1:-5,y0:5.4,y1:9,still:{x0:-10.5,x1:-4,y0:5,y1:10.2}}]
});
const races=require('./race-courses.cjs');
const forest=prepareCourse(races.forest),campus=prepareCourse(races.campus);
const all=[mountain,forest,campus,practice];
const planned=[{id:'forest',name:'Forest · Roots to canopy',biome:'forest',kind:'race',available:false},{id:'campus',name:'Campus · Old Main',biome:'campus',kind:'race',available:false}];
function catalog(definitions=all){return[...definitions.map(c=>({id:c.id,name:c.name,biome:c.biome,kind:c.kind,available:true})),...planned.filter(p=>!definitions.some(c=>c.id===p.id))];}
function nextRace(id,definitions=all){const races=definitions.filter(c=>c.kind==='race');const i=races.findIndex(c=>c.id===id);return races[(i+1+races.length)%races.length]?.id;}
module.exports={mountain,forest,campus,practice,all,catalog,nextRace,prepareCourse,validateCourse};
