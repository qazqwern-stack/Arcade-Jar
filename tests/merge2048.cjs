const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../games/2048/index.html','utf8');
const code=[...source.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const names=['bio','crystal','space','paper','terminal','liquid','city','thread'];
let drawCalls=0,clock=1000;
const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})}, {get:(t,k)=>k in t?t[k]:()=>{drawCalls++;},set:(t,k,v)=>(t[k]=v,true)});
const node=()=>({innerHTML:'',textContent:'',checked:false,hidden:false,events:{},setAttribute(){},setPointerCapture(){},addEventListener(type,fn){this.events[type]=fn;}});
const apps={};
for(const [i,k] of names.entries()){
 const items=new Map(),canvas={...node(),getContext:()=>ctx};
 apps[k]={...node(),dataset:{theme:k},parentElement:{hidden:i!==0},querySelector:s=>s==='canvas'?canvas:items.has(s)?items.get(s):(items.set(s,node()),items.get(s))};
}
const root={...node(),isConnected:true,querySelector:s=>apps[s.match(/data-theme="(.*?)"/)[1]]};
const Hub={init:()=>new Promise(()=>{}),save:()=>Promise.resolve(true),submitRun:()=>Promise.resolve({}),leaderboard:()=>Promise.resolve([])};
const sandbox={Hub,localStorage:{getItem(){return null;},setItem(){}},console,Math,Date,Set,Map,performance:{now:()=>clock},__MERGE_TEST__:{},requestAnimationFrame(){},window:{matchMedia:()=>({matches:false}),addEventListener(){}},document:{getElementById:()=>root,addEventListener(){}}};
vm.createContext(sandbox);vm.runInContext(code,sandbox);const a=sandbox.__MERGE_TEST__.api;a.setReady();
const asArray=x=>Array.from(x);
let b=Array(16).fill(0);b.splice(0,4,2,2,4,4);
let p=a.plan(b,'left');assert.deepEqual(asArray(p.board.slice(0,4)),[4,8,0,0]);assert.equal(p.gain,12);
p=a.plan(b,'right');assert.deepEqual(asArray(p.board.slice(0,4)),[0,0,4,8]);
b.splice(0,4,2,2,2,2);assert.deepEqual(asArray(a.plan(b,'left').board.slice(0,4)),[4,4,0,0],'tiles merge once per turn');
b=Array(16).fill(0);for(const i of [0,4,8,12])b[i]=2;
assert.deepEqual([0,4,8,12].map(i=>a.plan(b,'down').board[i]),[0,0,4,4]);
assert.deepEqual([0,4,8,12].map(i=>a.plan(b,'up').board[i]),[4,4,0,0]);
const stuck=Array.from({length:16},(_,i)=>(Math.floor(i/4)+i%4)%2?2:4);assert.equal(a.possible(stuck),false);
assert.equal(a.validBoard(stuck),true);assert.equal(a.validBoard([3,...Array(15).fill(0)]),false);
// Random directional plans conserve tile mass and never create a non-power of two.
for(let t=0;t<300;t++){
 const values=Array.from({length:16},()=>Math.random()<.4?0:2**(1+Math.floor(Math.random()*6)));
 for(const d of ['left','right','up','down']){const plan=a.plan(values,d);assert.equal(plan.board.reduce((s,n)=>s+n,0),values.reduce((s,n)=>s+n,0));assert.ok(a.validBoard(plan.board));}
}
a.newGame();assert.equal(a.get().board.filter(Boolean).length,2);
a.setBoard([2,2,...Array(14).fill(0)]);const mass=4;a.move('left');assert.equal(a.get().score,4);a.finish();
assert.equal(a.get().board.filter(Boolean).length,2);assert.ok([mass+2,mass+4].includes(a.get().board.reduce((s,n)=>s+n,0)));
// A no-op must not spawn a tile or change score.
a.setBoard([2,...Array(15).fill(0)]);assert.equal(a.move('left'),false);assert.equal(a.get().board.filter(Boolean).length,1);
// 2048 win is detected in an actual match, while demonstration preserves the record.
a.setBoard([1024,1024,...Array(14).fill(0)]);a.move('left');a.finish();assert.equal(a.get().won,true);const record=a.get().best;
a.demoMerge();a.finish();assert.equal(a.get().demo,true);assert.equal(a.get().best,record);assert.equal(a.get().score,0);assert.ok(a.get().board.includes(2048));
// Exercise all eight painters at every evolution step and during a merge animation.
a.setBoard([2,4,8,16,32,64,128,256,512,1024,2048,4096,0,0,0,0]);
for(const k of names)a.render(k,clock);
a.demoMerge();for(const k of names)a.render(k,clock+220);
assert.ok(drawCalls>1000);
console.log('PASS: four directions, one merge per turn, mass conservation (1,200 plans), spawn/no-op, game over, win, demo isolation and all eight renderers.');

