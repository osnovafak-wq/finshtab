/* Финштаб — интерфейсный кит: шторки, алерты, тосты, сегменты, графики, экран код-пароля и онбординг */
(function () {
  'use strict';
  const FS = window.FS;
  const { $, $$, esc, ICONS, short, plural } = FS;
  const UI = (FS.ui = {});

  /* ---------- утилиты ---------- */
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  UI.el = el;
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  UI.nextFrame = nextFrame;
  UI.isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  UI.isAndroid = /Android/.test(navigator.userAgent);
  UI.standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  /* ---------- тактильный отклик ---------- */
  UI.haptic = function (kind = 'light') {
    try {
      if (navigator.vibrate && !UI.isIOS) {
        navigator.vibrate(kind === 'error' ? [24, 40, 24] : kind === 'success' ? [10, 40, 14] : 8);
        return;
      }
      const l = document.querySelector('.haptic-label');
      if (l) l.click();
    } catch (e) { /* ignore */ }
  };

  /* ---------- клавиатура iOS: отступ снизу для шторок ---------- */
  if (window.visualViewport) {
    const upd = () => {
      const vv = window.visualViewport;
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', (kb > 80 ? kb : 0) + 'px');
    };
    visualViewport.addEventListener('resize', upd);
    visualViewport.addEventListener('scroll', upd);
  }

  /* ---------- стек оверлеев (Esc закрывает верхний) ---------- */
  const overlayStack = [];
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlayStack.length) {
      const top = overlayStack[overlayStack.length - 1];
      if (top.dismiss) top.dismiss();
    }
  });
  function lockScroll() { document.body.classList.toggle('sheet-open', overlayStack.length > 0); }
  UI.closeAll = function () {
    overlayStack.length = 0;
    ['#overlays', '#modals'].forEach((sel) => { const o = $(sel); if (o) o.innerHTML = ''; });
    lockScroll();
  };
  UI.hasOverlay = () => overlayStack.length > 0;

  /* ---------- шторка ---------- */
  /**
   * UI.sheet({ title, left, right, full, body(el, ctrl) | html, onClose })
   * left/right: { label?, icon?, bold?, fill?, round?, disabled?, onClick(ctrl) } | 'close' | 'cancel'
   */
  UI.sheet = function (opts) {
    const root = $('#overlays');
    const bd = el('div', 'backdrop');
    const sh = el('div', 'sheet' + (opts.full ? ' full' : '') + (opts.className ? ' ' + opts.className : ''));
    sh.setAttribute('role', 'dialog');
    sh.setAttribute('aria-modal', 'true');
    sh.innerHTML = '<div class="sheet__grab"></div><div class="sheet__pages"></div>';
    const pagesEl = sh.querySelector('.sheet__pages');
    const pages = [];
    let closed = false;

    const ctrl = {
      el: sh,
      get page() { return pages[pages.length - 1]; },
      get body() { return pages[pages.length - 1].body; },
      push(p) { return addPage(p, true); },
      pop() { return popPage(); },
      replace(p) {
        const old = pages.pop();
        const pg = addPage(p, false);
        old.el.remove();
        return pg;
      },
      close,
      dismiss() { if (opts.onDismissAttempt && opts.onDismissAttempt() === false) return; close(); },
      setRight(cfg) { renderBtn(ctrl.page.right, cfg, ctrl.page); },
      setLeft(cfg) { renderBtn(ctrl.page.left, cfg, ctrl.page); },
      setTitle(t) { ctrl.page.titleEl.textContent = t; ctrl.page.title = t; },
      rerender() { const p = ctrl.page; if (p.def.body) { p.body.innerHTML = ''; p.def.body(p.body, ctrl); } },
    };

    function renderBtn(holder, cfg, page) {
      holder.innerHTML = '';
      if (!cfg) return;
      if (cfg === 'close') cfg = { icon: 'xmark', round: true, label: 'Закрыть', onClick: () => ctrl.dismiss() };
      if (cfg === 'cancel') cfg = { label: 'Отменить', onClick: () => ctrl.dismiss() };
      if (cfg === 'back') {
        const prev = pages[pages.indexOf(page) - 1];
        const own = (page.def && page.def.title) || '';
        const lbl = prev && prev.title && prev.title.length + own.length <= 19 ? prev.title : '';
        cfg = lbl ? { icon: 'chevronL', label: lbl, back: true, onClick: () => popPage() } : { icon: 'chevronL', round: true, label: 'Назад', onClick: () => popPage() };
      }
      const b = el('button', 'sheet__btn' + (cfg.bold ? ' sheet__btn--bold' : '') + (cfg.fill ? ' sheet__btn--fill' : '') + (cfg.round ? ' sheet__btn--round' : ''));
      b.type = 'button';
      if (cfg.round) { b.innerHTML = ICONS[cfg.icon]; b.setAttribute('aria-label', cfg.label || ''); }
      else b.innerHTML = (cfg.icon ? ICONS[cfg.icon] : '') + (cfg.label ? `<span>${esc(cfg.back ? truncate(cfg.label, 14) : cfg.label)}</span>` : '');
      b.disabled = !!cfg.disabled;
      b.addEventListener('click', () => cfg.onClick && cfg.onClick(ctrl));
      holder.appendChild(b);
      holder._btn = b;
    }
    function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

    function addPage(def, animate) {
      const pe = el('div', 'sheet__page');
      pe.innerHTML = '<div class="sheet__nav"><div class="nav-l"></div><div class="sheet__title"></div><div class="nav-r"></div></div><div class="sheet__body"></div>';
      const page = { def, el: pe, left: pe.querySelector('.nav-l'), right: pe.querySelector('.nav-r'), titleEl: pe.querySelector('.sheet__title'), body: pe.querySelector('.sheet__body'), title: def.title || '' };
      page.titleEl.textContent = def.title || '';
      const prev = pages[pages.length - 1];
      pages.push(page);
      renderBtn(page.left, def.left || (prev ? 'back' : null), page);
      renderBtn(page.right, def.right || null, page);
      if (def.html != null) page.body.innerHTML = def.html;
      if (def.body) def.body(page.body, ctrl);
      bindDrag(pe.querySelector('.sheet__nav'));
      if (prev) {
        sh.classList.add('full');
        pages.forEach((p) => { p.el.style.position = 'absolute'; p.el.style.inset = '0'; });
        pe.classList.add('enter');
        pagesEl.appendChild(pe);
        if (animate) {
          nextFrame().then(() => { pe.classList.remove('enter'); prev.el.classList.add('behind'); });
        } else { pe.classList.remove('enter'); prev.el.classList.add('behind'); }
      } else {
        pe.style.position = opts.full ? 'absolute' : 'relative';
        if (opts.full) pe.style.inset = '0';
        pagesEl.appendChild(pe);
      }
      if (def.onShow) setTimeout(() => def.onShow(page.body, ctrl), animate ? 380 : 0);
      return page;
    }
    function popPage() {
      if (pages.length < 2) return close();
      const p = pages.pop();
      const prev = pages[pages.length - 1];
      p.el.classList.add('leave');
      prev.el.classList.remove('behind');
      if (prev.def.onReturn) prev.def.onReturn(prev.body, ctrl);
      setTimeout(() => p.el.remove(), 400);
    }

    function close() {
      if (closed) return;
      closed = true;
      sh.classList.remove('show');
      bd.classList.remove('show');
      const i = overlayStack.indexOf(entry);
      if (i >= 0) overlayStack.splice(i, 1);
      lockScroll();
      setTimeout(() => { sh.remove(); bd.remove(); }, 460);
      if (opts.onClose) opts.onClose();
    }

    // свайп вниз для закрытия
    function bindDrag(handle) {
      let y0 = null, dy = 0, t0 = 0;
      const start = (y) => { y0 = y; dy = 0; t0 = Date.now(); sh.classList.add('dragging'); };
      const move = (y) => { if (y0 == null) return; dy = Math.max(0, y - y0); sh.style.transform = `translateY(${dy}px)`; };
      const end = () => {
        if (y0 == null) return;
        sh.classList.remove('dragging');
        sh.style.transform = '';
        const v = dy / Math.max(1, Date.now() - t0);
        y0 = null;
        if (dy > 140 || (dy > 40 && v > 0.6)) ctrl.dismiss();
      };
      handle.addEventListener('touchstart', (e) => { if (e.target.closest('button,input,select,textarea')) return; start(e.touches[0].clientY); }, { passive: true });
      handle.addEventListener('touchmove', (e) => move(e.touches[0].clientY), { passive: true });
      handle.addEventListener('touchend', end);
      handle.addEventListener('touchcancel', end);
    }

    root.append(bd, sh);
    bd.addEventListener('click', () => ctrl.dismiss());
    bindDrag(sh.querySelector('.sheet__grab'));
    const entry = { dismiss: () => ctrl.dismiss() };
    overlayStack.push(entry);
    lockScroll();
    addPage(opts, false);
    nextFrame().then(() => { sh.classList.add('show'); bd.classList.add('show'); });
    return ctrl;
  };

  /* ---------- алерт ---------- */
  /** UI.alert({ title, message, input:{placeholder,value,type}, buttons:[{label, role, value}] }) → Promise<{value, input}> */
  UI.alert = function (o) {
    return new Promise((resolve) => {
      const root = $('#modals');
      const bd = el('div', 'backdrop');
      const wrap = el('div', 'alert-wrap');
      const btns = o.buttons || [{ label: 'OK', role: 'primary', value: true }];
      const two = btns.length === 2 && btns.every((b) => b.label.length < 14);
      wrap.innerHTML = `<div class="alert" role="alertdialog" aria-modal="true">
        ${o.title ? `<div class="alert__title">${esc(o.title)}</div>` : ''}
        ${o.message ? `<div class="alert__msg">${o.html ? o.message : esc(o.message)}</div>` : ''}
        ${o.input ? `<input class="input alert__input" type="${o.input.type || 'text'}" placeholder="${esc(o.input.placeholder || '')}" value="${esc(o.input.value || '')}" ${o.input.inputmode ? `inputmode="${o.input.inputmode}"` : ''}>` : ''}
        <div class="alert__btns${two ? ' two' : ''}">${btns.map((b, i) => `<button type="button" data-i="${i}" class="${b.role || ''}">${esc(b.label)}</button>`).join('')}</div>
      </div>`;
      root.append(bd, wrap);
      const box = wrap.querySelector('.alert');
      const inp = wrap.querySelector('input');
      const entry = {
        dismiss: () => {
          const c = btns.find((b) => b.role === 'cancel');
          finish(c ? c.value : null);
        },
      };
      overlayStack.push(entry);
      lockScroll();
      nextFrame().then(() => { bd.classList.add('show'); box.classList.add('show'); if (inp) inp.focus(); });
      function finish(value) {
        const i = overlayStack.indexOf(entry);
        if (i >= 0) overlayStack.splice(i, 1);
        lockScroll();
        bd.classList.remove('show');
        box.classList.remove('show');
        setTimeout(() => { bd.remove(); wrap.remove(); }, 260);
        resolve({ value, input: inp ? inp.value : undefined });
      }
      wrap.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-i]');
        if (b) finish(btns[+b.dataset.i].value);
      });
      if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const p = btns.find((b) => b.role === 'primary') || btns[btns.length - 1]; finish(p.value); } });
    });
  };
  UI.confirm = async function (title, message, okLabel = 'OK', destructive = false) {
    const r = await UI.alert({ title, message, buttons: [{ label: 'Отменить', role: 'cancel', value: false }, { label: okLabel, role: destructive ? 'destructive' : 'primary', value: true }] });
    return !!r.value;
  };
  UI.info = (title, message) => UI.alert({ title, message, buttons: [{ label: 'Понятно', role: 'primary', value: true }] });

  /* ---------- экшн-шит ---------- */
  UI.actions = function (o) {
    return new Promise((resolve) => {
      const root = $('#modals');
      const bd = el('div', 'backdrop');
      const as = el('div', 'asheet');
      as.innerHTML = `<div class="asheet__group">
          ${o.title || o.message ? `<div class="asheet__head">${o.title ? `<b>${esc(o.title)}</b>` : ''}${o.message ? esc(o.message) : ''}</div>` : ''}
          ${o.actions.map((a, i) => `<button type="button" class="asheet__btn${a.destructive ? ' destructive' : ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}
        </div>
        <div class="asheet__group"><button type="button" class="asheet__btn cancel" data-i="-1">${esc(o.cancel || 'Отменить')}</button></div>`;
      root.append(bd, as);
      const entry = { dismiss: () => finish(null) };
      overlayStack.push(entry);
      lockScroll();
      nextFrame().then(() => { bd.classList.add('show'); as.classList.add('show'); });
      function finish(v) {
        const i = overlayStack.indexOf(entry);
        if (i >= 0) overlayStack.splice(i, 1);
        lockScroll();
        bd.classList.remove('show');
        as.classList.remove('show');
        setTimeout(() => { bd.remove(); as.remove(); }, 420);
        resolve(v);
      }
      bd.addEventListener('click', () => finish(null));
      as.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-i]');
        if (!b) return;
        const i = +b.dataset.i;
        finish(i < 0 ? null : o.actions[i].value);
      });
    });
  };

  /* ---------- тост ---------- */
  UI.toast = function (text, o = {}) {
    const box = $('#toasts');
    const t = el('div', 'toast' + (o.error ? ' err' : ''));
    t.setAttribute('role', 'status');
    t.innerHTML = `${ICONS[o.icon || (o.error ? 'warn' : 'checkCircle')]}<span>${esc(text)}</span>${o.action ? `<button type="button">${esc(o.action.label)}</button>` : ''}`;
    box.appendChild(t);
    let gone = false;
    const hide = () => {
      if (gone) return;
      gone = true;
      t.classList.remove('show');
      setTimeout(() => t.remove(), 450);
    };
    if (o.action) t.querySelector('button').addEventListener('click', () => { o.action.onClick(); hide(); });
    nextFrame().then(() => t.classList.add('show'));
    setTimeout(hide, o.timeout || (o.action ? 4500 : 2600));
    // свайп вверх — скрыть
    let y0 = null;
    t.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    t.addEventListener('touchmove', (e) => { if (y0 != null && e.touches[0].clientY - y0 < -12) hide(); }, { passive: true });
    while (box.children.length > 2) box.firstChild.remove();
    return hide;
  };

  /* ---------- сегментированный контрол ---------- */
  UI.seg = function (name, options, current, cls = '') {
    const n = options.length;
    const idx = Math.max(0, options.findIndex((o) => o.value === current));
    return `<div class="seg ${cls}" data-seg="${esc(name)}" role="group">
      <span class="seg__thumb" style="width:calc((100% - 6px) / ${n});transform:translateX(${idx * 100}%)"></span>
      ${options.map((o) => `<button type="button" data-value="${esc(o.value)}" aria-pressed="${o.value === current}">${esc(o.label)}</button>`).join('')}
    </div>`;
  };
  UI.bindSeg = function (root, name, onChange) {
    const seg = root.querySelector(`[data-seg="${name}"]`);
    if (!seg) return;
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-value]');
      if (!b || b.getAttribute('aria-pressed') === 'true') return;
      const btns = $$('button[data-value]', seg);
      const i = btns.indexOf(b);
      btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      seg.querySelector('.seg__thumb').style.transform = `translateX(${i * 100}%)`;
      UI.haptic();
      onChange(b.dataset.value);
    });
  };

  /* ---------- графики (SVG) ---------- */
  const C = { FIXED: 'var(--blue)', LIFE: 'var(--green)', WANT: 'var(--orange)', LEAK: 'var(--purple)', BIZ: 'var(--teal)' };
  UI.levelColor = C;
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return m * p;
  }
  const Charts = (UI.charts = {});
  /** столбцы с накоплением: series=[{mk, FIXED, LIFE, WANT, LEAK, total}] */
  Charts.stacked = function (series, o = {}) {
    const keys = o.keys || ['FIXED', 'LIFE', 'WANT', 'LEAK'];
    const W = Math.max(260, o.width || 340), H = o.height || 190;
    const padL = 34, padR = 4, padT = 22, padB = 24;
    const max = niceMax(Math.max(1, ...series.map((s) => s.total)));
    const n = series.length;
    const slot = (W - padL - padR) / n;
    const bw = Math.min(30, slot * 0.58);
    const ih = H - padT - padB;
    const y = (v) => padT + ih - (v / max) * ih;
    let g = '';
    [0, 0.5, 1].forEach((f) => {
      const yy = y(max * f);
      g += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}"/>`;
      g += `<text x="${padL - 6}" y="${yy + 3.5}" text-anchor="end">${f === 0 ? '0' : esc(short(max * f))}</text>`;
    });
    let bars = '', defs = '';
    series.forEach((s, i) => {
      const x = padL + slot * i + (slot - bw) / 2;
      const sel = o.selected === s.mk;
      if (sel) bars += `<rect class="sel-bg" x="${padL + slot * i + 2}" y="${padT - 18}" width="${slot - 4}" height="${ih + 18 + padB - 2}" rx="10"/>`;
      if (s.total > 0) {
        const top = y(s.total);
        const cid = `clip-${o.id || 's'}-${i}`;
        defs += `<clipPath id="${cid}"><rect x="${x}" y="${top}" width="${bw}" height="${padT + ih - top}" rx="${Math.min(6, bw / 3)}"/></clipPath>`;
        let acc = 0, segs = '';
        keys.forEach((k) => {
          const v = s[k] || 0;
          if (v <= 0) return;
          const y1 = y(acc + v), y0 = y(acc);
          segs += `<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(0, y0 - y1 - (acc + v < s.total ? 1.5 : 0))}" style="fill:${C[k]}"/>`;
          acc += v;
        });
        bars += `<g clip-path="url(#${cid})">${segs}</g>`;
        bars += `<text class="${sel ? 'lbl-strong' : ''}" x="${x + bw / 2}" y="${top - 6}" text-anchor="middle">${esc(short(s.total))}</text>`;
      }
      bars += `<text class="${sel ? 'lbl-strong' : ''}" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(FS.monthShort(s.mk))}</text>`;
      if (o.hit) bars += `<rect class="bar-hit" data-act="${o.hit}" data-mk="${s.mk}" x="${padL + slot * i}" y="0" width="${slot}" height="${H}"/>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(o.label || 'График')}"><defs>${defs}</defs>${g}${bars}</svg>`;
  };
  /** доходы и расходы по месяцам */
  Charts.incomeExpense = function (series, o = {}) {
    const W = Math.max(260, o.width || 340), H = o.height || 170;
    const padL = 34, padR = 4, padT = 12, padB = 22;
    const max = niceMax(Math.max(1, ...series.map((s) => Math.max(s.income, s.total))));
    const n = series.length;
    const slot = (W - padL - padR) / n;
    const bw = Math.max(3, Math.min(10, slot * 0.3));
    const ih = H - padT - padB;
    const y = (v) => padT + ih - (Math.max(0, v) / max) * ih;
    let g = '';
    [0, 0.5, 1].forEach((f) => {
      const yy = y(max * f);
      g += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}"/>`;
      g += `<text x="${padL - 6}" y="${yy + 3.5}" text-anchor="end">${f === 0 ? '0' : esc(short(max * f))}</text>`;
    });
    let bars = '';
    series.forEach((s, i) => {
      const cx = padL + slot * i + slot / 2;
      const r = Math.min(3, bw / 2);
      if (s.income > 0) bars += `<rect x="${cx - bw - 1}" y="${y(s.income)}" width="${bw}" height="${padT + ih - y(s.income)}" rx="${r}" style="fill:var(--green)"/>`;
      if (s.total > 0) bars += `<rect x="${cx + 1}" y="${y(s.total)}" width="${bw}" height="${padT + ih - y(s.total)}" rx="${r}" style="fill:var(--orange)"/>`;
      const lbl = n > 8 ? FS.monthShort(s.mk).slice(0, 1).toUpperCase() : FS.monthShort(s.mk);
      bars += `<text x="${cx}" y="${H - 6}" text-anchor="middle" class="${o.selected === s.mk ? 'lbl-strong' : ''}">${esc(lbl)}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Доходы и расходы">${g}${bars}</svg>`;
  };
  /** кольцевая диаграмма */
  Charts.donut = function (segs, o = {}) {
    const size = o.size || 132, th = o.thickness || 18;
    const r = (size - th) / 2, c = size / 2, L = 2 * Math.PI * r;
    const total = segs.reduce((a, s) => a + s.value, 0);
    let off = 0, arcs = '';
    const gap = segs.filter((s) => s.value > 0).length > 1 ? 2.2 : 0;
    if (total <= 0) arcs = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" style="stroke:var(--fill3)" stroke-width="${th}"/>`;
    else segs.forEach((s) => {
      if (s.value <= 0) return;
      const len = (s.value / total) * L;
      const d = Math.max(0.01, len - gap);
      arcs += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" style="stroke:${s.color}" stroke-width="${th}" stroke-dasharray="${d} ${L - d}" stroke-dashoffset="${-off}" transform="rotate(-90 ${c} ${c})"/>`;
      off += len;
    });
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(o.label || 'Структура')}">${arcs}
      ${o.top ? `<text x="${c}" y="${c - 2}" text-anchor="middle" style="font: 700 ${o.topSize || 17}px var(--font-round);fill:var(--label)">${esc(o.top)}</text>` : ''}
      ${o.bottom ? `<text x="${c}" y="${c + 16}" text-anchor="middle" style="font: 500 11px var(--font);fill:var(--label2)">${esc(o.bottom)}</text>` : ''}
    </svg>`;
  };
  /** простые столбики (дни недели) */
  Charts.bars = function (values, labels, o = {}) {
    const W = Math.max(260, o.width || 340), H = o.height || 120;
    const padT = 18, padB = 20;
    const max = Math.max(1, ...values);
    const n = values.length;
    const slot = W / n;
    const bw = Math.min(26, slot * 0.55);
    const ih = H - padT - padB;
    let out = '';
    values.forEach((v, i) => {
      const h = (v / max) * ih;
      const x = slot * i + (slot - bw) / 2;
      const hi = o.highlight === i;
      out += `<rect x="${x}" y="${padT + ih - h}" width="${bw}" height="${Math.max(h, 2)}" rx="5" style="fill:${hi ? 'var(--orange)' : 'var(--fill)'}"/>`;
      if (v > 0) out += `<text x="${x + bw / 2}" y="${padT + ih - h - 5}" text-anchor="middle" class="${hi ? 'lbl-strong' : ''}">${esc(short(v))}</text>`;
      out += `<text x="${x + bw / 2}" y="${H - 5}" text-anchor="middle">${esc(labels[i])}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(o.label || 'График')}">${out}</svg>`;
  };

  /* =====================================================================
     ЭКРАН КОД-ПАРОЛЯ И ОНБОРДИНГ
     ===================================================================== */
  const LETTERS = ['', 'ABC', 'DEF', 'GHI', 'JKL', 'MNO', 'PQRS', 'TUV', 'WXYZ'];
  const lockEl = () => $('#lock');
  let keyHandler = null;

  function showLockLayer() {
    const l = lockEl();
    l.hidden = false;
    l.classList.remove('hide');
    document.body.classList.add('locked');
  }
  function hideLockLayer() {
    const l = lockEl();
    l.classList.add('hide');
    document.body.classList.remove('locked');
    setKeys(null);
    setTimeout(() => { if (l.classList.contains('hide')) { l.hidden = true; l.innerHTML = ''; } }, 380);
  }
  function setKeys(fn) {
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = fn;
    if (fn) document.addEventListener('keydown', fn);
  }
  function screen(html) {
    showLockLayer();
    const l = lockEl();
    l.innerHTML = html;
    l.scrollTop = 0;
    return l;
  }
  const lockLabel = (lock) => (lock && lock.type === 'alnum' ? 'пароль' : 'код-пароль');

  /**
   * Универсальный ввод код-пароля.
   * o = { title, sub, lock:{type:'digits'|'alnum', len}, onSubmit(pw) → Promise<true|string|false>,
   *       links:[{label, onClick}], cancel:{label,onClick}, autocomplete }
   * onSubmit возвращает true (успех), false (неверно → тряска) или строку-ошибку.
   */
  UI.passcode = function (o) {
    const lock = o.lock || { type: 'digits', len: 4 };
    const isDigits = lock.type !== 'alnum';
    const len = lock.len || 4;
    let pw = '';
    let busy = false;
    const l = screen(`<div class="lock__inner">
      <img class="lock__logo" src="icon-192.png" alt="">
      <div class="lock__title">${esc(o.title)}</div>
      <div class="lock__sub" id="pcSub">${esc(o.sub || '')}</div>
      ${isDigits
        ? `<div class="dots" id="pcDots">${'<i></i>'.repeat(len)}</div>
           <div class="keypad" id="pcPad">
             ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button type="button" class="key" data-k="${d}"><b>${d}</b><small>${LETTERS[d - 1]}</small></button>`).join('')}
             <button type="button" class="key key--ghost" data-k="cancel" ${o.cancel ? '' : 'style="visibility:hidden"'}>${esc(o.cancel ? o.cancel.label : '')}</button>
             <button type="button" class="key" data-k="0"><b>0</b><small></small></button>
             <button type="button" class="key key--ghost" data-k="del" aria-label="Удалить">Удалить</button>
           </div>`
        : `<form class="pw-field" id="pcForm" autocomplete="off">
             <input id="pcInput" type="password" ${o.autocomplete ? `autocomplete="${o.autocomplete}"` : 'autocomplete="current-password"'} placeholder="Пароль" enterkeyhint="done" aria-label="Пароль">
           </form>
           <button type="button" class="btn btn--block" id="pcGo">Готово</button>
           ${o.cancel ? `<button type="button" class="btn btn--plain btn--block" id="pcCancel">${esc(o.cancel.label)}</button>` : ''}`}
      <div class="lock__busy" id="pcBusy" hidden><span class="spinner"></span><span>Проверяем…</span></div>
      ${o.links && o.links.length ? `<div class="lock__links">${o.links.map((k, i) => `<button type="button" data-link="${i}">${esc(k.label)}</button>`).join('')}</div>` : ''}
    </div>`);
    const sub = $('#pcSub', l);
    const dots = $('#pcDots', l);
    const pad = $('#pcPad', l);
    const busyEl = $('#pcBusy', l);
    const delBtn = pad ? pad.querySelector('[data-k="del"]') : null;

    function setSub(text, err) { sub.textContent = text || ''; sub.classList.toggle('err', !!err); }
    function paint() {
      if (!dots) return;
      $$('i', dots).forEach((d, i) => d.classList.toggle('on', i < pw.length));
      if (delBtn) delBtn.textContent = pw.length ? 'Удалить' : o.cancel ? '' : 'Удалить';
      if (delBtn) delBtn.style.visibility = pw.length || !o.cancel ? 'visible' : 'hidden';
    }
    function setBusy(b) {
      busy = b;
      busyEl.hidden = !b;
      if (pad) pad.classList.toggle('disabled', b);
      const inp = $('#pcInput', l);
      if (inp) inp.disabled = b;
    }
    function waitGuard() {
      if (!o.guard) return false;
      const ms = FS.guard.waitMs();
      if (ms <= 0) return false;
      if (pad) pad.classList.add('disabled');
      const tick = () => {
        const left = Math.ceil(FS.guard.waitMs() / 1000);
        if (left <= 0) { if (pad) pad.classList.remove('disabled'); setSub(o.sub || ''); return; }
        setSub(`Слишком много попыток. Повторите через ${left} с`, true);
        setTimeout(tick, 500);
      };
      tick();
      return true;
    }
    async function submit() {
      if (busy) return;
      if (isDigits && pw.length < len) return;
      if (!isDigits && !pw) return;
      if (waitGuard()) return;
      setBusy(true);
      await new Promise((r) => setTimeout(r, 30));
      let res;
      try { res = await o.onSubmit(pw); } catch (e) { res = e.message || 'Ошибка'; }
      setBusy(false);
      if (res === true) { UI.haptic('success'); return; }
      UI.haptic('error');
      if (dots) { dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); }
      setSub(typeof res === 'string' ? res : `Неверный ${lockLabel(lock)}`, true);
      pw = '';
      paint();
      const inp = $('#pcInput', l);
      if (inp) { inp.value = ''; inp.focus(); }
      waitGuard();
    }
    function press(k) {
      if (busy) return;
      if (k === 'del') { pw = pw.slice(0, -1); paint(); return; }
      if (k === 'cancel') { if (o.cancel) o.cancel.onClick(); return; }
      if (pw.length >= len) return;
      pw += k;
      UI.haptic();
      paint();
      if (pw.length === len) setTimeout(submit, 120);
    }
    if (pad) {
      pad.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
      setKeys((e) => {
        if (overlayStack.length) return;
        if (/^[0-9]$/.test(e.key)) { press(e.key); const b = pad.querySelector(`[data-k="${e.key}"]`); if (b) { b.classList.add('press'); setTimeout(() => b.classList.remove('press'), 120); } }
        else if (e.key === 'Backspace') press('del');
        else if (e.key === 'Escape' && o.cancel) o.cancel.onClick();
      });
    } else {
      const inp = $('#pcInput', l);
      inp.addEventListener('input', () => { pw = inp.value; });
      $('#pcForm', l).addEventListener('submit', (e) => { e.preventDefault(); pw = inp.value; submit(); });
      $('#pcGo', l).addEventListener('click', () => { pw = inp.value; submit(); });
      const cb = $('#pcCancel', l);
      if (cb) cb.addEventListener('click', () => o.cancel.onClick());
      setKeys(null);
      setTimeout(() => inp.focus(), 60);
    }
    $$('[data-link]', l).forEach((b) => b.addEventListener('click', () => o.links[+b.dataset.link].onClick()));
    paint();
    waitGuard();
    return { setSub };
  };

  /** выбор типа код-пароля */
  UI.chooseLockType = async function () {
    return UI.actions({
      title: 'Параметры код-пароля',
      actions: [
        { label: '4-значный цифровой код', value: { type: 'digits', len: 4 } },
        { label: '6-значный цифровой код', value: { type: 'digits', len: 6 } },
        { label: 'Пароль из букв и цифр', value: { type: 'alnum' } },
      ],
    });
  };

  /** создание нового код-пароля (ввод + повтор). Возвращает Promise<{pw, lock}|null> */
  UI.createPasscode = function (o = {}) {
    return new Promise((resolve) => {
      let lock = o.lock || { type: 'digits', len: 4 };
      const step1 = (err) => {
        UI.passcode({
          title: o.title || 'Придумайте код-пароль',
          sub: err || o.sub || 'Им будут зашифрованы все ваши данные',
          lock,
          autocomplete: 'new-password',
          cancel: o.cancel ? { label: 'Отменить', onClick: () => resolve(null) } : null,
          links: [{ label: 'Параметры код-пароля', onClick: async () => { const t = await UI.chooseLockType(); if (t) { lock = t; step1(); } } }],
          onSubmit: async (pw1) => {
            if (lock.type === 'alnum' && pw1.length < 6) return 'Минимум 6 символов';
            setTimeout(() => step2(pw1), 150);
            return true;
          },
        });
        if (err) { const s = $('#pcSub'); if (s) s.classList.add('err'); }
      };
      const step2 = (pw1) => {
        UI.passcode({
          title: 'Повторите код-пароль',
          sub: o.repeatSub || '',
          lock,
          autocomplete: 'new-password',
          cancel: { label: 'Назад', onClick: () => step1() },
          onSubmit: async (pw2) => {
            if (pw2 !== pw1) { setTimeout(() => step1('Код-пароли не совпали. Попробуйте ещё раз.'), 450); return 'Не совпадает'; }
            resolve({ pw: pw1, lock });
            return true;
          },
        });
      };
      step1();
    });
  };

  /* ---------- онбординг ---------- */
  const Lock = (FS.lock = {});
  Lock.hide = hideLockLayer;
  Lock.screen = screen;

  Lock.boot = function () {
    if (!FS.crypto.cryptoReady()) {
      screen(`<div class="lock__inner"><img class="lock__logo" src="icon-192.png" alt="">
        <div class="lock__title">Нужно защищённое соединение</div>
        <div class="lock__sub">Шифрование работает только по адресу <b>https://</b>. Откройте Финштаб по ссылке GitHub Pages (https://…github.io/…).</div></div>`);
      return;
    }
    if (FS.vault.exists()) Lock.unlock();
    else if (UI.isIOS && !UI.standalone() && !FS.prefs.get('skipInstall')) Lock.install(true);
    else Lock.welcome();
  };

  Lock.install = function (first) {
    const ios = UI.isIOS;
    screen(`<div class="welcome">
      <img class="lock__logo" src="icon-192.png" alt="" style="align-self:center">
      <div class="welcome__title" style="margin-bottom:10px">Установите <span>Финштаб</span> на экран «Домой»</div>
      <div class="lock__sub center" style="margin-bottom:12px">Так он откроется как обычное приложение — без адресной строки и даже без интернета.</div>
      <ol class="install-steps">
        ${ios
          ? `<li><span>Нажмите <b>«Поделиться»</b> <span class="inline-ico">${ICONS.share}</span> в панели Safari (внизу или справа от адресной строки)</span></li>
             <li><span>Прокрутите меню и выберите <b>«На экран „Домой“»</b></span></li>
             <li><span>Нажмите <b>«Добавить»</b> и откройте Финштаб с иконки</span></li>`
          : `<li><span>Откройте меню браузера <b>⋮</b> (справа вверху)</span></li>
             <li><span>Выберите <b>«Установить приложение»</b> или <b>«Добавить на главный экран»</b></span></li>
             <li><span>Откройте Финштаб с иконки на рабочем столе</span></li>`}
      </ol>
      ${ios ? `<div class="banner banner--warn" style="margin-top:8px"><div class="banner__icon">${ICONS.info}</div><div class="banner__body"><div class="banner__text" style="color:var(--label)">На iPhone данные в Safari и в установленном приложении хранятся <b>раздельно</b>. Начните пользоваться уже из иконки на экране «Домой».</div></div></div>` : ''}
      <div class="welcome__foot">
        ${first ? `<button type="button" class="btn btn--gray btn--block" id="instContinue">Продолжить в браузере</button>` : `<button type="button" class="btn btn--block" id="instBack">Понятно</button>`}
      </div>
    </div>`);
    const c = $('#instContinue');
    if (c) c.addEventListener('click', () => { FS.prefs.set('skipInstall', true); Lock.welcome(); });
    const b = $('#instBack');
    if (b) b.addEventListener('click', () => Lock.welcome());
  };

  Lock.welcome = function () {
    screen(`<div class="welcome">
      <img class="lock__logo" src="icon-192.png" alt="" style="align-self:center;width:76px;height:76px;border-radius:18px">
      <div class="welcome__title">Добро пожаловать<br>в <span>Финштаб</span></div>
      <div class="feat"><div class="feat__ico">${ICONS.pencil}</div><div><div class="feat__title">Записывайте за пару секунд</div><div class="feat__text">Расход или приход, категория, дата и комментарий — остальное панель посчитает сама.</div></div></div>
      <div class="feat"><div class="feat__ico">${ICONS.chart}</div><div><div class="feat__title">Видно, куда утекают деньги</div><div class="feat__text">Паспорт месяца, норма сбережений, утечки, лимиты и прогноз накоплений.</div></div></div>
      <div class="feat"><div class="feat__ico">${ICONS.lock}</div><div><div class="feat__title">Под код-паролем и шифрованием</div><div class="feat__text">Данные хранятся только на вашем устройстве и зашифрованы.</div></div></div>
      <div class="feat"><div class="feat__ico">${ICONS.people}</div><div><div class="feat__title">Для всей семьи</div><div class="feat__text">По желанию — общая синхронизация между телефонами через ваш GitHub.</div></div></div>
      <div class="welcome__foot">
        <button type="button" class="btn btn--block" id="wStart">Начать</button>
        <button type="button" class="btn btn--plain btn--block" id="wJoin">Подключиться к семье</button>
        ${UI.isIOS && !UI.standalone() ? `<button type="button" class="btn btn--plain btn--block" id="wInstall">Как установить на iPhone</button>` : ''}
      </div>
    </div>`);
    $('#wStart').addEventListener('click', Lock.create);
    $('#wJoin').addEventListener('click', () => Lock.join());
    const wi = $('#wInstall');
    if (wi) wi.addEventListener('click', () => Lock.install(false));
  };

  Lock.create = async function () {
    const r = await UI.createPasscode({ cancel: true });
    if (!r) return Lock.welcome();
    Lock.start(r);
  };

  Lock.start = function (pass) {
    screen(`<div class="welcome">
      <div class="welcome__title" style="margin-bottom:18px">Как начнём?</div>
      <div class="form-label">Ваше имя (для семейного учёта)</div>
      <input class="input" id="sName" placeholder="Например, Максим" maxlength="30" autocomplete="given-name" style="margin-bottom:22px">
      <button type="button" class="choice" data-start="empty">
        <div class="choice__ico c-blue">${ICONS.pencil}</div>
        <div><div class="choice__title">С чистого листа</div><div class="choice__text">Сразу вносите свои траты и доходы</div></div>
      </button>
      <button type="button" class="choice" data-start="demo">
        <div class="choice__ico c-orange">${ICONS.sparkles}</div>
        <div><div class="choice__title">Посмотреть на демо-данных</div><div class="choice__text">Выдуманная семья за 4 месяца — удалить можно в один тап</div></div>
      </button>
    </div>`);
    $$('[data-start]').forEach((b) => b.addEventListener('click', async () => {
      $$('[data-start]').forEach((x) => (x.disabled = true));
      const name = ($('#sName').value || '').trim() || 'Я';
      const t = FS.now();
      const mid = FS.uid('m');
      const data = FS.freshData();
      data.members[mid] = { id: mid, name, color: 'blue', createdAt: t, updatedAt: t };
      const local = FS.freshLocal();
      local.me = mid;
      await FS.vault.create(pass.pw, pass.lock, { data, local });
      if (b.dataset.start === 'demo') FS.demo.load();
      Lock.enter();
    }));
  };

  /** вход в семью с нового устройства */
  Lock.join = function (prefill = {}) {
    screen(`<div class="welcome">
      <div class="welcome__title" style="margin-bottom:8px">Подключиться к семье</div>
      <div class="lock__sub center" style="margin-bottom:18px">Нужны название приватного репозитория и токен — их можно взять на устройстве, где уже настроена синхронизация: <b>Настройки → Синхронизация</b>.</div>
      <div class="field-group">
        <div class="field"><label for="jRepo">Репозиторий</label><input id="jRepo" placeholder="имя/finshtab-data" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(prefill.repo || FS.prefs.get('syncDraftRepo', ''))}"></div>
        <div class="field"><label for="jToken">Токен</label><input id="jToken" type="password" placeholder="github_pat_…" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(prefill.token || '')}"></div>
        <div class="field"><label for="jFolder">Папка</label><input id="jFolder" placeholder="${FS.sync.DEFAULT_FOLDER}" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(prefill.folder || '')}"></div>
      </div>
      <div class="lock__sub err" id="jErr" style="text-align:left;margin:10px 4px 0"></div>
      <div class="welcome__foot">
        <button type="button" class="btn btn--block" id="jGo">Подключиться</button>
        <button type="button" class="btn btn--plain btn--block" id="jBack">Назад</button>
      </div>
    </div>`);
    $('#jBack').addEventListener('click', () => Lock.welcome());
    $('#jRepo').addEventListener('input', (e) => FS.prefs.set('syncDraftRepo', e.target.value.trim()));
    $('#jGo').addEventListener('click', async () => {
      const err = $('#jErr');
      err.textContent = '';
      const rp = FS.sync.parseRepo($('#jRepo').value);
      const token = $('#jToken').value.trim();
      const folder = ($('#jFolder').value || '').trim() || FS.sync.DEFAULT_FOLDER;
      if (!rp) { err.textContent = 'Укажите репозиторий в виде «имя/репозиторий».'; return; }
      if (!token) { err.textContent = 'Вставьте токен доступа.'; return; }
      const cfg = { owner: rp.owner, repo: rp.repo, token, folder };
      const btn = $('#jGo');
      btn.disabled = true;
      btn.textContent = 'Проверяем…';
      let pr;
      try { pr = await FS.sync.probe(cfg); } catch (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = 'Подключиться'; return; }
      btn.disabled = false;
      btn.textContent = 'Подключиться';
      if (pr.empty) { err.textContent = 'В этой папке репозитория пока нет данных Финштаба. Сначала включите синхронизацию на основном устройстве.'; return; }
      UI.passcode({
        title: 'Код-пароль семьи',
        sub: 'Тот же, что на основном устройстве',
        lock: pr.vault.lock,
        cancel: { label: 'Назад', onClick: () => Lock.join({ repo: `${cfg.owner}/${cfg.repo}`, token, folder }) },
        onSubmit: async (pw) => {
          const got = await FS.sync.download(cfg, pw, pr);
          if (!got) return false;
          setTimeout(() => Lock.whoAmI(cfg, got), 200);
          return true;
        },
      });
    });
  };

  Lock.whoAmI = function (cfg, got) {
    const members = Object.values(got.data.members).filter((m) => !m.deleted);
    screen(`<div class="welcome">
      <div class="welcome__title" style="margin-bottom:8px">Кто пользуется<br>этим устройством?</div>
      <div class="lock__sub center" style="margin-bottom:18px">Новые операции будут подписаны этим именем</div>
      <div class="list" id="wMembers">
        ${members.map((m) => `<button type="button" class="row row--tap" data-m="${esc(m.id)}"><span class="row__icon row__icon--round c-${FS.mcolor(m)}">${esc((m.name || '?').slice(0, 1).toUpperCase())}</span><span class="row__main"><span class="row__title">${esc(m.name)}</span></span><span class="row__chev">${ICONS.chevronR}</span></button>`).join('')}
      </div>
      <div class="form-label mt24">Или добавьте себя</div>
      <div class="row-gap"><input class="input" id="wNew" placeholder="Ваше имя" maxlength="30"><button type="button" class="btn" id="wAdd" style="flex:none">Добавить</button></div>
    </div>`);
    const finish = async (memberId, newName) => {
      const local = FS.freshLocal();
      local.sync = { owner: cfg.owner, repo: cfg.repo, folder: cfg.folder, token: cfg.token, files: got.files, lastSyncAt: Date.now(), lastError: '', since: Date.now() };
      if (newName) {
        const t = FS.now();
        memberId = FS.uid('m');
        const used = members.map((m) => m.color);
        got.data.members[memberId] = { id: memberId, name: newName, color: FS.MEMBER_COLORS.find((c) => !used.includes(c)) || 'teal', createdAt: t, updatedAt: t };
      }
      local.me = memberId;
      await FS.vault.adopt(got.key, got.kdf, got.lock, got.data, local);
      Lock.enter();
      FS.sync.run();
    };
    $$('[data-m]').forEach((b) => b.addEventListener('click', () => finish(b.dataset.m)));
    $('#wAdd').addEventListener('click', () => { const n = $('#wNew').value.trim(); if (n) finish(null, n); });
  };

  Lock.unlock = function (sub) {
    const h = FS.vault.header();
    UI.passcode({
      title: h && h.lock && h.lock.type === 'alnum' ? 'Введите пароль' : 'Введите код-пароль',
      sub: sub || '',
      lock: (h && h.lock) || { type: 'digits', len: 4 },
      guard: true,
      links: [{ label: 'Забыли код-пароль?', onClick: Lock.forgot }],
      onSubmit: async (pw) => {
        const ok = await FS.vault.unlock(pw);
        if (!ok) return false;
        Lock.enter();
        return true;
      },
    });
  };

  Lock.forgot = async function () {
    const r = await UI.alert({
      title: 'Забыли код-пароль?',
      message: 'Данные зашифрованы вашим код-паролем — без него их не открыть никому, даже разработчику. Можно стереть данные на этом устройстве и начать заново (если включали синхронизацию — потом подключитесь к семье, узнав код-пароль у близких).',
      buttons: [{ label: 'Отменить', role: 'cancel', value: false }, { label: 'Стереть и начать заново', role: 'destructive', value: true }],
    });
    if (!r.value) return;
    const sure = await UI.confirm('Точно стереть?', 'Все записи на этом устройстве будут удалены без возможности восстановления.', 'Стереть', true);
    if (!sure) return;
    FS.vault.wipe();
    Lock.welcome();
  };

  Lock.enter = function () {
    hideLockLayer();
    FS.emit('unlocked');
  };
})();
