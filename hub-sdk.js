/* =====================================================================
   Hub SDK — общий контракт между хабом пакета и каждой игрой.
   У каждой игры СВОИ: монеты, покупки, рекорд, друзья и рейтинг.

   В игре:   <script src="../../hub-sdk.js"></script>
             const r = await Hub.init('skyhoop');
             Hub.earn(1); Hub.save({...}); await Hub.submitRun({score, duration});
             await Hub.buy({id, cur, price, title}); Hub.friends(); Hub.leaderboard();
             Hub.on('leaderboard', d => …); Hub.invite(); Hub.exit();

   Внутри хаба игра общается с ним через postMessage. Если игру открыть
   отдельно (без хаба), SDK работает локально — удобно для разработки.

   HubBackend — демо-реализация хранилища. В продакшене её методы
   заменяются запросами к Edge Function (Supabase), которая проверяет
   Telegram initData и берёт цены из каталога shop_items.
   ===================================================================== */
(function(){
  // Друзья приходят с сервера (у каждой игры свои). Пока сервера нет, список пуст:
  // друг появится, когда откроет игру по вашей ссылке-приглашению и бэкенд это запишет.
  const DEMO_FRIENDS = {};

  class HubBackend {
    constructor(gameId, opts){
      opts = opts || {};
      this.gameId = gameId;
      this.key = 'pack_' + gameId;               // CloudStorage: только A-Z a-z 0-9 _ -
      this.tg = opts.tg || null;
      this.user = opts.user || { id:'me', name:'Вы' };
      this.s = this._load();
      this.friendsList = (DEMO_FRIENDS[gameId] || []).map(f => Object.assign({}, f));
    }
    _load(){ let s = null; try { s = JSON.parse(localStorage.getItem(this.key)); } catch(e){}
      return Object.assign({ coins:0, best:0, owned:[], data:{}, plays:0, lastPlayed:0, ts:0 }, s || {}); }
    _persist(){ this.s.ts = Date.now(); const v = JSON.stringify(this.s);
      try { localStorage.setItem(this.key, v); } catch(e){}
      try { this.tg && this.tg.CloudStorage && this.tg.CloudStorage.setItem(this.key, v); } catch(e){} }
    syncCloud(onChange){
      try { this.tg && this.tg.CloudStorage && this.tg.CloudStorage.getItem(this.key, (err, v) => {
        if (err || !v) return; try { const c = JSON.parse(v); if ((c.ts||0) > (this.s.ts||0)) { this.s = Object.assign(this.s, c); onChange && onChange(); } } catch(e){} }); } catch(e){}
    }
    stats(){ return { coins:this.s.coins, best:this.s.best, plays:this.s.plays, lastPlayed:this.s.lastPlayed, friends:this.friendsList.length }; }

    init(){ this.s.plays++; this.s.lastPlayed = Date.now(); this._persist();
      return { user:this.user, coins:this.s.coins, best:this.s.best, owned:this.s.owned.slice(), data:this.s.data }; }
    save(data){ this.s.data = Object.assign({}, this.s.data, data || {}); this._persist(); return true; }
    // Сервер: не больше ~5 монет в минуту игры (см. submit_run в SQL)
    earn(n){ this.s.coins += Math.max(0, n|0); this._persist(); return this.s.coins; }
    submitRun(run){ const score = Math.max(0, run.score|0), record = score > this.s.best;
      if (record) this.s.best = score; this._persist(); return { best:this.s.best, record }; }
    buy(item){
      if (this.s.owned.includes(item.id)) return { ok:true, coins:this.s.coins };
      if (item.cur !== 'coin') return { ok:false, message:`★ ${item.price} Stars: оплата в Telegram` };
      if (this.s.coins < item.price) return { ok:false, message:`Не хватает ${item.price - this.s.coins} монет` };
      this.s.coins -= item.price; this.s.owned.push(item.id); this._persist();
      return { ok:true, coins:this.s.coins };
    }
    friends(){ return this.friendsList.slice().sort((a,b) => b.s - a.s); }
    leaderboard(){
      const me = { id:'me', n:this.user.name, s:this.s.best, c:'#16121c', photo:this.user.photo, me:true };
      return this.friendsList.concat([me]).sort((a,b) => b.s - a.s);
    }
    demoBump(){ if (!this.friendsList.length) return null;
      const f = this.friendsList[Math.floor(Math.random()*this.friendsList.length)]; f.s += 15 + Math.floor(Math.random()*90); return f.id; }
  }
  window.HubBackend = HubBackend;

  // ---------- клиент SDK для игры ----------
  const inHub = window.parent !== window;
  let seq = 0, local = null;
  const pending = new Map(), listeners = {};

  function call(method, args){
    args = args || [];
    if (!inHub){
      if (method === 'init'){ local = new HubBackend(args[0]); return Promise.resolve(Object.assign(local.init(), { env:'standalone' })); }
      if (method === 'invite' || method === 'exit') return Promise.resolve(false);
      return Promise.resolve(local[method].apply(local, args));
    }
    return new Promise((resolve, reject) => {
      const id = ++seq; pending.set(id, { resolve, reject });
      parent.postMessage({ type:'hub:req', id, method, args }, '*');
    });
  }
  addEventListener('message', e => {
    const m = e.data || {};
    if (m.type === 'hub:res'){ const p = pending.get(m.id); if (!p) return; pending.delete(m.id); m.error ? p.reject(new Error(m.error)) : p.resolve(m.result); }
    if (m.type === 'hub:event'){ (listeners[m.name] || []).forEach(f => f(m.data)); }
  });

  // монеты копятся пачкой и отправляются раз в 1.5 с — меньше запросов к серверу
  let coinBuf = 0, timer = null;
  function flush(){ timer = null; if (!coinBuf) return Promise.resolve(); const n = coinBuf; coinBuf = 0; return call('earn', [n]); }
  addEventListener('pagehide', flush);

  window.Hub = {
    init: gameId => call('init', [gameId]),
    save: data => call('save', [data]),
    earn: n => { coinBuf += n; if (!timer) timer = setTimeout(flush, 1500); },
    flush,
    submitRun: run => flush().then(() => call('submitRun', [run])),
    buy: item => flush().then(() => call('buy', [item])),
    friends: () => call('friends'),
    leaderboard: () => call('leaderboard'),
    invite: () => call('invite'),
    exit: () => flush().then(() => call('exit')),
    on: (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); },
  };
})();
