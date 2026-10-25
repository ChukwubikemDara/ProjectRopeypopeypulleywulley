// A team checklist, validated by the server's actual inputs and physics events. Never gates a race.
const LESSONS=[
 {id:'aim',title:'Aim your hands',arms:'Tilt left/right and forward/back, or drag the touch aim pad.',legs:'Your arms teammate aims. Try leaning to swing your feet.',both:'Tilt or drag to position your hands.',line:'Two brains. One climber. We have deliberately not thought this through.'},
 {id:'grip',title:'Catch a real hold',arms:'Hold a thumb pad near the colored holds. Look for GRIPPED.',legs:'Ask your arms teammate to catch a hold. Closed is not the same as gripping.',both:'Aim at the colored holds, then hold a hand pad until it says GRIPPED.',line:'A closed fist is an ambition. GRIPPED is a plan.'},
 {id:'hop',title:'Let your legs do the jumping',arms:'Release the pads as your legs teammate hops.',legs:'Hop, or tap Jump if enabled. Release the grips together so you can rise.',both:'Let go, then hop or tap Jump. Land and try again.',line:'Arms hold. Legs jump. Blaming your teammate remains a full-body exercise.'},
 {id:'combo',title:'Hop + release together',arms:'At the high bars: hold both pads, then release as your legs teammate hops.',legs:'At the high bars: hop while your arms teammate releases both pads.',both:'Hang from a high bar. Hop and release both pads within 0.4 seconds.',line:'Three, two, one—was that a countdown or a negotiation?'},
 {id:'kick',title:'Meet the training snowpal',arms:'Let your legs teammate kick the snowpal at the right-hand station.',legs:'Stand beside the snowpal. Shove forward or tap Kick.',both:'Stand beside the snowpal. Shove forward or tap Kick.',line:'That snowpal signed absolutely no paperwork for this.'}
];
class Tutorial{
 constructor(){this.teams=new Map();}
 reset(){this.teams.clear();}
 entry(id){if(!this.teams.has(id))this.teams.set(id,{done:new Set(),failAt:-10,quip:null,quipUntil:0});return this.teams.get(id);}
 input(id,role,m){if(role!=='legs'&&(Math.abs(m.aim||0)>.3||Math.abs((m.ay??.6)-.6)>.25))this.entry(id).done.add('aim');}
 event(ev){if(!ev.id)return;const e=this.entry(ev.id);if(ev.type==='grab')e.done.add('grip');if(ev.type==='combo'){e.done.add('combo');e.done.add('hop');}if(ev.type==='kick'&&ev.target==='practice-dummy')e.done.add('kick');}
 observe(c,time){const e=this.entry(c.id);if(c.tutorialTakeoff!==undefined&&time-c.tutorialTakeoffAt<1.2&&c.body.translation().y>c.tutorialTakeoff+.35){e.done.add('hop');delete c.tutorialTakeoff;}}
 gesture(c,g,ok,time){if((g==='flick'||g==='push')&&ok){c.tutorialTakeoff=c.body.translation().y;c.tutorialTakeoffAt=time;}else if((g==='flick'||g==='push')&&!ok&&c.lastGestureResult==='no footing'){const e=this.entry(c.id);if(time-e.failAt>7){e.failAt=time;e.quip='Ambitious. Now find something to push off.';e.quipUntil=time+3;}}}
 snapshot(c,time){this.observe(c,time);const e=this.entry(c.id),step=LESSONS.find(l=>!e.done.has(l.id));return{step:step?.id||'done',index:step?LESSONS.indexOf(step):LESSONS.length,total:LESSONS.length,complete:!step,done:[...e.done],line:e.quipUntil>time?e.quip:(step?.line||'You are now officially qualified to argue about timing.'),lesson:step||{id:'done',title:'Ready when you are',arms:'Keep practicing, or let the host start the race.',legs:'Keep practicing, or let the host start the race.',both:'Keep practicing, or let the host start the race.'}};}
}
module.exports={Tutorial,LESSONS};
