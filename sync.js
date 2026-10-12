/* Финштаб — семейная синхронизация через приватный репозиторий GitHub.
   В облаке лежат зашифрованные файлы: meta.json (категории, участники, лимиты, настройки)
   и ops-YYYY-MM.json (операции месяца). Без код-пароля прочитать их нельзя. */
(function () {
  'use strict';
  const FS = window.FS;
  const store = FS.store;
  const { stable } = FS;

  const API = 'https://api.github.com';
  const DEFAULT_FOLDER = 'finshtab';
  const FILE_RE = /^(meta|ops-\d{4}-\d{2})\.json$/;

  class SyncError extends Error {
    constructor(code, message, extra) { super(message); this.code = code; Object.assign(this, extra || {}); }
  }
  const MSG = {
    auth: 'Токен не подходит или истёк. Создайте новый и вставьте его в настройках синхронизации.',
    forbidden: 'Нет прав на запись. У токена должно быть право «Contents: Read and write» для этого репозитория.',
    notfound: 'Репозиторий не найден. Проверьте название и что токен выдан именно на этот репозиторий.',
    rate: 'GitHub временно ограничил запросы. Повторим позже.',
    network: 'Нет связи с GitHub. Изменения сохранены на устройстве и отправятся позже.',
    server: 'GitHub временно недоступен. Повторим позже.',
    corrupt: 'В папке синхронизации лежат чужие или повреждённые файлы.',
    needpass: 'Код-пароль семьи изменился. Введите новый код-пароль.',
  };

  function utf8b64(text) { return FS.crypto.b64(new TextEncoder().encode(text)); }
  function b64utf8(b) { return new TextDecoder().decode(FS.crypto.unb64(b)); }
  const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function parseRepo(input) {
    let s = String(input || '').trim();
    s = s.replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
    const m = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(s);
    return m ? { owner: m[1], repo: m[2] } : null;
  }

  /* ---------- клиент GitHub REST API ---------- */
  function client(cfg) {
    const base = `${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
    async function req(method, path, body, accept) {
      let res;
      try {
        res = await fetch(base + path, {
          method,
          cache: 'no-store',
          headers: Object.assign(
            { Authorization: `Bearer ${cfg.token}`, Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
            body ? { 'Content-Type': 'application/json' } : {}
          ),
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        throw new SyncError('network', MSG.network);
      }
      return res;
    }
    async function fail(res, ctx) {
      let msg = '';
      try { msg = (await res.json()).message || ''; } catch (e) { /* ignore */ }
      if (res.status === 401) throw new SyncError('auth', MSG.auth);
      if (res.status === 403 || res.status === 429) {
        if (res.headers.get('x-ratelimit-remaining') === '0' || res.status === 429 || /rate limit/i.test(msg)) throw new SyncError('rate', MSG.rate);
        throw new SyncError('forbidden', MSG.forbidden);
      }
      if (res.status === 404) throw new SyncError('notfound', MSG.notfound);
      if (res.status === 409 || res.status === 422) throw new SyncError('conflict', 'conflict: ' + msg);
      if (res.status >= 500) throw new SyncError('server', MSG.server);
      throw new SyncError('http', `GitHub ответил ошибкой ${res.status}${msg ? ': ' + msg : ''}${ctx ? ' (' + ctx + ')' : ''}`);
    }
    return {
      async repo() {
        const res = await req('GET', '');
        if (!res.ok) await fail(res, 'repo');
        return res.json();
      },
      async list(folder) {
        const res = await req('GET', `/contents/${enc(folder)}`);
        if (res.status === 404) return null;
        if (!res.ok) await fail(res, 'list');
        const j = await res.json();
        return Array.isArray(j) ? j : [];
      },
      async get(path) {
        const res = await req('GET', `/contents/${enc(path)}`);
        if (res.status === 404) return null;
        if (!res.ok) await fail(res, 'get');
        const j = await res.json();
        if (j.content && j.encoding === 'base64') return { sha: j.sha, text: b64utf8(j.content) };
        // файл больше 1 МБ — забираем «сырым»
        const raw = await req('GET', `/contents/${enc(path)}`, null, 'application/vnd.github.raw+json');
        if (!raw.ok) await fail(raw, 'raw');
        return { sha: j.sha, text: await raw.text() };
      },
      async put(path, text, sha, message) {
        const body = { message, content: utf8b64(text) };
        if (sha) body.sha = sha;
        const res = await req('PUT', `/contents/${enc(path)}`, body);
        if (res.status === 409 || res.status === 422) return { conflict: true };
        if (!res.ok) await fail(res, 'put');
        const j = await res.json();
        return { sha: j.content && j.content.sha };
      },
    };
  }

  /* ---------- состояние синхронизации ---------- */
  const state = { status: 'off', error: '', code: '', needPass: null };
  let running = null;
  let pending = false;
  let timer = null;

  function setStatus(status, err) {
    state.status = status;
    state.error = err ? err.message || String(err) : '';
    state.code = err ? err.code || '' : '';
    FS.emit('sync', state);
  }
  function cfg() { return store.unlocked && store.local && store.local.sync; }
  function label(name) {
    if (name === 'meta.json') return 'настройки';
    const m = /^ops-(\d{4}-\d{2})\.json$/.exec(name);
    return m ? 'операции ' + m[1] : name;
  }
  const metaFirst = (a, b) => (a === 'meta.json' ? -1 : b === 'meta.json' ? 1 : a < b ? -1 : a > b ? 1 : 0);

  async function openRemote(text) {
    let v;
    try { v = JSON.parse(text); } catch (e) { throw new SyncError('corrupt', MSG.corrupt); }
    if (!v || v.app !== 'finshtab' || !v.kdf || !v.enc) throw new SyncError('corrupt', MSG.corrupt);
    return v;
  }

  /** один проход: скачать изменённое → слить → отправить отличающееся */
  async function syncOnce(c) {
    const api = client(c);
    const folder = c.folder || DEFAULT_FOLDER;
    const listing = await api.list(folder);
    const remote = {};
    for (const f of listing || []) if (f.type === 'file' && FILE_RE.test(f.name)) remote[f.name] = f.sha;
    c.files = c.files || {};
    for (const n of Object.keys(c.files)) if (!remote[n]) delete c.files[n];

    let changed = false;
    for (const name of Object.keys(remote).sort(metaFirst)) {
      const sha = remote[name];
      const known = c.files[name];
      if (known && (known.sha === sha || (known.prev || []).includes(sha))) continue;
      const file = await api.get(`${folder}/${name}`);
      if (!file) continue;
      const v = await openRemote(file.text);
      if (v.kdf.salt !== store.kdf.salt) throw new SyncError('needpass', MSG.needpass, { vault: v });
      let content;
      try { content = await FS.crypto.open(v, store.key); } catch (e) { throw new SyncError('needpass', MSG.needpass, { vault: v }); }
      if (FS.merge.mergeInto(store.data, content)) changed = true;
      c.files[name] = { sha: file.sha || sha, hash: await FS.crypto.sha(stable(content)), prev: known && known.sha ? [known.sha].concat(known.prev || []).slice(0, 5) : [] };
    }
    if (changed) {
      store.ver++;
      FS.vault.scheduleSave();
      FS.emit('change', { remote: true });
    }

    const shards = FS.shards(store.data);
    for (const name of Object.keys(shards).sort(metaFirst)) {
      const content = shards[name];
      const h = await FS.crypto.sha(stable(content));
      const known = c.files[name];
      if (known && known.hash === h) continue;
      const v = await FS.crypto.seal(content, store.key, store.kdf, store.lock);
      const res = await api.put(`${folder}/${name}`, JSON.stringify(v), known && known.sha, `Финштаб: ${label(name)} · ${store.local.deviceName || 'устройство'}`);
      if (res.conflict) return 'retry';
      c.files[name] = { sha: res.sha, hash: h, prev: known && known.sha ? [known.sha].concat(known.prev || []).slice(0, 5) : [] };
    }
    return 'ok';
  }

  async function run() {
    const c = cfg();
    if (!c || !c.token) { setStatus('off'); return; }
    if (state.needPass) return;
    if (running) { pending = true; return running; }
    running = (async () => {
      setStatus('syncing');
      try {
        let r = 'retry';
        for (let attempt = 0; attempt < 4 && r === 'retry'; attempt++) {
          if (attempt) await sleep(500 * attempt);
          r = await syncOnce(c);
        }
        if (r === 'retry') throw new SyncError('server', 'Не удалось договориться с GitHub о версии файлов. Повторим позже.');
        c.lastSyncAt = Date.now();
        c.lastError = '';
        setStatus('ok');
      } catch (e) {
        console.warn('sync', e);
        if (e.code === 'needpass') {
          state.needPass = e.vault;
          setStatus('needpass', e);
        } else {
          c.lastError = e.message;
          setStatus(e.code === 'network' ? 'offline' : 'error', e);
        }
      } finally {
        if (store.unlocked) FS.vault.scheduleSave();
        running = null;
        if (pending) { pending = false; schedule(800); }
      }
    })();
    return running;
  }

  function schedule(ms = 2500) {
    if (!cfg()) return;
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  }

  /** проверить репозиторий и узнать, есть ли там данные */
  async function probe(c) {
    const api = client(c);
    const info = await api.repo();
    const folder = c.folder || DEFAULT_FOLDER;
    const listing = await api.list(folder);
    const names = (listing || []).filter((f) => f.type === 'file' && FILE_RE.test(f.name)).map((f) => f.name);
    if (!names.includes('meta.json')) return { info, empty: true, names };
    const meta = await api.get(`${folder}/meta.json`);
    const vault = await openRemote(meta.text);
    return { info, empty: false, names, vault, metaSha: meta.sha };
  }

  /** вход в семью: скачать и расшифровать всё (новое устройство) */
  async function download(c, password, pr) {
    const key = await FS.crypto.deriveKey(password, pr.vault.kdf);
    let meta;
    try { meta = await FS.crypto.open(pr.vault, key); } catch (e) { return null; }
    const api = client(c);
    const folder = c.folder || DEFAULT_FOLDER;
    const data = FS.freshData();
    FS.merge.mergeInto(data, meta);
    const files = { 'meta.json': { sha: pr.metaSha, hash: await FS.crypto.sha(stable(meta)), prev: [] } };
    for (const name of pr.names.filter((n) => n !== 'meta.json')) {
      const f = await api.get(`${folder}/${name}`);
      if (!f) continue;
      const v = await openRemote(f.text);
      if (v.kdf.salt !== pr.vault.kdf.salt) continue;
      const content = await FS.crypto.open(v, key);
      FS.merge.mergeInto(data, content);
      files[name] = { sha: f.sha, hash: await FS.crypto.sha(stable(content)), prev: [] };
    }
    return { key, kdf: pr.vault.kdf, lock: pr.vault.lock || { type: 'digits', len: 4 }, data, files };
  }

  /** ввести новый код-пароль семьи (после смены пароля на другом устройстве) */
  async function providePassword(password) {
    const v = state.needPass;
    if (!v) return true;
    const key = await FS.crypto.deriveKey(password, v.kdf);
    try { await FS.crypto.open(v, key); } catch (e) { return false; }
    await FS.vault.rekey(key, v.kdf, v.lock);
    const c = cfg();
    if (c && c.files) for (const n in c.files) c.files[n].hash = null;
    state.needPass = null;
    setStatus('idle');
    await run();
    return true;
  }

  function connectLocal(c, files) {
    FS.actions.setLocal({ sync: { owner: c.owner, repo: c.repo, folder: c.folder || DEFAULT_FOLDER, token: c.token, files: files || {}, lastSyncAt: 0, lastError: '', since: Date.now() } });
    state.needPass = null;
    setStatus('idle');
  }
  function disconnect() {
    FS.actions.setLocal({ sync: null });
    state.needPass = null;
    clearTimeout(timer);
    setStatus('off');
  }

  FS.sync = {
    state, run, schedule, probe, download, providePassword, connectLocal, disconnect, parseRepo, client,
    DEFAULT_FOLDER, MSG, SyncError,
    configured: () => !!cfg(),
    reset() { state.needPass = null; clearTimeout(timer); setStatus(cfg() ? 'idle' : 'off'); },
  };
})();
