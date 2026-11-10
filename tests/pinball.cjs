const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../games/pinball/index.html','utf8'),code=[...source.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const ctx=new Proxy({},{get:()=>()=>{},set:()=>true});
const node=()=>({innerHTML:'',textContent:'',style:{setProperty(){}},hidden:false,classList:{add(){},remove(){}},events:{},setAttribute(){},addEventListener(k,f){this.events[k]=f;}});
const nodes=new Map(),canvas={...node(),getContext:()=>ctx,setPointerCapture(){},getBoundingClientRect:()=>({left:0,width:320})},buttons=['left','launch','right'].map(k=>({...node(),dataset:{key:k}}));
const root={...node(),isConnected:true,querySelector:s=>s==='canvas'?canvas:nodes.has(s)?nodes.get(s):(nodes.set(s,node()),nodes.get(s)),querySelectorAll:s=>s==='[data-key]'?buttons:[]};
const calls=[];const Hub={init:()=>new Promise(()=>{}),save:d=>{calls.push(['save',d]);return Promise.resolve(true);},submitRun:r=>{calls.push(['run',r]);return Promise.resolve({});}};
const sandbox={Hub,setInterval(){},localStorage:{getItem(){return null;},setItem(){}},console,Math,Date,Map,Set,requestAnimationFrame(){},__ORBIT_TEST__:{},window:{addEventListener(){}},document:{getElementById:()=>root,addEventListener(){}}};vm.createContext(sandbox);vm.runInContext(code,sandbox);const a=sandbox.__ORBIT_TEST__.api;a.setReady();
function tick(seconds){for(let i=0;i<seconds*240;i++)a.update(1/240);}
// Any point on the field charges the spring. A second finger cannot reset it.
assert.ok(!source.includes('data-key="'),'no separate gameplay buttons');
a.start();canvas.events.pointerdown({pointerId:7,clientX:50,preventDefault(){}});tick(.4);const heldCharge=a.get().charge;assert.ok(heldCharge>.4);
canvas.events.pointerdown({pointerId:8,clientX:240,preventDefault(){}});assert.equal(a.get().charge,heldCharge);canvas.events.pointerup({pointerId:8});assert.equal(a.get().phase,'ready');
canvas.events.pointerup({pointerId:7});assert.equal(a.get().phase,'play');
a.start();canvas.events.pointerdown({pointerId:9,clientX:160,preventDefault(){}});tick(.3);canvas.events.pointercancel({pointerId:9});assert.equal(a.get().phase,'ready');assert.equal(a.get().charge,0);canvas.events.pointerup({pointerId:9});assert.equal(a.get().phase,'ready');
a.start();assert.equal(a.get().phase,'ready');assert.equal(a.get().balls,3);a.beginCharge();tick(.95);assert.ok(a.get().charge>.99);assert.ok(a.launch());assert.equal(a.get().phase,'play');assert.equal(a.get().charge,0);
let exited=false;for(let i=0;i<480;i++){a.update(1/240);if(!a.get().ball.lane)exited=true;}assert.ok(exited,'launch must leave the shooter lane');
// The finite-radius ball bounces off a wall without crossing it.
a.setBall({x:28,y:200,vx:-150,vy:0,lane:false});a.update(1/240);assert.ok(a.get().ball.x>28);assert.ok(a.get().ball.vx>0);
// A bumper scores, kicks outwards, and cannot score repeatedly during one contact.
a.start();a.launch();const bumper=a.get().bumpers[0];a.setBall({x:bumper.x,y:bumper.y-19,vx:0,vy:100,lane:false});a.update(1/240);assert.ok(a.get().score>=100);assert.ok(a.get().ball.vy<0);const points=a.get().score;a.update(1/240);assert.equal(a.get().score,points);
// Flipper motors impart upward velocity; this is a moving-surface collision.
a.start();a.launch();const f=a.get().flippers[0];a.setBall({x:134,y:441,vx:0,vy:180,lane:false});a.keyDown('left');tick(.11);assert.ok(a.get().flippers[0].angle<0);assert.ok(a.get().ball.vy<0,'left flip launches ball upward');a.keyUp('left');tick(.2);assert.ok(Math.abs(f.angle-f.rest)<.01);
a.start();a.launch();a.setBall({x:186,y:441,vx:0,vy:180,lane:false});a.keyDown('right');tick(.11);assert.ok(a.get().ball.vy<0,'right flip launches upward');a.keyUp('right');
// Rollover completion increases the multiplier, and losses count exactly once.
a.start();a.launch();for(const l of a.get().lanes){a.setBall({x:l.x,y:l.y,vx:0,vy:1,lane:false});a.update(1/240);}assert.equal(a.get().multiplier,2);
a.setSave(0);a.drain();assert.equal(a.get().balls,2);a.drain();assert.equal(a.get().balls,2);a.launch();a.setSave(0);a.drain();assert.equal(a.get().balls,1);a.launch();a.setSave(0);a.drain();assert.equal(a.get().balls,0);assert.equal(a.get().phase,'over');
a.start();a.launch();a.drain();assert.equal(a.get().balls,3,'early ball save');assert.equal(a.get().ballSave,0,'free save cannot repeat indefinitely');
// Two independent fingers keep the other flipper pressed when one is released.
a.start();a.launch();canvas.events.pointerdown({pointerId:1,clientX:80,preventDefault(){}});canvas.events.pointerdown({pointerId:2,clientX:240,preventDefault(){}});
assert.ok(a.get().controls.left&&a.get().controls.right);canvas.events.pointerup({pointerId:1});assert.ok(!a.get().controls.left&&a.get().controls.right);canvas.events.pointercancel({pointerId:2});assert.ok(!a.get().controls.right);
// Cancellation never launches; pausing freezes both ball and motor state.
a.start();a.keyDown('launch');tick(.5);a.keyUp('launch',true);assert.equal(a.get().phase,'ready');assert.equal(a.get().charge,0);a.launch();a.pause();const y=a.get().ball.y;tick(2);assert.equal(a.get().ball.y,y);
// Complete simulated games with timed inputs remain finite and do not tunnel.
const simulations=[];
for(let trial=0;trial<5;trial++){
 a.start();a.launch();for(let i=0;i<240*30;i++){if(a.get().phase==='ready')a.launch();if(a.get().phase==='over')break;
  const ball=a.get().ball;if(ball.y>390&&ball.vy>0){a.keyDown(ball.x<160?'left':'right');}else{a.keyUp('left');a.keyUp('right');}a.update(1/240);
  for(const k of ['x','y','vx','vy'])assert.ok(Number.isFinite(a.get().ball[k]),k);
 }
 simulations.push({score:a.get().score,balls:a.get().balls,phase:a.get().phase});
}
assert.ok(simulations.some(s=>s.score>0),'a natural launch must reach scoring objects');
console.log('Simulated games:',JSON.stringify(simulations));
console.log('PASS: spring charge/launch, lane exit, rails, bumpers/scoring/cooldown, powered left/right flippers, multiplier, three-ball loss, early save, cancellation, pause, full-game simulation.');

