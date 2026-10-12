/* Финштаб — хранилище: шифрование, состояние, изменения, слияние, резервные копии, демо-данные */
(function () {
  'use strict';
  const FS = window.FS;
  const { uid, now, stable, today, addMonths, curMonth, daysInMonth, pad, mulberry32, round2, defaultCategories } = FS;

  const LS_VAULT = 'finshtab.vault';
  const LS_PREFS = 'finshtab.prefs';
  const LS_GUARD = 'finshtab.guard';
  const KDF_ITER = 350000;
  const AAD = new TextEncoder().encode('finshtab');

  /* ---------- безопасный localStorage ---------- */
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { localStorage.setItem(k, v); },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
    json(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  };

  /* ---------- крипто ---------- */
  const te = new TextEncoder();
  const td = new TextDecoder();
  function b64(bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function unb64(str) {
    const s = atob(String(str).replace(/\s/g, ''));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  const hasGzip = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
  async function gz(bytes) {
    const st = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(st).arrayBuffer());
  }
  async function ungz(bytes) {
    const st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(st).arrayBuffer());
  }
  function cryptoReady() {
    return !!(window.crypto && crypto.subtle && window.isSecureContext !== false);
  }
  function newKdf() {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return { alg: 'PBKDF2-SHA256', salt: b64(salt), iter: KDF_ITER };
  }
  async function deriveKey(password, kdf) {
    const base = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: unb64(kdf.salt), iterations: kdf.iter },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }
  async function seal(obj, key, kdf, lock) {
    return sealText(JSON.stringify(obj), key, kdf, lock);
  }
  async function sealText(text, key, kdf, lock) {
    let bytes = te.encode(text);
    let z = null;
    if (hasGzip) { bytes = await gz(bytes); z = 'gzip'; }
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, bytes));
    return { app: 'finshtab', v: 1, kdf, lock, enc: { alg: 'AES-GCM', iv: b64(iv), z }, ct: b64(ct), ts: Date.now() };
  }
  async function open(vault, key) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(vault.enc.iv), additionalData: AAD }, key, unb64(vault.ct));
    let bytes = new Uint8Array(pt);
    if (vault.enc.z === 'gzip') {
      if (!hasGzip) throw new Error('Браузер устарел: нет поддержки сжатия. Обновите iOS / браузер.');
      bytes = await ungz(bytes);
    }
    return JSON.parse(td.decode(bytes));
  }
  async function sha(str) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(str)));
    return Array.from(h.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  FS.crypto = { b64, unb64, deriveKey, seal, sealText, open, sha, newKdf, cryptoReady, hasGzip };

  /* ---------- события ---------- */
  const listeners = {};
  FS.on = (ev, fn) => ((listeners[ev] = listeners[ev] || []).push(fn), () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); });
  FS.emit = (ev, payload) => (listeners[ev] || []).slice().forEach((fn) => { try { fn(payload); } catch (e) { console.error(e); } });

  /* ---------- состояние ---------- */
  function freshData() {
    return {
      v: 1,
      ops: {},
      cats: defaultCategories(),
      members: {},
      limits: {},
      settings: { currency: '₽', savingsTarget: 0.2, yieldRate: 0.1, updatedAt: 0 },
    };
  }
  function guessDeviceName() {
    const ua = navigator.userAgent || '';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Android';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows';
    return 'Устройство';
  }
  function freshLocal() {
    return { deviceId: uid('d'), deviceName: guessDeviceName(), me: null, autoLock: 60000, sync: null, lastBackupAt: 0, createdAt: Date.now(), hints: {} };
  }
  /** миграции и подстраховка структуры */
  function normalize(data, local) {
    data = data || freshData();
    data.v = data.v || 1;
    data.ops = data.ops || {};
    data.members = data.members || {};
    data.limits = data.limits || {};
    data.settings = Object.assign({ currency: '₽', savingsTarget: 0.2, yieldRate: 0.1, updatedAt: 0 }, data.settings || {});
    const defs = defaultCategories();
    data.cats = data.cats || {};
    for (const id in defs) if (!data.cats[id]) data.cats[id] = defs[id];
    local = Object.assign(freshLocal(), local || {});
    local.hints = local.hints || {};
    return { data, local };
  }

  const store = (FS.store = {
    data: null, local: null, key: null, kdf: null, lock: null, ver: 0, unlocked: false,
  });

  /* ---------- prefs (не секретные, доступны до разблокировки) ---------- */
  FS.prefs = {
    get(k, def) { const p = ls.json(LS_PREFS, {}); return k in p ? p[k] : def; },
    set(k, v) { const p = ls.json(LS_PREFS, {}); p[k] = v; try { ls.set(LS_PREFS, JSON.stringify(p)); } catch (e) { /* ignore */ } },
  };

  /* ---------- сейф (зашифрованное хранилище) ---------- */
  let saveChain = Promise.resolve();
  let saveQueued = false;
  const vault = (FS.vault = {
    exists() { return !!ls.get(LS_VAULT); },
    header() { try { const v = JSON.parse(ls.get(LS_VAULT)); return v && v.app === 'finshtab' ? v : null; } catch (e) { return null; } },
    async create(password, lock, init) {
      const kdf = newKdf();
      const key = await deriveKey(password, kdf);
      const n = normalize(init && init.data, init && init.local);
      Object.assign(store, { data: n.data, local: n.local, key, kdf, lock, unlocked: true });
      store.ver++;
      await vault.saveNow();
      guard.reset();
      return true;
    },
    /** создать сейф с готовыми параметрами (вход в семью) */
    async adopt(key, kdf, lock, data, local) {
      const n = normalize(data, local);
      Object.assign(store, { data: n.data, local: n.local, key, kdf, lock, unlocked: true });
      store.ver++;
      await vault.saveNow();
      guard.reset();
    },
    async unlock(password) {
      const h = vault.header();
      if (!h) throw new Error('Нет данных');
      const key = await deriveKey(password, h.kdf);
      let payload;
      try { payload = await open(h, key); } catch (e) { guard.fail(); return false; }
      const n = normalize(payload.data, payload.local);
      Object.assign(store, { data: n.data, local: n.local, key, kdf: h.kdf, lock: h.lock, unlocked: true });
      store.ver++;
      guard.reset();
      return true;
    },
    /** проверить пароль без смены состояния */
    async check(password) {
      const h = vault.header();
      if (!h) return false;
      try { const key = await deriveKey(password, h.kdf); await open(h, key); return true; } catch (e) { return false; }
    },
    async changePassword(password, lock) {
      const kdf = newKdf();
      const key = await deriveKey(password, kdf);
      Object.assign(store, { key, kdf, lock });
      if (store.local.sync) {
        // все файлы в облаке нужно перешифровать новым ключом
        const files = store.local.sync.files || {};
        for (const n in files) files[n].hash = null;
      }
      await vault.saveNow();
    },
    /** принять ключ, полученный из облака (пароль сменили на другом устройстве) */
    async rekey(key, kdf, lock) {
      Object.assign(store, { key, kdf, lock: lock || store.lock });
      await vault.saveNow();
    },
    /** сохранение сразу после изменения; частые изменения склеиваются в одну запись */
    scheduleSave() { return vault.saveNow(); },
    saveNow() {
      if (saveQueued) return saveChain; // уже ждёт своей очереди — заберёт самое свежее состояние
      saveQueued = true;
      saveChain = saveChain.then(async () => {
        saveQueued = false;
        if (!store.unlocked || !store.key) return;
        const text = JSON.stringify({ data: store.data, local: store.local });
        const { key, kdf, lock } = store;
        const v = await sealText(text, key, kdf, lock);
        try {
          ls.set(LS_VAULT, JSON.stringify(v));
        } catch (e) {
          console.error(e);
          FS.emit('save-error', e);
        }
      }).catch((e) => { saveQueued = false; console.error(e); FS.emit('save-error', e); });
      return saveChain;
    },
    async lockNow() {
      await vault.saveNow();
      Object.assign(store, { data: null, local: null, key: null, unlocked: false });
      store.ver++;
    },
    wipe() {
      ls.del(LS_VAULT);
      ls.del(LS_GUARD);
      Object.assign(store, { data: null, local: null, key: null, kdf: null, lock: null, unlocked: false });
      store.ver++;
    },
  });

  /* ---------- защита от перебора ---------- */
  const guard = (FS.guard = {
    state() { return ls.json(LS_GUARD, { fails: 0, until: 0 }); },
    fail() {
      const g = guard.state();
      g.fails++;
      if (g.fails >= 5) g.until = Date.now() + (g.fails >= 9 ? 300000 : g.fails >= 7 ? 60000 : 30000);
      try { ls.set(LS_GUARD, JSON.stringify(g)); } catch (e) { /* ignore */ }
      return g;
    },
    reset() { ls.del(LS_GUARD); },
    waitMs() { const g = guard.state(); return Math.max(0, (g.until || 0) - Date.now()); },
  });

  /* ---------- изменения ---------- */
  function commit(mutator, opts = {}) {
    if (!store.unlocked) return;
    const res = mutator(store.data, store.local);
    store.ver++;
    vault.scheduleSave();
    FS.emit('change', opts);
    if (opts.sync !== false && FS.sync) FS.sync.schedule();
    return res;
  }
  /** изменение только локальных настроек (не синхронизируются) */
  function commitLocal(mutator) {
    if (!store.unlocked) return;
    const res = mutator(store.local);
    vault.scheduleSave();
    FS.emit('local-change');
    return res;
  }

  const actions = (FS.actions = {
    addOp(fields) {
      const t = now();
      const op = {
        id: uid('o'),
        type: fields.type === 'income' ? 'income' : 'expense',
        amount: round2(Math.abs(fields.amount)),
        date: fields.date || today(),
        cat: fields.cat,
        note: (fields.note || '').trim().slice(0, 200),
        member: fields.member || null,
        createdAt: t,
        updatedAt: t,
      };
      if (fields.demo) op.demo = true;
      commit((d) => { d.ops[op.id] = op; });
      return op;
    },
    updateOp(id, patch) {
      return commit((d) => {
        const o = d.ops[id];
        if (!o) return;
        const next = Object.assign({}, o, patch, { updatedAt: now() });
        if ('amount' in patch) next.amount = round2(Math.abs(patch.amount));
        if ('note' in patch) next.note = (patch.note || '').trim().slice(0, 200);
        delete next.demo;
        d.ops[id] = next;
      });
    },
    deleteOp(id) {
      let prev = null;
      commit((d) => {
        const o = d.ops[id];
        if (!o) return;
        prev = Object.assign({}, o);
        d.ops[id] = { id, date: o.date, deleted: true, updatedAt: now() };
      });
      return prev;
    },
    restoreOp(op) {
      commit((d) => { d.ops[op.id] = Object.assign({}, op, { deleted: undefined, updatedAt: now() }); delete d.ops[op.id].deleted; });
    },
    setLimit(catId, amount) {
      commit((d) => {
        if (amount > 0) d.limits[catId] = { amount: round2(amount), updatedAt: now() };
        else d.limits[catId] = { amount: 0, deleted: true, updatedAt: now() };
      });
    },
    setLimits(map) {
      commit((d) => {
        const t = now();
        for (const id in map) {
          const a = map[id];
          d.limits[id] = a > 0 ? { amount: round2(a), updatedAt: t } : { amount: 0, deleted: true, updatedAt: t };
        }
      });
    },
    setSettings(patch) {
      commit((d) => { d.settings = Object.assign({}, d.settings, patch, { updatedAt: now() }); });
    },
    upsertCat(cat) {
      const id = cat.id || uid('c');
      commit((d) => {
        const prev = d.cats[id] || {};
        const level = cat.level || prev.level || 'WANT';
        d.cats[id] = Object.assign({ order: 1000 + Object.keys(d.cats).length }, prev, cat, {
          id, level, kind: level === 'INCOME' ? 'income' : 'expense', updatedAt: now(),
        });
      });
      return id;
    },
    upsertMember(m) {
      const id = m.id || uid('m');
      commit((d) => {
        const t = now();
        d.members[id] = Object.assign({ createdAt: t }, d.members[id] || {}, m, { id, updatedAt: t });
        delete d.members[id].deleted;
        delete d.members[id].demo;
      });
      return id;
    },
    deleteMember(id) {
      commit((d) => { const m = d.members[id]; if (m) d.members[id] = { id, name: m.name, deleted: true, updatedAt: now() }; });
      if (store.local.me === id) commitLocal((l) => { l.me = null; });
    },
    setLocal(patch) { commitLocal((l) => Object.assign(l, patch)); },
    commit, commitLocal,
  });

  /* ---------- выборки ---------- */
  FS.members = function (includeDeleted) {
    const ms = store.data ? Object.values(store.data.members) : [];
    return ms.filter((m) => includeDeleted || !m.deleted).sort((a, b) => (a.createdAt || a.updatedAt || 0) - (b.createdAt || b.updatedAt || 0));
  };
  FS.memberName = function (id) {
    const m = store.data && store.data.members[id];
    return m ? m.name : '';
  };
  FS.cats = function (kind, opts = {}) {
    const all = Object.values(store.data.cats).filter((c) => !c.deleted && (opts.withHidden || !c.hidden));
    return all.filter((c) => !kind || c.kind === kind).sort((a, b) => (a.order || 0) - (b.order || 0));
  };
  FS.limits = function () {
    const out = {};
    const L = store.data.limits;
    for (const id in L) if (!L[id].deleted && L[id].amount > 0) out[id] = L[id].amount;
    return out;
  };

  /* ---------- слияние (для синхронизации и импорта) ---------- */
  function newer(x, y) {
    // true если y должен заменить x
    if (!x) return true;
    if (!y) return false;
    const tx = x.updatedAt || 0, ty = y.updatedAt || 0;
    if (ty !== tx) return ty > tx;
    const sx = stable(x), sy = stable(y);
    return sy > sx;
  }
  function mergeMap(target, incoming) {
    let changed = false;
    for (const k in incoming || {}) {
      const y = incoming[k];
      if (!y || typeof y !== 'object') continue;
      if (newer(target[k], y)) {
        if (!target[k] || stable(target[k]) !== stable(y)) { target[k] = y; changed = true; }
      }
    }
    return changed;
  }
  /** влить часть данных (meta или ops) в store.data; вернёт true если что-то поменялось */
  function mergeInto(data, part) {
    let changed = false;
    if (part.ops) changed = mergeMap(data.ops, part.ops) || changed;
    if (part.cats) changed = mergeMap(data.cats, part.cats) || changed;
    if (part.members) changed = mergeMap(data.members, part.members) || changed;
    if (part.limits) changed = mergeMap(data.limits, part.limits) || changed;
    if (part.settings && newer(data.settings, part.settings) && stable(data.settings) !== stable(part.settings)) {
      data.settings = Object.assign({}, data.settings, part.settings);
      changed = true;
    }
    return changed;
  }
  FS.merge = { mergeMap, mergeInto, newer };

  /** разбиение данных на файлы для облака: meta.json + ops-YYYY-MM.json */
  FS.shards = function (data) {
    const out = { 'meta.json': { cats: data.cats, members: data.members, limits: data.limits, settings: data.settings } };
    for (const id in data.ops) {
      const o = data.ops[id];
      const mk = (o.date || '0000-00').slice(0, 7);
      const name = `ops-${mk}.json`;
      (out[name] = out[name] || { ops: {} }).ops[id] = o;
    }
    return out;
  };

  /* ---------- резервные копии ---------- */
  FS.backup = {
    make() {
      return { app: 'finshtab', kind: 'backup', v: 1, exportedAt: new Date().toISOString(), version: FS.VERSION, data: store.data };
    },
    parse(text) {
      let obj;
      try { obj = JSON.parse(text); } catch (e) { throw new Error('Это не похоже на копию Финштаба (ошибка JSON)'); }
      if (!obj || obj.app !== 'finshtab' || !obj.data || typeof obj.data.ops !== 'object') throw new Error('Файл не является резервной копией Финштаба');
      return obj;
    },
    importMerge(obj) {
      let changed = false;
      commit((d) => { changed = mergeInto(d, obj.data); });
      return changed;
    },
    importReplace(obj) {
      commit((d) => {
        const t = now();
        const inc = obj.data;
        // всё текущее помечаем удалённым, а входящее делаем самым свежим — так замена переживёт синхронизацию
        for (const id in d.ops) if (!d.ops[id].deleted && !(inc.ops && inc.ops[id])) d.ops[id] = { id, date: d.ops[id].date, deleted: true, updatedAt: t };
        for (const id in inc.ops || {}) d.ops[id] = Object.assign({}, inc.ops[id], { updatedAt: t });
        for (const id in inc.cats || {}) d.cats[id] = Object.assign({}, inc.cats[id], { updatedAt: t });
        for (const id in d.members) if (!(inc.members && inc.members[id])) d.members[id] = Object.assign({}, d.members[id], { deleted: true, updatedAt: t });
        for (const id in inc.members || {}) d.members[id] = Object.assign({}, inc.members[id], { updatedAt: t });
        for (const id in d.limits) if (!(inc.limits && inc.limits[id])) d.limits[id] = { amount: 0, deleted: true, updatedAt: t };
        for (const id in inc.limits || {}) d.limits[id] = Object.assign({}, inc.limits[id], { updatedAt: t });
        if (inc.settings) d.settings = Object.assign({}, d.settings, inc.settings, { updatedAt: t });
      });
    },
    csv() {
      const rows = [['Дата', 'Тип', 'Категория', 'Уровень', 'Сумма', 'Комментарий', 'Участник']];
      const ops = FS.liveOps(store.data).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      for (const o of ops) {
        const c = FS.catOf(store.data.cats, o.cat);
        const lvl = o.type === 'income' ? 'Доход' : FS.LEVELS[c.level] ? FS.LEVELS[c.level].title : c.level;
        rows.push([o.date, o.type === 'income' ? 'Приход' : 'Расход', c.name, lvl, String(o.type === 'income' ? o.amount : -o.amount).replace('.', ','), o.note || '', FS.memberName(o.member)]);
      }
      const q = (v) => (/[;"\n\r]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
      return '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n');
    },
  };

  /* ---------- демо-данные ---------- */
  FS.demo = {
    has() { return store.data && Object.values(store.data.ops).some((o) => o.demo && !o.deleted); },
    load() {
      const rnd = mulberry32(20260917);
      const r = (a, b) => a + rnd() * (b - a);
      const ri = (a, b, step = 10) => Math.round(r(a, b) / step) * step;
      const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
      const t0 = now();
      const ops = [];
      const td = today();
      let me = store.local.me;
      let partner = null;
      commit((d, l) => {
        if (!me || !d.members[me] || d.members[me].deleted) {
          me = uid('m');
          d.members[me] = { id: me, name: 'Я', color: 'blue', createdAt: t0, updatedAt: t0 };
          l.me = me;
        }
        partner = uid('m');
        d.members[partner] = { id: partner, name: 'Аня', color: 'pink', demo: true, createdAt: t0 + 1, updatedAt: t0 + 1 };
      }, { sync: false });
      const add = (date, type, cat, amount, note, member) => {
        if (date > td) return;
        ops.push({ date, type, cat, amount: round2(amount), note, member: member || (rnd() < 0.55 ? me : partner) });
      };
      const N = {
        groceries: ['продукты на неделю', 'магазин у дома', 'рынок', 'овощи и фрукты', 'продукты', 'гипермаркет'],
        cafe: ['кофе', 'обед', 'ужин в ресторане', 'кофейня', 'бизнес-ланч'],
        market: ['заказ с маркетплейса', 'товары для дома', 'мелочи для кухни', 'заказ'],
        delivery: ['доставка роллов', 'доставка пиццы', 'доставка бургеров', 'доставка еды'],
        fun: ['кино', 'концерт', 'боулинг', 'театр'],
        health: ['аптека', 'анализы', 'стоматолог'],
        kids: ['канцелярия', 'игрушки', 'детская одежда'],
        home: ['бытовая химия', 'хозтовары', 'посуда'],
        impulse: ['спонтанная покупка', 'распродажа'],
      };
      const cm = curMonth();
      for (let i = 3; i >= 0; i--) {
        const mk = addMonths(cm, -i);
        const dim = daysInMonth(mk);
        const day = (n) => `${mk}-${pad(Math.min(n, dim))}`;
        // доходы
        add(day(5), 'income', 'salary', 76000, 'зарплата', partner);
        add(day(10), 'income', 'salary', 78000, 'зарплата', me);
        add(day(25), 'income', 'salary', 52000, 'аванс', me);
        add(day(1), 'income', 'cashback', ri(900, 2100), 'кэшбэк за прошлый месяц', me);
        if (i === 2) add(day(17), 'income', 'side', 12000, 'разовый проект', me);
        // FIXED
        add(day(1), 'expense', 'rent', 35000, 'аренда квартиры', me);
        add(day(15), 'expense', 'rent', ri(5600, 7400), 'ЖКХ', partner);
        add(day(3), 'expense', 'telecom', 650, 'мобильная связь', me);
        add(day(3), 'expense', 'telecom', 700, 'мобильная связь', partner);
        add(day(3), 'expense', 'telecom', 750, 'домашний интернет', me);
        add(day(20), 'expense', 'loans', 12500, 'кредит за машину', me);
        add(day(2), 'expense', 'edu', 6500, 'секция ребёнка', partner);
        if (i === 1) add(day(12), 'expense', 'insurance', 9800, 'ОСАГО', me);
        // LIFE
        const trips = 12 + Math.floor(rnd() * 3);
        for (let k = 0; k < trips; k++) add(day(1 + Math.floor((k + rnd()) * (dim / trips))), 'expense', 'groceries', ri(800, 3600), pick(N.groceries));
        add(day(1), 'expense', 'transport', 2900, 'проездной', me);
        add(day(1), 'expense', 'transport', 2900, 'проездной', partner);
        for (let k = 0; k < 3; k++) add(day(4 + k * 9), 'expense', 'car', ri(2800, 3600), 'бензин', me);
        if (i === 3) add(day(22), 'expense', 'car', 8500, 'ТО', me);
        add(day(9), 'expense', 'health', ri(500, 2600), pick(N.health));
        add(day(13), 'expense', 'kids', ri(1500, 4000), pick(N.kids), partner);
        add(day(24), 'expense', 'kids', ri(800, 2500), pick(N.kids), partner);
        add(day(16), 'expense', 'home', ri(800, 3200), pick(N.home));
        add(day(8), 'expense', 'pets', 2400, 'корм для кота', partner);
        // WANT
        const cafes = 6 + Math.floor(rnd() * 3);
        for (let k = 0; k < cafes; k++) add(day(1 + Math.floor((k + rnd()) * (dim / cafes))), 'expense', 'cafe', ri(350, 2400), pick(N.cafe));
        const mps = 3 + Math.floor(rnd() * 3);
        for (let k = 0; k < mps; k++) add(day(2 + Math.floor((k + rnd()) * ((dim - 2) / mps))), 'expense', 'market', ri(600, 3800), pick(N.market));
        add(day(19), 'expense', 'clothes', i === 1 ? 9800 : ri(0, 3500), i === 1 ? 'куртка' : 'одежда', partner);
        add(day(6), 'expense', 'sport', 3200, 'абонемент в зал', me);
        add(day(14), 'expense', 'fun', ri(700, 2400), pick(N.fun));
        add(day(27), 'expense', 'beauty', 2800, 'стрижка и уход', partner);
        for (let k = 0; k < 3; k++) add(day(5 + k * 8), 'expense', 'taxi', ri(450, 900), 'такси');
        if (i === 2) add(day(11), 'expense', 'travel', 32000, 'билеты на море', me);
        if (i === 1) add(day(21), 'expense', 'gifts', 4500, 'подарок маме', partner);
        // LEAK
        const dels = 3 + Math.floor(rnd() * 3);
        for (let k = 0; k < dels; k++) add(day(3 + Math.floor((k + rnd()) * ((dim - 3) / dels))), 'expense', 'delivery', ri(850, 2100), pick(N.delivery));
        add(day(7), 'expense', 'subs', 299, 'Музыка', me);
        add(day(12), 'expense', 'subs', 399, 'Онлайн-кинотеатр', partner);
        add(day(18), 'expense', 'subs', 149, 'Облако 200 ГБ', me);
        add(day(22), 'expense', 'subs', 599, 'Фитнес-приложение', me);
        add(day(1), 'expense', 'fees', 199, 'обслуживание карты', me);
        add(day(23), 'expense', 'fees', ri(50, 150), 'комиссия за перевод');
        add(day(26), 'expense', 'impulse', ri(600, 2500), pick(N.impulse));
        if (i === 1) add(day(9), 'expense', 'fines', 500, 'штраф ПДД', me);
      }
      commit((d) => {
        let t = now();
        for (const o of ops) {
          if (o.amount <= 0) continue;
          const id = uid('o');
          t++;
          d.ops[id] = Object.assign({ id, createdAt: t, updatedAt: t, demo: true }, o);
        }
        const lim = { groceries: 32000, cafe: 10000, market: 12000, delivery: 6000, taxi: 3000, fun: 4000 };
        for (const id in lim) d.limits[id] = { amount: lim[id], updatedAt: t, demo: true };
      });
    },
    clear() {
      commit((d) => {
        const t = now();
        for (const id in d.ops) { const o = d.ops[id]; if (o.demo && !o.deleted) d.ops[id] = { id, date: o.date, deleted: true, updatedAt: t }; }
        for (const id in d.members) { const m = d.members[id]; if (m.demo && !m.deleted) d.members[id] = { id, name: m.name, deleted: true, updatedAt: t }; }
        for (const id in d.limits) { const l = d.limits[id]; if (l.demo && !l.deleted) d.limits[id] = { amount: 0, deleted: true, updatedAt: t }; }
      });
    },
  };

  FS.normalize = normalize;
  FS.freshData = freshData;
  FS.freshLocal = freshLocal;
  FS.ls = ls;
})();
