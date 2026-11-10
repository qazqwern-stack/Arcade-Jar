const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(__dirname + '/../games/riftboots/index.html', 'utf8');
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const events = new Map();
const ctx = new Proxy({}, { get: (_, key) => key === 'measureText' ? () => ({width: 50}) : () => {}, set: () => true });
const node = () => ({textContent:'', innerHTML:'', hidden:false, classList:{remove(){},add(){}},addEventListener(){}});
const elements = new Map();
const canvas = {...node(),getContext:()=>ctx};
const root = {...node(),isConnected:true,querySelector:s=>s==='canvas'?canvas:(elements.has(s)?elements.get(s):elements.set(s,node()).get(s)),querySelectorAll:()=>[]};
const calls=[];let autosave;const storage=new Map();
const Hub={init:()=>new Promise(()=>{}),save:d=>{calls.push(['save',d]);return Promise.resolve();},clearRun:()=>{calls.push(['clear']);return Promise.resolve();},submitRun:r=>{calls.push(['run',r]);return Promise.resolve();},checkpoint(){},autosave:f=>{autosave=f;}};
const sandbox = {Hub,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},console, Math, Date, Set, Map, requestAnimationFrame(){},__RIFT_TEST__:{},window:{addEventListener(){}},document:{hidden:false,getElementById:()=>root,addEventListener(k,f){events.set(k,f);}}};
vm.createContext(sandbox);vm.runInContext(code,sandbox);
const api = sandbox.__RIFT_TEST__.api;
api.setReady();api.start();
let s = api.get();
assert.equal(s.player.ammo,8);
api.action();assert.ok(s.player.vy<0);assert.equal(s.player.ammo,8,'jump must not spend ammo');
api.update(.21);s.player.ground=false;const vy=s.player.vy;
api.action();assert.equal(s.player.ammo,7);assert.ok(s.player.vy<vy,'shot must slow fall');
// Top-down collision kills a safe enemy, bounces and reloads.
s.player.x=140;s.player.y=280;s.player.vy=250;s.player.ammo=1;s.player.inv=0;
s.enemies.length=0;s.enemies.push({x:140,y:299,baseX:140,baseY:299,w:16,h:14,hp:1,type:'beetle',t:0,dead:false});
api.update(1/120);assert.equal(s.enemies[0].dead,true);assert.equal(s.player.ammo,s.player.maxAmmo);assert.ok(s.player.vy<0);assert.equal(api.get().combo,1);
// A spiked enemy hurts even when touched from above and clears the combo.
s.player.x=140;s.player.y=350;s.player.vy=250;s.enemies.push({x:140,y:369,baseX:140,baseY:369,w:16,h:14,hp:2,type:'spike',t:0,dead:false});const hp=s.player.hp;
api.update(1/120);assert.equal(s.player.hp,hp-1);assert.equal(api.get().combo,0);
// Thresholds pay exactly once within a combo.
const beforeRewards=api.get().runGems;
for(let i=0;i<8;i++)api.kill({dead:false,x:100,y:500,type:'bat'});
assert.equal(api.get().runGems,beforeRewards+100);
api.kill({dead:false,x:100,y:500,type:'bat'});assert.equal(api.get().runGems,beforeRewards+100);
for(let i=9;i<15;i++)api.kill({dead:false,x:100,y:500,type:'bat'});
assert.equal(s.player.maxAmmo,9);
s.player.hp=2;for(let i=15;i<25;i++)api.kill({dead:false,x:100,y:500,type:'bat'});
assert.equal(s.player.hp,3);
// Each generated floor guarantees two rooms and an exit, and perks advance all 12 floors.
api.enterShop(s.voids[0]);assert.equal(api.get().combo,25);assert.equal(api.get().mode,'shop');
api.collect(100);assert.equal(api.get().high,8);
api.buy('ammo');assert.equal(s.player.maxAmmo,10);assert.equal(api.get().spent,45);
api.start();
for(let i=0;i<12;i++){
  s=api.get();assert.equal(s.level,i);assert.equal(s.voids.length,2);assert.ok(s.platforms.some(p=>p.bottom));
  for(const v of s.voids)assert.ok(!s.enemies.some(e=>e.y>=v.y-30&&e.y<=v.y+v.h+30),'safe room must exclude enemies');
  api.nextLevel();if(i<11){assert.equal(api.get().mode,'perk');api.setOffered(['clip']);api.applyPerk('clip');}
}
assert.equal(api.get().mode,'end');
// Fixed-step simulation survives a continuous multi-second mobile-style input.
api.start();api.setKeys({right:true,fire:true});for(let i=0;i<1200;i++)api.update(1/120);
s=api.get();for(const k of ['x','y','vx','vy','hp','ammo'])assert.ok(Number.isFinite(s.player[k]),k+' must remain finite');
assert.ok(s.player.x>=22&&s.player.x<=254);assert.ok(s.player.ammo>=0);
console.log('PASS: jump/fire, stomp/reload, spikes/damage, combo rewards, gem high, shop, 12 floors, safe generation, fixed-step play.');

