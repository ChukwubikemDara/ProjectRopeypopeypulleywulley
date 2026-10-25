// Synthetic events verify interpretation/delivery logic, not physical iPhone hardware.
const vm=require('vm'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
 let now=1000;const events={},gestures=[];
 const ctx={console,Math,Number,Date,navigator:{userAgent:'iPhone',maxTouchPoints:5,platform:'iPhone'},performance:{now:()=>now},isSecureContext:true,addEventListener(t,f){(events[t]??=[]).push(f);},setInterval(){},DeviceMotionEvent:{requestPermission:async()=> 'granted'},DeviceOrientationEvent:{requestPermission:async()=> 'granted'}};ctx.window=ctx;
 vm.createContext(ctx);
 for(const f of ['../public/js/motion.js','client/sensor-status.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,f),'utf8'),ctx);
 await ctx.Motion.enable();
 assert.equal(ctx.LabSensors.ready(),false,'Permission alone must not count as live motion');console.log('PASS permission alone is not reported as live sensors');
 const emit=(t,e)=>(events[t]||[]).forEach(f=>f(e));
 emit('deviceorientation',{beta:50,gamma:15});
 assert.equal(ctx.Motion.aim,.5);console.log('PASS real motion interpreter maps tilt to aim');
 ctx.Motion.onGesture=(g,power)=>gestures.push({g,power});
 emit('devicemotion',{accelerationIncludingGravity:{x:0,y:-9.8,z:0},acceleration:{x:0,y:-20,z:0}});
 assert.equal(gestures[0]?.g,'flick');console.log('PASS acceleration passes through existing hop interpreter');
 assert.equal(ctx.LabSensors.ready(),true);console.log('PASS live status requires both valid tilt and acceleration delivery');
 ctx.Motion.center();emit('deviceorientation',{beta:40,gamma:0});assert.equal(ctx.Motion.ay,1);ctx.Motion.center();emit('deviceorientation',{beta:40,gamma:0});assert.equal(ctx.Motion.ay,.6);console.log('PASS centering updates the neutral forward/back tilt');
 // kicks: a forward shove counts however far back the phone is tilted; sideways jolts and hops don't
 const shove=(theta,a)=>{const r=theta*Math.PI/180,ag={x:0,y:-9.8*Math.cos(r),z:-9.8*Math.sin(r)};for(let i=0;i<40;i++)emit('devicemotion',{accelerationIncludingGravity:ag,acceleration:{x:0,y:0,z:0}});now+=600;gestures.length=0;
  const acc=a(r);emit('devicemotion',{accelerationIncludingGravity:{x:ag.x+acc.x,y:ag.y+acc.y,z:ag.z+acc.z},acceleration:acc});now+=600;return gestures.map(g=>g.g).join(',')||'none';};
 const forward=k=>r=>({x:0,y:k*Math.sin(r),z:-k*Math.cos(r)}),up=k=>r=>({x:0,y:-k*Math.cos(r),z:-k*Math.sin(r)}) // a hop reads along the gravity reading here, like the existing hop check;
 for(const theta of [0,30,45,60,80])assert.equal(shove(theta,forward(14)),'kick',`a forward shove kicks with the phone tilted ${theta} degrees back`);
 assert.equal(shove(45,()=>({x:18,y:0,z:0})),'none','a sideways jolt is not a kick');
 assert.equal(shove(45,r=>{const u=up(18)(r),f=forward(6)(r);return{x:0,y:u.y+f.y,z:u.z+f.z};}),'flick','a hop that drifts forward is still a hop');
 console.log('PASS a forward shove kicks at any holding angle; sideways jolts and hops do not');
 ctx.isSecureContext=false;assert.equal(ctx.LabSensors.ready(),false);ctx.isSecureContext=true;
 now=5000;assert.equal(ctx.LabSensors.ready(),false);console.log('PASS HTTP and stale sensors cannot report ready');
})().catch(e=>{console.error(e);process.exitCode=1;});
