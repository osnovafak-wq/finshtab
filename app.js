/* Финштаб — запуск, обработка нажатий, автоблокировка, свайпы, обновления */
(function () {
  'use strict';
  const FS = window.FS;
  const UI = FS.ui;
  const V = FS.views;
  const store = FS.store;
  const { $, $$, ICONS, addMonths, curMonth } = FS;

  const app = (FS.app = { suspendLockUntil: 0 });
  const DEFAULT_FILTER = () => ({ month: 'all', type: 'all', cat: 'all', member: 'all', q: '' });

  /* ---------- каркас ---------- */
  function paintIcons(root = document) {
    $$('[data-ico]', root).forEach((s) => { s.outerHTML = ICONS[s.dataset.ico] || ''; });
  }
  function showShell() {
    ['#app', '#navbar', '#tabbar', '#fab'].forEach((s) => ($(s).hidden = false));
    $$('.view').forEach((v) => (v.hidden = v.dataset.tab !== V.tab));
    $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === V.tab)));
  }
  function hideShell() {
    ['#app', '#navbar', '#tabbar', '#fab'].forEach((s) => ($(s).hidden = true));
    $$('.view').forEach((v) => (v.innerHTML = ''));
  }

  /* ---------- перерисовка ---------- */
  let rerenderQueued = false;
  function rerender() {
    if (!store.unlocked || rerenderQueued) return;
    rerenderQueued = true;
    requestAnimationFrame(() => {
      rerenderQueued = false;
      if (!store.unlocked) return;
      const ae = document.activeElement;
      if (V.tab === 'ops' && ae && ae.id === 'opsSearch') { V.renderNav(); V.refreshOpsList(); return; }
      V.render();
    });
  }
  FS.on('change', rerender);
  FS.on('local-change', rerender);
  let lastSync = '';
  FS.on('sync', (st) => {
    if (!store.unlocked) return;
    V.renderNav();
    const key = st.status + '|' + st.code;
    if (key !== lastSync && (st.status === 'error' || st.status === 'needpass' || /error|needpass/.test(lastSync))) rerender();
    lastSync = key;
  });
  FS.on('save-error', () => UI.toast('Не удалось сохранить: закончилась память браузера', { error: true, timeout: 5000 }));

  FS.on('unlocked', () => {
    V.tab = FS.prefs.get('tab', 'overview');
    V.period = FS.prefs.get('period', '3');
    V.month = curMonth();
    V.f = DEFAULT_FILTER();
    showShell();
    V.render();
    window.scrollTo(0, 0);
    FS.sync.reset();
    if (FS.sync.configured()) FS.sync.run();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
  });

  /* ---------- блокировка ---------- */
  app.lock = async function () {
    if (!store.unlocked) return;
    UI.closeAll();
    await FS.vault.lockNow();
    hideShell();
    FS.sync.reset();
    FS.lock.unlock();
  };
  app.askSyncPassword = function () {
    const v = FS.sync.state.needPass;
    if (!v) return;
    UI.passcode({
      title: 'Новый код-пароль семьи',
      sub: 'Его сменили на другом устройстве',
      lock: v.lock,
      cancel: { label: 'Позже', onClick: () => FS.lock.hide() },
      onSubmit: async (pw) => {
        const ok = await FS.sync.providePassword(pw);
        if (!ok) return false;
        FS.lock.hide();
        UI.toast('Код-пароль обновлён, синхронизация продолжена');
        return true;
      },
    });
  };
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      if (store.unlocked) {
        FS.vault.saveNow();
        if (store.local.autoLock >= 0 && Date.now() > app.suspendLockUntil) document.body.classList.add('privacy');
      }
      return;
    }
    document.body.classList.remove('privacy');
    if (!store.unlocked || !hiddenAt) return;
    const al = store.local.autoLock;
    const away = Date.now() - hiddenAt;
    hiddenAt = 0;
    if (al >= 0 && away >= al && Date.now() > app.suspendLockUntil) { app.lock(); return; }
    if (FS.sync.configured() && Date.now() - (store.local.sync.lastSyncAt || 0) > 15000) FS.sync.run();
    if (V.month !== curMonth() && away > 6 * 3600e3) V.month = curMonth();
    rerender();
  });
  window.addEventListener('pagehide', () => { if (store.unlocked) FS.vault.saveNow(); });
  window.addEventListener('beforeunload', () => { if (store.unlocked) FS.vault.saveNow(); });
  window.addEventListener('online', () => { if (store.unlocked) FS.sync.run(); });
  setInterval(() => { if (store.unlocked && document.visibilityState === 'visible' && FS.sync.configured()) FS.sync.run(); }, 120000);
  // внешние окна (выбор файла, «Поделиться») не должны блокировать приложение
  const origSave = FS.saveFile;
  FS.saveFile = async (...a) => { app.suspendLockUntil = Date.now() + 120000; try { return await origSave(...a); } finally { app.suspendLockUntil = Date.now() + 3000; } };
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('input[type=file]')) app.suspendLockUntil = Date.now() + 120000;
  }, true);

  /* ---------- нажатия ---------- */
  function deleteWithUndo(id) {
    const prev = FS.actions.deleteOp(id);
    if (!prev) return;
    UI.haptic('success');
    UI.toast('Операция удалена', { icon: 'trash', action: { label: 'Вернуть', onClick: () => FS.actions.restoreOp(prev) } });
  }
  const ACT = {
    tab: (el) => { UI.haptic(); V.setTab(el.dataset.tab); },
    add: () => {
      const preset = {};
      if (V.tab === 'ops' && V.f.cat !== 'all' && !V.f.cat.startsWith('lvl:') && store.data.cats[V.f.cat]) {
        preset.cat = V.f.cat;
        preset.type = store.data.cats[V.f.cat].kind;
      } else if (V.tab === 'ops' && V.f.type === 'income') preset.type = 'income';
      V.openOp(null, preset);
    },
    op: (el) => {
      if (el._swiped && Date.now() - el._swiped < 450) return;
      if (el._open) { closeSwipe(el); return; }
      const op = store.data.ops[el.dataset.id];
      if (op && !op.deleted) V.openOp(op);
    },
    'op-swipe-del': (el) => deleteWithUndo(el.dataset.id),
    settings: () => V.openSettings(),
    'open-sync': () => V.openSettings('sync'),
    'open-backup': () => V.openSettings('backup'),
    'install-help': async () => {
      if (app.installPrompt) {
        const p = app.installPrompt;
        app.installPrompt = null;
        p.prompt();
        return;
      }
      V.openSettings('install');
    },
    'sync-now': () => {
      if (FS.sync.state.status === 'needpass') return app.askSyncPassword();
      if (!FS.sync.configured()) return V.openSettings('sync');
      UI.haptic();
      FS.sync.run().then(() => {
        const st = FS.sync.state;
        if (st.status === 'ok') UI.toast('Синхронизировано');
        else if (st.status === 'offline') UI.toast('Нет связи с GitHub — повторим позже', { icon: 'cloudSlash' });
        else if (st.status === 'error') UI.toast(st.error, { error: true, timeout: 5000 });
      });
    },
    'sync-pass': () => app.askSyncPassword(),
    'month-prev': () => { V.month = addMonths(V.month, -1); UI.haptic(); V.render(); },
    'month-next': () => { if (V.month < V.maxMonth()) { V.month = addMonths(V.month, 1); UI.haptic(); V.render(); } },
    'month-pick': () => V.openMonthPicker(),
    'chart-month': (el) => {
      const mk = el.dataset.mk;
      if (!mk || mk === V.month || (V.S(mk).count === 0 && mk !== curMonth())) return;
      V.month = mk;
      UI.haptic();
      V.render();
    },
    'goto-ops': (el) => {
      V.f = Object.assign(DEFAULT_FILTER(), {
        month: el.dataset.month || 'all',
        type: el.dataset.type || 'all',
        cat: el.dataset.cat || 'all',
        q: el.dataset.q || '',
      });
      if (V.f.q && V.f.cat !== 'all') V.f.q = '';
      V.limit = 150;
      if (V.tab === 'ops') { V.render(); window.scrollTo(0, 0); } else { V.scroll.ops = 0; V.setTab('ops'); }
    },
    'filter-reset': () => { V.f = DEFAULT_FILTER(); V.limit = 150; V.render(); },
    'search-clear': () => { V.f.q = ''; V.render(); const i = $('#opsSearch'); if (i) i.focus(); },
    'ops-more': () => { V.limit += 150; V.refreshOpsList(); },
    'demo-clear': async () => {
      const ok = await UI.confirm('Удалить демо-данные?', 'Останутся только записи, которые вы внесли сами. Можно начинать вести свой учёт.', 'Удалить', true);
      if (!ok) return;
      FS.demo.clear();
      V.month = curMonth();
      UI.toast('Демо-данные удалены. Добавьте первую операцию ＋');
    },
    'demo-load': () => { FS.demo.load(); UI.toast('Демо-данные загружены'); },
    'hint-close': (el) => FS.actions.commitLocal((l) => { l.hints[el.dataset.hint] = true; }),
    'backup-snooze': () => FS.actions.commitLocal((l) => { l.hints.backupSnooze = Date.now(); }),
    limit: (el) => V.openLimit(el.dataset.cat),
    'limits-suggest': () => V.suggestLimits(),
    'app-update': () => app.applyUpdate(),
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.closest('#overlays') || el.closest('#modals') || el.closest('#lock')) return;
    if (!store.unlocked) return;
    const fn = ACT[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('change', (e) => {
    const s = e.target.closest('select[data-filter]');
    if (!s || !store.unlocked) return;
    V.f[s.dataset.filter] = s.value;
    V.limit = 150;
    V.render();
  });
  document.addEventListener('keydown', (e) => {
    if (!store.unlocked || UI.hasOverlay() || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.key === 'n' || e.key === 'т' || e.key === '+') { e.preventDefault(); ACT.add(); }
    else if (e.key >= '1' && e.key <= '4') V.setTab(['overview', 'ops', 'limits', 'analysis'][+e.key - 1]);
  });
  // :active на iOS
  document.addEventListener('touchstart', () => {}, { passive: true });

  /* ---------- свайп для удаления операций ---------- */
  let sw = null;
  let openFront = null;
  function closeSwipe(f) {
    if (!f) return;
    f.style.transform = '';
    f._open = false;
    if (openFront === f) openFront = null;
    setTimeout(() => { if (!f._open && f.parentElement) f.parentElement.classList.remove('active'); }, 320);
  }
  document.addEventListener('touchstart', (e) => {
    const front = e.target.closest && e.target.closest('.swipe__front');
    if (openFront && openFront !== front && !e.target.closest('.swipe__del')) closeSwipe(openFront);
    if (!front) { sw = null; return; }
    const t = e.touches[0];
    sw = { front, x0: t.clientX, y0: t.clientY, base: front._open ? -88 : 0, mode: null, t: front._open ? -88 : 0 };
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!sw) return;
    const t = e.touches[0];
    const dx = t.clientX - sw.x0, dy = t.clientY - sw.y0;
    if (!sw.mode) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) sw.mode = 'h';
      else if (Math.abs(dy) > 10) { sw = null; return; }
      else return;
    }
    if (e.cancelable) e.preventDefault();
    sw.t = Math.min(0, sw.base + dx);
    sw.front.classList.add('dragging');
    if (sw.front.parentElement) sw.front.parentElement.classList.add('active');
    sw.front.style.transform = `translateX(${sw.t}px)`;
  }, { passive: false });
  const swEnd = () => {
    if (!sw) return;
    const f = sw.front;
    f.classList.remove('dragging');
    if (sw.mode === 'h') {
      const w = f.offsetWidth;
      f._swiped = Date.now();
      if (sw.t < -w * 0.6) {
        f.style.transform = `translateX(${-w}px)`;
        const id = f.dataset.id;
        setTimeout(() => deleteWithUndo(id), 180);
        openFront = null;
      } else if (sw.t < -40) {
        f.style.transform = 'translateX(-88px)';
        f._open = true;
        openFront = f;
        UI.haptic();
      } else closeSwipe(f);
    }
    sw = null;
  };
  document.addEventListener('touchend', swEnd);
  document.addEventListener('touchcancel', swEnd);

  /* ---------- ширина экрана (перерисовка графиков) ---------- */
  let lastW = window.innerWidth;
  window.addEventListener('resize', FS.debounce(() => {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    rerender();
  }, 250));

  /* ---------- service worker и обновления ---------- */
  app.applyUpdate = async function () {
    if (store.unlocked) await FS.vault.saveNow();
    const w = FS.updateReady;
    if (w && w.postMessage) w.postMessage('skipWaiting');
    else location.reload();
  };
  function registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || !FS.updateReady) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').then((reg) => {
      if (!reg) return;
      const waiting = (w) => { FS.updateReady = w; rerender(); };
      if (reg.waiting && navigator.serviceWorker.controller) waiting(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (nw) nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) waiting(nw); });
      });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch((e) => console.warn('SW', e));
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); app.installPrompt = e; });

  /* ---------- старт ---------- */
  function boot() {
    paintIcons();
    FS.applyTheme();
    try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', FS.applyTheme); } catch (e) { /* старые браузеры */ }
    registerSW();
    FS.lock.boot();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
