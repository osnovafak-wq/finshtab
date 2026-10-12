/* Финштаб — ядро: утилиты, справочники, расчёты.
   Все файлы подключаются обычными <script defer> и делят пространство имён window.FS */
(function () {
  'use strict';
  const FS = (window.FS = window.FS || {});

  FS.VERSION = '1.0.0';

  /* ---------- DOM ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);

  /* ---------- id / время ---------- */
  function uid(prefix = '') {
    const rnd = new Uint8Array(8);
    crypto.getRandomValues(rnd);
    let s = '';
    for (const b of rnd) s += (b % 36).toString(36);
    return prefix + Date.now().toString(36) + s;
  }
  let lastTs = 0;
  /** монотонная метка времени (для слияния данных между устройствами) */
  function now() {
    let t = Date.now();
    if (t <= lastTs) t = lastTs + 1;
    lastTs = t;
    return t;
  }

  /* ---------- числа и деньги ---------- */
  const nfInt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const MINUS = '−';
  const NBSP = ' ';

  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  function fmtNum(n) {
    n = round2(n);
    const abs = Math.abs(n);
    const s = Math.round(abs * 100) % 100 === 0 ? nfInt.format(abs) : nf2.format(abs);
    return s.replace(/ /g, NBSP);
  }
  function cur() {
    const c = FS.store && FS.store.data && FS.store.data.settings && FS.store.data.settings.currency;
    const safe = String(c || '').replace(/[<>&"'`\\]/g, '').trim().slice(0, 4);
    return safe || '₽';
  }
  /** 1 234 ₽, −1 234 ₽, +1 234 ₽ (sign: 'auto' | 'always' | 'never') */
  function money(n, opts = {}) {
    const sign = opts.sign || 'auto';
    n = round2(n);
    let p = '';
    if (n < 0 && sign !== 'never') p = MINUS;
    else if (n > 0 && sign === 'always') p = '+';
    return p + fmtNum(n) + (opts.noCur ? '' : NBSP + cur());
  }
  /** короткая запись для графиков: 429к, 1,2 млн */
  function short(n) {
    const a = Math.abs(n);
    const sg = n < 0 ? MINUS : '';
    if (a >= 1e6) return sg + nf1.format(a / 1e6).replace(',0', '') + NBSP + 'млн';
    if (a >= 1e4) return sg + Math.round(a / 1e3) + 'к';
    if (a >= 1e3) return sg + nf1.format(a / 1e3).replace(',0', '') + 'к';
    return sg + nfInt.format(Math.round(a));
  }
  /** деньги без копеек — для средних и прогнозов */
  const rub = (n, opts) => money(Math.round(Number(n) || 0), opts);
  function pct(x, digits = 1) {
    if (x == null || !isFinite(x)) return '—';
    const v = x * 100;
    const f = digits === 0 ? nfInt : nf1;
    return f.format(v) + NBSP + '%';
  }
  /** «1200», «1 200,50», «1200+350» → число (простая арифметика) */
  function parseAmount(str) {
    if (str == null) return NaN;
    let s = String(str).replace(/\s| | /g, '').replace(/,/g, '.').replace(/[×xх]/gi, '*').replace(/[÷:]/g, '/').replace(/[−–—]/g, '-');
    if (!s) return NaN;
    if (!/^[0-9.+\-*/()]+$/.test(s)) return NaN;
    // рекурсивный спуск без eval
    let i = 0;
    const peek = () => s[i];
    function num() {
      if (peek() === '(') { i++; const v = expr(); if (peek() === ')') i++; return v; }
      if (peek() === '-') { i++; return -num(); }
      const m = /^\d*\.?\d+|^\d+\.?/.exec(s.slice(i));
      if (!m) return NaN;
      i += m[0].length;
      return parseFloat(m[0]);
    }
    function term() {
      let v = num();
      while (peek() === '*' || peek() === '/') {
        const op = s[i++];
        const r = num();
        v = op === '*' ? v * r : v / r;
      }
      return v;
    }
    function expr() {
      let v = term();
      while (peek() === '+' || peek() === '-') {
        const op = s[i++];
        const r = term();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    const v = expr();
    if (i !== s.length || !isFinite(v)) return NaN;
    return round2(v);
  }
  function plural(n, forms) {
    n = Math.abs(Math.trunc(n));
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
    return forms[2];
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- даты (локальные строки YYYY-MM-DD) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dateStr(new Date());
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const monthKey = (s) => s.slice(0, 7);
  const curMonth = () => monthKey(today());
  function addMonths(mk, n) {
    const [y, m] = mk.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }
  function addDays(ds, n) { const d = parseDate(ds); d.setDate(d.getDate() + n); return dateStr(d); }
  function daysInMonth(mk) { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); }
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const MONTHS_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const WD_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const mIdx = (mk) => Number(mk.slice(5, 7)) - 1;
  function monthLabel(mk, withYear = true) {
    const y = mk.slice(0, 4);
    const name = MONTHS[mIdx(mk)];
    return withYear && y !== String(new Date().getFullYear()) ? `${name} ${y}` : name;
  }
  const monthLabelFull = (mk) => `${MONTHS[mIdx(mk)]} ${mk.slice(0, 4)}`;
  const monthPrep = (mk) => MONTHS_PREP[mIdx(mk)];
  const monthShort = (mk) => MONTHS_SHORT[mIdx(mk)];
  function dayLabel(ds) {
    const t = today();
    if (ds === t) return 'Сегодня';
    if (ds === addDays(t, -1)) return 'Вчера';
    const d = parseDate(ds);
    const y = d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '';
    return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${y}, ${WEEKDAYS[d.getDay()]}`;
  }
  function dateShort(ds) {
    const d = parseDate(ds);
    return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  }

  /* ---------- прочее ---------- */
  function debounce(fn, ms) {
    let t;
    const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    f.flush = (...a) => { clearTimeout(t); fn(...a); };
    f.cancel = () => clearTimeout(t);
    return f;
  }
  /** JSON с отсортированными ключами — для сравнения и хешей */
  function stable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  /** детерминированный ГПСЧ для демо-данных */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function median(arr) {
    if (!arr.length) return 0;
    const a = [...arr].sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  const sum = (arr) => arr.reduce((s, x) => s + x, 0);

  /* ---------- справочники ---------- */
  const LEVELS = {
    FIXED: { id: 'FIXED', title: 'FIXED', name: 'Обязательное', desc: 'обязательное', color: 'blue', hint: 'аренда, ЖКХ, кредиты, налоги — то, что нельзя не платить' },
    LIFE: { id: 'LIFE', title: 'LIFE', name: 'Нужное', desc: 'нужное', color: 'green', hint: 'продукты, транспорт, здоровье, дети — без этого не прожить' },
    WANT: { id: 'WANT', title: 'WANT', name: 'Качество жизни', desc: 'качество жизни', color: 'orange', hint: 'кафе, покупки, отдых — делает жизнь приятнее' },
    LEAK: { id: 'LEAK', title: 'LEAK', name: 'Утечки', desc: 'утечки', color: 'purple', hint: 'доставка, забытые подписки, комиссии — деньги, которые уходят незаметно' },
    BIZ: { id: 'BIZ', title: 'Бизнес', name: 'Бизнес', desc: 'отдельный учёт', color: 'teal', hint: 'расходы на дело — считаются отдельно и не входят в личный бюджет' },
    INCOME: { id: 'INCOME', title: 'Доход', name: 'Доход', desc: 'доход', color: 'green', hint: '' },
  };
  const EXP_LEVELS = ['FIXED', 'LIFE', 'WANT', 'LEAK', 'BIZ'];
  const PERSONAL_LEVELS = ['FIXED', 'LIFE', 'WANT', 'LEAK'];

  // id стабильны: одинаковы на всех устройствах семьи (важно для синхронизации)
  const DEFAULT_CATS = [
    // FIXED
    ['rent', 'Аренда и ЖКХ', 'FIXED', '🏠'],
    ['telecom', 'Связь и интернет', 'FIXED', '📶'],
    ['loans', 'Кредиты и ипотека', 'FIXED', '🏦'],
    ['taxes', 'Налоги', 'FIXED', '🧾'],
    ['insurance', 'Страховки', 'FIXED', '🛡️'],
    ['edu', 'Образование и секции', 'FIXED', '🎓'],
    // LIFE
    ['groceries', 'Продукты', 'LIFE', '🛒'],
    ['transport', 'Транспорт', 'LIFE', '🚇'],
    ['car', 'Автомобиль', 'LIFE', '🚗'],
    ['health', 'Здоровье', 'LIFE', '💊'],
    ['kids', 'Дети', 'LIFE', '🧸'],
    ['home', 'Дом и быт', 'LIFE', '🧺'],
    ['pets', 'Питомцы', 'LIFE', '🐾'],
    // WANT
    ['cafe', 'Кафе и рестораны', 'WANT', '☕'],
    ['market', 'Маркетплейсы', 'WANT', '📦'],
    ['clothes', 'Одежда и обувь', 'WANT', '👕'],
    ['gifts', 'Подарки', 'WANT', '🎁'],
    ['fun', 'Развлечения', 'WANT', '🎬'],
    ['beauty', 'Красота и уход', 'WANT', '💅'],
    ['sport', 'Спорт', 'WANT', '🏋️'],
    ['travel', 'Путешествия', 'WANT', '✈️'],
    ['tech', 'Техника', 'WANT', '💻'],
    ['taxi', 'Такси', 'WANT', '🚕'],
    ['cash', 'Наличные', 'WANT', '💵'],
    // LEAK
    ['delivery', 'Доставка еды', 'LEAK', '🛵'],
    ['subs', 'Подписки', 'LEAK', '🔁'],
    ['fees', 'Комиссии и проценты', 'LEAK', '💸'],
    ['impulse', 'Импульсивные покупки', 'LEAK', '⚡'],
    ['fines', 'Штрафы и пени', 'LEAK', '🚨'],
    // BIZ
    ['team', 'Команда и подрядчики', 'BIZ', '👥'],
    ['ads', 'Реклама', 'BIZ', '📣'],
    ['tools', 'Рабочие сервисы', 'BIZ', '🧰'],
    // INCOME
    ['salary', 'Зарплата', 'INCOME', '💼'],
    ['side', 'Подработка', 'INCOME', '🛠️'],
    ['clients', 'Клиенты', 'INCOME', '🤝'],
    ['sales', 'Продажи продукта', 'INCOME', '🚀'],
    ['cashback', 'Кэшбэк и проценты', 'INCOME', '🪙'],
    ['gifts_in', 'Подарки и помощь', 'INCOME', '🎀'],
    ['refund', 'Возвраты', 'INCOME', '↩️'],
    ['other_in', 'Прочие доходы', 'INCOME', '➕'],
  ];
  function defaultCategories() {
    const out = {};
    DEFAULT_CATS.forEach(([id, name, level, icon], i) => {
      out[id] = { id, name, level, icon, kind: level === 'INCOME' ? 'income' : 'expense', order: i, hidden: false, updatedAt: 0 };
    });
    return out;
  }

  const MEMBER_COLORS = ['blue', 'pink', 'orange', 'green', 'purple', 'teal', 'indigo', 'red'];
  const mcolor = (m) => (m && MEMBER_COLORS.includes(m.color) ? m.color : 'blue');

  /* ---------- SVG-иконки в духе SF Symbols ---------- */
  const I = (p, vb = '0 0 24 24') => `<svg class="ico" viewBox="${vb}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const ICONS = {
    house: I('<path d="M3.5 10.5 12 3.8l8.5 6.7"/><path d="M5.5 9v10.2c0 .7.5 1.3 1.2 1.3h3.6v-6h3.4v6h3.6c.7 0 1.2-.6 1.2-1.3V9"/>'),
    houseFill: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.7 3.3a1.2 1.2 0 0 0-1.4 0L3.2 9.7c-.5.4-.6 1.1-.2 1.6.4.5 1.1.6 1.6.2l.4-.3v8.3c0 1.2.9 2 2 2h3.5v-5.8c0-.4.3-.7.7-.7h1.6c.4 0 .7.3.7.7v5.8H17c1.1 0 2-.8 2-2v-8.3l.4.3c.5.4 1.2.3 1.6-.2.4-.5.3-1.2-.2-1.6l-8.1-6.4Z"/></svg>',
    list: I('<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.6" cy="6.5" r=".9" fill="currentColor"/><circle cx="4.6" cy="12" r=".9" fill="currentColor"/><circle cx="4.6" cy="17.5" r=".9" fill="currentColor"/>'),
    gauge: I('<path d="M4.2 17.5a8.5 8.5 0 1 1 15.6 0"/><path d="m12 13 3.6-4.2"/><circle cx="12" cy="13.2" r="1.4" fill="currentColor"/>'),
    chart: I('<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="6.5" rx="1"/><rect x="10.5" y="6.5" width="3" height="11" rx="1"/><rect x="15.5" y="13.5" width="3" height="4" rx="1"/>'),
    sparkles: I('<path d="M12 3.5 13.6 8a2 2 0 0 0 1.3 1.3l4.6 1.6-4.6 1.6a2 2 0 0 0-1.3 1.3L12 18.5l-1.6-4.6a2 2 0 0 0-1.3-1.3L4.5 11l4.6-1.6A2 2 0 0 0 10.4 8Z"/><path d="M19 3.5v3M17.5 5h3"/>'),
    plus: I('<path d="M12 5v14M5 12h14"/>', '0 0 24 24'),
    gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
    chevronR: I('<path d="m9 5.5 6.5 6.5L9 18.5"/>'),
    chevronL: I('<path d="M15 5.5 8.5 12l6.5 6.5"/>'),
    chevronD: I('<path d="m6 9.5 6 6 6-6"/>'),
    search: I('<circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.6 15.6 4.4 4.4"/>'),
    xmark: I('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
    xcircle: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="currentColor"/><path d="M8.8 8.8l6.4 6.4M15.2 8.8l-6.4 6.4" stroke="var(--card)" stroke-width="1.9" stroke-linecap="round"/></svg>',
    lock: I('<rect x="5" y="10.5" width="14" height="10" rx="2.4"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>'),
    cloud: I('<path d="M7.2 18.5h10.2a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7.2 18.5Z"/>'),
    cloudCheck: I('<path d="M7.2 18.5h10.2a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7.2 18.5Z"/><path d="m9.6 13.6 1.9 1.9 3.4-3.6"/>'),
    cloudSlash: I('<path d="M7.2 18.5h10.2M19.8 16.4a4 4 0 0 0-2-5.9 6 6 0 0 0-8.9-4.3M5.5 8.6a6 6 0 0 0-.5 2.6 3.3 3.3 0 0 0 1 6.5"/><path d="M3.5 3.5l17 17"/>'),
    sync: I('<path d="M19.5 9.5A7.8 7.8 0 0 0 5.2 8M4.5 14.5A7.8 7.8 0 0 0 18.8 16"/><path d="M5 4v4h4M19 20v-4h-4"/>'),
    trash: I('<path d="M4.5 7h15M9.5 7V4.8c0-.4.4-.8.8-.8h3.4c.4 0 .8.4.8.8V7M6.5 7l.8 12.2c.1 1 .9 1.8 1.9 1.8h5.6c1 0 1.8-.8 1.9-1.8L17.5 7"/>'),
    pencil: I('<path d="M15.5 5.2 18.8 8.5 8.6 18.7 4.5 19.5l.8-4.1Z"/><path d="m13.5 7.2 3.3 3.3"/>'),
    share: I('<path d="M12 3.5v11M8 7l4-3.5L16 7"/><path d="M8.5 10.5H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1.5"/>'),
    download: I('<path d="M12 4v11M7.5 10.8 12 15.3l4.5-4.5"/><path d="M5 19.5h14"/>'),
    upload: I('<path d="M12 15.3V4.3M7.5 8.6 12 4.1l4.5 4.5"/><path d="M5 19.5h14"/>'),
    doc: I('<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8Z"/><path d="M14 3.5V8h4.5M9 12.5h6M9 16h6"/>'),
    person: I('<circle cx="12" cy="8" r="3.8"/><path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0"/>'),
    people: I('<circle cx="9" cy="8.2" r="3.3"/><path d="M3 19.5a6 6 0 0 1 12 0"/><path d="M15.5 5.3a3.2 3.2 0 0 1 0 6.1M17.5 13.6A6 6 0 0 1 21 19.5"/>'),
    tag: I('<path d="M3.8 12.6V5.3c0-.8.7-1.5 1.5-1.5h7.3l7.6 7.6c.6.6.6 1.5 0 2.1l-7.3 7.3c-.6.6-1.5.6-2.1 0Z"/><circle cx="8.3" cy="8.3" r="1.3" fill="currentColor"/>'),
    target: I('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>'),
    percent: I('<path d="M18.5 5.5l-13 13"/><circle cx="7" cy="7" r="2.3"/><circle cx="17" cy="17" r="2.3"/>'),
    moon: I('<path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1Z"/>'),
    sun: I('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'),
    help: I('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.8"/><circle cx="12" cy="17.2" r=".6" fill="currentColor"/>'),
    info: I('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".7" fill="currentColor"/>'),
    calendar: I('<rect x="4" y="5.5" width="16" height="15" rx="2.4"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>'),
    wallet: I('<path d="M19 8V6.5a2 2 0 0 0-2-2H6a2.5 2.5 0 0 0 0 5h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a2.5 2.5 0 0 1-2.5-2.5V7"/><circle cx="16" cy="14.5" r="1.1" fill="currentColor"/>'),
    flame: I('<path d="M12 21a6 6 0 0 0 6-6c0-3.6-2.6-5.2-3.4-8.5-.3-1.2-1.7-1.6-2.4-.6C10.7 8 8.9 8.8 7.6 11A6.6 6.6 0 0 0 6 15a6 6 0 0 0 6 6Z"/><path d="M12 21a2.6 2.6 0 0 1-2.6-2.6c0-1.6 1.6-2.6 2.6-4.2 1 1.6 2.6 2.6 2.6 4.2A2.6 2.6 0 0 1 12 21Z"/>'),
    drop: I('<path d="M12 3.5s6 6.4 6 10.7a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5Z"/>'),
    repeat: I('<path d="M17 3.5 20 6.5l-3 3"/><path d="M4 11.5V10a3.5 3.5 0 0 1 3.5-3.5H20M7 20.5 4 17.5l3-3"/><path d="M20 12.5V14a3.5 3.5 0 0 1-3.5 3.5H4"/>'),
    arrowUp: I('<path d="M12 19V5M6 11l6-6 6 6"/>'),
    arrowDown: I('<path d="M12 5v14M6 13l6 6 6-6"/>'),
    trendUp: I('<path d="M3.5 17 9.3 11.2l3.8 3.8 7.4-7.5"/><path d="M15 7.5h5.5V13"/>'),
    trendDown: I('<path d="M3.5 7 9.3 12.8l3.8-3.8 7.4 7.5"/><path d="M15 16.5h5.5V11"/>'),
    check: I('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    checkCircle: I('<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.8 2.8L16.2 9.6"/>'),
    warn: I('<path d="M10.3 4.4 3 17.5c-.7 1.3.2 3 1.7 3h14.6c1.5 0 2.4-1.7 1.7-3L13.7 4.4a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="17.2" r=".6" fill="currentColor"/>'),
    bolt: I('<path d="M13 2.8 4.8 13.4h6.4L10.5 21.2l8.7-10.9h-6.5Z"/>'),
    piggy: I('<path d="M19 10.5c.9.3 1.5 1.1 1.5 2v1.3c0 .6-.4 1-1 1h-.8a7 7 0 0 1-2.2 2.6V20h-2.7v-1.6h-3.6V20H7.5v-2.6A6.5 6.5 0 0 1 9 5.6h3.4a6.5 6.5 0 0 1 5.4 2.9"/><path d="M12.5 5.6V4.3l2.2-1"/><circle cx="15.5" cy="10.5" r=".8" fill="currentColor"/>'),
    key: I('<circle cx="8" cy="15.5" r="4.2"/><path d="m11 12.5 8.5-8.5M16.5 7l2.5 2.5M14.5 9l1.8 1.8"/>'),
    paint: I('<path d="M12 21a9 9 0 1 1 9-9c0 2-1.6 3-3.2 3H16a2 2 0 0 0-1.4 3.4c.6.6.4 2.6-2.6 2.6Z"/><circle cx="7.5" cy="11.5" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="15" cy="7.8" r="1.2" fill="currentColor"/>'),
    phone: I('<rect x="6.5" y="2.8" width="11" height="18.4" rx="2.6"/><path d="M10.5 18h3"/>'),
    github: I('<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>'),
    eye: I('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>'),
    delete: I('<path d="M9.2 5.5H19a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H9.2L3.5 12Z"/><path d="m11.5 9.5 5 5M16.5 9.5l-5 5"/>'),
    box: I('<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4Z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/>'),
  };

  /* ---------- расчёты ---------- */
  function catOf(cats, id) {
    return cats[id] || { id, name: 'Без категории', level: 'WANT', icon: '❔', kind: 'expense', missing: true };
  }
  function liveOps(data) {
    const out = [];
    for (const id in data.ops) { const o = data.ops[id]; if (!o.deleted) out.push(o); }
    return out;
  }
  /** индекс операций по месяцам (кэшируется по версии данных) */
  let idxCache = { ver: -1, byMonth: null, all: null };
  function index(data, ver) {
    if (idxCache.ver === ver && idxCache.byMonth) return idxCache;
    const byMonth = {};
    const all = liveOps(data).sort((a, b) => (b.date === a.date ? (b.createdAt || 0) - (a.createdAt || 0) : b.date < a.date ? -1 : 1));
    for (const o of all) (byMonth[monthKey(o.date)] = byMonth[monthKey(o.date)] || []).push(o);
    idxCache = { ver, byMonth, all };
    return idxCache;
  }

  function emptyStats(mk) {
    return {
      mk, count: 0, income: 0, expenseAll: 0, expense: 0, personalIncome: 0, savings: 0,
      byLevel: { FIXED: 0, LIFE: 0, WANT: 0, LEAK: 0, BIZ: 0 }, byCat: {}, incomeByCat: {}, byMember: {}, byDay: {},
      savingsRate: null, leakShare: 0, fixedShare: null,
    };
  }
  function monthStats(ops, cats, mk) {
    const s = emptyStats(mk);
    for (const o of ops || []) {
      if (o.deleted) continue;
      s.count++;
      const a = Number(o.amount) || 0;
      if (o.type === 'income') {
        s.income += a;
        s.incomeByCat[o.cat] = (s.incomeByCat[o.cat] || 0) + a;
      } else {
        const lvl = catOf(cats, o.cat).level;
        const L = EXP_LEVELS.includes(lvl) ? lvl : 'WANT';
        s.byLevel[L] += a;
        s.expenseAll += a;
        s.byCat[o.cat] = (s.byCat[o.cat] || 0) + a;
        if (L !== 'BIZ') {
          s.expense += a;
          const m = o.member || '_';
          s.byMember[m] = (s.byMember[m] || 0) + a;
          s.byDay[o.date] = (s.byDay[o.date] || 0) + a;
        }
      }
    }
    s.personalIncome = s.income - s.byLevel.BIZ;
    s.savings = s.personalIncome - s.expense;
    s.savingsRate = s.personalIncome > 0 ? s.savings / s.personalIncome : null;
    s.leakShare = s.expense > 0 ? s.byLevel.LEAK / s.expense : 0;
    s.fixedShare = s.personalIncome > 0 ? s.byLevel.FIXED / s.personalIncome : null;
    return s;
  }
  /** статусы-бейджи: tone = good | warn | bad | info */
  function savingsStatus(rate, target) {
    if (rate == null) return { tone: 'info', text: 'нет дохода' };
    if (rate >= target) return { tone: 'good', text: 'норма' };
    if (rate >= target / 2) return { tone: 'warn', text: 'зона риска' };
    return { tone: 'bad', text: 'проблема' };
  }
  function leakStatus(share) {
    if (share <= 0.03) return { tone: 'good', text: 'норма' };
    if (share <= 0.06) return { tone: 'warn', text: 'зона риска' };
    return { tone: 'bad', text: 'проблема' };
  }
  function fixedStatus(share) {
    if (share == null) return { tone: 'info', text: '' };
    if (share <= 0.35) return { tone: 'good', text: 'норма' };
    if (share <= 0.5) return { tone: 'warn', text: 'многовато' };
    return { tone: 'bad', text: 'перегруз' };
  }
  function expenseStatus(s) {
    if (s.expense === 0) return { tone: 'info', text: 'трат нет' };
    if (s.personalIncome <= 0) return { tone: 'warn', text: 'дохода пока нет' };
    if (s.expense <= s.personalIncome) return { tone: 'good', text: 'укладываешься' };
    return { tone: 'bad', text: 'перерасход' };
  }

  /** средний личный доход/расход за n месяцев до mk (не включая mk) */
  function avgPrev(statsFn, mk, n = 3) {
    const arr = [];
    for (let i = 1; i <= n; i++) {
      const s = statsFn(addMonths(mk, -i));
      if (s.count > 0) arr.push(s);
    }
    if (!arr.length) return null;
    const avg = (f) => sum(arr.map(f)) / arr.length;
    return {
      months: arr.length,
      personalIncome: avg((s) => s.personalIncome),
      expense: avg((s) => s.expense),
      savings: avg((s) => s.savings),
      leak: avg((s) => s.byLevel.LEAK),
      want: avg((s) => s.byLevel.WANT),
      byCat: (id) => avg((s) => s.byCat[id] || 0),
    };
  }

  /** темп месяца: сколько потрачено, прогноз */
  function pace(s, mk, prev) {
    const dim = daysInMonth(mk);
    const cm = curMonth();
    const isCurrent = mk === cm;
    const isFuture = mk > cm;
    const day = isCurrent ? Number(today().slice(8, 10)) : isFuture ? 0 : dim;
    const variable = s.byLevel.LIFE + s.byLevel.WANT + s.byLevel.LEAK;
    const perDay = day > 0 ? variable / day : 0;
    const forecast = isCurrent ? s.byLevel.FIXED + perDay * dim : s.expense;
    const prevExp = prev ? prev.expense : null;
    const diff = prevExp ? (forecast - prevExp) / prevExp : null;
    return { dim, day, isCurrent, isFuture, variable, perDay, forecast, prevExp, diff, elapsed: dim ? day / dim : 0 };
  }

  /** свободные деньги: сколько ещё можно тратить, сохраняя цель сбережений */
  function freeMoney(s, mk, target, avg) {
    const p = pace(s, mk, null);
    let base = s.personalIncome;
    let estimated = false;
    if (base <= 0 && avg && avg.personalIncome > 0 && (p.isCurrent || p.isFuture)) { base = avg.personalIncome; estimated = true; }
    const allowed = base * (1 - target);
    const left = allowed - s.expense;
    const daysLeft = p.isCurrent ? p.dim - p.day + 1 : p.isFuture ? p.dim : 0;
    return { base, estimated, allowed, left, daysLeft, perDay: daysLeft > 0 ? left / daysLeft : null, isPast: !p.isCurrent && !p.isFuture };
  }

  /** ряд по уровням для графика «Архитектура расходов» */
  function levelSeries(statsFn, endMk, n = 6) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const mk = addMonths(endMk, -i);
      const s = statsFn(mk);
      out.push({ mk, FIXED: s.byLevel.FIXED, LIFE: s.byLevel.LIFE, WANT: s.byLevel.WANT, LEAK: s.byLevel.LEAK, total: s.expense, income: s.personalIncome, savings: s.savings, rate: s.savingsRate, count: s.count });
    }
    return out;
  }

  /** поиск регулярных списаний и подписок */
  function normNote(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[0-9.,:;!?()"'«»#№%+\-*/\\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function findRecurring(byMonth, cats, endMk, months = 6) {
    const groups = {};
    for (let i = 0; i < months; i++) {
      const mk = addMonths(endMk, -i);
      for (const o of byMonth[mk] || []) {
        if (o.type !== 'expense') continue;
        const c = catOf(cats, o.cat);
        // обязательные (аренда, кредиты, налоги) и бизнес — и так на виду; ищем то, что «не замечаешь»
        if (c.level === 'BIZ' || (c.level === 'FIXED' && o.cat !== 'telecom')) continue;
        const n = normNote(o.note);
        const key = n ? `${o.cat}|${n}` : `${o.cat}|#${Math.round(o.amount)}`;
        const g = (groups[key] = groups[key] || { key, cat: o.cat, note: o.note || '', ops: [], months: new Set() });
        g.ops.push(o);
        g.months.add(mk);
      }
    }
    const out = [];
    for (const k in groups) {
      const g = groups[k];
      const amounts = g.ops.map((o) => o.amount);
      const med = median(amounts);
      const minA = Math.min(...amounts), maxA = Math.max(...amounts);
      const perMonth = g.ops.length / g.months.size;
      const isSubsCat = g.cat === 'subs';
      const ratio = minA > 0 ? maxA / minA : Infinity;
      const tight = ratio <= 1.03; // одинаковая сумма — типичная подписка/автоплатёж
      const stableAmount = ratio <= 1.15;
      const recurring = isSubsCat || (g.months.size >= 2 && tight && perMonth <= 2.5) || (g.months.size >= 3 && stableAmount && perMonth <= 1.3);
      if (!recurring) continue;
      const last = g.ops.reduce((a, o) => (o.date > a ? o.date : a), '');
      const monthly = med * (g.months.size < 2 ? 1 : Math.min(perMonth, 2.5));
      out.push({ key: k, cat: g.cat, name: g.note || catOf(cats, g.cat).name, monthly, yearly: monthly * 12, months: g.months.size, count: g.ops.length, last, subs: isSubsCat });
    }
    out.sort((a, b) => b.monthly - a.monthly);
    return out;
  }

  /** будущее значение регулярных накоплений */
  function futureValue(monthly, months, yearRate) {
    const r = yearRate / 12;
    if (!r) return monthly * months;
    return monthly * ((Math.pow(1 + r, months) - 1) / r);
  }

  Object.assign(FS, {
    $, $$, esc, uid, now, round2, fmtNum, money, rub, short, pct, parseAmount, plural, clamp, cur, MINUS, NBSP,
    pad, dateStr, today, parseDate, monthKey, curMonth, addMonths, addDays, daysInMonth, monthLabel, monthLabelFull,
    monthPrep, monthShort, dayLabel, dateShort, MONTHS, MONTHS_GEN, WEEKDAYS, WD_SHORT,
    debounce, stable, mulberry32, median, sum,
    LEVELS, EXP_LEVELS, PERSONAL_LEVELS, DEFAULT_CATS, defaultCategories, MEMBER_COLORS, mcolor, ICONS,
    catOf, liveOps, index, emptyStats, monthStats, savingsStatus, leakStatus, fixedStatus, expenseStatus,
    avgPrev, pace, freeMoney, levelSeries, findRecurring, normNote, futureValue,
  });
})();
