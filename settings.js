/* Финштаб — настройки: семья, категории, учёт, код-пароль, синхронизация, копии, оформление, справка */
(function () {
  'use strict';
  const FS = window.FS;
  const UI = FS.ui;
  const V = FS.views;
  const store = FS.store;
  const { $, $$, esc, ICONS, money, pct, plural, LEVELS, EXP_LEVELS } = FS;

  const check = (on) => `<span class="t-blue" style="font-size:20px;width:22px;display:inline-flex;justify-content:flex-end">${on ? ICONS.check : ''}</span>`;
  const navRow = (act, icon, color, title, detail, extra = '') =>
    `<button type="button" class="row" data-go="${act}" ${extra}><span class="row__icon c-${color}">${ICONS[icon]}</span><span class="row__main"><span class="row__title">${esc(title)}</span></span>${detail != null ? `<span class="row__detail">${esc(detail)}</span>` : ''}<span class="row__chev">${ICONS.chevronR}</span></button>`;
  const actRow = (act, icon, color, title, cls = '') =>
    `<button type="button" class="row ${cls}" data-go="${act}"><span class="row__icon c-${color}">${ICONS[icon]}</span><span class="row__main"><span class="row__title">${esc(title)}</span></span></button>`;

  function ago(ts) {
    if (!ts) return 'никогда';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'только что';
    if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
    if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
    const d = Math.floor(s / 86400);
    return `${d} ${plural(d, ['день', 'дня', 'дней'])} назад`;
  }
  FS.ago = ago;
  const AUTOLOCK = [
    { v: 0, label: 'Сразу' },
    { v: 60000, label: 'Через 1 минуту' },
    { v: 300000, label: 'Через 5 минут' },
    { v: 900000, label: 'Через 15 минут' },
    { v: 3600000, label: 'Через 1 час' },
    { v: -1, label: 'Только при перезапуске' },
  ];
  const THEMES = [{ v: 'auto', label: 'Как в системе' }, { v: 'light', label: 'Светлая' }, { v: 'dark', label: 'Тёмная' }];
  const CURRENCIES = [['₽', 'Российский рубль'], ['$', 'Доллар США'], ['€', 'Евро'], ['₸', 'Казахстанский тенге'], ['Br', 'Белорусский рубль'], ['₴', 'Украинская гривна'], ['֏', 'Армянский драм'], ['₾', 'Грузинский лари'], ['сўм', 'Узбекский сум'], ['£', 'Фунт стерлингов'], ['¥', 'Юань'], ['₺', 'Турецкая лира'], ['AED', 'Дирхам ОАЭ']];

  /* ---------- файлы ---------- */
  async function saveFile(name, text, mime) {
    const blob = new Blob([text], { type: mime });
    if (UI.isIOS && navigator.canShare) {
      try {
        const file = new File([blob], name, { type: mime });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return true; }
      } catch (e) { if (e && e.name === 'AbortError') return false; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
    return true;
  }
  FS.saveFile = saveFile;
  function pickFile(accept) {
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = accept;
      inp.style.display = 'none';
      inp.addEventListener('change', () => { resolve(inp.files && inp.files[0]); inp.remove(); });
      document.body.appendChild(inp);
      inp.click();
    });
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (er) { ok = false; }
      ta.remove();
      return ok;
    }
  }
  FS.copyText = copyText;
  const stamp = () => FS.today();

  /* ---------- тема ---------- */
  FS.applyTheme = function () {
    const t = FS.prefs.get('theme', 'auto');
    const root = document.documentElement;
    if (t === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', t);
    const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    $$('meta[name="theme-color"]').forEach((m) => m.remove());
    const m = document.createElement('meta');
    m.name = 'theme-color';
    m.content = dark ? '#000000' : '#f2f2f7';
    document.head.appendChild(m);
  };

  /* ---------- общее: импорт копии ---------- */
  async function importBackupText(text, sheet) {
    let obj;
    try { obj = FS.backup.parse(text); } catch (e) { UI.info('Не получилось', e.message); return false; }
    const n = Object.values(obj.data.ops || {}).filter((o) => !o.deleted).length;
    const mode = await UI.actions({
      title: 'Загрузить копию',
      message: `В копии ${n} ${plural(n, ['операция', 'операции', 'операций'])} от ${obj.exportedAt ? new Date(obj.exportedAt).toLocaleDateString('ru-RU') : '—'}.`,
      actions: [
        { label: 'Объединить с текущими', value: 'merge' },
        { label: 'Заменить всё копией', value: 'replace', destructive: true },
      ],
    });
    if (!mode) return false;
    if (mode === 'replace') {
      const ok = await UI.confirm('Заменить все данные?', 'Текущие операции, участники и лимиты будут заменены содержимым копии.', 'Заменить', true);
      if (!ok) return false;
      FS.backup.importReplace(obj);
    } else FS.backup.importMerge(obj);
    UI.haptic('success');
    UI.toast(mode === 'replace' ? 'Данные заменены копией' : 'Копия объединена с данными');
    if (sheet) sheet.close();
    return true;
  }

  /* ---------- смена код-пароля ---------- */
  async function changePasscode() {
    const done = () => FS.lock.hide();
    UI.passcode({
      title: 'Текущий код-пароль',
      sub: 'Чтобы сменить код-пароль, введите нынешний',
      lock: store.lock,
      cancel: { label: 'Отменить', onClick: done },
      onSubmit: async (pw) => {
        if (!(await FS.vault.check(pw))) return false;
        setTimeout(async () => {
          const r = await UI.createPasscode({ title: 'Новый код-пароль', sub: FS.sync.configured() ? 'Его нужно будет ввести и на других телефонах семьи' : 'Им будут зашифрованы все ваши данные', cancel: true });
          if (!r) return done();
          await FS.vault.changePassword(r.pw, r.lock);
          done();
          UI.haptic('success');
          UI.toast('Код-пароль изменён');
          if (FS.sync.configured()) FS.sync.run();
        }, 150);
        return true;
      },
    });
  }

  /* =====================================================================
     ШТОРКА НАСТРОЕК
     ===================================================================== */
  V.openSettings = function (start) {
    const sheet = UI.sheet({
      title: 'Настройки',
      right: { label: 'Готово', bold: true, onClick: (c) => c.close() },
      full: true,
      body: root,
      onReturn: (b) => root(b),
    });
    if (start && PAGES[start]) PAGES[start](sheet);
    return sheet;

    function root(body) {
      const d = store.data, l = store.local;
      const me = d.members[l.me];
      const cfg = l.sync;
      const lockLbl = (AUTOLOCK.find((a) => a.v === l.autoLock) || AUTOLOCK[1]).label.replace('Через ', '');
      body.innerHTML = `
        <div class="app-head"><img src="icon-192.png" alt=""><b>Финштаб</b><span>Версия ${FS.VERSION} · данные зашифрованы на устройстве</span></div>
        <div class="group-label">Семья</div>
        <div class="list">
          ${navRow('members', 'people', 'blue', 'Участники', String(FS.members().length))}
          ${navRow('device', 'phone', 'indigo', 'Это устройство', me && !me.deleted ? me.name : 'не выбрано')}
        </div>
        <div class="group-label">Учёт</div>
        <div class="list">
          ${navRow('categories', 'tag', 'orange', 'Категории', String(FS.cats(null, { withHidden: true }).length))}
          ${navRow('target', 'target', 'green', 'Цель сбережений', pct(d.settings.savingsTarget, 0))}
          ${navRow('yield', 'trendUp', 'teal', 'Доходность для прогноза', pct(d.settings.yieldRate, 0))}
          ${navRow('currency', 'wallet', 'gray', 'Валюта', FS.cur())}
        </div>
        <div class="group-label">Безопасность</div>
        <div class="list">
          ${actRow('passcode', 'key', 'red', 'Сменить код-пароль', 'row--tap')}
          ${navRow('autolock', 'lock', 'gray', 'Автоблокировка', lockLbl)}
          ${actRow('lock-now', 'lock', 'indigo', 'Заблокировать сейчас', 'row--action')}
        </div>
        <div class="group-label">Синхронизация</div>
        <div class="list">
          ${navRow('sync', 'github', 'gray', 'Семейная синхронизация', cfg ? (FS.sync.state.status === 'error' || FS.sync.state.status === 'needpass' ? 'ошибка' : 'вкл') : 'выкл')}
        </div>
        <div class="group-foot">Общие записи для всей семьи через ваш приватный репозиторий GitHub — в зашифрованном виде.</div>
        <div class="group-label">Данные</div>
        <div class="list">
          ${navRow('backup', 'download', 'blue', 'Резервная копия', l.lastBackupAt ? ago(l.lastBackupAt) : 'не было')}
          ${FS.demo.has() ? actRow('demo-clear', 'sparkles', 'orange', 'Удалить демо-данные', 'row--action') : actRow('demo-load', 'sparkles', 'orange', 'Загрузить демо-данные', 'row--action')}
        </div>
        <div class="group-label">Оформление</div>
        <div class="list">${navRow('theme', 'paint', 'purple', 'Тема', (THEMES.find((t) => t.v === FS.prefs.get('theme', 'auto')) || THEMES[0]).label)}</div>
        <div class="group-label">Помощь</div>
        <div class="list">
          ${navRow('help', 'help', 'blue', 'Как пользоваться')}
          ${navRow('install', 'phone', 'green', 'Установка на телефон')}
          ${navRow('about', 'info', 'gray', 'О приложении')}
        </div>
        <div class="list mt24"><button type="button" class="row row--danger row--center row--plain" data-go="wipe"><span class="row__title">Удалить все данные</span></button></div>`;
      body.onclick = (e) => {
        const b = e.target.closest('[data-go]');
        if (!b) return;
        const go = b.dataset.go;
        if (PAGES[go]) return PAGES[go](sheet);
        if (ACTS[go]) return ACTS[go](sheet);
      };
    }
  };

  const ACTS = {
    passcode: () => changePasscode(),
    'lock-now': (sheet) => { sheet.close(); FS.app.lock(); },
    'demo-load': (sheet) => { FS.demo.load(); sheet.close(); UI.toast('Демо-данные загружены'); },
    'demo-clear': async (sheet) => {
      const ok = await UI.confirm('Удалить демо-данные?', 'Останутся только записи, которые вы внесли сами.', 'Удалить', true);
      if (!ok) return;
      FS.demo.clear();
      sheet.rerender();
      UI.toast('Демо-данные удалены');
    },
    wipe: async (sheet) => {
      const r = await UI.alert({
        title: 'Удалить все данные?',
        message: `Все операции, категории и настройки на этом устройстве будут стёрты без возможности восстановления.${store.local.sync ? ' Копия в GitHub останется — к ней можно будет подключиться снова.' : ' Сначала сохраните резервную копию, если она нужна.'}`,
        buttons: [{ label: 'Отменить', role: 'cancel', value: false }, { label: 'Удалить всё', role: 'destructive', value: true }],
      });
      if (!r.value) return;
      sheet.close();
      FS.vault.wipe();
      location.reload();
    },
  };

  /* ---------- страницы ---------- */
  const PAGES = {};

  PAGES.members = (sheet) => {
    sheet.push({
      title: 'Участники',
      onReturn: (b) => render(b),
      body: render,
    });
    function render(body) {
      const ms = FS.members();
      body.innerHTML = `<div class="group-label">Семья</div>
        <div class="list">${ms.map((m) => `<button type="button" class="row" data-m="${esc(m.id)}"><span class="row__icon row__icon--round c-${FS.mcolor(m)}" style="font-size:15px;font-weight:700">${esc((m.name || '?').slice(0, 1).toUpperCase())}</span><span class="row__main"><span class="row__title">${esc(m.name)}</span>${m.id === store.local.me ? '<span class="row__sub">это устройство</span>' : ''}</span><span class="row__chev">${ICONS.chevronR}</span></button>`).join('')}
          <button type="button" class="row row--action" data-m="new"><span class="row__icon c-green">${ICONS.plus}</span><span class="row__main"><span class="row__title">Добавить участника</span></span></button></div>
        <div class="group-foot">Участники помогают видеть, кто сколько тратит. Новые операции подписываются участником этого устройства — его можно сменить при записи.</div>`;
      body.onclick = (e) => {
        const b = e.target.closest('[data-m]');
        if (!b) return;
        editMember(sheet, b.dataset.m === 'new' ? null : store.data.members[b.dataset.m]);
      };
    }
  };
  function editMember(sheet, m) {
    const isNew = !m;
    const used = FS.members().map((x) => x.color);
    const st = m ? { name: m.name, color: FS.mcolor(m) } : { name: '', color: FS.MEMBER_COLORS.find((c) => !used.includes(c)) || 'teal' };
    sheet.push({
      title: isNew ? 'Новый участник' : 'Участник',
      right: { label: 'Готово', bold: true, onClick: save },
      body(body) {
        body.innerHTML = `<div class="field-group mt16"><div class="field"><input class="left" id="mName" placeholder="Имя" maxlength="30" value="${esc(st.name)}" autocomplete="off"></div></div>
          <div class="form-label mt24">Цвет</div>
          <div class="chips" id="mColors">${FS.MEMBER_COLORS.map((c) => `<button type="button" class="chip chip--sm" data-c="${c}" aria-pressed="${c === st.color}" style="padding:0 12px"><span class="dot c-${c}" style="width:16px;height:16px"></span></button>`).join('')}</div>
          ${!isNew ? `<div class="list mt24">
            ${m.id !== store.local.me ? `<button type="button" class="row row--action row--plain" id="mMe"><span class="row__main"><span class="row__title">Сделать участником этого устройства</span></span></button>` : ''}
            <button type="button" class="row row--danger row--plain" id="mDel"><span class="row__main"><span class="row__title">Удалить участника</span></span></button></div>
            <div class="group-foot">Операции участника сохранятся, просто без подписи.</div>` : ''}`;
        const name = $('#mName', body);
        name.addEventListener('input', () => { st.name = name.value; });
        $('#mColors', body).addEventListener('click', (e) => {
          const c = e.target.closest('[data-c]');
          if (!c) return;
          st.color = c.dataset.c;
          $$('[data-c]', body).forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
        });
        const me = $('#mMe', body);
        if (me) me.addEventListener('click', () => { FS.actions.setLocal({ me: m.id }); UI.toast(`Это устройство — ${m.name}`); sheet.pop(); });
        const del = $('#mDel', body);
        if (del) del.addEventListener('click', async () => {
          const ok = await UI.confirm(`Удалить «${m.name}»?`, 'Операции останутся, но без подписи участника.', 'Удалить', true);
          if (!ok) return;
          FS.actions.deleteMember(m.id);
          sheet.pop();
        });
        if (isNew) setTimeout(() => name.focus(), 400);
      },
    });
    function save() {
      const n = (st.name || '').trim();
      if (!n) { UI.info('Нужно имя', 'Введите имя участника.'); return; }
      const id = FS.actions.upsertMember({ id: m ? m.id : undefined, name: n, color: st.color });
      if (!store.local.me || !store.data.members[store.local.me] || store.data.members[store.local.me].deleted) FS.actions.setLocal({ me: id });
      sheet.pop();
    }
  }

  PAGES.device = (sheet) => {
    sheet.push({
      title: 'Это устройство',
      body(body) {
        const render = () => {
          const ms = FS.members();
          body.innerHTML = `<div class="group-label">Кто пользуется этим устройством</div>
            <div class="list">${ms.map((m) => `<button type="button" class="row row--plain" data-m="${esc(m.id)}"><span class="dot c-${FS.mcolor(m)}" style="width:12px;height:12px"></span><span class="row__main"><span class="row__title">${esc(m.name)}</span></span>${check(m.id === store.local.me)}</button>`).join('')}</div>
            <div class="group-foot">Этим именем будут подписываться новые операции с этого устройства.</div>
            <div class="group-label">Название устройства</div>
            <div class="field-group"><div class="field"><input class="left" id="dName" maxlength="30" value="${esc(store.local.deviceName || '')}" placeholder="Например, iPhone Ани"></div></div>
            <div class="group-foot">Видно в истории синхронизации на GitHub.</div>`;
          $('#dName', body).addEventListener('change', (e) => FS.actions.setLocal({ deviceName: e.target.value.trim() || 'Устройство' }));
        };
        render();
        body.onclick = (e) => {
          const b = e.target.closest('[data-m]');
          if (!b) return;
          FS.actions.setLocal({ me: b.dataset.m });
          UI.haptic();
          render();
        };
      },
    });
  };

  PAGES.categories = (sheet) => {
    let kind = 'expense';
    sheet.push({ title: 'Категории', body: render, onReturn: (b) => render(b) });
    function render(body) {
      const cats = FS.cats(kind, { withHidden: true });
      const row = (c) => `<button type="button" class="row" data-c="${esc(c.id)}" style="${c.hidden ? 'opacity:.5' : ''}"><span class="row__icon row__icon--round row__icon--emoji tint-${c.kind === 'income' ? 'green' : (LEVELS[c.level] || {}).color || 'gray'}">${esc(c.icon)}</span><span class="row__main"><span class="row__title">${esc(c.name)}</span>${c.hidden ? '<span class="row__sub">скрыта</span>' : ''}</span><span class="row__chev">${ICONS.chevronR}</span></button>`;
      body.innerHTML = `${UI.seg('ckind', [{ value: 'expense', label: 'Расходы' }, { value: 'income', label: 'Доходы' }], kind)}
        ${kind === 'income'
          ? `<div class="group-label">Доходы</div><div class="list">${cats.map(row).join('')}</div>`
          : EXP_LEVELS.map((L) => {
            const cs = cats.filter((c) => c.level === L);
            return cs.length ? `<div class="group-label">${esc(LEVELS[L].title)} · ${esc(LEVELS[L].desc)}</div><div class="list">${cs.map(row).join('')}</div><div class="group-foot">${esc(LEVELS[L].hint)}</div>` : '';
          }).join('')}
        <div class="list mt24"><button type="button" class="row row--action" data-c="new"><span class="row__icon c-green">${ICONS.plus}</span><span class="row__main"><span class="row__title">Новая категория</span></span></button></div>`;
      UI.bindSeg(body, 'ckind', (v) => { kind = v; render(body); });
      body.onclick = (e) => {
        const b = e.target.closest('[data-c]');
        if (!b) return;
        const c = b.dataset.c === 'new' ? null : store.data.cats[b.dataset.c];
        V.editCategory(c, { kind, onSaved: () => render(body) });
      };
    }
  };

  function optionsPage(sheet, title, opts, current, onPick, foot) {
    sheet.push({
      title,
      body(body) {
        const render = (cur) => {
          body.innerHTML = `<div class="list mt16">${opts.map((o) => `<button type="button" class="row row--plain" data-v="${esc(String(o.v))}"><span class="row__main"><span class="row__title">${esc(o.label)}</span>${o.sub ? `<span class="row__sub">${esc(o.sub)}</span>` : ''}</span>${check(String(o.v) === String(cur))}</button>`).join('')}</div>${foot ? `<div class="group-foot">${foot}</div>` : ''}`;
        };
        render(current);
        body.onclick = (e) => {
          const b = e.target.closest('[data-v]');
          if (!b) return;
          const o = opts.find((x) => String(x.v) === b.dataset.v);
          onPick(o.v);
          UI.haptic();
          render(o.v);
        };
      },
    });
  }
  PAGES.target = (sheet) => optionsPage(sheet, 'Цель сбережений',
    [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5].map((v) => ({ v, label: pct(v, 0), sub: v === 0.2 ? 'классическое правило 50/30/20' : '' })),
    store.data.settings.savingsTarget, (v) => FS.actions.setSettings({ savingsTarget: v }),
    'Какую долю личного дохода вы хотите откладывать. От неё зависят статусы «норма / зона риска / проблема» и «Свободные деньги».');
  PAGES.yield = (sheet) => optionsPage(sheet, 'Доходность',
    [0, 0.05, 0.08, 0.1, 0.12, 0.15, 0.18, 0.2].map((v) => ({ v, label: v ? `${pct(v, 0)} годовых` : 'Без процентов' })),
    store.data.settings.yieldRate, (v) => FS.actions.setSettings({ yieldRate: v }),
    'Используется только для прогноза накоплений во вкладке «Разбор» (ежемесячная капитализация). Подставьте ставку своего вклада.');
  PAGES.currency = (sheet) => optionsPage(sheet, 'Валюта',
    CURRENCIES.map(([v, label]) => ({ v, label: `${v} — ${label}` })),
    FS.cur(), (v) => FS.actions.setSettings({ currency: v }),
    'Меняется только значок. Суммы не пересчитываются.');
  PAGES.autolock = (sheet) => optionsPage(sheet, 'Автоблокировка',
    AUTOLOCK.map((a) => ({ v: a.v, label: a.label })),
    store.local.autoLock, (v) => FS.actions.setLocal({ autoLock: v }),
    'Через сколько времени после сворачивания Финштаб снова попросит код-пароль.');
  PAGES.theme = (sheet) => optionsPage(sheet, 'Тема', THEMES.map((t) => ({ v: t.v, label: t.label })), FS.prefs.get('theme', 'auto'), (v) => { FS.prefs.set('theme', v); FS.applyTheme(); });

  /* ---------- синхронизация ---------- */
  const NEW_REPO_URL = 'https://github.com/new?name=finshtab-data&visibility=private&description=' + encodeURIComponent('Данные Финштаба (зашифрованы)');
  const tokenUrl = (owner) => 'https://github.com/settings/personal-access-tokens/new?name=Finshtab&description=' + encodeURIComponent('Синхронизация Финштаба') + '&expires_in=none&contents=write' + (owner ? '&target_name=' + encodeURIComponent(owner) : '');

  PAGES.sync = (sheet) => {
    let off = null;
    sheet.push({
      title: 'Синхронизация',
      body(body) {
        const render = () => (store.local.sync ? renderOn(body) : renderOff(body));
        render();
        off = FS.on('sync', () => { if (body.isConnected) render(); else if (off) off(); });
      },
    });
  };
  function renderOff(body) {
    body.innerHTML = `
      <div class="card mt16"><div class="row-gap" style="align-items:flex-start"><span class="row__icon c-blue" style="margin-top:2px">${ICONS.people}</span><div class="hint" style="font-size:15px;color:var(--label)">Каждый в семье вносит траты со своего телефона, а панель считает общие цифры. Данные хранятся в <b>вашем приватном репозитории GitHub</b> в зашифрованном виде — прочитать их можно только с код-паролем.</div></div></div>
      <div class="group-label">Шаг 1 — репозиторий для данных</div>
      <div class="card"><div class="hint" style="font-size:15px">Создайте <b>приватный</b> репозиторий, например <span class="code">finshtab-data</span>. Отдельный от сайта: сайт — публичный, данные — приватные.</div>
        <a class="btn btn--tinted btn--sm mt12" href="${NEW_REPO_URL}" target="_blank" rel="noopener">${ICONS.github} Создать на GitHub</a></div>
      <div class="group-label">Шаг 2 — токен доступа</div>
      <div class="card"><ol class="steps-mini">
          <li>Нажмите кнопку ниже — откроется готовая форма токена (имя, срок и право <b>Contents: Read and write</b> уже заполнены).</li>
          <li>В блоке <b>Repository access</b> выберите <b>Only select repositories</b> → ваш репозиторий с данными.</li>
          <li>Нажмите <b>Generate token</b> и скопируйте токен (начинается с <span class="code">github_pat_</span>).</li>
        </ol>
        <a class="btn btn--tinted btn--sm mt12" id="sTokenLink" href="${tokenUrl('')}" target="_blank" rel="noopener">${ICONS.key} Создать токен</a></div>
      <div class="group-label">Шаг 3 — подключите</div>
      <div class="field-group">
        <div class="field"><label for="sRepo">Репозиторий</label><input id="sRepo" placeholder="имя/finshtab-data" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
        <div class="field"><label for="sToken">Токен</label><input id="sToken" type="password" placeholder="github_pat_…" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
        <div class="field"><label for="sFolder">Папка</label><input id="sFolder" placeholder="${FS.sync.DEFAULT_FOLDER}" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
      </div>
      <div class="group-foot" id="sErr" style="color:var(--red)"></div>
      <button type="button" class="btn btn--block mt16" id="sGo">Подключить</button>
      <div class="group-foot mt16">Токен хранится только на этом устройстве, внутри зашифрованных данных. На других телефонах семьи: «Подключиться к семье» на первом экране.</div>`;
    const repo = $('#sRepo', body);
    const draft = FS.prefs.get('syncDraftRepo', '');
    if (draft) repo.value = draft;
    const updLink = () => { const p = FS.sync.parseRepo(repo.value); $('#sTokenLink', body).href = tokenUrl(p ? p.owner : ''); };
    updLink();
    repo.addEventListener('input', () => { FS.prefs.set('syncDraftRepo', repo.value.trim()); updLink(); });
    // пока создаёте репозиторий и токен на GitHub, приложение не будет блокироваться (15 минут)
    $$('a[target="_blank"]', body).forEach((a) => a.addEventListener('click', () => { FS.app.suspendLockUntil = Date.now() + 15 * 60000; }));
    $('#sGo', body).addEventListener('click', async () => {
      const err = $('#sErr', body);
      err.textContent = '';
      const p = FS.sync.parseRepo(repo.value);
      const token = $('#sToken', body).value.trim();
      const folder = ($('#sFolder', body).value || '').trim() || FS.sync.DEFAULT_FOLDER;
      if (!p) { err.textContent = 'Укажите репозиторий в виде «имя/репозиторий».'; return; }
      if (!token) { err.textContent = 'Вставьте токен.'; return; }
      const btn = $('#sGo', body);
      btn.disabled = true;
      btn.textContent = 'Проверяем…';
      const cfg = { owner: p.owner, repo: p.repo, token, folder };
      try {
        const pr = await FS.sync.probe(cfg);
        if (pr.info && pr.info.private === false) {
          const go = await UI.confirm('Репозиторий публичный', 'Данные зашифрованы, но лучше хранить их в приватном репозитории (Settings → Danger Zone → Change visibility). Всё равно продолжить?', 'Продолжить');
          if (!go) { btn.disabled = false; btn.textContent = 'Подключить'; return; }
        }
        if (pr.empty || pr.vault.kdf.salt === store.kdf.salt) {
          FS.sync.connectLocal(cfg, {});
          await FS.sync.run();
          UI.haptic('success');
          UI.toast(pr.empty ? 'Синхронизация включена' : 'Синхронизация восстановлена');
          return;
        }
        // в репозитории уже данные семьи с другим код-паролем
        btn.disabled = false;
        btn.textContent = 'Подключить';
        UI.passcode({
          title: 'Код-пароль семьи',
          sub: 'В репозитории уже есть данные. Введите их код-пароль — записи объединятся, а код-пароль этого устройства станет таким же.',
          lock: pr.vault.lock,
          cancel: { label: 'Отменить', onClick: () => FS.lock.hide() },
          onSubmit: async (pw) => {
            const key = await FS.crypto.deriveKey(pw, pr.vault.kdf);
            try { await FS.crypto.open(pr.vault, key); } catch (e) { return false; }
            await FS.vault.rekey(key, pr.vault.kdf, pr.vault.lock);
            FS.sync.connectLocal(cfg, {});
            FS.lock.hide();
            await FS.sync.run();
            UI.toast('Подключено: записи семьи объединены');
            return true;
          },
        });
      } catch (e) {
        err.textContent = e.message;
        btn.disabled = false;
        btn.textContent = 'Подключить';
      }
    });
  }
  function renderOn(body) {
    const c = store.local.sync;
    const st = FS.sync.state;
    const map = { syncing: ['Синхронизация…', 'sync', 'blue'], ok: ['Всё синхронизировано', 'cloudCheck', 'green'], idle: ['Включена', 'cloud', 'blue'], offline: ['Нет связи — повторим позже', 'cloudSlash', 'gray'], error: ['Ошибка синхронизации', 'warn', 'red'], needpass: ['Нужен новый код-пароль семьи', 'lock', 'red'], off: ['Включена', 'cloud', 'blue'] };
    const [txt, ico, color] = map[st.status] || map.idle;
    body.innerHTML = `
      <div class="card mt16"><div class="row-gap"><span class="row__icon c-${color}">${ICONS[ico]}</span><div><div style="font-weight:600">${esc(txt)}</div><div class="hint">Последняя: ${esc(ago(c.lastSyncAt))}</div></div></div>
        ${st.error || c.lastError ? `<div class="hint mt8" style="color:var(--red)">${esc(st.error || c.lastError)}</div>` : ''}
        <div class="btn-row mt12">${st.status === 'needpass' ? `<button type="button" class="btn btn--sm" id="sPass">Ввести код-пароль</button>` : `<button type="button" class="btn btn--sm" id="sNow">${ICONS.sync} Синхронизировать</button>`}</div></div>
      <div class="group-label">Подключение</div>
      <div class="list">
        <a class="row row--plain" href="https://github.com/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}" target="_blank" rel="noopener"><span class="row__main"><span class="row__title">Репозиторий</span></span><span class="row__detail">${esc(c.owner)}/${esc(c.repo)}</span><span class="row__chev">${ICONS.chevronR}</span></a>
        <div class="row row--plain"><span class="row__main"><span class="row__title">Папка</span></span><span class="row__detail">${esc(c.folder)}</span></div>
        <div class="row row--plain"><span class="row__main"><span class="row__title">Файлов в облаке</span></span><span class="row__detail">${Object.keys(c.files || {}).length}</span></div>
      </div>
      <div class="group-label">Другие телефоны семьи</div>
      <div class="card"><ol class="steps-mini">
        <li>Откройте сайт Финштаба на другом телефоне и установите на экран «Домой».</li>
        <li>На первом экране нажмите <b>«Подключиться к семье»</b>.</li>
        <li>Введите репозиторий, токен и <b>код-пароль семьи</b> (тот же, что здесь).</li>
      </ol>
      <button type="button" class="btn btn--tinted btn--sm mt12" id="sShare">${ICONS.key} Показать данные для подключения</button></div>
      <div class="list mt24">
        <button type="button" class="row row--plain row--action" id="sToken"><span class="row__main"><span class="row__title">Заменить токен</span></span></button>
        <button type="button" class="row row--plain row--danger" id="sOff"><span class="row__main"><span class="row__title">Отключить синхронизацию</span></span></button>
      </div>
      <div class="group-foot">При отключении записи остаются на этом устройстве и в репозитории.</div>`;
    const now = $('#sNow', body);
    if (now) now.addEventListener('click', () => FS.sync.run());
    const pass = $('#sPass', body);
    if (pass) pass.addEventListener('click', () => FS.app.askSyncPassword());
    $('#sShare', body).addEventListener('click', () => {
      UI.passcode({
        title: 'Подтвердите код-паролем',
        lock: store.lock,
        cancel: { label: 'Отменить', onClick: () => FS.lock.hide() },
        onSubmit: async (pw) => {
          if (!(await FS.vault.check(pw))) return false;
          FS.lock.hide();
          const r = await UI.alert({
            title: 'Данные для подключения',
            html: true,
            message: `Репозиторий: <b>${esc(c.owner)}/${esc(c.repo)}</b><br>Папка: <b>${esc(c.folder)}</b><br>Токен: <span class="code">${esc(c.token.slice(0, 14))}…</span><br><br>Передавайте токен только близким — он даёт доступ к репозиторию.`,
            buttons: [{ label: 'Скопировать всё', role: 'primary', value: 'copy' }, { label: 'Закрыть', role: 'cancel', value: null }],
          });
          if (r.value === 'copy') {
            const ok = await copyText(`Финштаб — подключение к семье\nРепозиторий: ${c.owner}/${c.repo}\nПапка: ${c.folder}\nТокен: ${c.token}`);
            UI.toast(ok ? 'Скопировано' : 'Не удалось скопировать', { error: !ok });
          }
          return true;
        },
      });
    });
    $('#sToken', body).addEventListener('click', async () => {
      const r = await UI.alert({ title: 'Новый токен', message: 'Вставьте новый токен доступа GitHub', input: { placeholder: 'github_pat_…', type: 'password' }, buttons: [{ label: 'Отменить', role: 'cancel', value: false }, { label: 'Сохранить', role: 'primary', value: true }] });
      if (!r.value || !r.input.trim()) return;
      FS.actions.setLocal({ sync: Object.assign({}, store.local.sync, { token: r.input.trim(), lastError: '' }) });
      FS.sync.reset();
      FS.sync.run();
    });
    $('#sOff', body).addEventListener('click', async () => {
      const ok = await UI.confirm('Отключить синхронизацию?', 'Записи останутся на этом устройстве и в репозитории, но перестанут обмениваться.', 'Отключить', true);
      if (!ok) return;
      FS.sync.disconnect();
      renderOff(body);
      UI.toast('Синхронизация отключена');
    });
  }

  /* ---------- резервная копия ---------- */
  PAGES.backup = (sheet) => {
    sheet.push({
      title: 'Резервная копия',
      body(body) {
        const l = store.local;
        const n = FS.liveOps(store.data).length;
        body.innerHTML = `<div class="card mt16"><div class="hint" style="font-size:15px;color:var(--label)">Записи живут в памяти этого устройства (в зашифрованном виде). Сохраняйте копию перед сменой телефона, очисткой браузера — или чтобы перенести данные.</div>
          <div class="kv mt8"><span>Операций</span><b>${n}</b></div><div class="kv"><span>Последняя копия</span><b>${esc(l.lastBackupAt ? ago(l.lastBackupAt) : 'не было')}</b></div></div>
          <div class="list mt16">
            <button type="button" class="row" data-b="save"><span class="row__icon c-blue">${ICONS.download}</span><span class="row__main"><span class="row__title">Сохранить копию в файл</span></span></button>
            <button type="button" class="row" data-b="show"><span class="row__icon c-indigo">${ICONS.doc}</span><span class="row__main"><span class="row__title">Показать копию текстом</span></span><span class="row__chev">${ICONS.chevronR}</span></button>
          </div>
          <div class="list mt16">
            <button type="button" class="row" data-b="load"><span class="row__icon c-green">${ICONS.upload}</span><span class="row__main"><span class="row__title">Загрузить копию из файла</span></span></button>
            <button type="button" class="row" data-b="paste"><span class="row__icon c-teal">${ICONS.doc}</span><span class="row__main"><span class="row__title">Вставить копию текстом</span></span><span class="row__chev">${ICONS.chevronR}</span></button>
          </div>
          <div class="list mt16">
            <button type="button" class="row" data-b="csv"><span class="row__icon c-green">${ICONS.list}</span><span class="row__main"><span class="row__title">Операции в CSV (для Excel)</span></span></button>
          </div>
          <div class="group-foot">Копия — обычный файл без шифрования. Храните её в надёжном месте (например, в «Файлах» → iCloud Drive).</div>`;
        body.onclick = async (e) => {
          const b = e.target.closest('[data-b]');
          if (!b) return;
          const act = b.dataset.b;
          if (act === 'save') {
            const ok = await FS.saveFile(`finshtab-backup-${stamp()}.json`, JSON.stringify(FS.backup.make(), null, 1), 'application/json');
            if (ok) { FS.actions.setLocal({ lastBackupAt: Date.now() }); UI.toast('Копия сохранена'); sheet.rerender(); }
          } else if (act === 'csv') {
            await FS.saveFile(`finshtab-operations-${stamp()}.csv`, FS.backup.csv(), 'text/csv');
          } else if (act === 'show') {
            const text = JSON.stringify(FS.backup.make());
            sheet.push({
              title: 'Копия',
              body(bd) {
                bd.innerHTML = `<div class="hint mt8">Скопируйте этот текст и сохраните в Заметках или отправьте себе. Загрузить — «Вставить копию текстом».</div>
                  <textarea class="input mt12" readonly style="min-height:260px">${esc(text)}</textarea>
                  <button type="button" class="btn btn--block mt16" id="bCopy">Скопировать</button>`;
                $('#bCopy', bd).addEventListener('click', async () => {
                  const ok = await copyText(text);
                  if (ok) FS.actions.setLocal({ lastBackupAt: Date.now() });
                  UI.toast(ok ? 'Скопировано' : 'Не удалось скопировать', { error: !ok });
                });
              },
            });
          } else if (act === 'load') {
            const f = await pickFile('.json,application/json');
            if (!f) return;
            importBackupText(await f.text(), sheet);
          } else if (act === 'paste') {
            sheet.push({
              title: 'Вставить копию',
              body(bd) {
                bd.innerHTML = `<textarea class="input mt16" id="bText" placeholder="Вставьте сюда текст копии" style="min-height:260px"></textarea>
                  <button type="button" class="btn btn--block mt16" id="bGo">Загрузить</button>`;
                $('#bGo', bd).addEventListener('click', () => { const t = $('#bText', bd).value.trim(); if (t) importBackupText(t, sheet); });
              },
            });
          }
        };
      },
    });
  };

  /* ---------- справка ---------- */
  PAGES.help = (sheet) => sheet.push({
    title: 'Как пользоваться',
    html: `<div class="card mt16"><b>Записывайте сразу</b><div class="hint mt8" style="font-size:15px">Нажмите ＋ → сумма → категория → «Готово». Дату и комментарий можно поменять. Сумму можно посчитать прямо в поле: <span class="code">1200+350</span>.</div></div>
      <div class="group-label">Уровни расходов</div>
      <div class="list">${['FIXED', 'LIFE', 'WANT', 'LEAK', 'BIZ'].map((L) => `<div class="row row--plain" style="align-items:flex-start;padding-top:12px;padding-bottom:12px"><span class="dot" style="background:${UI.levelColor[L]};margin-top:6px"></span><span class="row__main"><span class="row__title" style="white-space:normal">${esc(LEVELS[L].title)} — ${esc(LEVELS[L].desc)}</span><span class="row__sub" style="white-space:normal">${esc(LEVELS[L].hint)}</span></span></div>`).join('')}</div>
      <div class="group-label">Что считает панель</div>
      <div class="card"><div class="steps-mini" style="padding:0">
        <p><b>Личный доход</b> — все поступления минус расходы на бизнес.</p>
        <p><b>Личный расход</b> — FIXED + LIFE + WANT + LEAK.</p>
        <p><b>Норма сбережений</b> — какая доля личного дохода остаётся. Цель по умолчанию — 20 %.</p>
        <p><b>Доля утечек</b> — LEAK от личных расходов. Норма — до 3 %.</p>
        <p><b>Темп месяца</b> — прогноз расходов: обязательные + средние переменные траты × дни месяца.</p>
        <p><b>Свободные деньги</b> — сколько ещё можно потратить, чтобы отложить цель.</p>
      </div></div>
      <div class="group-label">Советы</div>
      <div class="card"><ul class="steps-mini">
        <li>Переводы между своими счетами и картами не записывайте — это не расход.</li>
        <li>Подписки записывайте в «Подписки», а название сервиса — в комментарий: так «Разбор» найдёт все регулярные списания.</li>
        <li>Поставьте лимиты на кафе, маркетплейсы и доставку — панель предупредит, когда лимит на исходе.</li>
        <li>Раз в месяц сохраняйте резервную копию или включите семейную синхронизацию.</li>
      </ul></div>`,
  });
  PAGES.install = (sheet) => sheet.push({
    title: 'Установка',
    html: `<div class="group-label">iPhone и iPad (Safari)</div>
      <div class="card"><ol class="install-steps" style="margin:0">
        <li><span>Откройте ссылку Финштаба в <b>Safari</b>.</span></li>
        <li><span>Нажмите <b>«Поделиться»</b> <span class="inline-ico">${ICONS.share}</span>.</span></li>
        <li><span>Выберите <b>«На экран „Домой“»</b> → <b>«Добавить»</b>.</span></li>
      </ol><div class="hint mt8">Важно: на iPhone данные в Safari и в приложении с экрана «Домой» хранятся раздельно. Пользуйтесь Финштабом из иконки.</div></div>
      <div class="group-label">Android (Chrome)</div>
      <div class="card"><ol class="install-steps" style="margin:0">
        <li><span>Откройте ссылку в <b>Chrome</b>.</span></li>
        <li><span>Меню <b>⋮</b> → <b>«Установить приложение»</b> (или «Добавить на главный экран»).</span></li>
      </ol></div>
      <div class="group-foot">После установки Финштаб работает и без интернета. Обновления подтягиваются сами, когда появляется сеть.</div>`,
  });
  PAGES.about = (sheet) => sheet.push({
    title: 'О приложении',
    html: `<div class="app-head mt16"><img src="icon-192.png" alt=""><b>Финштаб</b><span>Версия ${FS.VERSION}</span></div>
      <div class="card mt16"><div class="hint" style="font-size:15px;color:var(--label)">Личный финансовый штаб семьи: записывайте траты и доходы — панель сама считает норму сбережений, утечки, темп месяца, лимиты и прогноз накоплений.</div></div>
      <div class="group-label">Приватность</div>
      <div class="card"><ul class="steps-mini">
        <li>Никаких серверов и аккаунтов: данные хранятся на устройстве и зашифрованы (AES-256-GCM, ключ из код-пароля через PBKDF2).</li>
        <li>При синхронизации в GitHub попадают только зашифрованные файлы — без код-пароля их не прочитать.</li>
        <li>Код-пароль нигде не сохраняется. Если его забыть, данные не восстановить — делайте резервные копии.</li>
      </ul></div>`,
  });
  V.settingsPages = PAGES;
})();
