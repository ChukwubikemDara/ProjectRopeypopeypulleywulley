// Collision silhouettes and route cues share coordinates with the scenery renderer.
const block=(id,kind,x0,x1,base,top)=>({id,kind,pts:[[x0,base],[x1,base],[x1,top],[x0,top]]});
const ramp=(id,kind,x0,y0,x1,y1,base)=>({id,kind,pts:[[x0,base],[x1,base],[x1,y1],[x0,y0]]});
const beam=(id,kind,x0,y0,x1,y1,thickness=.65)=>({id,kind,pts:[[x0,y0-thickness],[x1,y1-thickness],[x1,y1],[x0,y0]]});
const climb=(prefix,x,from,to)=>Array.from({length:Math.ceil((to-from)/.65)+1},(_,i)=>({id:`${prefix}-${i}`,kind:'rung',x,y:Math.min(to,from+i*.65)}));
const forest={id:'forest',biome:'forest',kind:'race',progressTolerance:2,name:'Forest · Branch Management',
 bounds:{x0:-2,x1:38,y0:-2,y1:19},spawn:{x0:.5,x1:2.5,y:0},finish:{x:36,y:13.5,zoneX:35.2},
 terrain:[block('entry-stop','boundary',-3,-1.6,-2,1.8),block('finish-stop','boundary',37.8,39,0,15.5),block('floor','moss',-3,39,-2,0),ramp('roots','bark',4,0,10,3,0),block('root-rest','bark',10,13,0,3),
 block('trunk-step','bark',13,17,4.8,6.4),beam('branch-walk','bark',17,6.4,23,6.4),beam('rising-bough','bark',23,6.4,29,10),
 beam('canopy-rest','bark',29,10,32,10),block('crown','bark',32,34,11.9,13.5),beam('finish-bough','bark',34,13.5,38,13.5),beam('catch-bough','bark',17,2.6,29,2.6)],
 holds:[...climb('trunk',12.78,4.3,6.65),{id:'trunk-lip',kind:'knob',x:13.35,y:6.55},
 ...climb('crown',31.78,11.3,13.75),{id:'crown-lip',kind:'knob',x:32.4,y:13.65},
 {id:'vine-0',kind:'handle',x:10.4,y:5.2},{id:'vine-1',kind:'handle',x:11.9,y:6.7},
 {id:'vine-2',kind:'twig',x:13.5,y:8.3,breakMs:2400,regrowMs:6500},{id:'vine-3',kind:'handle',x:15.3,y:8.3}],
 path:[[1,1],[4,1],[10,4],[12,4],[12,7.4],[17,7.4],[23,7.4],[29,11],[31,11],[31,14.5],[36,14.5]],
 routes:{shortcut:{id:'vine-cut',name:'The vine line',holdIds:['vine-0','vine-1','vine-2','vine-3'],path:[[10,4],[10.4,5.2],[11.9,6.7],[13.5,8.3],[15.3,8.3],[18,7.4]]}},
 sections:[{name:'Roots',x:6,y:1},{name:'Trunk',x:13,y:5},{name:'Branches',x:21,y:6.4},{name:'Canopy',x:33,y:13.5}],
 signs:[{x:8,y:6.4,text:'TAKE THE SCENIC ROOT',sub:'Vines above. Patience below.'},{x:24,y:11,text:'BRANCH MANAGEMENT',sub:'The promotion comes with a climb.'}],objects:[]};
const campus={id:'campus',biome:'campus',kind:'race',progressTolerance:2,name:'Campus · Old Main, New Heights',
 bounds:{x0:-2,x1:40,y0:-2,y1:22},spawn:{x0:.5,x1:2.4,y:0},finish:{x:38,y:17,zoneX:37.2},
 terrain:[block('entry-stop','boundary',-3,-1.6,-2,1.8),block('finish-stop','boundary',39.8,41,0,19),block('lawn','grass',-3,41,-2,0),ramp('entry','stone',3,0,7,1.5,0),block('porch','stone',7,11,0,1.5),
 block('facade-low','stone',11,15,0,4.8),block('cornice','stone',15,24,0,4.8),ramp('roof','roof',24,4.8,30,9,0),
 block('roof-rest','roof',30,33,0,9),block('tower-low','stone',33,36,0,13),block('tower-high','stone',36,40,0,17)],
 holds:[...climb('facade',10.78,2.8,5.05),{id:'facade-lip',kind:'knob',x:11.4,y:4.95},
 ...climb('tower-low',32.78,10.3,13.25),{id:'tower-low-lip',kind:'knob',x:33.4,y:13.15},
 ...climb('tower-high',35.78,14.3,17.25),{id:'tower-high-lip',kind:'knob',x:36.4,y:17.15},
 {id:'bunting-0',kind:'handle',x:8.3,y:3.8},{id:'bunting-1',kind:'handle',x:9.8,y:5.3},
 {id:'bunting-2',kind:'twig',x:11.4,y:6.7,breakMs:2400,regrowMs:6500},{id:'bunting-3',kind:'handle',x:13.3,y:6.7}],
 path:[[1,1],[3,1],[7,2.5],[10,2.5],[10,5.8],[15,5.8],[24,5.8],[30,10],[32,10],[32,14],[35,14],[35,18],[38,18]],
 routes:{shortcut:{id:'bunting-cut',name:'Extracurricular climbing',holdIds:['bunting-0','bunting-1','bunting-2','bunting-3'],path:[[8,2.5],[8.3,3.8],[9.8,5.3],[11.4,6.7],[13.3,6.7],[16,5.8]]}},
 sections:[{name:'The lawn',x:2,y:0},{name:'Old Main',x:13,y:4.8},{name:'Rooftops',x:27,y:7},{name:'Clock tower',x:37,y:17}],
 signs:[{x:8,y:6.7,text:'OLD MAIN. NEW HEIGHTS.',sub:'Please use the extremely unofficial entrance.'},{x:25,y:11.6,text:'OFFICE HOURS: UPHILL',sub:'Your degree is just a few holds away.'}],objects:[]};
module.exports={forest,campus};
