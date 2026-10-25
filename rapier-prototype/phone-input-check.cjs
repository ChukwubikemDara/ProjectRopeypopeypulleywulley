const assert=require('node:assert/strict');
const {harness}=require('./calibration-check.cjs');
const {Simulation}=require('./physics.cjs');
(async()=>{
 const h=harness();h.inbound('you','p1');h.inbound('phase','playing');
 await h.node('joinBtn').handlers.click[0]();
 h.inbound('state3d',{phase:'playing',climbers:[{id:'c1',x:1,y:1,z:0,hands:[],legs:[]}]});
 h.inbound('roster',[{id:'c1',name:'Phone test',color:'#42b9ab',members:[{id:'p1',name:'Phone test',role:'both'}]}]);
 assert.equal(h.ctx.PhoneInput.gesture('kick'),false);assert.equal(h.emitted.filter(e=>e.type==='gesture').length,0);
 h.ctx.Net.completeCalibration();h.flush();assert.equal(h.ctx.PhoneInput.gesture('kick'),true);
 assert.equal(h.ctx.Motion.onGesture('kick',1),false);assert.equal(h.emitted.filter(e=>e.type==='gesture').length,1);console.log('PASS buttons require calibration and share a lockout with motion');
 h.advance(451);h.ctx.Net.role='arms';assert.equal(h.ctx.PhoneInput.gesture('flick'),false);h.ctx.Net.role='legs';assert.equal(h.ctx.PhoneInput.gesture('flick'),true);assert.equal(h.emitted.at(-1).args[0],'flick');console.log('PASS jump button follows the same role-enforced gesture path');
 h.advance(451);h.ctx.PhoneInput.setTouchMode(true);h.ctx.PhoneInput.setAim(.8,-.2);
 const last=h.emitted.filter(e=>e.type==='input').at(-1);assert.equal(last.args[0].aim,.8);assert.equal(last.args[0].ay,-.2);assert.equal(last.args[0].brace,true);
 assert.equal(h.ctx.Motion.onGesture('kick',1),false);assert.equal(h.ctx.PhoneInput.gesture('yank'),true);console.log('PASS touch aiming reaches the existing input protocol; sensor gestures are suppressed in touch mode');
 h.ctx.Motion._keys.q=true;h.node('padL').handlers.touchstart[0]({preventDefault(){}});assert.equal(h.emitted.at(-1).args[0].l,true);
 for(const fn of h.windowEvents.blur||[])fn();assert.equal(h.emitted.at(-1).args[0].l,false);assert.equal(h.ctx.PhoneInput.aim.aim,0);console.log('PASS leaving the page releases held pads and centers touch aim');
 h.advance(451);h.node('debug').classList.remove('hidden');assert.equal(h.ctx.PhoneInput.gesture('kick'),false);console.log('PASS settings cannot accidentally trigger gameplay actions');
 const sim=await Simulation.create();try{
  const a=sim.spawn('a'),b=sim.spawn('b');for(let i=0;i<180;i++)sim.step();
  assert.equal(sim.snapshot(a).actions.jump.ready,true);sim.gesture(a,'flick',1);assert.equal(sim.snapshot(a).actions.jump.reason,'cooldown');
  const move=(c,x,y)=>{for(const h of c.hands)sim.release(h,'setup');c.body.setTranslation({x,y,z:0},true);for(const h of c.hands)h.body.setTranslation({x:x+h.side*.35,y:y+.5,z:0},true);for(const f of c.feet)f.body.setTranslation({x:x+f.side*.2,y:y-1,z:0},true);c.lastJump=c.lastFoot=c.lastLetGo=-10;};
  move(a,7,18);move(b,7.8,17.2);sim.world.propagateModifiedBodyPositionsToColliders();b.hands[0].body.setTranslation(a.hands[1].body.translation(),true);assert.ok(sim.grabClimber(b,b.hands[0]));
  assert.equal(sim.snapshot(b).actions.jump.ready,false);assert.equal(sim.snapshot(b).actions.jump.reason,'no footing');assert.equal(sim.gesture(b,'flick',1),false);console.log('PASS HUD readiness matches actual jump rules, including airborne climber grabs');
  sim.gesture(b,'kick',1);assert.ok(sim.snapshot(b).actions.kick.cooldown>1);console.log('PASS kick cooldown is supplied by the simulation');
 }finally{sim.free();}
})().catch(e=>{console.error(e);process.exitCode=1;});