// Full-table snapshots preserve the moving ball, lights and flipper positions.
a.start();a.launch();a.setSave(0);a.setBall({x:160,y:330,vx:43,vy:140,lane:false});a.get().lanes[0].lit=true;a.get().targets[3].lit=true;a.get().flippers[0].angle=-.4;
const snap=JSON.parse(JSON.stringify(a.snapshot()));assert.ok(a.validRun(snap));const bytes=JSON.stringify({profile:snap.profile,run:snap}).length;assert.ok(bytes<8000);
a.start();a.setSavedRun(snap);a.resumeRun();assert.equal(a.get().ball.x,160);assert.equal(a.get().ball.vx,43);assert.equal(a.get().flippers[0].angle,-.4);assert.equal(a.get().lanes[0].lit,true);assert.equal(a.get().targets[3].lit,true);assert.equal(a.get().controls.left,false);
assert.ok(!a.validRun({...snap,ball:{...snap.ball,x:NaN}}));
console.log('PASS: full-table snapshot/restore, invalid save validation; '+bytes+'/8000 characters.');
// Reopen through the real shared SDK, preserving palette and in-flight state.
(async()=>{
 const disk=new Map();
 function session(){const real={console,Math,Date,Map,Set,requestAnimationFrame(){},__ORBIT_TEST__:{},document:sandbox.document,
 addEventListener(){},setInterval(){},setTimeout(){return 1;},localStorage:{getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v)}};
 real.window=real;real.parent=real;vm.createContext(real);vm.runInContext(fs.readFileSync(__dirname+'/../hub-sdk.js','utf8'),real);vm.runInContext(code,real);return real;}
 const first=session();await Promise.resolve();await Promise.resolve();const f=first.__ORBIT_TEST__.api;
 f.start();f.launch();const bumper=f.get().bumpers[0];f.setBall({x:bumper.x,y:bumper.y-19,vx:0,vy:100,lane:false});f.update(1/240);f.setPalette(2);f.remember();await f.pending();
 const saved=JSON.parse(disk.get('pack_orbitpinball'));assert.equal(saved.data.profile.palette,2);assert.ok(saved.data.run.score>0);
 const second=session();await Promise.resolve();await Promise.resolve();const b=second.__ORBIT_TEST__.api;b.resumeRun();
 assert.equal(b.get().score,saved.data.run.score);assert.equal(b.get().ball.x,saved.data.run.ball.x);assert.equal(b.get().palette,2);
 let submitted=0;const original=second.Hub.submitRun;second.Hub.submitRun=r=>{submitted++;return original(r);};
 for(let i=0;i<3;i++){if(b.get().phase==='ready')b.launch();b.setSave(0);b.drain();}await b.pending();
 assert.equal(submitted,1);const completed=JSON.parse(disk.get('pack_orbitpinball'));assert.equal(completed.data.run,null);assert.ok(completed.best>=saved.data.run.score);
 b.start();await b.pending();assert.equal(submitted,1);assert.equal(JSON.parse(disk.get('pack_orbitpinball')).data.run.balls,3);
 console.log('PASS: real SDK init, ordered saves, reopen/resume, palette, one-time score and completed-round cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
