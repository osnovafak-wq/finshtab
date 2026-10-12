/* Финштаб — экраны: Обзор, Операции, Лимиты, Разбор, шторка операции, лимиты */
(function () {
  'use strict';
  const FS = window.FS;
  const UI = FS.ui;
  const store = FS.store;
  const { $, $$, esc, ICONS, money, rub, short, pct, plural, fmtNum, monthLabel, monthLabelFull, monthShort, monthPrep, addMonths, curMonth, today, addDays, dayLabel, dateShort, LEVELS, EXP_LEVELS, PERSONAL_LEVELS, catOf } = FS;

  const V = (FS.views = {
    tab: 'overview',
    month: curMonth(),
    period: '3',
    limitsAll: false,
    f: { month: 'all', type: 'all', cat: 'all', member: 'all', q: '' },
    limit: 150,
    scroll: {},
  });

  /* ---------- данные и кэш ---------- */
  let cache = { ver: -1, stats: {} };
  function idx() { return FS.index(store.data, store.ver); }
  function S(mk) {
    if (cache.ver !== store.ver) cache = { ver: store.ver, stats: {} };
    if (!cache.stats[mk]) cache.stats[mk] = FS.monthStats(idx().byMonth[mk] || [], store.data.cats, mk);
    return cache.stats[mk];
  }
  V.S = S;
  const settings = () => store.data.settings;
  const target = () => Number(settings().savingsTarget) || 0.2;
  function dataMonths() {
    const ks = Object.keys(idx().byMonth).sort();
    return ks;
  }
  function maxMonth() {
    const ks = dataMonths();
    const cm = curMonth();
    return ks.length && ks[ks.length - 1] > cm ? ks[ks.length - 1] : cm;
  }
  V.maxMonth = maxMonth;
  function minMonth() {
    const ks = dataMonths();
    const cm = curMonth();
    return ks.length && ks[0] < cm ? ks[0] : addMonths(cm, -1);
  }
  function combine(list, mk) {
    const a = FS.emptyStats(mk);
    for (const s of list) {
      a.count += s.count;
      a.income += s.income;
      a.expense += s.expense;
      a.expenseAll += s.expenseAll;
      for (const k in s.byLevel) a.byLevel[k] += s.byLevel[k];
      for (const k in s.byCat) a.byCat[k] = (a.byCat[k] || 0) + s.byCat[k];
      for (const k in s.incomeByCat) a.incomeByCat[k] = (a.incomeByCat[k] || 0) + s.incomeByCat[k];
      for (const k in s.byMember) a.byMember[k] = (a.byMember[k] || 0) + s.byMember[k];
    }
    a.personalIncome = a.income - a.byLevel.BIZ;
    a.savings = a.personalIncome - a.expense;
    a.savingsRate = a.personalIncome > 0 ? a.savings / a.personalIncome : null;
    a.leakShare = a.expense > 0 ? a.byLevel.LEAK / a.expense : 0;
    a.fixedShare = a.personalIncome > 0 ? a.byLevel.FIXED / a.personalIncome : null;
    return a;
  }
  function periodStats(endMk, n) {
    const list = [];
    for (let i = 0; i < n; i++) list.push(S(addMonths(endMk, -i)));
    const p = combine(list, endMk);
    p.n = n;
    p.months = list.filter((s) => s.count > 0).length;
    return p;
  }

  /* ---------- мелкие компоненты ---------- */
  const lvlColor = (lvl) => (LEVELS[lvl] ? LEVELS[lvl].color : 'gray');
  function catColor(c) { return c.kind === 'income' ? 'green' : lvlColor(c.level); }
  function catIcon(c, size) {
    return `<span class="row__icon row__icon--round row__icon--emoji tint-${catColor(c)}"${size ? ` style="width:${size}px;height:${size}px"` : ''}>${esc(c.icon || '•')}</span>`;
  }
  function lvlTag(lvl) {
    if (lvl === 'INCOME') return '<span class="lvl-tag lvl-INCOME">ДОХОД</span>';
    const L = LEVELS[lvl];
    return L ? `<span class="lvl-tag lvl-${lvl}">${esc(L.title.toUpperCase())}</span>` : '';
  }
  function mv(text, cls = '') {
    const len = String(text).replace(/<[^>]+>/g, '').length;
    return `<div class="metric__value${len > 9 ? ' metric__value--sm' : ''}${cls ? ' ' + cls : ''}">${text}</div>`;
  }
  function badge(st) { return st && st.text ? `<span class="badge badge--${st.tone}">${esc(st.text)}</span>` : ''; }
  function chartWidth() {
    const app = $('#app');
    const w = (app ? app.clientWidth : 360) - 32 - 32;
    return Math.max(260, Math.min(700, w));
  }
  function monthSwitch() {
    const mk = V.month;
    const canPrev = mk > minMonth();
    const canNext = mk < maxMonth();
    return `<div class="month-switch">
      <button type="button" data-act="month-prev" aria-label="Предыдущий месяц" ${canPrev ? '' : 'disabled'}>${ICONS.chevronL}</button>
      <button type="button" class="month-switch__label" data-act="month-pick">${esc(monthLabel(mk))}</button>
      <button type="button" data-act="month-next" aria-label="Следующий месяц" ${canNext ? '' : 'disabled'}>${ICONS.chevronR}</button>
    </div>`;
  }
  function opRow(o, opts = {}) {
    const c = catOf(store.data.cats, o.cat);
    const inc = o.type === 'income';
    const member = FS.members().length > 1 && o.member ? FS.memberName(o.member) : '';
    const sub = [o.note, member].filter(Boolean).join(' · ');
    const inner = `<span class="row__icon row__icon--round row__icon--emoji tint-${catColor(c)}">${esc(c.icon || '•')}</span>
      <span class="row__main"><span class="row__title">${esc(c.name)}</span><span class="row__sub">${lvlTag(inc ? 'INCOME' : c.level)}${esc(sub)}</span></span>
      <span class="row__amount ${inc ? 'op-amount--income' : ''}">${money(inc ? o.amount : -o.amount, { sign: inc ? 'always' : 'auto' })}${opts.withDate ? `<small>${esc(dateShort(o.date))}</small>` : ''}</span>`;
    if (opts.swipe) {
      return `<div class="swipe" data-id="${esc(o.id)}"><div class="swipe__actions"><button type="button" class="swipe__del" data-act="op-swipe-del" data-id="${esc(o.id)}">${ICONS.trash}<span>Удалить</span></button></div>
        <button type="button" class="row op-row swipe__front" data-act="op" data-id="${esc(o.id)}">${inner}</button></div>`;
    }
    return `<button type="button" class="row op-row" data-act="op" data-id="${esc(o.id)}">${inner}</button>`;
  }
  V.opRow = opRow;
  function emptyBlock(icon, title, text, btn) {
    return `<div class="empty"><div class="empty__ico">${ICONS[icon]}</div><div class="empty__title">${esc(title)}</div><div>${esc(text)}</div>${btn ? `<button type="button" class="btn" data-act="${btn.act}">${btn.icon ? ICONS[btn.icon] : ''}${esc(btn.label)}</button>` : ''}</div>`;
  }

  /* ---------- навбар ---------- */
  const TITLES = { overview: 'Обзор', ops: 'Операции', limits: 'Лимиты', analysis: 'Разбор' };
  V.renderNav = function () {
    const nb = $('#navbar');
    if (!nb) return;
    const st = FS.sync.state;
    let syncBtn = '';
    if (FS.sync.configured()) {
      const map = {
        syncing: ['busy', 'sync', 'Синхр.'],
        ok: ['ok', 'cloudCheck', ''],
        idle: ['', 'cloud', ''],
        offline: ['', 'cloudSlash', 'Офлайн'],
        error: ['err', 'warn', 'Ошибка'],
        needpass: ['err', 'lock', 'Пароль'],
        off: ['', 'cloud', ''],
      };
      const [cls, ico, txt] = map[st.status] || map.idle;
      syncBtn = `<button type="button" class="sync-pill ${cls}" data-act="sync-now" aria-label="Синхронизация">${ICONS[ico]}${txt ? `<span>${txt}</span>` : ''}</button>`;
    }
    nb.querySelector('.navbar__title').textContent = TITLES[V.tab];
    nb.querySelector('.navbar__side--left').innerHTML = syncBtn;
    nb.querySelector('.navbar__side--right').innerHTML = `<button type="button" class="icon-btn" data-act="settings" aria-label="Настройки">${ICONS.gear}</button>`;
  };

  /* ---------- вкладки ---------- */
  V.setTab = function (tab) {
    if (!TITLES[tab]) tab = 'overview';
    if (tab === V.tab) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    V.scroll[V.tab] = window.scrollY;
    V.tab = tab;
    $$('.view').forEach((v) => (v.hidden = v.dataset.tab !== tab));
    $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
    V.render();
    window.scrollTo(0, V.scroll[tab] || 0);
    FS.prefs.set('tab', tab);
  };
  V.render = function () {
    if (!store.unlocked) return;
    V.renderNav();
    const sec = $('#view-' + V.tab);
    if (!sec) return;
    const b = BUILD[V.tab];
    sec.innerHTML = b();
    if (AFTER[V.tab]) AFTER[V.tab](sec);
    onScroll();
  };
  function onScroll() {
    const nb = $('#navbar');
    if (nb) nb.classList.toggle('scrolled', window.scrollY > 24);
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* =====================================================================
     ОБЗОР
     ===================================================================== */
  function bannersHtml() {
    const out = [];
    const hints = store.local.hints || {};
    const st = FS.sync.state;
    if (st.status === 'needpass') {
      out.push(`<div class="banner banner--bad"><div class="banner__icon">${ICONS.lock}</div><div class="banner__body"><div class="banner__title">Код-пароль семьи изменён</div><div class="banner__text">На другом устройстве сменили код-пароль. Введите новый, чтобы продолжить синхронизацию.</div><div class="banner__actions"><button type="button" data-act="sync-pass">Ввести код-пароль</button></div></div></div>`);
    } else if (st.status === 'error' && st.code !== 'network') {
      out.push(`<div class="banner banner--bad"><div class="banner__icon">${ICONS.warn}</div><div class="banner__body"><div class="banner__title">Синхронизация не работает</div><div class="banner__text">${esc(st.error)}</div><div class="banner__actions"><button type="button" data-act="sync-now">Повторить</button><button type="button" data-act="open-sync">Настройки</button></div></div></div>`);
    }
    if (FS.updateReady) {
      out.push(`<div class="banner"><div class="banner__icon">${ICONS.sparkles}</div><div class="banner__body"><div class="banner__title">Доступно обновление Финштаба</div><div class="banner__actions"><button type="button" data-act="app-update">Обновить сейчас</button></div></div></div>`);
    }
    if (FS.demo.has()) {
      out.push(`<div class="banner banner--warn"><div class="banner__icon">${ICONS.sparkles}</div><div class="banner__body"><div class="banner__title">Это демо-данные</div><div class="banner__text">Выдуманная семья — посмотрите, как всё работает. Когда будете готовы, удалите их и вносите свои.</div><div class="banner__actions"><button type="button" data-act="demo-clear">Удалить демо и начать</button></div></div></div>`);
    }
    if (!UI.standalone() && (UI.isIOS || UI.isAndroid) && !hints.install) {
      out.push(`<div class="banner"><div class="banner__icon">${ICONS.phone}</div><div class="banner__body"><div class="banner__title">Установите на экран «Домой»</div><div class="banner__text">Финштаб будет открываться как приложение — на весь экран и без интернета.</div><div class="banner__actions"><button type="button" data-act="install-help">Как установить</button></div></div><button type="button" class="banner__close" data-act="hint-close" data-hint="install" aria-label="Скрыть">${ICONS.xmark}</button></div>`);
    }
    const ops = idx().all.length;
    const lb = store.local.lastBackupAt || 0;
    if (ops >= 30 && !FS.sync.configured() && Date.now() - lb > 30 * 864e5 && !FS.demo.has() && !(hints.backupSnooze && Date.now() - hints.backupSnooze < 7 * 864e5)) {
      out.push(`<div class="banner"><div class="banner__icon">${ICONS.download}</div><div class="banner__body"><div class="banner__title">Сохраните резервную копию</div><div class="banner__text">${lb ? 'Последняя копия — ' + Math.floor((Date.now() - lb) / 864e5) + ' дн. назад.' : 'Копий ещё не было.'} Данные живут только на этом устройстве.</div><div class="banner__actions"><button type="button" data-act="open-backup">Сохранить копию</button><button type="button" data-act="backup-snooze">Позже</button></div></div></div>`);
    }
    return out.join('');
  }

  function passportHtml(mk) {
    const s = S(mk);
    const t = target();
    const biz = s.byLevel.BIZ;
    const prev = S(addMonths(mk, -1));
    const isCur = mk === curMonth();
    const incCount = (idx().byMonth[mk] || []).filter((o) => o.type === 'income').length;
    const incSub = biz > 0
      ? `Поступило ${money(s.income)}, на бизнес ушло ${money(biz)}`
      : s.income > 0
        ? `Поступило ${money(s.income)} · ${incCount} ${plural(incCount, ['поступление', 'поступления', 'поступлений'])}${!isCur && prev.personalIncome > 0 ? ` · ${diffText(s.personalIncome, prev.personalIncome)} к ${monthShort(prev.mk)}` : ''}`
        : 'Доходов за месяц пока нет — внесите зарплату и другие поступления';
    const incBadge = biz > 0 ? { tone: 'good', text: 'за вычетом бизнеса' } : s.income > 0 ? { tone: 'good', text: 'получено' } : { tone: 'info', text: 'пока нет' };
    const lv = s.byLevel;
    const fixedSt = FS.fixedStatus(s.fixedShare);
    return `<div class="grid2 grid4">
      <div class="card card--tap metric" data-act="goto-ops" data-type="income" data-month="${mk}">
        <div class="metric__label">Личный доход</div>
        ${mv(money(s.personalIncome))}
        ${badge(incBadge)}
        <div class="metric__sub">${esc(incSub)}</div>
      </div>
      <div class="card card--tap metric" data-act="goto-ops" data-type="expense" data-month="${mk}">
        <div class="metric__label">Личный расход</div>
        ${mv(money(s.expense))}
        ${badge(FS.expenseStatus(s))}
        <div class="metric__sub num">${PERSONAL_LEVELS.map((L) => `${L} ${fmtNum(Math.round(lv[L]))}`).join(' · ')}</div>
      </div>
      <div class="card card--tap metric" data-act="tab" data-tab="analysis">
        <div class="metric__label">Норма сбережений</div>
        <div class="metric__value">${s.savingsRate == null ? '—' : pct(s.savingsRate)}</div>
        ${badge(FS.savingsStatus(s.savingsRate, t))}
        <div class="metric__sub">Норма ${pct(t, 0)} и выше. ${s.savings >= 0 ? `Остаётся ${money(s.savings)}` : `Не хватает ${money(-s.savings)}`}</div>
      </div>
      <div class="card card--tap metric" data-act="goto-ops" data-cat="lvl:LEAK" data-month="${mk}">
        <div class="metric__label">Доля утечек</div>
        <div class="metric__value">${pct(s.leakShare)}</div>
        ${badge(FS.leakStatus(s.leakShare))}
        <div class="metric__sub">Норма до 3 %. Сейчас ${money(lv.LEAK)}.${s.fixedShare != null ? ` FIXED = ${pct(s.fixedShare, 0)} дохода — ${fixedSt.text}` : ''}</div>
      </div>
    </div>`;
  }
  function diffText(cur, prev) {
    if (!prev) return '';
    const d = (cur - prev) / prev;
    if (Math.abs(d) < 0.005) return 'как';
    return (d > 0 ? '+' : FS.MINUS) + pct(Math.abs(d), 0).replace(/ %/, ' %');
  }

  function paceHtml(mk) {
    const s = S(mk);
    const prev = S(addMonths(mk, -1));
    const p = FS.pace(s, mk, prev.count ? prev : null);
    const avg = FS.avgPrev(S, mk, 3);
    const fm = FS.freeMoney(s, mk, target(), avg);
    let paceCard;
    if (p.isCurrent) {
      const dTone = p.diff == null ? 'info' : p.diff > 0.05 ? 'warn' : p.diff < -0.05 ? 'good' : 'info';
      const dText = p.diff == null ? 'первый месяц' : Math.abs(p.diff) <= 0.05 ? `как в ${monthPrep(prev.mk)}` : `${p.diff > 0 ? '+' : FS.MINUS}${pct(Math.abs(p.diff), 0)} к ${monthShort(prev.mk)}`;
      paceCard = `<div class="card metric">
        <div class="metric__label">Темп месяца</div>
        ${mv(rub(p.forecast))}
        ${badge({ tone: dTone, text: dText })}
        <div class="metric__sub">Прогноз расходов на месяц. Прошло ${p.day} из ${p.dim} дн., переменные траты — <b>${rub(p.perDay)}</b> в день.</div>
        <div class="bar bar--thin mt8"><i style="width:${Math.round(p.elapsed * 100)}%;background:var(--label3)"></i></div>
      </div>`;
    } else if (p.isFuture) {
      paceCard = `<div class="card metric"><div class="metric__label">Темп месяца</div><div class="metric__value">—</div><div class="metric__sub">Месяц ещё не начался</div></div>`;
    } else {
      const dTone = p.diff == null ? 'info' : p.diff > 0.05 ? 'warn' : p.diff < -0.05 ? 'good' : 'info';
      const dText = p.diff == null ? 'итог месяца' : `${p.diff > 0 ? '+' : FS.MINUS}${pct(Math.abs(p.diff), 0)} к ${monthShort(prev.mk)}`;
      paceCard = `<div class="card metric">
        <div class="metric__label">Итог месяца</div>
        ${mv(money(s.expense))}
        ${badge({ tone: dTone, text: dText })}
        <div class="metric__sub">Переменные траты в среднем — <b>${rub(p.perDay)}</b> в день.</div>
      </div>`;
    }
    let freeCard;
    if (fm.isPast) {
      freeCard = `<div class="card metric">
        <div class="metric__label">Отложено</div>
        ${mv(rub(s.savings), s.savings < 0 ? 't-red' : '')}
        ${badge(FS.savingsStatus(s.savingsRate, target()))}
        <div class="metric__sub">Цель — ${rub(Math.max(0, s.personalIncome * target()))} (${pct(target(), 0)} дохода).</div>
      </div>`;
    } else if (fm.base <= 0) {
      freeCard = `<div class="card metric">
        <div class="metric__label">Свободные деньги</div>
        <div class="metric__value">—</div>
        ${badge({ tone: 'info', text: 'нужен доход' })}
        <div class="metric__sub">Внесите доход месяца — и панель покажет, сколько можно тратить в день.</div>
      </div>`;
    } else {
      const ok = fm.left >= 0;
      freeCard = `<div class="card metric">
        <div class="metric__label">Свободные деньги</div>
        ${mv(rub(fm.left), ok ? '' : 't-red')}
        ${badge(ok ? { tone: 'good', text: fm.perDay != null ? `≈ ${rub(fm.perDay)} в день` : 'в запасе' } : { tone: 'bad', text: 'цель под угрозой' })}
        <div class="metric__sub">${ok ? `Можно потратить до конца месяца и отложить ${pct(target(), 0)}` : `Чтобы отложить ${pct(target(), 0)}, тратить уже некуда`}${fm.estimated ? ' (по среднему доходу)' : ''}. Осталось ${fm.daysLeft} ${plural(fm.daysLeft, ['день', 'дня', 'дней'])}.</div>
      </div>`;
    }
    return `<div class="grid2">${paceCard}${freeCard}</div>`;
  }

  function architectureHtml(mk) {
    const s = S(mk);
    const series = FS.levelSeries(S, mk, 6);
    const any = series.some((x) => x.total > 0);
    const levels = PERSONAL_LEVELS.map((L) => ({ L, v: s.byLevel[L] }));
    const tot = s.expense || 1;
    return `<div class="section-head"><div><h2 class="section-title">Архитектура расходов</h2>
        <div class="section-sub">FIXED — обязательное. LIFE — нужное. WANT — качество жизни. LEAK — утечки. Бизнес считается отдельно и в личный бюджет не входит.</div></div></div>
      <div class="card">
        <div class="legend">${PERSONAL_LEVELS.map((L) => `<span><i style="background:${UI.levelColor[L]}"></i>${L} · ${esc(LEVELS[L].desc)}</span>`).join('')}</div>
        ${any ? UI.charts.stacked(series, { selected: mk, width: chartWidth(), hit: 'chart-month', id: 'arch', label: 'Расходы по месяцам' }) : `<div class="hint center" style="padding:24px 0">Здесь появится график, когда будут траты</div>`}
      </div>
      <div class="card">
        ${levels.map(({ L, v }) => `<div class="lvl-row">
          <span class="dot" style="background:${UI.levelColor[L]}"></span>
          <span class="lvl-name">${L}<small>${esc(LEVELS[L].desc)}</small></span>
          <span class="lvl-val">${money(v)}<small>${pct(v / tot, 0)}</small></span>
          <div class="bar bar--thin"><i style="width:${(v / tot) * 100}%;background:${UI.levelColor[L]}"></i></div>
        </div>`).join('')}
        ${s.byLevel.BIZ > 0 ? `<div class="lvl-row"><span class="dot" style="background:var(--teal)"></span><span class="lvl-name">Бизнес<small>отдельно</small></span><span class="lvl-val">${money(s.byLevel.BIZ)}</span></div>` : ''}
      </div>`;
  }

  function topCatsHtml(mk) {
    const s = S(mk);
    const lim = FS.limits();
    const arr = Object.entries(s.byCat).filter(([id]) => catOf(store.data.cats, id).level !== 'BIZ').sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (!arr.length) return '';
    const max = arr[0][1] || 1;
    return `<div class="section-head"><h2 class="section-title">Куда ушли деньги</h2><button type="button" class="section-link" data-act="tab" data-tab="analysis">Разбор ${ICONS.chevronR}</button></div>
      <div class="list">${arr.map(([id, v]) => {
        const c = catOf(store.data.cats, id);
        const l = lim[id];
        const over = l && v > l;
        return `<button type="button" class="row" data-act="goto-ops" data-cat="${esc(id)}" data-month="${mk}" style="--sep-inset:60px">
          ${catIcon(c)}
          <span class="row__main"><span class="row__title">${esc(c.name)}</span>
            <span class="bar bar--thin" style="margin-top:6px"><i style="width:${(v / max) * 100}%;background:${over ? 'var(--red)' : UI.levelColor[c.level] || 'var(--blue)'}"></i></span></span>
          <span class="row__amount">${money(v)}${l ? `<small class="${over ? 't-red' : ''}">из ${money(l)}</small>` : `<small>${pct(v / (s.expense || 1), 0)}</small>`}</span>
        </button>`;
      }).join('')}</div>`;
  }

  function limitsMiniHtml(mk) {
    const lim = FS.limits();
    const ids = Object.keys(lim);
    if (!ids.length) return '';
    const s = S(mk);
    const rows = ids.map((id) => ({ id, l: lim[id], v: s.byCat[id] || 0 })).map((r) => Object.assign(r, { r: r.v / r.l })).sort((a, b) => b.r - a.r);
    const over = rows.filter((r) => r.r > 1).length;
    const near = rows.filter((r) => r.r > 0.85 && r.r <= 1).length;
    const top = rows.slice(0, 3);
    return `<div class="section-head"><div><h2 class="section-title">Лимиты</h2><div class="section-sub">${ids.length} ${plural(ids.length, ['лимит', 'лимита', 'лимитов'])}${over ? ` · превышено: ${over}` : ''}${near ? ` · на грани: ${near}` : ''}</div></div><button type="button" class="section-link" data-act="tab" data-tab="limits">Все ${ICONS.chevronR}</button></div>
      <div class="card">${top.map((r) => {
        const c = catOf(store.data.cats, r.id);
        const tone = r.r > 1 ? 'var(--red)' : r.r > 0.85 ? 'var(--orange)' : 'var(--green)';
        return `<div style="padding:6px 0"><div class="kv" style="padding:0 0 6px"><span style="color:var(--label)">${esc(c.icon)} ${esc(c.name)}</span><b>${money(r.v)} <span class="muted" style="font-weight:500">/ ${fmtNum(r.l)}</span></b></div><div class="bar"><i style="width:${Math.min(100, r.r * 100)}%;background:${tone}"></i></div></div>`;
      }).join('')}</div>`;
  }

  function recentHtml(mk) {
    const list = (idx().byMonth[mk] || []).slice(0, 5);
    if (!list.length) return '';
    return `<div class="section-head"><h2 class="section-title">Последние операции</h2><button type="button" class="section-link" data-act="goto-ops" data-month="${mk}">Все ${ICONS.chevronR}</button></div>
      <div class="list">${list.map((o) => opRow(o, { withDate: true })).join('')}</div>`;
  }

  function overviewHtml() {
    const mk = V.month;
    const s = S(mk);
    const noData = idx().all.length === 0;
    return `<div class="lt"><h1 class="large-title">Обзор</h1></div>
      ${bannersHtml()}
      <div class="toolbar">${monthSwitch()}</div>
      <section class="section">
        <div class="section-head"><div><h2 class="section-title">Паспорт месяца</h2><div class="section-sub">${esc(monthLabelFull(mk).toLowerCase())} · ${s.count} ${plural(s.count, ['операция', 'операции', 'операций'])}</div></div></div>
        ${passportHtml(mk)}
      </section>
      ${noData ? `<section class="section"><div class="card">${emptyBlock('wallet', 'Начните с первой записи', 'Нажмите ＋ внизу — внесите трату или доход. Панель сразу всё посчитает.', { act: 'add', label: 'Добавить операцию', icon: 'plus' })}
        <div class="center"><button type="button" class="link-btn" data-act="demo-load">или посмотреть на демо-данных</button></div></div></section>` : ''}
      <section class="section">${paceHtml(mk)}</section>
      ${limitsMiniHtml(mk) ? `<section class="section">${limitsMiniHtml(mk)}</section>` : ''}
      <section class="section">${architectureHtml(mk)}</section>
      ${topCatsHtml(mk) ? `<section class="section">${topCatsHtml(mk)}</section>` : ''}
      ${recentHtml(mk) ? `<section class="section">${recentHtml(mk)}</section>` : ''}`;
  }

  /* =====================================================================
     ОПЕРАЦИИ
     ===================================================================== */
  function filteredOps() {
    const f = V.f;
    const q = FS.normNote(f.q);
    const cats = store.data.cats;
    let list = f.month === 'all' ? idx().all : idx().byMonth[f.month] || [];
    return list.filter((o) => {
      if (f.type !== 'all' && o.type !== f.type) return false;
      if (f.cat !== 'all') {
        if (f.cat.startsWith('lvl:')) {
          if (o.type !== 'expense' || catOf(cats, o.cat).level !== f.cat.slice(4)) return false;
        } else if (o.cat !== f.cat) return false;
      }
      if (f.member !== 'all' && (o.member || '') !== f.member) return false;
      if (q) {
        const c = catOf(cats, o.cat);
        const hay = FS.normNote(`${o.note} ${c.name} ${FS.memberName(o.member)} ${o.amount}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
  function filtersHtml() {
    const f = V.f;
    const months = dataMonths().slice().reverse();
    if (f.month !== 'all' && !months.includes(f.month)) months.unshift(f.month);
    const monthLbl = f.month === 'all' ? 'Все месяцы' : monthLabel(f.month);
    const typeLbl = { all: 'Приход и расход', expense: 'Расходы', income: 'Приходы' }[f.type];
    let catLbl = 'Все категории';
    if (f.cat.startsWith('lvl:')) catLbl = 'Все ' + f.cat.slice(4);
    else if (f.cat !== 'all') catLbl = catOf(store.data.cats, f.cat).name;
    const members = FS.members();
    const memberLbl = f.member === 'all' ? 'Все участники' : FS.memberName(f.member) || 'Без участника';
    const expCats = FS.cats('expense', { withHidden: true });
    const incCats = FS.cats('income', { withHidden: true });
    const any = f.month !== 'all' || f.type !== 'all' || f.cat !== 'all' || f.member !== 'all';
    return `<div class="filters">
      <label class="fchip ${f.month !== 'all' ? 'active' : ''}">${esc(monthLbl)} ${ICONS.chevronD}
        <select data-filter="month" aria-label="Месяц"><option value="all">Все месяцы</option>${months.map((m) => `<option value="${m}" ${m === f.month ? 'selected' : ''}>${esc(monthLabelFull(m))}</option>`).join('')}</select></label>
      <label class="fchip ${f.type !== 'all' ? 'active' : ''}">${esc(typeLbl)} ${ICONS.chevronD}
        <select data-filter="type" aria-label="Тип"><option value="all">Приход и расход</option><option value="expense" ${f.type === 'expense' ? 'selected' : ''}>Только расходы</option><option value="income" ${f.type === 'income' ? 'selected' : ''}>Только приходы</option></select></label>
      <label class="fchip ${f.cat !== 'all' ? 'active' : ''}">${esc(catLbl)} ${ICONS.chevronD}
        <select data-filter="cat" aria-label="Категория"><option value="all">Все категории</option>
          ${EXP_LEVELS.map((L) => `<optgroup label="${esc(LEVELS[L].title + ' · ' + LEVELS[L].desc)}"><option value="lvl:${L}" ${f.cat === 'lvl:' + L ? 'selected' : ''}>Все ${esc(LEVELS[L].title)}</option>${expCats.filter((c) => c.level === L).map((c) => `<option value="${esc(c.id)}" ${f.cat === c.id ? 'selected' : ''}>${esc(c.icon + ' ' + c.name)}</option>`).join('')}</optgroup>`).join('')}
          <optgroup label="Доходы">${incCats.map((c) => `<option value="${esc(c.id)}" ${f.cat === c.id ? 'selected' : ''}>${esc(c.icon + ' ' + c.name)}</option>`).join('')}</optgroup>
        </select></label>
      ${members.length > 1 ? `<label class="fchip ${f.member !== 'all' ? 'active' : ''}">${esc(memberLbl)} ${ICONS.chevronD}
        <select data-filter="member" aria-label="Участник"><option value="all">Все участники</option>${members.map((m) => `<option value="${esc(m.id)}" ${f.member === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>` : ''}
      ${any ? `<button type="button" class="fchip" data-act="filter-reset" style="color:var(--blue)">Сбросить</button>` : ''}
    </div>`;
  }
  function opsListHtml() {
    const list = filteredOps();
    if (!idx().all.length) return `<div class="card">${emptyBlock('list', 'Пока нет операций', 'Здесь будут все ваши траты и доходы.', { act: 'add', label: 'Добавить операцию', icon: 'plus' })}</div>`;
    if (!list.length) return `<div class="card">${emptyBlock('search', 'Ничего не нашлось', 'Попробуйте изменить фильтры или поиск.')}</div>`;
    let inc = 0, exp = 0;
    for (const o of list) { if (o.type === 'income') inc += o.amount; else exp += o.amount; }
    const shown = list.slice(0, V.limit);
    let html = '';
    let curDay = null, buf = [], dayTotal = 0;
    const flush = () => {
      if (!buf.length) return;
      html += `<div class="day-head"><b>${esc(dayLabel(curDay))}</b><span class="num">${dayTotal ? money(-dayTotal) : ''}</span></div><div class="list">${buf.join('')}</div>`;
      buf = [];
      dayTotal = 0;
    };
    for (const o of shown) {
      if (o.date !== curDay) { flush(); curDay = o.date; }
      buf.push(opRow(o, { swipe: true }));
      if (o.type === 'expense' && catOf(store.data.cats, o.cat).level !== 'BIZ') dayTotal += o.amount;
    }
    flush();
    if (list.length > shown.length) html += `<div class="center mt16"><button type="button" class="btn btn--gray btn--sm" data-act="ops-more">Показать ещё ${Math.min(150, list.length - shown.length)}</button></div>`;
    html += `<div class="card mt24 totals"><span class="muted">Итого в выборке</span><b>${money(-exp)} / <span class="pos">${money(inc, { sign: 'always' })}</span></b></div>`;
    return html;
  }
  function opsHtml() {
    const n = filteredOps().length;
    return `<div class="lt"><h1 class="large-title">Операции</h1><div class="lt-sub" id="opsCount">${n} ${plural(n, ['запись', 'записи', 'записей'])}</div></div>
      <div class="search">${ICONS.search.replace('class="ico"', 'class="ico ico-s"')}<input id="opsSearch" type="search" placeholder="Поиск по комментарию" value="${esc(V.f.q)}" autocomplete="off" enterkeyhint="search">${V.f.q ? `<button type="button" class="clear" data-act="search-clear" aria-label="Очистить">${ICONS.xcircle}</button>` : ''}</div>
      ${filtersHtml()}
      <div id="opsList">${opsListHtml()}</div>`;
  }
  function refreshOpsList() {
    const box = $('#opsList');
    if (!box) return V.render();
    box.innerHTML = opsListHtml();
    const n = filteredOps().length;
    const c = $('#opsCount');
    if (c) c.textContent = `${n} ${plural(n, ['запись', 'записи', 'записей'])}`;
  }
  V.refreshOpsList = refreshOpsList;

  /* =====================================================================
     ЛИМИТЫ
     ===================================================================== */
  function limitsHtml() {
    const mk = V.month;
    const s = S(mk);
    const lim = FS.limits();
    const ids = Object.keys(lim);
    const p = FS.pace(s, mk, null);
    const totalL = FS.sum(ids.map((id) => lim[id]));
    const totalS = FS.sum(ids.map((id) => s.byCat[id] || 0));
    let head;
    if (!ids.length) {
      head = `<div class="card">${emptyBlock('gauge', 'Лимитов пока нет', 'Поставьте месячный лимит на категории, где хочется тратить меньше — например, кафе, маркетплейсы или доставку.')}
        <div class="btn-row"><button type="button" class="btn" data-act="limits-suggest">${ICONS.sparkles}Предложить по моим тратам</button></div></div>`;
    } else {
      const left = totalL - totalS;
      const r = totalL ? totalS / totalL : 0;
      const tone = r > 1 ? 'var(--red)' : r > p.elapsed + 0.1 && p.isCurrent ? 'var(--orange)' : 'var(--green)';
      const daysLeft = p.isCurrent ? p.dim - p.day + 1 : 0;
      head = `<div class="card">
        <div class="metric__label">Потрачено по лимитам</div>
        <div class="row-gap" style="align-items:baseline;margin:6px 0 10px"><span class="big">${money(totalS)}</span><span class="muted">из ${money(totalL)}</span></div>
        <div class="bar bar--thick"><i style="width:${Math.min(100, r * 100)}%;background:${tone}"></i>${p.isCurrent ? `<span class="marker" style="left:${p.elapsed * 100}%"></span>` : ''}</div>
        <div class="hint mt8">${left >= 0 ? `Осталось <b style="color:var(--label)">${money(left)}</b>` : `Перерасход <b class="t-red">${money(-left)}</b>`}${daysLeft && left > 0 ? ` · ≈ ${rub(left / daysLeft)} в день, ${daysLeft} ${plural(daysLeft, ['день', 'дня', 'дней'])}` : ''}${p.isCurrent ? ' · черта — сколько месяца прошло' : ''}</div>
        <div class="btn-row mt12"><button type="button" class="btn btn--tinted btn--sm" data-act="limits-suggest">${ICONS.sparkles}Предложить лимиты</button></div>
      </div>`;
    }
    const cats = FS.cats('expense');
    const groups = EXP_LEVELS.map((L) => {
      const rows = cats.filter((c) => c.level === L).filter((c) => V.limitsAll || lim[c.id] || s.byCat[c.id]);
      rows.sort((a, b) => (lim[b.id] ? 1 : 0) - (lim[a.id] ? 1 : 0) || (s.byCat[b.id] || 0) - (s.byCat[a.id] || 0));
      if (!rows.length) return '';
      return `<div class="group-label">${esc(LEVELS[L].title)} · ${esc(LEVELS[L].desc)}</div><div class="list">${rows.map((c) => {
        const v = s.byCat[c.id] || 0;
        const l = lim[c.id];
        let right, bar = '', sub;
        if (l) {
          const r = v / l;
          const tone = r > 1 ? 'var(--red)' : r > 0.85 ? 'var(--orange)' : 'var(--green)';
          right = `${money(v)}<small>из ${money(l)}</small>`;
          bar = `<span class="bar bar--thin" style="margin-top:6px"><i style="width:${Math.min(100, r * 100)}%;background:${tone}"></i></span>`;
          sub = r > 1 ? `<span class="t-red">превышен на ${money(v - l)}</span>` : `осталось ${money(l - v)}`;
        } else {
          right = `${money(v)}<small class="t-blue">лимит +</small>`;
          sub = 'без лимита';
        }
        return `<button type="button" class="row" data-act="limit" data-cat="${esc(c.id)}">${catIcon(c)}<span class="row__main"><span class="row__title">${esc(c.name)}</span><span class="row__sub">${sub}</span>${bar}</span><span class="row__amount">${right}</span></button>`;
      }).join('')}</div>`;
    }).join('');
    return `<div class="lt"><h1 class="large-title">Лимиты</h1></div>
      <div class="toolbar">${monthSwitch()}</div>
      <section class="section">${head}</section>
      <section class="section" style="margin-top:12px">
        ${UI.seg('limitsAll', [{ value: 'used', label: 'С тратами' }, { value: 'all', label: 'Все категории' }], V.limitsAll ? 'all' : 'used')}
        ${groups || `<div class="card mt12 hint center">В этом месяце трат пока нет. Переключитесь на «Все категории», чтобы поставить лимиты заранее.</div>`}
      </section>`;
  }

  /* =====================================================================
     РАЗБОР
     ===================================================================== */
  function insightRow(tone, icon, html) {
    const c = { good: 'c-green', warn: 'c-orange', bad: 'c-red', info: 'c-blue' }[tone] || 'c-blue';
    return `<div class="insight"><div class="insight__ico ${c}">${ICONS[icon]}</div><div class="insight__text">${html}</div></div>`;
  }
  function analysisHtml() {
    const end = V.month;
    const n = Number(V.period);
    const cm = curMonth();
    const p = periodStats(end, n);
    const inProgress = end === cm;
    const fullN = inProgress ? n - 1 : n;
    const full = fullN > 0 ? periodStats(inProgress ? addMonths(end, -1) : end, fullN) : null;
    const base = full && full.months > 0 ? full : null; // полные месяцы — основа для средних
    const prev = periodStats(addMonths(end, -n), n);
    const avgOf = (st, v) => v / Math.max(1, st.months || 1);
    const t = target();
    const cats = store.data.cats;
    const periodName = n === 1 ? monthLabelFull(end).toLowerCase() + (inProgress ? ' — месяц ещё идёт' : '') : `${n} ${plural(n, ['месяц', 'месяца', 'месяцев'])} до ${monthLabel(end).toLowerCase()} включительно`;
    const rec = FS.findRecurring(idx().byMonth, cats, end, 6);
    const recTotal = FS.sum(rec.map((r) => r.monthly));
    const head = `<div class="lt"><h1 class="large-title">Разбор</h1><div class="lt-sub">${esc(periodName)}</div></div>
      ${UI.seg('period', [{ value: '1', label: 'Месяц' }, { value: '3', label: '3 месяца' }, { value: '12', label: 'Год' }], V.period)}
      <div class="toolbar mt12">${monthSwitch()}</div>`;
    if (p.count === 0) {
      return `${head}<div class="card mt16">${emptyBlock('sparkles', 'Пока нечего разбирать', 'Добавьте операции — и здесь появятся выводы: утечки, подписки, прогноз накоплений.', { act: 'add', label: 'Добавить операцию', icon: 'plus' })}</div>`;
    }
    const ins = [];
    const sv = base || p;
    // 1. сбережения
    if (sv.savingsRate == null) ins.push(insightRow('info', 'info', 'Доходов за период нет — внесите их, чтобы посчитать норму сбережений.'));
    else if (sv.savingsRate >= t) ins.push(insightRow('good', 'checkCircle', `Норма сбережений <b>${pct(sv.savingsRate)}</b> — выше цели ${pct(t, 0)}. Отложено <b>${rub(sv.savings)}</b>${base && n > 1 ? ` за ${base.months} ${plural(base.months, ['полный месяц', 'полных месяца', 'полных месяцев'])}` : ''}.`));
    else {
      const need = avgOf(sv, sv.personalIncome * t - sv.savings);
      ins.push(insightRow(sv.savingsRate >= t / 2 ? 'warn' : 'bad', 'piggy', `Норма сбережений <b>${pct(sv.savingsRate)}</b> — ниже цели ${pct(t, 0)}. До цели не хватает <b>${rub(need)}</b> в месяц.`));
    }
    // 2. утечки
    if (p.byLevel.LEAK > 0) {
      const top = Object.entries(p.byCat).filter(([id]) => catOf(cats, id).level === 'LEAK').sort((a, b) => b[1] - a[1])[0];
      ins.push(insightRow(FS.leakStatus(p.leakShare).tone, 'drop', `Утечки — <b>${rub(p.byLevel.LEAK)}</b> (${pct(p.leakShare)} расходов, норма до 3 %).${top ? ` Больше всего — ${esc(catOf(cats, top[0]).name)}: <b>${rub(top[1])}</b>.` : ''}`));
    } else if (p.expense > 0) ins.push(insightRow('good', 'drop', 'Утечек нет — ни доставки, ни лишних подписок и комиссий. Отлично!'));
    // 3. динамика к прошлому периоду (по средним за полный месяц)
    if (base && prev.months > 0) {
      const growth = Object.keys(base.byCat).map((id) => {
        const cur = avgOf(base, base.byCat[id]);
        const was = avgOf(prev, prev.byCat[id] || 0);
        return { id, d: cur - was, r: was ? cur / was - 1 : null };
      }).filter((g) => !['BIZ', 'FIXED'].includes(catOf(cats, g.id).level) && g.d >= 1500 && (g.r == null || g.r >= 0.2)).sort((a, b) => b.d - a.d)[0];
      if (growth) ins.push(insightRow('warn', 'trendUp', `${esc(catOf(cats, growth.id).name)}: <b>+${rub(growth.d)}</b> в месяц${growth.r != null ? ` (+${pct(growth.r, 0)})` : ''} к ${n === 1 ? monthLabel(addMonths(end, -1)).toLowerCase() : 'прошлому периоду'}.`));
      const ce = avgOf(base, base.expense), pe = avgOf(prev, prev.expense);
      const dexp = pe ? ce / pe - 1 : null;
      if (dexp != null && Math.abs(dexp) >= 0.05) ins.push(insightRow(dexp > 0 ? 'warn' : 'good', dexp > 0 ? 'trendUp' : 'trendDown', `Личные расходы в месяц ${dexp > 0 ? 'выросли' : 'снизились'} на <b>${pct(Math.abs(dexp), 0)}</b>: ${rub(pe)} → ${rub(ce)}.`));
    } else if (inProgress && n === 1) {
      ins.push(insightRow('info', 'calendar', 'Месяц ещё идёт — сравнение с прошлым появится по его итогам. Прогноз смотрите в «Темпе месяца» на обзоре.'));
    }
    // 4. регулярные списания
    if (rec.length) ins.push(insightRow(recTotal > 3000 ? 'warn' : 'info', 'repeat', `Подписки и регулярные платежи: <b>${rec.length}</b> на <b>${rub(recTotal)}</b> в месяц — это <b>${rub(recTotal * 12)}</b> в год.`));
    // 5. обязательные
    if (sv.fixedShare != null) {
      const fs = FS.fixedStatus(sv.fixedShare);
      ins.push(insightRow(fs.tone, 'house', `Обязательные (FIXED) — <b>${pct(sv.fixedShare, 0)}</b> дохода: ${fs.tone === 'good' ? 'в норме (до 35 %)' : fs.tone === 'warn' ? 'многовато, норма — до 35 %' : 'перегруз: больше половины дохода'}.`));
    }
    // 6. лимиты
    if (n === 1) {
      const lim = FS.limits();
      const over = Object.keys(lim).filter((id) => (p.byCat[id] || 0) > lim[id]);
      if (over.length) ins.push(insightRow('bad', 'gauge', `Превышены лимиты: ${over.slice(0, 3).map((id) => `${esc(catOf(cats, id).name)} (+${rub(p.byCat[id] - lim[id])})`).join(', ')}${over.length > 3 ? ' и др.' : ''}.`));
    }

    // итого: сколько можно откладывать
    const avgSave = avgOf(sv, sv.savings);
    const avgLeak = avgOf(sv, sv.byLevel.LEAK);
    const canSave = Math.max(0, avgSave + avgLeak * 0.8);
    const yr = Number(settings().yieldRate) || 0;
    const proj = [12, 36, 60].map((m) => ({ m, plain: canSave * m, fv: FS.futureValue(canSave, m, yr) }));

    // структура
    const lvlSegs = PERSONAL_LEVELS.map((L) => ({ L, value: p.byLevel[L], color: UI.levelColor[L] }));
    const topCats = Object.entries(p.byCat).filter(([id]) => catOf(cats, id).level !== 'BIZ').sort((a, b) => b[1] - a[1]).slice(0, 8);
    const series = FS.levelSeries(S, end, 12);

    // дни недели (переменные траты)
    const wd = [0, 0, 0, 0, 0, 0, 0], wdCnt = [0, 0, 0, 0, 0, 0, 0];
    const first = idx().all.length ? idx().all[idx().all.length - 1].date : today();
    let startDay = `${addMonths(end, -(n - 1))}-01`;
    if (first > startDay) startDay = first;
    const lastDay = inProgress ? today() : `${end}-${String(FS.daysInMonth(end)).padStart(2, '0')}`;
    for (let d = startDay; d <= lastDay; d = addDays(d, 1)) wdCnt[FS.parseDate(d).getDay()]++;
    for (let i = 0; i < n; i++) for (const o of idx().byMonth[addMonths(end, -i)] || []) {
      if (o.type !== 'expense') continue;
      const L = catOf(cats, o.cat).level;
      if (L === 'BIZ' || L === 'FIXED') continue;
      wd[FS.parseDate(o.date).getDay()] += o.amount;
    }
    const order = [1, 2, 3, 4, 5, 6, 0];
    const wdAvg = order.map((i) => (wdCnt[i] ? wd[i] / wdCnt[i] : 0));
    const wdMax = wdAvg.indexOf(Math.max(...wdAvg));
    const wdPos = wdAvg.filter((v) => v > 0);
    const wdMin = wdPos.length ? Math.min(...wdPos) : 0;
    const WD_DAT = ['понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям'];

    const members = FS.members();
    const byM = Object.entries(p.byMember).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

    return `${head}
      <section class="section">
        <div class="section-head"><h2 class="section-title">Главное</h2></div>
        <div class="card">${ins.slice(0, 6).join('')}</div>
      </section>

      <section class="section">
        <div class="section-head"><div><h2 class="section-title">Итого</h2><div class="section-sub">Сколько реально можно откладывать без падения уровня жизни</div></div></div>
        <div class="card">
          <div class="big">${rub(canSave)}<span class="muted" style="font-size:17px;font-weight:600"> / мес</span></div>
          <div class="hint mt8">Сейчас откладываете в среднем <b style="color:var(--label)">${rub(avgSave)}</b> в месяц${avgLeak > 0 ? `, и ещё ≈ <b style="color:var(--label)">${rub(avgLeak * 0.8)}</b> можно вернуть, срезав 80 % утечек` : ''}.${base ? '' : ' Пока считаем по неполному месяцу — точнее станет по его итогам.'}</div>
          <div class="proj">${proj.map((x) => `<div><small>${x.m} мес</small><b>${short(x.plain)}</b>${yr ? `<span>${short(x.fv)} под ${pct(yr, 0)}</span>` : ''}</div>`).join('')}</div>
          <div class="hint mt8">Во что превратятся накопления${yr ? `; зелёным — с доходностью ${pct(yr, 0)} годовых (меняется в настройках)` : ''}.</div>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><div><h2 class="section-title">Регулярные списания</h2><div class="section-sub">Подписки и платежи, которые повторяются каждый месяц — их легко не замечать</div></div></div>
        ${rec.length ? `<div class="list">${rec.slice(0, 12).map((r) => {
          const c = catOf(cats, r.cat);
          return `<button type="button" class="row" data-act="goto-ops" data-cat="${esc(r.cat)}">${catIcon(c)}<span class="row__main"><span class="row__title">${esc(r.name)}</span><span class="row__sub">${esc(c.name)} · ${r.months > 1 ? `${r.months} ${plural(r.months, ['месяц', 'месяца', 'месяцев'])} подряд` : 'подписка'}</span></span><span class="row__amount">${rub(r.monthly)}<small>${esc(short(r.yearly))} в год</small></span></button>`;
        }).join('')}
          <div class="row row--plain"><span class="row__main"><span class="row__title" style="font-weight:600">Всего</span></span><span class="row__amount">${rub(recTotal)}<small>${rub(recTotal * 12)} в год</small></span></div></div>`
          : `<div class="card hint">Повторяющихся списаний не найдено. Подсказка: подписки записывайте в категорию «Подписки» с названием сервиса в комментарии.</div>`}
      </section>

      <section class="section">
        <div class="section-head"><h2 class="section-title">Структура расходов</h2></div>
        <div class="card">
          <div class="donut-wrap">${UI.charts.donut(lvlSegs, { top: short(p.expense), bottom: 'расходы', size: 124 })}
            <div class="donut-legend">${lvlSegs.map((sg) => `<div><i class="dot" style="background:${sg.color}"></i><span><b>${sg.L}</b> <span class="muted">${pct(p.expense ? sg.value / p.expense : 0, 0)}</span></span><b>${esc(short(sg.value))}</b></div>`).join('')}</div>
          </div>
        </div>
        ${topCats.length ? `<div class="list mt12">${topCats.map(([id, v]) => {
          const c = catOf(cats, id);
          let dTxt = '', dCls = '';
          if (base && prev.months > 0) {
            const cur = avgOf(base, base.byCat[id] || 0), was = avgOf(prev, prev.byCat[id] || 0);
            if (!was) dTxt = cur ? 'новая' : '';
            else {
              const d = cur / was - 1;
              dTxt = Math.abs(d) < 0.05 ? 'как раньше' : `${d > 0 ? '+' : FS.MINUS}${pct(Math.abs(d), 0)}`;
              dCls = d > 0.05 ? 't-red' : d < -0.05 ? 'pos' : '';
            }
          }
          const perM = n > 1 ? ` · ${rub(avgOf(base || p, (base || p).byCat[id] || 0))}/мес` : '';
          return `<button type="button" class="row" data-act="goto-ops" data-cat="${esc(id)}" data-month="${n === 1 ? end : 'all'}">${catIcon(c)}<span class="row__main"><span class="row__title">${esc(c.name)}</span><span class="row__sub">${pct(v / (p.expense || 1), 0)} расходов${perM}</span></span><span class="row__amount">${rub(v)}${dTxt ? `<small class="${dCls}">${dTxt}</small>` : ''}</span></button>`;
        }).join('')}</div>${base && prev.months > 0 ? `<div class="group-foot">Изменение — средняя сумма в месяц к прошлому периоду.</div>` : ''}` : ''}
      </section>

      <section class="section">
        <div class="section-head"><div><h2 class="section-title">Доходы и расходы</h2><div class="section-sub">Последние 12 месяцев</div></div></div>
        <div class="card">
          <div class="legend"><span><i style="background:var(--green)"></i>доход</span><span><i style="background:var(--orange)"></i>личный расход</span></div>
          ${UI.charts.incomeExpense(series, { width: chartWidth(), selected: end })}
          <div class="hint mt8">Норма сбережений за 12 месяцев: <b style="color:var(--label)">${pct(combineRate(series))}</b></div>
        </div>
      </section>

      ${wdPos.length ? `<section class="section">
        <div class="section-head"><div><h2 class="section-title">По дням недели</h2><div class="section-sub">Средние переменные траты за день (без обязательных)</div></div></div>
        <div class="card">${UI.charts.bars(wdAvg, order.map((i) => FS.WD_SHORT[i]), { width: chartWidth(), highlight: wdMax, label: 'Траты по дням недели' })}
          ${wdMin > 0 && wdAvg[wdMax] / wdMin >= 1.5 ? `<div class="hint mt8">Больше всего тратите по ${WD_DAT[wdMax]} — в ${(wdAvg[wdMax] / wdMin).toFixed(1).replace('.', ',')} раза больше, чем в самый «тихий» день.</div>` : ''}
        </div>
      </section>` : ''}

      ${members.length > 1 && byM.length ? `<section class="section">
        <div class="section-head"><h2 class="section-title">Кто сколько тратит</h2></div>
        <div class="card">${byM.map(([id, v]) => {
          const m = store.data.members[id];
          const color = m && !m.deleted ? FS.mcolor(m) : 'gray';
          return `<div style="padding:6px 0"><div class="kv" style="padding:0 0 6px"><span style="color:var(--label)">${esc(m && !m.deleted ? m.name : 'Не указан')}</span><b>${rub(v)} <span class="muted" style="font-weight:500">${pct(v / (p.expense || 1), 0)}</span></b></div><div class="bar"><i style="width:${(v / (byM[0][1] || 1)) * 100}%;background:var(--${color})"></i></div></div>`;
        }).join('')}</div>
      </section>` : ''}`;
  }
  function combineRate(series) {
    const inc = FS.sum(series.map((s) => s.income));
    const sv = FS.sum(series.map((s) => s.savings));
    return inc > 0 ? sv / inc : null;
  }

  const BUILD = { overview: overviewHtml, ops: opsHtml, limits: limitsHtml, analysis: analysisHtml };
  const AFTER = {
    limits(sec) { UI.bindSeg(sec, 'limitsAll', (v) => { V.limitsAll = v === 'all'; V.render(); }); },
    analysis(sec) { UI.bindSeg(sec, 'period', (v) => { V.period = v; FS.prefs.set('period', v); setTimeout(V.render, 180); }); },
    ops(sec) {
      const inp = $('#opsSearch', sec);
      if (inp) inp.addEventListener('input', FS.debounce(() => { V.f.q = inp.value; V.limit = 150; refreshOpsList(); toggleClear(sec); }, 180));
    },
  };
  function toggleClear(sec) {
    const wrap = $('.search', sec);
    const has = !!V.f.q;
    let btn = $('.clear', wrap);
    if (has && !btn) wrap.insertAdjacentHTML('beforeend', `<button type="button" class="clear" data-act="search-clear" aria-label="Очистить">${ICONS.xcircle}</button>`);
    if (!has && btn) btn.remove();
  }

  /* =====================================================================
     ШТОРКА ОПЕРАЦИИ
     ===================================================================== */
  function frequentCats(kind) {
    const counts = {};
    const since = addDays(today(), -90);
    for (const o of idx().all) {
      if (o.date < since) break;
      if ((o.type === 'income') !== (kind === 'income')) continue;
      counts[o.cat] = (counts[o.cat] || 0) + 1;
    }
    return Object.entries(counts).filter(([id]) => store.data.cats[id] && !store.data.cats[id].hidden && !store.data.cats[id].deleted).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => id);
  }

  V.openOp = function (op, preset = {}) {
    const editing = !!op;
    const st = {
      type: op ? op.type : preset.type || 'expense',
      amount: op ? String(op.amount).replace('.', ',') : '',
      cat: op ? op.cat : preset.cat || null,
      date: op ? op.date : preset.date || today(),
      note: op ? op.note || '' : '',
      member: op ? op.member || null : store.local.me || null,
    };
    if (st.member && (!store.data.members[st.member] || store.data.members[st.member].deleted)) st.member = null;
    const cur = FS.cur();
    let sheet;
    const valid = () => FS.parseAmount(st.amount) > 0 && !!st.cat && store.data.cats[st.cat];
    const updBtn = () => { if (!sheet) return; const b = sheet.page.right._btn; if (b) b.disabled = !valid(); };

    function catsHtml() {
      const kind = st.type;
      const freq = frequentCats(kind);
      const all = FS.cats(kind);
      if (st.cat && !all.find((c) => c.id === st.cat) && store.data.cats[st.cat]) all.unshift(store.data.cats[st.cat]);
      const chip = (c) => `<button type="button" class="chip" data-cat="${esc(c.id)}" aria-pressed="${c.id === st.cat}"><span class="em">${esc(c.icon)}</span>${esc(c.name)}</button>`;
      let html = '';
      if (freq.length >= 3) html += `<div class="cat-group-title">${ICONS.bolt} Частые</div><div class="chips">${freq.map((id) => chip(store.data.cats[id])).join('')}</div>`;
      if (kind === 'income') html += `<div class="cat-group-title">Доходы</div><div class="chips">${all.map(chip).join('')}</div>`;
      else EXP_LEVELS.forEach((L) => {
        const cs = all.filter((c) => c.level === L);
        if (cs.length) html += `<div class="cat-group-title"><span class="dot" style="background:${UI.levelColor[L]}"></span>${esc(LEVELS[L].title)} · ${esc(LEVELS[L].desc)}</div><div class="chips">${cs.map(chip).join('')}</div>`;
      });
      html += `<div class="chips mt12"><button type="button" class="chip chip--add" data-act-local="new-cat">${ICONS.plus} Новая категория</button></div>`;
      return html;
    }
    function dateHtml() {
      const t = today(), y = addDays(t, -1);
      const other = st.date !== t && st.date !== y;
      return `<button type="button" class="chip chip--sm" data-date="${t}" aria-pressed="${st.date === t}">Сегодня</button>
        <button type="button" class="chip chip--sm" data-date="${y}" aria-pressed="${st.date === y}">Вчера</button>
        <label class="date-pick" aria-pressed="${other}">${ICONS.calendar}<span>${other ? esc(dateShort(st.date)) + (st.date.slice(0, 4) !== t.slice(0, 4) ? ' ' + st.date.slice(0, 4) : '') : 'Другая дата'}</span><input type="date" id="opDate" value="${st.date}" max="${addDays(t, 366)}" aria-label="Дата"></label>`;
    }
    function membersHtml() {
      const ms = FS.members();
      if (ms.length < 2) return '';
      return `<div class="form-block"><div class="form-label">Кто</div><div class="chips" id="opMembers">${ms.map((m) => `<button type="button" class="chip chip--sm" data-member="${esc(m.id)}" aria-pressed="${st.member === m.id}"><span class="dot c-${FS.mcolor(m)}"></span>${esc(m.name)}</button>`).join('')}</div></div>`;
    }
    function render(body) {
      body.innerHTML = `
        ${UI.seg('type', [{ value: 'expense', label: 'Расход' }, { value: 'income', label: 'Приход' }], st.type, 'seg--lg')}
        <div class="amount-box ${st.type === 'income' ? 'amount--income' : ''}" id="opAmountBox"><input id="opAmount" inputmode="decimal" placeholder="0" value="${esc(st.amount)}" autocomplete="off" aria-label="Сумма"><span class="cur">${esc(cur)}</span></div>
        <div class="amount-calc" id="opCalc"></div>
        <div class="form-block"><div class="form-label">Категория</div><div id="opCats">${catsHtml()}</div></div>
        <div class="form-block"><div class="form-label">Дата</div><div class="date-row" id="opDates">${dateHtml()}</div></div>
        <div class="form-block"><div class="form-label">Комментарий</div><input class="input" id="opNote" placeholder="За что — своими словами" maxlength="200" value="${esc(st.note)}" autocomplete="off" enterkeyhint="done"></div>
        ${membersHtml()}
        ${editing ? `<div class="form-block mt24"><button type="button" class="btn btn--danger btn--block" id="opDel">${ICONS.trash}Удалить операцию</button></div>` : ''}`;
      UI.bindSeg(body, 'type', (v) => {
        st.type = v;
        if (st.cat && store.data.cats[st.cat] && store.data.cats[st.cat].kind !== v) st.cat = null;
        $('#opCats', body).innerHTML = catsHtml();
        $('#opAmountBox', body).classList.toggle('amount--income', v === 'income');
        updBtn();
      });
      const amt = $('#opAmount', body);
      const calc = $('#opCalc', body);
      const onAmt = () => {
        st.amount = amt.value;
        const v = FS.parseAmount(amt.value);
        calc.textContent = /[+\-*/×x÷]/.test(amt.value.replace(/^-/, '')) && v > 0 ? '= ' + money(v) : '';
        updBtn();
      };
      amt.addEventListener('input', onAmt);
      onAmt();
      body.addEventListener('click', (e) => {
        const c = e.target.closest('[data-cat]');
        if (c && body.contains(c)) {
          st.cat = c.dataset.cat;
          $$('[data-cat]', body).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.cat === st.cat)));
          UI.haptic();
          if (document.activeElement === amt) amt.blur();
          updBtn();
          return;
        }
        const d = e.target.closest('[data-date]');
        if (d) { st.date = d.dataset.date; $('#opDates', body).innerHTML = dateHtml(); bindDate(); UI.haptic(); return; }
        const m = e.target.closest('[data-member]');
        if (m) {
          st.member = st.member === m.dataset.member ? null : m.dataset.member;
          $$('[data-member]', body).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.member === st.member)));
          UI.haptic();
          return;
        }
        const nc = e.target.closest('[data-act-local="new-cat"]');
        if (nc) {
          V.editCategory(null, { kind: st.type, onSaved: (id) => { st.cat = id; $('#opCats', body).innerHTML = catsHtml(); updBtn(); } });
        }
      });
      function bindDate() {
        const di = $('#opDate', body);
        di.addEventListener('change', () => { if (di.value) { st.date = di.value; $('#opDates', body).innerHTML = dateHtml(); bindDate(); } });
      }
      bindDate();
      const note = $('#opNote', body);
      note.addEventListener('input', () => { st.note = note.value; });
      note.addEventListener('keydown', (e) => { if (e.key === 'Enter') { note.blur(); if (valid()) save(); } });
      const del = $('#opDel', body);
      if (del) del.addEventListener('click', async () => {
        const ok = await UI.actions({ title: 'Удалить эту операцию?', actions: [{ label: 'Удалить операцию', value: true, destructive: true }] });
        if (!ok) return;
        const prev = FS.actions.deleteOp(op.id);
        sheet.close();
        UI.haptic('success');
        UI.toast('Операция удалена', { icon: 'trash', action: { label: 'Вернуть', onClick: () => FS.actions.restoreOp(prev) } });
      });
    }
    function save() {
      if (!valid()) return;
      const amount = FS.parseAmount(st.amount);
      const fields = { type: st.type, amount, date: st.date, cat: st.cat, note: st.note, member: st.member };
      let saved;
      if (editing) { FS.actions.updateOp(op.id, fields); saved = Object.assign({}, op, fields); }
      else saved = FS.actions.addOp(fields);
      sheet.close();
      UI.haptic('success');
      const c = catOf(store.data.cats, st.cat);
      const msg = `${editing ? 'Сохранено' : 'Записано'}: ${money(st.type === 'income' ? amount : -amount, { sign: st.type === 'income' ? 'always' : 'auto' })} · ${c.name}`;
      UI.toast(msg, editing ? {} : { action: { label: 'Отменить', onClick: () => FS.actions.deleteOp(saved.id) } });
      if (st.type === 'expense') {
        const l = FS.limits()[st.cat];
        if (l) {
          const spent = S(st.date.slice(0, 7)).byCat[st.cat] || 0;
          if (spent > l) setTimeout(() => UI.toast(`Лимит «${c.name}» превышен на ${money(spent - l)}`, { error: true, timeout: 3800 }), 700);
          else if (spent > l * 0.85) setTimeout(() => UI.toast(`«${c.name}»: осталось ${money(l - spent)} из лимита`, { icon: 'warn', timeout: 3200 }), 700);
        }
      }
    }
    sheet = UI.sheet({
      title: editing ? 'Операция' : 'Новая операция',
      left: 'cancel',
      right: { label: editing ? 'Сохранить' : 'Готово', fill: true, disabled: true, onClick: save },
      full: true,
      body: render,
    });
    updBtn();
    if (!editing) {
      const amt = $('#opAmount', sheet.body);
      try { amt.focus({ preventScroll: true }); } catch (e) { amt.focus(); }
    }
    return sheet;
  };

  /* ---------- редактор категории (используется и в настройках) ---------- */
  const EMOJI = ['🛒', '🍎', '☕', '🍔', '🍕', '🛵', '🚇', '🚕', '🚗', '⛽', '🏠', '💡', '📶', '📱', '💳', '🏦', '🧾', '🛡️', '🎓', '🧸', '👶', '🐾', '💊', '🩺', '🧺', '🧴', '👕', '👟', '💅', '💇', '🎁', '🎬', '🎮', '🎵', '📚', '🏋️', '⚽', '✈️', '🏖️', '💻', '📦', '🔁', '💸', '⚡', '🚨', '💵', '💼', '🤝', '🚀', '🪙', '↩️', '➕', '🎀', '🛠️', '👥', '📣', '🧰', '🍷', '🚬', '🎰', '⛪', '🌱', '🏥', '🪴'];
  V.EMOJI = EMOJI;
  V.editCategory = function (cat, opts = {}) {
    const isNew = !cat;
    const st = cat ? Object.assign({}, cat) : { name: '', icon: opts.kind === 'income' ? '💼' : '🛒', level: opts.kind === 'income' ? 'INCOME' : opts.level || 'WANT', hidden: false };
    const kindIncome = st.level === 'INCOME';
    let sheet;
    function render(body) {
      body.innerHTML = `
        <div class="center" style="margin:10px 0 16px"><span class="row__icon row__icon--round row__icon--emoji tint-${kindIncome ? 'green' : lvlColor(st.level)}" id="ceIco" style="width:72px;height:72px;font-size:38px">${esc(st.icon)}</span></div>
        <div class="field-group"><div class="field"><input class="left" id="ceName" placeholder="Название категории" maxlength="40" value="${esc(st.name)}" autocomplete="off"></div></div>
        ${kindIncome ? '' : `<div class="form-label mt24">Уровень</div>
        <div class="list">${EXP_LEVELS.map((L) => `<button type="button" class="row row--plain" data-level="${L}"><span class="dot" style="background:${UI.levelColor[L]}"></span><span class="row__main"><span class="row__title">${esc(LEVELS[L].title)} · ${esc(LEVELS[L].desc)}</span><span class="row__sub">${esc(LEVELS[L].hint)}</span></span><span class="t-blue" style="font-size:20px">${st.level === L ? ICONS.check : ''}</span></button>`).join('')}</div>`}
        <div class="form-label mt24">Значок</div>
        <div class="emoji-grid">${EMOJI.map((e) => `<button type="button" data-emoji="${e}" aria-pressed="${e === st.icon}">${e}</button>`).join('')}</div>
        <div class="field-group mt12"><div class="field"><label for="ceEmoji">Свой эмодзи</label><input id="ceEmoji" maxlength="8" placeholder="🙂" value=""></div></div>
        ${isNew ? '' : `<div class="field-group mt24"><div class="field"><span class="field__label">Скрыть из списка</span><span class="space"></span><label class="switch"><input type="checkbox" id="ceHidden" ${st.hidden ? 'checked' : ''}><i></i></label></div></div>
        <div class="group-foot">Скрытая категория не показывается при добавлении, но старые операции с ней сохраняются.</div>`}`;
      const name = $('#ceName', body);
      name.addEventListener('input', () => { st.name = name.value; sheet.page.right._btn.disabled = !st.name.trim(); });
      body.addEventListener('click', (e) => {
        const lv = e.target.closest('[data-level]');
        if (lv) { st.level = lv.dataset.level; render(body); sheet.page.right._btn.disabled = !st.name.trim(); return; }
        const em = e.target.closest('[data-emoji]');
        if (em) { st.icon = em.dataset.emoji; $$('[data-emoji]', body).forEach((x) => x.setAttribute('aria-pressed', String(x === em))); $('#ceIco', body).textContent = st.icon; }
      });
      $('#ceEmoji', body).addEventListener('input', (e) => { const v = e.target.value.trim(); if (v) { st.icon = v; $$('[data-emoji]', body).forEach((x) => x.setAttribute('aria-pressed', 'false')); $('#ceIco', body).textContent = st.icon; } });
      const hid = $('#ceHidden', body);
      if (hid) hid.addEventListener('change', () => { st.hidden = hid.checked; });
    }
    sheet = UI.sheet({
      title: isNew ? 'Новая категория' : 'Категория',
      left: 'cancel',
      right: {
        label: 'Готово', fill: true, disabled: !st.name.trim(),
        onClick: () => {
          if (!st.name.trim()) return;
          const id = FS.actions.upsertCat({ id: cat ? cat.id : undefined, name: st.name.trim(), icon: st.icon, level: st.level, hidden: !!st.hidden });
          sheet.close();
          if (opts.onSaved) opts.onSaved(id);
        },
      },
      full: true,
      body: render,
    });
  };

  /* =====================================================================
     ЛИМИТ
     ===================================================================== */
  V.openLimit = function (catId) {
    const c = catOf(store.data.cats, catId);
    const cur = FS.limits()[catId] || 0;
    const avg = FS.avgPrev(S, V.month, 3);
    const a = avg ? avg.byCat(catId) : 0;
    const spent = S(V.month).byCat[catId] || 0;
    const roundUp = (v) => { const step = v < 5000 ? 500 : 1000; return Math.max(step, Math.ceil(v / step) * step); };
    const sug = a > 0 ? [roundUp(a * 0.8), roundUp(a), roundUp(a * 1.15)].filter((v, i, arr) => arr.indexOf(v) === i) : [3000, 5000, 10000];
    let val = cur ? String(cur) : '';
    let sheet;
    function render(body) {
      body.innerHTML = `<div class="center" style="margin-top:6px"><span class="row__icon row__icon--round row__icon--emoji tint-${catColor(c)}" style="width:60px;height:60px;font-size:30px">${esc(c.icon || '•')}</span></div>
        <div class="center hint mt8">${esc(LEVELS[c.level] ? LEVELS[c.level].title + ' · ' + LEVELS[c.level].desc : '')}</div>
        <div class="amount-box"><input id="limAmt" inputmode="decimal" placeholder="0" value="${esc(val)}" autocomplete="off" aria-label="Лимит в месяц"><span class="cur">${esc(FS.cur())}</span></div>
        <div class="amount-calc">лимит на месяц</div>
        <div class="chips" style="justify-content:center">${sug.map((v) => `<button type="button" class="chip chip--sm" data-sug="${v}">${money(v)}</button>`).join('')}</div>
        <div class="card mt24">
          <div class="kv"><span>Потрачено в ${esc(monthPrep(V.month))}</span><b>${money(spent)}</b></div>
          <div class="kv"><span>В среднем за 3 месяца</span><b>${a > 0 ? money(a) : '—'}</b></div>
        </div>
        ${cur ? `<button type="button" class="btn btn--danger btn--block mt24" id="limDel">Убрать лимит</button>` : ''}`;
      const inp = $('#limAmt', body);
      inp.addEventListener('input', () => { val = inp.value; sheet.page.right._btn.disabled = !(FS.parseAmount(val) > 0); });
      body.addEventListener('click', (e) => {
        const s = e.target.closest('[data-sug]');
        if (s) { val = s.dataset.sug; inp.value = val; sheet.page.right._btn.disabled = false; UI.haptic(); }
      });
      const del = $('#limDel', body);
      if (del) del.addEventListener('click', () => { FS.actions.setLimit(catId, 0); sheet.close(); UI.toast('Лимит убран'); });
    }
    sheet = UI.sheet({
      title: c.name,
      left: 'cancel',
      right: {
        label: 'Готово', fill: true, disabled: !(FS.parseAmount(val) > 0),
        onClick: () => {
          const v = FS.parseAmount(val);
          if (!(v > 0)) return;
          FS.actions.setLimit(catId, v);
          sheet.close();
          UI.haptic('success');
          UI.toast(`Лимит: ${c.name} — ${money(v)} в месяц`);
        },
      },
      body: render,
    });
  };

  V.suggestLimits = async function () {
    const avg = FS.avgPrev(S, V.month, 3);
    if (!avg) { UI.info('Мало данных', 'Чтобы предложить лимиты, нужны траты хотя бы за один прошлый месяц.'); return; }
    const lim = FS.limits();
    const roundUp = (v) => { const step = v < 5000 ? 500 : 1000; return Math.ceil(v / step) * step; };
    const sug = {};
    for (const c of FS.cats('expense')) {
      if (c.level === 'FIXED' || c.level === 'BIZ') continue;
      const a = avg.byCat(c.id);
      if (a >= 300) sug[c.id] = roundUp(c.level === 'LEAK' ? a * 0.7 : c.level === 'WANT' ? a * 0.9 : a);
    }
    const ids = Object.keys(sug);
    if (!ids.length) { UI.info('Мало данных', 'Пока не по чему считать — добавьте больше операций.'); return; }
    const fresh = ids.filter((id) => !lim[id]);
    const choice = await UI.actions({
      title: 'Предложить лимиты',
      message: `По средним тратам за ${avg.months} ${plural(avg.months, ['месяц', 'месяца', 'месяцев'])}: нужное — как есть, качество жизни −10 %, утечки −30 %.`,
      actions: [
        ...(fresh.length ? [{ label: `Только новые (${fresh.length})`, value: 'new' }] : []),
        { label: `Пересчитать все (${ids.length})`, value: 'all' },
      ],
    });
    if (!choice) return;
    const map = {};
    (choice === 'new' ? fresh : ids).forEach((id) => (map[id] = sug[id]));
    FS.actions.setLimits(map);
    UI.toast(`Поставлено лимитов: ${Object.keys(map).length}`);
  };

  /* =====================================================================
     ВЫБОР МЕСЯЦА
     ===================================================================== */
  V.openMonthPicker = function () {
    const months = [];
    for (let m = maxMonth(); m >= minMonth(); m = addMonths(m, -1)) months.push(m);
    const sheet = UI.sheet({
      title: 'Выберите месяц',
      right: 'close',
      body(body) {
        body.innerHTML = `<div class="list">${months.map((m) => {
          const s = S(m);
          return `<button type="button" class="row row--plain" data-mk="${m}"><span class="row__main"><span class="row__title">${esc(monthLabelFull(m))}</span><span class="row__sub">${s.count ? `расход ${money(s.expense)} · доход ${money(s.personalIncome)}` : 'нет операций'}</span></span><span class="t-blue" style="font-size:20px">${m === V.month ? ICONS.check : ''}</span></button>`;
        }).join('')}</div>`;
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-mk]');
          if (!b) return;
          V.month = b.dataset.mk;
          sheet.close();
          V.render();
        });
      },
    });
  };
})();
