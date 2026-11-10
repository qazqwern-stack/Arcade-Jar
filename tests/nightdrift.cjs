const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../games/nightdrift/index.html','utf8');
const code=[...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
const ctx=new Proxy({},{get:()=>()=>{},set:()=>true});
const node=()=>({innerHTML:'',textContent:'',hidden:false,classList:{add(){},remove(){}},addEventListener(){}});
const items=new Map(),canvas={...node(),getContext:()=>ctx};
const root={...node(),isConnected:true,querySelector:s=>s==='canvas'?canvas:items.has(s)?items.get(s):(items.set(s,node()),items.get(s)),querySelectorAll:()=>[]};
const calls=[];const Hub={init:()=>new Promise(()=>{}),save:d=>{calls.push(['save',d]);return Promise.resolve();},clearRun:()=>{calls.push(['clear']);return Promise.resolve();},submitRun:r=>{calls.push(['run',r]);return Promise.resolve();},checkpoint(){},autosave(){}};
const sandbox={Hub,localStorage:{getItem(){return null;},setItem(){},removeItem(){}},console,Math,Date,Map,Set,requestAnimationFrame(){},__NIGHT_TEST__:{},window:{addEventListener(){}},document:{getElementById:()=>root,addEventListener(){}}};
vm.createContext(sandbox);vm.runInContext(code,sandbox);const a=sandbox.__NIGHT_TEST__.api;
a.setReady();
function tick(s){for(let i=0;i<s*120;i++)a.update(1/120);}
a.start(false);let s=a.get();const x=s.p.x;a.update(.1);assert.ok(s.p.x>x,'automatic movement');
a.press();assert.ok(s.p.vy<0);assert.ok(!s.p.ground);a.release();tick(1.8);assert.equal(a.get().phase,'play');assert.ok(s.p.ground,'tap jump lands safely');
// A natural timed hold/release lands a backflip without setting rotation manually.
a.start(false);a.press();tick(1);a.release();tick(.7);assert.equal(a.get().phase,'play');assert.ok(a.get().flips>=1,'one-second hold must land a real backflip');
// Holding rotates; releasing stops further rotation. A full rotation lands with a bonus.
a.start(false);a.press();a.setHeld(true);tick(.3);assert.ok(Math.abs(a.get().p.rot)>0);a.release();const rotation=a.get().p.rot;tick(.1);assert.equal(a.get().p.rot,rotation);
a.setRotation(-Math.PI*2);const speed=a.get().p.speed;a.land(a.terrain(a.get().p.x));assert.equal(a.get().flips,1);assert.ok(a.get().score>=120);assert.ok(a.get().p.speed>speed);
a.start(false);a.setRotation(Math.PI);a.land(a.terrain(0));assert.equal(a.get().phase,'over','bad landing ends classic run');
// Lotus rescues a failed landing once, then grants a brief grace interval.
a.start(false);a.setShield(5);a.setRotation(Math.PI);a.land(a.terrain(0));assert.equal(a.get().phase,'play');assert.equal(a.get().lotus,0);
// Rock collision is fatal in classic, harmless in Zen.
a.start(false);s=a.get();s.items.length=0;s.items.push({kind:'rock',x:s.p.x+1,y:a.terrain(s.p.x+1),w:20,h:20});a.update(1/120);assert.equal(a.get().phase,'over');
a.start(true);s=a.get();s.items.length=0;s.items.push({kind:'rock',x:s.p.x+1,y:a.terrain(s.p.x+1),w:20,h:20});a.update(1/120);assert.equal(a.get().phase,'play');
const oldStats=JSON.stringify(s.profile.stats);a.setRotation(Math.PI);a.land(a.terrain(s.p.x));tick(120);s=a.get();assert.equal(s.phase,'play','Zen never ends on mistakes');assert.equal(s.score,0);assert.equal(s.coins,0);assert.equal(JSON.stringify(s.profile.stats),oldStats,'Zen must not advance goals');assert.ok(s.p.x>5000);
for(const k of ['x','y','speed','vy','rot'])assert.ok(Number.isFinite(s.p[k]),k+' finite');
// All 180 goals are defined and completable, opening the six riders.
a.start(false);s=a.get();for(const k of Object.keys(s.profile.stats))s.profile.stats[k]=999999;
for(let i=0;i<60;i++)a.checkGoals();assert.equal(new Set(s.profile.done).size,180);assert.equal(a.currentGoals().length,0);
for(let i=0;i<180;i++){const goal=a.goal(i);assert.ok(goal.label);assert.ok(goal.n>0);assert.ok(goal.key in s.profile.stats);}
// Echo has a second jump; other riders do not.
a.setRider(5);a.start(false);a.jump();tick(.15);a.jump();assert.equal(a.get().p.airJump,true);const vy=a.get().p.vy;a.jump();assert.equal(a.get().p.vy,vy);
a.setRider(0);a.start(false);a.jump();tick(.15);const vyNormal=a.get().p.vy;a.jump();assert.equal(a.get().p.vy,vyNormal);
// Pickups set their effect and award only classic-run coins.
a.start(false);s=a.get();s.items.length=0;
for(const kind of ['lotus','magnet','boost','coin'])s.items.push({kind,x:s.p.x+1,y:s.p.y-12});
a.update(1/120);assert.ok(a.get().lotus>0);assert.ok(a.get().magnet>0);assert.ok(a.get().boost>0);assert.equal(a.get().coins,1);
console.log('PASS: auto-run, tap jump, hold/release, flip rewards, bad landing, lotus, rocks, 120-second Zen, 180 goals, six-rider progression, double jump, pickups.');

// Compact snapshots restore terrain, speed, spin, bonuses and collected pickups.
a.start(false);a.press();a.setHeld(true);tick(.4);a.release();
let snap=JSON.parse(JSON.stringify(a.snapshot()));assert.ok(a.validRun(snap));
const sample=a.terrain(1234),savedX=snap.p.x,goalsBefore=JSON.stringify(a.get().profile.done);
a.start(true);a.setSavedRun(snap);a.resumeRun();
assert.equal(a.get().zen,false);assert.equal(a.get().p.x,savedX);assert.equal(a.terrain(1234),sample);assert.equal(a.get().p.rot,snap.p.rot);assert.equal(JSON.stringify(a.get().profile.done),goalsBefore);
assert.ok(!a.validRun({...snap,p:{...snap.p,speed:NaN}}));
const bytes=JSON.stringify({profile:a.get().profile,run:snap}).length;assert.ok(bytes<8000,'save too large: '+bytes);
const submissions=calls.filter(c=>c[0]==='run').length;
a.start(true);a.rescue('test');a.setRotation(Math.PI);a.land(a.terrain(0));assert.equal(calls.filter(c=>c[0]==='run').length,submissions,'Zen must not submit');
a.start(false);a.rescue('test');assert.equal(calls.filter(c=>c[0]==='run').length,submissions+1);
console.log('PASS: snapshot restore, deterministic terrain, profile/goal retention, invalid-save checks, '+bytes+'/8000 chars, classic-only result submission.');
// Reopen using the actual shared Hub SDK and its standalone persistent storage.
(async()=>{
 const disk=new Map();
 function session(){const real={console,Math,Date,Map,Set,requestAnimationFrame(){},__NIGHT_TEST__:{},document:sandbox.document,
  addEventListener(){},setInterval(){},setTimeout(){return 1;},localStorage:{getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)}};
  real.window=real;real.parent=real;vm.createContext(real);vm.runInContext(fs.readFileSync(__dirname+'/../hub-sdk.js','utf8'),real);vm.runInContext(code,real);return real;}
 const first=session();await Promise.resolve();await Promise.resolve();
 const f=first.__NIGHT_TEST__.api;f.start(false);f.get().profile.stats.coins=123;f.press();f.update(.2);first.Hub.checkpoint();await Promise.resolve();
 const packed=JSON.parse(disk.get('pack_nightdrift'));assert.equal(packed.data.run.profile.stats.coins,123);
 const second=session();await Promise.resolve();await Promise.resolve();const b=second.__NIGHT_TEST__.api;b.resumeRun();
 assert.equal(b.get().profile.stats.coins,123);assert.equal(b.get().p.x,packed.data.run.p.x);assert.equal(b.get().phase,'play');
 b.rescue('test');await Promise.resolve();await Promise.resolve();const after=JSON.parse(disk.get('pack_nightdrift'));
 assert.equal(after.data.run,null);assert.equal(after.best,Math.floor(packed.data.run.score));
 console.log('PASS: real Hub SDK init, checkpoint, reopen, persistent profile, score submission and completed-run cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
