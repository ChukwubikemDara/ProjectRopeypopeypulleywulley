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
const practice=prepareCourse({id:'practice',biome:'snow',kind:'practice',name:'Base Camp · Practice together',
 bounds:{x0:-2,x1:17,y0:-2,y1:8},spawn:{x0:.8,x1:2.4,y:0},finish:{x:15.5,y:0,zoneX:15},
 terrain:[{kind:'rock',pts:[[-2,-2],[17,-2],[17,0],[-2,0]]},{kind:'rock',pts:[[3.5,0],[5.2,0],[5.2,1.2],[3.5,1.2]]},{kind:'boundary',pts:[[-2,-2],[-1,-2],[-1,7],[-2,7]]},{kind:'boundary',pts:[[16.5,-2],[17,-2],[17,7],[16.5,7]]}],
 holds:[{id:'first-left',x:2.1,y:1.75,kind:'knob'},{id:'first-right',x:2.65,y:1.75,kind:'knob'},
 {id:'bar-left',x:5.8,y:3.5,kind:'handle'},{id:'bar-right',x:6.35,y:3.5,kind:'handle'},{id:'bar-next',x:7.2,y:3.5,kind:'handle'}],
 objects:[{id:'practice-dummy',kind:'dummy',w:.65,h:1,x0:12,x1:12,y:.55,speed:0,handles:[]}],
 path:[[1,1],[4,2.2],[6.1,2.7],[9,1],[15.5,1]],
 signs:[{x:2.4,y:3.3,text:'AIM + GRAB',sub:'Tilt toward a hold. Hold a thumb pad.'},{x:6.1,y:5.2,text:'BETTER TOGETHER',sub:'Legs hop. Arms release. Both laugh.'},{x:12,y:3.2,text:'KICK STATION',sub:'Your very patient training partner.'}],
 stations:{aim:{x:1.6,y:1.05},grip:{x:2.35,y:1.05},hop:{x:2.35,y:1.05},combo:{x:6.1,y:2.6},kick:{x:11.45,y:1.05}}
});
const races=require('./race-courses.cjs');
const forest=prepareCourse(races.forest),campus=prepareCourse(races.campus);
const all=[mountain,forest,campus,practice];
const planned=[{id:'forest',name:'Forest · Roots to canopy',biome:'forest',kind:'race',available:false},{id:'campus',name:'Campus · Old Main',biome:'campus',kind:'race',available:false}];
function catalog(definitions=all){return[...definitions.map(c=>({id:c.id,name:c.name,biome:c.biome,kind:c.kind,available:true})),...planned.filter(p=>!definitions.some(c=>c.id===p.id))];}
function nextRace(id,definitions=all){const races=definitions.filter(c=>c.kind==='race');const i=races.findIndex(c=>c.id===id);return races[(i+1+races.length)%races.length]?.id;}
module.exports={mountain,forest,campus,practice,all,catalog,nextRace,prepareCourse,validateCourse};
