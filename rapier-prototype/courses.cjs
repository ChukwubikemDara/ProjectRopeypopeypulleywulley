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
 if(c.routes?.shortcut){const r=c.routes.shortcut;if(!r.id||r.path?.length<2||!r.holdIds?.length||r.holdIds.some(id=>!ids.has(id)))throw Error('Shortcut needs a path and existing holds');}
 return c;
}
const mountain=prepareCourse({...source,id:'mountain',biome:'snow',kind:'race',name:'Snowbound · The Long Way Up',source:'main 8f94284 / complete course',routes:{shortcut:{id:'pipe-roof',name:'Over the pipe',holdIds:source.holds.filter(h=>h.kind==='knob'&&h.x<20).map(h=>h.id),path:[[4,1],[7,5],[20,11],[25,9.2]]}}});
// The prologue: a short narrated climb that teaches by doing. Each section needs the move it introduces;
// falling only ever drops you back a section, never to the start.
// A plain hop lifts the feet about 2.5 m, so the trench (3.2 m) needs a grip and the wall (4.2 m) needs the combo.
const practice=prepareCourse({id:'practice',biome:'snow',kind:'practice',name:'Prologue · The Foot of the Mountain',
 bounds:{x0:-2,x1:30,y0:-4,y1:14},spawn:{x0:.6,x1:2.6,y:0},finish:{x:26.5,y:5.6,zoneX:25.7},
 terrain:[
  {id:'meadow',kind:'rock',pts:[[-2,-4],[7,-4],[7,0],[-2,0]]},
  {id:'step',kind:'rock',pts:[[7,-4],[10,-4],[10,1.4],[7,1.4]]},          // first hop
  {id:'trench',kind:'rock',pts:[[10,-4],[14,-4],[14,-1.8],[10,-1.8]]},    // too deep to hop out of: grab the wall knobs
  {id:'shelf',kind:'rock',pts:[[14,-4],[18,-4],[18,1.4],[14,1.4]]},
  {id:'wall',kind:'rock',pts:[[18,-4],[30,-4],[30,5.6],[18,5.6]]},        // too tall to hop: hang, then hop + let go together
  {id:'left-edge',kind:'boundary',pts:[[-2,-4],[-1,-4],[-1,13],[-2,13]]},
  {id:'right-edge',kind:'boundary',pts:[[29,-4],[30,-4],[30,13],[29,13]]}],
 holds:[
  {id:'bar-1',x:10.7,y:3.6,kind:'handle'},{id:'bar-2',x:11.6,y:3.6,kind:'handle'},{id:'bar-3',x:12.5,y:3.6,kind:'handle'},{id:'bar-4',x:13.4,y:3.6,kind:'handle'},
  {id:'trench-lip',x:13.9,y:1.55,kind:'knob'},
  {id:'wall-low',x:17.85,y:3.1,kind:'rung'},{id:'wall-high',x:17.85,y:3.9,kind:'rung'},
  {id:'wall-lip',x:18.1,y:5.68,kind:'knob'},{id:'summit-knob',x:19.4,y:5.72,kind:'knob'}],
 objects:[{id:'practice-dummy',kind:'dummy',w:.65,h:1,x0:23,x1:23,y:6.15,speed:0,handles:[]}],
 path:[[1,1],[7,1],[8.5,2.4],[12,2.4],[16,2.4],[17.6,3.8],[19,6.6],[26.5,6.6]],
 signs:[],
 // Reset stance drops the team back at the start of their current section.
 stations:{meadow:{x:1.6,y:1.05},step:{x:7.6,y:2.45},shelf:{x:14.6,y:2.45},summit:{x:19.2,y:6.65}},
 zones:[
  {id:'meadow',x0:-1,x1:7,y0:-1,y1:4},{id:'step',x0:7,x1:10,y0:1.2,y1:5},{id:'trench',x0:10,x1:14,y0:-2,y1:-.6},
  {id:'shelf',x0:14,x1:18,y0:1.2,y1:5},{id:'wall',x0:17,x1:18.2,y0:2.6,y1:5.6},{id:'summit',x0:18,x1:29,y0:5.4,y1:13}]
});
const races=require('./race-courses.cjs');
const forest=prepareCourse(races.forest),campus=prepareCourse(races.campus);
const all=[mountain,forest,campus,practice];
const planned=[{id:'forest',name:'Forest · Roots to canopy',biome:'forest',kind:'race',available:false},{id:'campus',name:'Campus · Old Main',biome:'campus',kind:'race',available:false}];
function catalog(definitions=all){return[...definitions.map(c=>({id:c.id,name:c.name,biome:c.biome,kind:c.kind,available:true})),...planned.filter(p=>!definitions.some(c=>c.id===p.id))];}
function nextRace(id,definitions=all){const races=definitions.filter(c=>c.kind==='race');const i=races.findIndex(c=>c.id===id);return races[(i+1+races.length)%races.length]?.id;}
module.exports={mountain,forest,campus,practice,all,catalog,nextRace,prepareCourse,validateCourse};