// Skins change within the game without touching the live arrangement or score.
a.setBoard([2,2,4,0,...Array(12).fill(0)],76);
for(const key of names){a.setTheme(key);assert.equal(a.get().activeTheme,key);assert.deepEqual(asArray(a.get().board),[2,2,4,0,...Array(12).fill(0)]);assert.equal(a.get().score,76);}
assert.ok(!source.includes('data-dir='),'no on-screen direction buttons');
assert.ok(source.includes('data-setting="theme"'),'in-game style selector exists');
// Exercise actual registered swipe handlers for every cardinal direction.
a.setTheme('bio');const cv=apps.bio.querySelector('canvas');
const gesture=(x,y,event='pointerup')=>{cv.events.pointerdown({isPrimary:true,pointerId:1,clientX:100,clientY:100,preventDefault(){}});cv.events[event]({pointerId:1,clientX:x,clientY:y});};
for(const [dir,x,y] of [['left',20,100],['right',180,100],['up',100,20],['down',100,180]]){
 const start=[0,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0];a.setBoard(start);
 gesture(x,y);assert.deepEqual(asArray(a.get().board),asArray(a.plan(start,dir).board),dir+' swipe');
}
a.setBoard([0,2,...Array(14).fill(0)]);const before=asArray(a.get().board);gesture(104,103);assert.deepEqual(asArray(a.get().board),before,'tap is not a move');
gesture(20,100,'pointercancel');cv.events.pointerup({pointerId:1,clientX:20,clientY:100});assert.deepEqual(asArray(a.get().board),before,'cancelled gesture must not move');
console.log('PASS: eight in-game skins preserve state, all four swipe handlers, tap rejection, cancellation and no arrow buttons.');

// Reopen the game with the actual shared Hub SDK, retaining board, score and skin.
(async()=>{
 const disk=new Map();
 function session(){const real={console,Math,Date,Map,Set,performance:{now:()=>1000},requestAnimationFrame(){},__MERGE_TEST__:{},
 document:sandbox.document,matchMedia:()=>({matches:false}),addEventListener(){},setInterval(){},setTimeout(){return 1;},
 localStorage:{getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v)}};real.window=real;real.parent=real;
 vm.createContext(real);vm.runInContext(fs.readFileSync(__dirname+'/../hub-sdk.js','utf8'),real);vm.runInContext(code,real);return real;}
 const first=session();await Promise.resolve();await Promise.resolve();const f=first.__MERGE_TEST__.api;
 f.setBoard([2,2,...Array(14).fill(0)]);f.move('left');f.finish();f.setTheme('crystal');await f.pending();
 const saved=JSON.parse(disk.get('pack_merge2048'));assert.equal(saved.data.run.score,4);assert.equal(saved.data.profile.theme,'crystal');assert.ok(JSON.stringify(saved.data).length<8000);
 const second=session();await Promise.resolve();await Promise.resolve();const b=second.__MERGE_TEST__.api;
 assert.equal(b.get().score,4);assert.deepEqual(asArray(b.get().board),asArray(saved.data.run.board));assert.equal(b.get().activeTheme,'crystal');
 let submissions=0;const original=second.Hub.submitRun;second.Hub.submitRun=r=>{submissions++;return original(r);};
 b.completeRound();b.completeRound();b.checkpoint();await b.pending();assert.equal(submissions,1,'round submits once');
 assert.equal(JSON.parse(disk.get('pack_merge2048')).best,4);b.newGame();await b.pending();assert.equal(submissions,1);assert.equal(JSON.parse(disk.get('pack_merge2048')).data.run.score,0);
 // Remote saves must resolve only after the server responds, allowing ordered saves.
 let respond,settled=false;const remote=session();remote.ARCADE_JAR_SERVER={url:'https://example.test',anonKey:'public'};
 vm.runInContext(fs.readFileSync(__dirname+'/../hub-sdk.js','utf8'),remote);
 remote.fetch=()=>new Promise(resolve=>{respond=resolve;});
 const backend=new remote.HubBackend('merge2048',{tg:{initData:'test-signed-data'}});
 const saving=backend.save({probe:1});assert.equal(typeof saving.then,'function');saving.then(()=>settled=true);await Promise.resolve();assert.equal(settled,false);
 respond({ok:true,json:()=>Promise.resolve({ok:true})});await saving;assert.equal(settled,true);
 console.log('PASS: real SDK checkpoint/reopen, skin and score retention, one-time submission, new-game cleanup, remote save acknowledgement.');
})().catch(e=>{console.error(e);process.exitCode=1;});