// A checkpoint restores geometry, enemies, gems, purchases and player without duplication.
api.start();api.collect(120);api.enterShop(api.get().voids[0]);api.buy('ammo');
let snap=JSON.parse(JSON.stringify(api.snapshot()));assert.ok(api.validRun(snap));
const positions=JSON.stringify(api.get().platforms);api.start();api.setSavedRun(snap);api.resumeRun();
s=api.get();assert.equal(s.mode,'shop');assert.equal(s.player.maxAmmo,9);assert.equal(s.spent,45);assert.equal(s.runGems,120);assert.equal(JSON.stringify(s.platforms),positions);
// Persisted perk choices remain the same after reopening, with one application only.
api.start();api.nextLevel();snap=JSON.parse(JSON.stringify(api.snapshot()));api.start();api.setSavedRun(snap);api.resumeRun();
assert.equal(api.get().mode,'perk');const perk=snap.offered[0];api.applyPerk(perk);assert.equal(api.get().level,1);api.applyPerk(perk);assert.equal(api.get().level,1);
// Worst-case floor loot still fits the backend 8,000-character save limit.
api.start();for(const e of api.get().enemies)api.kill(e);
const size=JSON.stringify({profile:{version:1,totalGems:999999},run:api.snapshot()}).length;
assert.ok(size<8000,'snapshot is too large: '+size);
assert.ok(!api.validRun({...snap,p:{...snap.p,hp:NaN}}));
assert.ok(calls.some(c=>c[0]==='run'),'completed runs must submit to Hub');
console.log('PASS: Hub submission, checkpoint round-trip, stable perk choices, validation; maximum loot save '+size+'/8000 characters.');

// Run the real shared SDK in standalone mode, then reopen the cartridge.
(async()=>{
  const disk=new Map();
  function session(){
    const real={console,Math,Date,Set,Map,requestAnimationFrame(){},__RIFT_TEST__:{},
      document:sandbox.document,addEventListener(){},setInterval(){},setTimeout(){return 1;},
      localStorage:{getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)}};
    real.window=real;real.parent=real;
    vm.createContext(real);vm.runInContext(fs.readFileSync(__dirname+'/../hub-sdk.js','utf8'),real);vm.runInContext(code,real);return real;
  }
  const first=session();await Promise.resolve();await Promise.resolve();
  const a=first.__RIFT_TEST__.api;a.start();a.collect(150);a.enterShop(a.get().voids[0]);a.buy('ammo');
  first.Hub.checkpoint();await Promise.resolve();
  const stored=JSON.parse(disk.get('pack_riftboots'));
  assert.equal(stored.data.run.g,150);assert.equal(stored.data.run.p.maxAmmo,9);
  const second=session();await Promise.resolve();await Promise.resolve();
  const b=second.__RIFT_TEST__.api;b.resumeRun();
  assert.equal(b.get().mode,'shop');assert.equal(b.get().spent,45);assert.equal(b.get().totalGems,150);
  await second.Hub.submitRun({score:123,duration:10});
  assert.equal(JSON.parse(disk.get('pack_riftboots')).best,123);
  b.start();await Promise.resolve();assert.equal(JSON.parse(disk.get('pack_riftboots')).data.run,null);
  console.log('PASS: real Hub SDK boot, persistent checkpoint, reopen/resume, leaderboard score and new-run cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
