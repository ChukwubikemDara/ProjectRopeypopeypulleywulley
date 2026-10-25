// Observe delivery of real browser sensor events without changing the motion interpreter.
(()=>{
 const S={orientation:0,acceleration:0,lastOrientation:0,lastAcceleration:0,lastGesture:'none',lastGestureAt:0};
 const valid=x=>typeof x==='number'&&Number.isFinite(x);
 addEventListener('deviceorientation',e=>{if(valid(e.beta)&&valid(e.gamma)){S.orientation++;S.lastOrientation=performance.now();}});
 addEventListener('devicemotion',e=>{const a=e.acceleration,g=e.accelerationIncludingGravity;if(a&&g&&[a.x,a.y,a.z,g.x,g.y,g.z].every(valid)){S.acceleration++;S.lastAcceleration=performance.now();}});
 S.phone=()=>navigator.maxTouchPoints>0||/iPhone|iPad|iPod/.test(navigator.userAgent||'');
 S.ready=()=>window.isSecureContext&&Motion.enabled&&S.orientation>0&&S.acceleration>0&&performance.now()-S.lastOrientation<2500&&performance.now()-S.lastAcceleration<2500;
 S.report=()=>({secure:!!window.isSecureContext,enabled:!!Motion.enabled,orientation:S.orientation,acceleration:S.acceleration,ready:!!S.ready(),aim:Motion.aim,ay:Motion.ay,energy:Motion.energy,lastGesture:S.lastGesture});
 window.LabSensors=S;
})();
