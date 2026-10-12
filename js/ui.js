/* 백일의 틈 — ui: 화면 구성. 상태는 엔진과 store가 가지고, 여기서는 그리기와 입력만 한다. */
(function () {
  'use strict';
  const BG = window.BG;
  const E = BG.engine;
  const S = BG.store;
  const h = BG.h;
  const UI = (BG.ui = {});
  const app = document.getElementById('app');
  const banner = document.getElementById('banner');

  let settings = S.loadSettings();
  let meta = S.loadMeta();
  let profiles = S.loadProfiles();
  let screen = 'title';
  let busy = false;
  let revealing = false;
  let revealTimer = null;
  let metaTimer = null;
  let sideTab = 'clues';
  let drawer = false;
  let lastViewSig = null;
  let setupSel = { slot: null, interest: null, mode: 'tutorial', seed: '' };
  let recordsTab = 'endings';

  /* ───────── 엔진 연결 ───────── */
  function saveMetaSoon() {
    clearTimeout(metaTimer);
    metaTimer = setTimeout(function () { S.saveMeta(meta); }, 400);
  }
  E.hooks.settings = function () { return settings; };
  E.hooks.save = function (run) {
    const ok = S.saveRun(run);
    if (!ok) showBanner('저장에 실패했습니다. 브라우저 저장 공간이 가득 찼거나 비공개 모드일 수 있습니다. 지금 진행 상황을 파일로 내보내 두세요.', [{ label: 'JSON 내보내기', fn: exportAll }]);
    else if (banner.dataset.kind === 'save') hideBanner();
    if (!ok) banner.dataset.kind = 'save';
    return ok;
  };
  E.hooks.viewed = function (k) { return !!meta.viewed[k]; };
  E.hooks.markViewed = function (k) {
    if (!meta.viewed[k]) { meta.viewed[k] = 1; saveMetaSoon(); }
  };
  E.hooks.onMet = function (id) {
    if (!meta.met[id]) { meta.met[id] = Date.now(); saveMetaSoon(); }
  };
  const RANK = { stable: 3, temp: 2, retreat: 1, collapse: 0, isolated: 0 };
  E.hooks.onRunEnd = function (run, sum) {
    meta.endings.push({ interest: sum.interest, rel: sum.relationshipOutcome, event: sum.eventOutcome, completed: sum.romanceCompleted, at: Date.now() });
    meta.runs.unshift({ at: Date.now(), interest: sum.interest, name: sum.name, rel: sum.relationshipOutcome, event: sum.eventOutcome, completed: sum.romanceCompleted, seed: sum.seed, text: E.summaryText() });
    meta.runs = meta.runs.slice(0, 30);
    sum.cases.forEach(function (c) {
      const m = (meta.cases[c.no] = meta.cases[c.no] || { seen: 0, best: null, variants: {} });
      m.seen += 1;
      m.variants[c.variant] = 1;
      if (m.best == null || RANK[c.outcome] > RANK[m.best]) m.best = c.outcome;
    });
    S.saveMeta(meta);
  };

  /* ───────── 설정 적용 ───────── */
  function applySettings() {
    const root = document.documentElement;
    root.style.setProperty('--fs', settings.fontSize + 'px');
    root.dataset.theme = settings.theme;
    root.classList.toggle('reduce-motion', !!settings.reduceMotion);
    root.classList.toggle('serif', !!settings.serif);
    if (BG.audio) BG.audio.set(settings.sound, settings.volume);
  }
  function saveSettings() {
    S.saveSettings(settings);
    applySettings();
  }

  /* ───────── 배너 ───────── */
  function showBanner(text, actions) {
    BG.clear(banner);
    banner.appendChild(h('p', null, '▲ ', text));
    (actions || []).forEach(function (a) { banner.appendChild(h('button', { class: 'btn small', type: 'button', onclick: a.fn }, a.label)); });
    banner.appendChild(h('button', { class: 'btn small ghost', type: 'button', 'aria-label': '알림 닫기', onclick: hideBanner }, '닫기'));
    banner.hidden = false;
  }
  function hideBanner() {
    banner.hidden = true;
    delete banner.dataset.kind;
  }

  function exportAll() {
    const d = new Date();
    const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
    S.download('baekil-save-' + stamp + '.json', S.exportAll());
  }

  /* ───────── 이동 ───────── */
  UI.go = function (name) {
    screen = name;
    clearTimeout(revealTimer);
    revealing = false;
    drawer = false;
    if (BG.audio) BG.audio.mood(name === 'game' ? 'calm' : 'quiet');
    ({ title: renderTitle, setup: renderSetup, game: renderGame, records: renderRecords, settings: renderSettings, data: renderData })[name]();
    app.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  };

  function topNav(title) {
    return h('header', { class: 'page-head' },
      h('button', { class: 'btn ghost', type: 'button', onclick: function () { UI.go('title'); } }, '← 타이틀'),
      h('h1', null, title));
  }

  /* ───────── 타이틀 ───────── */
  function renderTitle() {
    const lr = S.loadRun();
    const r = lr.run;
    const live = r && r.view && r.view.kind !== 'summary';
    let cont = '진행 중인 조사가 없습니다';
    if (live) {
      const ch = BG.chars[r.interest];
      const label = r.phase === 'case' ? '사건 ' + (r.chapter + 1) + '/4' : r.phase === 'interlude' ? '막간 ' + ((r.il && r.il.n + 1) || '') + '/3' : r.phase === 'final' || r.phase === 'confession' ? '최종 겹침' : r.phase === 'ending' ? '귀환 기록' : '서장';
      cont = r.profile.name + ' · ' + ch.name + ' · ' + label + ' · 균열 ' + r.res.crack;
    }
    const node = h('div', { class: 'title-screen' },
      h('div', { class: 'title-card' },
        h('p', { class: 'mono small dim' }, 'CASE FILE · 2027 · BETA ' + BG.VERSION.content),
        h('h1', { class: 'title' }, BG.VERSION.title),
        h('p', { class: 'subtitle' }, BG.VERSION.subtitle),
        h('p', { class: 'lead' }, '이상현상을 조사하러 들어간 밤, 당신은 다른 시간에서 온 사람을 만난다. 무엇을 알아내고, 누구를 믿고, 어떤 약속을 남긴 채 함께 돌아올 것인가.'),
        h('nav', { class: 'title-menu', 'aria-label': '주 메뉴' },
          h('button', { class: 'btn primary big', type: 'button', onclick: newRunFlow }, '새 조사'),
          h('button', { class: 'btn big', type: 'button', disabled: !live, onclick: continueRun }, '계속하기', h('span', { class: 'btn-sub' }, cont)),
          h('button', { class: 'btn big', type: 'button', onclick: function () { UI.go('records'); } }, '조사기록'),
          h('button', { class: 'btn big', type: 'button', onclick: function () { UI.go('settings'); } }, '설정'),
          h('button', { class: 'btn big', type: 'button', onclick: function () { UI.go('data'); } }, '저장 관리')),
        h('p', { class: 'fine' }, '텍스트 기반 · 이미지 없음 · 정상 완주 약 45–60분 · 저장은 이 브라우저에만 남습니다.'),
        h('p', { class: 'fine' }, '성인 수준의 공포·폭력·신체 훼손 묘사가 포함될 수 있습니다. 설정에서 잔혹 묘사를 줄여도 단서·선택·결말은 같습니다. 연애 묘사는 고백·포옹·입맞춤까지입니다.'),
        !S.available ? h('p', { class: 'warn-text' }, '▲ 이 브라우저에서는 로컬 저장을 쓸 수 없습니다. 새로고침하면 진행이 사라집니다. 저장 관리에서 수시로 내보내 주세요.') : null,
        lr.error ? h('p', { class: 'warn-text' }, '▲ ', lr.error) : null));
    BG.clear(app).appendChild(node);
  }
  async function newRunFlow() {
    const lr = S.loadRun();
    if (lr.run && lr.run.view && lr.run.view.kind !== 'summary') {
      const ok = await BG.confirm('새 조사 시작', '진행 중인 조사가 있습니다. 새로 시작하면 지금 판은 덮어써집니다. 계속할까요?', '새로 시작', true);
      if (!ok) return;
    }
    setupSel = { slot: profiles.selectedProfileId ? profiles.profiles.findIndex(function (p) { return p && p.id === profiles.selectedProfileId; }) : null, interest: null, mode: 'tutorial', seed: '' };
    if (setupSel.slot < 0) setupSel.slot = null;
    UI.go('setup');
  }
  function continueRun() {
    const lr = S.loadRun();
    if (!lr.run) return;
    E.load(lr.run);
    if (lr.warn) showBanner(lr.warn);
    UI.go('game');
  }

  /* ───────── 조사 준비 ───────── */
  function saveProfiles() {
    if (!S.saveProfiles(profiles)) showBanner('프로필 저장에 실패했습니다. 내보내기로 백업해 주세요.', [{ label: 'JSON 내보내기', fn: exportAll }]);
  }
  function openCreator(slot, profile, isNew) {
    BG.creator.open({
      slot: slot, profile: profile, isNew: isNew,
      onCancel: function () { UI.go('setup'); },
      onSave: function (p, go) {
        profiles.profiles[slot] = p;
        profiles.selectedProfileId = p.id;
        saveProfiles();
        setupSel.slot = slot;
        UI.go('setup');
        if (go) setTimeout(function () { const el = document.getElementById('interest-section'); if (el) el.scrollIntoView(); }, 50);
      },
    });
  }
  function profileCard(p, i) {
    const sel = setupSel.slot === i;
    if (!p) {
      return h('div', { class: 'slot empty' },
        h('p', { class: 'mono small dim' }, '슬롯 ' + (i + 1) + ' · 비어 있음'),
        h('button', { class: 'btn primary', type: 'button', onclick: function () { openCreator(i, S.newProfile('record'), true); } }, '새로 만들기'),
        h('p', { class: 'small' }, '빠른 시작 — 기본 프로필로 바로'),
        h('div', { class: 'row wrap' }, BG.BG_KEYS.map(function (k) {
          return h('button', { class: 'btn small', type: 'button', onclick: function () {
            const np = S.newProfile(k);
            profiles.profiles[i] = np;
            profiles.selectedProfileId = np.id;
            saveProfiles();
            setupSel.slot = i;
            renderSetup();
          } }, BG.BACKGROUNDS[k].label);
        })));
    }
    const s = BG.profileSummary(p);
    return h('div', { class: 'slot' + (sel ? ' on' : '') },
      h('p', { class: 'mono small dim' }, '슬롯 ' + (i + 1) + (sel ? ' · 선택됨' : '')),
      h('p', { class: 'pc-head' }, s.head),
      h('p', { class: 'small' }, BG.BACKGROUNDS[p.background].label + ' · ' + s.stats),
      h('p', { class: 'small dim' }, s.look),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn' + (sel ? ' primary' : ''), type: 'button', 'aria-pressed': sel ? 'true' : 'false', onclick: function () { setupSel.slot = i; profiles.selectedProfileId = p.id; saveProfiles(); renderSetup(); } }, sel ? '✓ 선택됨' : '이 탐사자로'),
        h('button', { class: 'btn small', type: 'button', onclick: function () { openCreator(i, p, false); } }, '편집'),
        h('button', { class: 'btn small', type: 'button', onclick: function () {
          const j = profiles.profiles.findIndex(function (x) { return !x; });
          if (j < 0) { BG.alert('복제할 수 없음', '빈 슬롯이 없습니다. 슬롯은 3개까지입니다.'); return; }
          const c = BG.clone(p);
          c.id = 'p' + Date.now().toString(36);
          c.name = (c.name + ' 2').slice(0, BG.LIMITS.name);
          profiles.profiles[j] = c;
          saveProfiles();
          renderSetup();
        } }, '복제'),
        h('button', { class: 'btn small', type: 'button', onclick: function () { S.download('baekil-profile-' + p.name + '.json', S.exportProfile(p)); } }, '내보내기'),
        h('button', { class: 'btn small danger', type: 'button', onclick: async function () {
          if (!(await BG.confirm('프로필 삭제', '“' + p.name + '” 프로필을 삭제할까요? 진행 중인 조사에는 영향이 없습니다.', '삭제', true))) return;
          profiles.profiles[i] = null;
          if (setupSel.slot === i) setupSel.slot = null;
          saveProfiles();
          renderSetup();
        } }, '삭제')));
  }
  function importProfileFile() {
    const inp = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
    inp.addEventListener('change', function () {
      const f = inp.files && inp.files[0];
      if (!f) return;
      f.text().then(async function (t) {
        const r = S.parseImport(t);
        if (!r.ok || r.kind !== 'profile') { BG.alert('가져오기 실패', (r.errors || ['프로필 파일이 아닙니다.']).concat(['기존 데이터는 바뀌지 않았습니다.'])); return; }
        let j = profiles.profiles.findIndex(function (x) { return !x; });
        if (j < 0) {
          const pick = await BG.modal({ title: '덮어쓸 슬롯 선택', body: '빈 슬롯이 없습니다. 어느 슬롯을 덮어쓸까요?', actions: [{ label: '취소', value: -1 }, { label: '슬롯 1', value: 0 }, { label: '슬롯 2', value: 1 }, { label: '슬롯 3', value: 2 }], cancelValue: -1 });
          if (pick < 0) return;
          j = pick;
        }
        profiles.profiles[j] = r.profile;
        saveProfiles();
        setupSel.slot = j;
        renderSetup();
      });
    });
    document.body.appendChild(inp);
    inp.click();
    setTimeout(function () { inp.remove(); }, 60000);
  }
  function renderSetup() {
    const p = setupSel.slot != null ? profiles.profiles[setupSel.slot] : null;
    const interestCards = BG.INITIAL.map(function (id) {
      const c = BG.chars[id];
      const on = setupSel.interest === id;
      const d = BG.content.cases[c.ownCase];
      const done = meta.endings.filter(function (e) { return e.interest === id && e.completed; }).length;
      return h('label', { class: 'card pick interest' + (on ? ' on' : '') },
        h('input', { type: 'radio', name: 'interest', checked: on, onchange: function () { setupSel.interest = id; renderSetup(); } }),
        h('strong', { class: 'name' }, c.name),
        h('span', { class: 'small dim' }, c.role),
        h('span', null, c.blurb),
        h('span', { class: 'small' }, '동행 특기 — ' + c.spec.name + ': ' + c.spec.desc),
        h('span', { class: 'small mono dim' }, '첫 사건 ' + d.no + ' ‘' + d.title + '’' + (done ? ' · 공략 완료 ' + done + '회' : '')));
    });
    const order = setupSel.interest ? BG.TUTORIAL[setupSel.interest].map(function (c) { return c + ' ' + BG.content.cases[c].title; }).join(' → ') : '';
    const node = h('div', { class: 'page' },
      topNav('새 조사'),
      h('section', { class: 'sec' },
        h('h2', null, '1. 탐사자'),
        h('p', { class: 'small dim' }, '프로필은 이 브라우저에 3개까지 저장됩니다. 조사를 시작하면 복사본이 그 판에 고정됩니다.'),
        h('div', { class: 'slots' }, profiles.profiles.map(profileCard)),
        h('button', { class: 'btn small', type: 'button', onclick: importProfileFile }, '프로필 파일 가져오기')),
      p ? h('section', { class: 'sec', id: 'interest-section' },
        h('h2', null, '2. 관심 인물'),
        h('p', { class: 'small dim' }, '고른 사람과는 첫 사건 안에서 반드시 만나고, 주요 관계 장면이 이 판에 예약됩니다. 공략의 목표는 서로의 사랑을 확인하고 연인이 되는 것입니다. 모든 선택이 자동으로 성공하지는 않습니다.'),
        h('div', { class: 'cards interests', role: 'radiogroup' }, interestCards)) : null,
      p && setupSel.interest ? h('section', { class: 'sec' },
        h('h2', null, '3. 사건 조합'),
        h('div', { class: 'cards two', role: 'radiogroup' },
          h('label', { class: 'card pick' + (setupSel.mode === 'tutorial' ? ' on' : '') },
            h('input', { type: 'radio', name: 'mode', checked: setupSel.mode === 'tutorial', onchange: function () { setupSel.mode = 'tutorial'; renderSetup(); } }),
            h('strong', null, '튜토리얼 조합 (권장)'),
            h('span', { class: 'small' }, '검증된 고정 4건 — ' + order)),
          h('label', { class: 'card pick' + (setupSel.mode === 'random' ? ' on' : '') },
            h('input', { type: 'radio', name: 'mode', checked: setupSel.mode === 'random', onchange: function () { setupSel.mode = 'random'; renderSetup(); } }),
            h('strong', null, '무작위 조합'),
            h('span', { class: 'small' }, '첫 사건은 관심 인물의 사건으로 고정, 나머지 3건은 5건 풀에서 무작위. 사건마다 규칙 변형도 무작위입니다.'))),
        settings.debug ? h('label', { class: 'field' }, h('span', { class: 'field-label' }, '시드 (검수 모드)'),
          h('input', { type: 'text', inputmode: 'numeric', value: setupSel.seed, placeholder: '비우면 무작위', oninput: function (e) { setupSel.seed = e.target.value.replace(/\D/g, ''); } })) : null,
        h('div', { class: 'row' },
          h('button', { class: 'btn primary big', type: 'button', onclick: startRun }, '조사 시작'))) : null);
    BG.clear(app).appendChild(node);
  }
  function startRun() {
    const p = profiles.profiles[setupSel.slot];
    const v = S.validateProfile(p);
    if (!v.ok) { BG.alert('프로필 확인 필요', v.errors); return; }
    E.newRun({ profile: v.profile, interest: setupSel.interest, mode: setupSel.mode, seed: Number(setupSel.seed) || 0 });
    lastViewSig = null;
    UI.go('game');
  }

  /* ───────── 게임 화면 ───────── */
  const CHG_ICON = { up: '▲', down: '▼', crack: '◆', slot: '·', rel: '◇', clue: '◆', mile: '♥', promise: '✓', bound: '✕', roll: '⚄', info: 'ⓘ' };
  const LAYER_CLASS = { '현재': 'now', '과거 기록': 'past', '기억': 'mem', '극본': 'script', '미확인': 'unk' };

  function lineNode(l, i) {
    const style = '--i:' + i;
    switch (l.k) {
      case 'head': return h('p', { class: 'l-head mono', style: style }, '▣ ', l.text);
      case 'note': return h('p', { class: 'l-note', style: style }, '※ ', l.text);
      case 'warn': return h('p', { class: 'l-warn', style: style }, h('span', { 'aria-hidden': 'true' }, '▲ '), h('span', { class: 'sr' }, '경고: '), l.text);
      case 'say':
        return h('div', { class: 'l-say', style: style },
          h('p', { class: 'who' }, h('span', { class: 'name' }, l.name), h('span', { class: 'layer ' + (LAYER_CLASS[l.layer] || 'now') }, l.layer)),
          h('p', { class: 'said' }, l.text));
      case 'me':
        return h('div', { class: 'l-say me', style: style },
          h('p', { class: 'who' }, h('span', { class: 'name' }, E.get().profile.name), h('span', { class: 'layer me' }, '나')),
          h('p', { class: 'said' }, l.text));
      case 'chg': return h('p', { class: 'l-chg t-' + l.tone, style: style }, h('span', { class: 'ico', 'aria-hidden': 'true' }, CHG_ICON[l.tone] || '·'), ' ', l.text);
      case 'clue':
        return h('div', { class: 'clue-card' + (l.core ? ' core' : ''), style: style },
          h('p', { class: 'clue-top' }, h('span', { class: 'tag' }, l.type), l.core ? h('span', { class: 'tag core' }, '핵심') : null, h('span', { class: 'tag st-' + (l.status === '확인됨' ? 'ok' : l.status === '반증됨' ? 'no' : 'q') }, l.status)),
          h('p', { class: 'clue-title' }, l.title),
          h('p', { class: 'clue-text' }, l.text));
      default: return h('p', { class: 'l-narr', style: style }, l.text);
    }
  }

  function bar(cur, max, cls) {
    const pct = Math.max(0, Math.min(100, (cur / max) * 100));
    return h('div', { class: 'bar ' + (cls || ''), role: 'presentation' }, h('i', { style: 'width:' + pct + '%' }));
  }
  function resBlock(compact) {
    const r = E.get();
    const R = r.res;
    const low = function (v, m) { return v <= Math.ceil(m / 4); };
    const row = function (k, ico, label, cur, max, extra) {
      const isLow = k !== 'crack' && k !== 'supply' && low(cur, max);
      return h('div', { class: 'res-row' + (isLow ? ' low' : '') },
        h('span', { class: 'ico', 'aria-hidden': 'true' }, ico),
        h('span', { class: 'lbl' }, label),
        h('span', { class: 'val mono' }, cur + (max ? '/' + max : ''), isLow ? h('span', { class: 'flag' }, ' ▲위험') : null),
        compact ? null : extra || bar(cur, max, 'b-' + k));
    };
    const crackBar = h('div', { class: 'bar b-crack' }, h('i', { style: 'width:' + R.crack + '%' }), h('b', { class: 'mark', style: 'left:40%' }), h('b', { class: 'mark', style: 'left:70%' }));
    return h('div', { class: 'res' + (compact ? ' compact' : ''), 'aria-label': '자원' },
      row('hp', '♥', '체력', R.hp, R.hpMax),
      row('comp', '◎', '침착', R.comp, R.compMax),
      row('supply', '▣', '물자', R.supply, R.supplyMax),
      row('crack', '◆', '균열', R.crack, 100, crackBar),
      compact ? null : h('p', { class: 'small dim' }, '균열 40 장소 변형' + (r.marks[40] ? ' ✓' : '') + ' · 70 최종 압박' + (r.marks[70] ? ' ✓' : '') + ' · 100 조사 종료'));
  }
  function companionBlock() {
    const r = E.get();
    const c = BG.chars[r.interest];
    const rt = BG.content.routes[r.interest];
    const lab = E.relLabels();
    const ps = r.rel.promises[rt.promise];
    const psLabel = { set: '맺음', kept: '지킴 ✓', broken: '깨짐 ✕' }[ps] || '아직 맺지 않음';
    const hurt = E.companionHurt();
    const resc = E.canRescue();
    const bounds = Object.keys(r.rel.boundaries).filter(function (b) { return !r.rel.boundaries[b].resolved; });
    const m = r.rel.milestones;
    return h('div', { class: 'comp' },
      h('p', { class: 'comp-name' }, c.name, h('span', { class: 'small dim' }, ' · 동행')),
      h('p', { class: 'small' }, '특기 — ', c.spec.name, ': ', c.spec.desc),
      h('p', { class: 'small' + (hurt ? ' warn-text' : '') }, hurt ? '▼ 부상·탈진 — 이번 사건 동안 보정·특기 없음' : '● 함께 움직이는 중'),
      h('p', null, h('span', { class: 'k' }, '관계 '), lab.trust, ' · ', lab.intimacy, settings.debug ? h('span', { class: 'mono dim' }, ' [신뢰 ' + r.rel.trust + ' · 친밀 ' + r.rel.intimacy + ']') : null),
      h('p', null, h('span', { class: 'k' }, '약속 '), rt.promiseLabel, ' — ', h('strong', null, psLabel)),
      h('p', { class: 'mile' }, Object.keys(E.LABELS.milestone).map(function (k) { return h('span', { class: m[k] ? 'on' : '' }, (m[k] ? '■ ' : '□ ') + E.LABELS.milestone[k]); })),
      bounds.length ? h('p', { class: 'warn-text small' }, '✕ 해명이 필요한 일 — ', bounds.map(function (b) { return rt.boundaries[b] || b; }).join(', ')) : null,
      h('p', { class: 'small' }, resc ? '● 구조 가능 — 한 판에 1회, 신뢰가 쌓인 동행이 곁에 있을 때' : r.rescueUsed ? '○ 구조 기회 사용함' : '○ 구조 불가 — ' + (hurt ? '동행 부상' : '신뢰가 ‘함께 움직임’에 이르지 못함')));
  }
  function toolBlock() {
    const r = E.get();
    const t = BG.TOOLS[r.items[0]];
    if (!t) return null;
    const used = t.stat ? r.sp.tool : r.cs && r.cs.done.kit;
    return h('p', { class: 'small' }, h('span', { class: 'k' }, '도구 '), t.label, ' — ', t.desc, used ? h('span', { class: 'dim' }, ' (이번 사건 사용함)') : null);
  }
  function cluesTab() {
    const r = E.get();
    const ids = Object.keys(r.clues);
    if (!ids.length) return h('p', { class: 'small dim' }, '아직 기록한 단서가 없다.');
    const byCase = {};
    ids.forEach(function (id) { const c = id.split('.')[0]; (byCase[c] = byCase[c] || []).push(id); });
    const order = Object.keys(byCase).sort(function (a, b) { return (r.cs && a === r.cs.id ? -1 : 0) - (r.cs && b === r.cs.id ? -1 : 0); });
    return h('div', null, order.map(function (cid) {
      const d = BG.content.cases[cid];
      return h('div', { class: 'clue-group' },
        h('p', { class: 'mono small' }, d.no + ' ' + d.title),
        byCase[cid].map(function (id) {
          const c = d.clues[id];
          const st = r.clues[id];
          // 단서 문장은 그 사건의 변형으로 읽는다
          const cx = { p: r.profile, compShort: BG.chars[r.interest].short, compName: BG.chars[r.interest].name, variant: st.variant || r.variants[cid], hook: d.hook, reduced: settings.reducedHorror };
          const text = BG.text.render(c.text, cx);
          const title = BG.text.render(c.title, cx);
          const status = st.verified === null ? '미확인' : st.verified ? '확인됨' : '반증됨';
          return h('div', { class: 'clue-mini' },
            h('p', null, h('span', { class: 'tag' }, c.type), c.core ? h('span', { class: 'tag core' }, '핵심') : null, h('span', { class: 'tag st-' + (st.verified === null ? 'q' : st.verified ? 'ok' : 'no') }, status), ' ', h('strong', null, title)),
            h('p', { class: 'small' }, text, st.verified === false && c.refuted ? ' — ' + c.refuted : ''));
        }));
    }));
  }
  function peopleTab() {
    const r = E.get();
    const ids = Object.keys(r.met);
    if (!ids.length) return h('p', { class: 'small dim' }, '아직 만난 사람이 없다.');
    return h('div', null, ids.map(function (id) {
      const c = BG.chars[id];
      return h('div', { class: 'person' },
        h('p', null, h('strong', null, c.name), ' ', h('span', { class: 'layer ' + (LAYER_CLASS[r.met[id]] || 'now') }, r.met[id])),
        h('p', { class: 'small dim' }, c.role),
        c.blurb ? h('p', { class: 'small' }, c.blurb) : null);
    }));
  }
  function logTab() {
    const r = E.get();
    if (!r.rel.log.length) return h('p', { class: 'small dim' }, '아직 관계에 기록된 변화가 없다.');
    const where = function (x) { return x.phase === 'interlude' ? '막간' : x.phase === 'final' || x.phase === 'confession' ? '최종' : '사건 ' + (x.ch + 1); };
    return h('ol', { class: 'rel-log' }, r.rel.log.slice().reverse().map(function (x) {
      return h('li', null, h('span', { class: 'mono dim' }, where(x) + ' '), (x.k === 'trust' ? '신뢰 ' : '마음 ') + (x.d > 0 ? '▲' : '▼'), ' — ', x.why || '');
    }));
  }
  function debugTab() {
    const d = E.debug();
    const v = BG.validate();
    return h('div', { class: 'small mono debug' },
      h('p', null, 'seed ' + d.seed + ' · rng ' + d.rngState),
      h('p', null, 'order ' + d.order.join(' → ')),
      h('p', null, 'variants ' + Object.keys(d.variants).map(function (k) { return k + ':' + d.variants[k]; }).join(' ')),
      h('p', null, 'phase ' + d.phase + ' · ch ' + d.chapter + ' · ready ' + d.ready),
      h('p', null, 'flags ' + Object.keys(d.flags).join(', ')),
      h('p', null, 'promises ' + JSON.stringify(d.rel.promises) + ' · bounds ' + JSON.stringify(d.rel.boundaries)),
      h('p', null, '검수: 오류 ' + v.errors.length + ' · 경고 ' + v.warnings.length),
      v.errors.slice(0, 10).map(function (e) { return h('p', { class: 'warn-text' }, e); }));
  }
  function sidePanel() {
    const tabs = [['clues', '단서'], ['people', '인물'], ['log', '관계 기록']];
    if (settings.debug) tabs.push(['debug', '검수']);
    const body = sideTab === 'people' ? peopleTab() : sideTab === 'log' ? logTab() : sideTab === 'debug' ? debugTab() : cluesTab();
    return h('aside', { class: 'side' + (drawer ? ' open' : ''), id: 'side', 'aria-label': '상태와 기록' },
      h('div', { class: 'side-top' },
        h('h2', { class: 'mono small' }, '상태'),
        h('button', { class: 'btn small ghost drawer-close', type: 'button', onclick: function () { drawer = false; renderGame(); } }, '닫기')),
      resBlock(false),
      companionBlock(),
      toolBlock(),
      h('div', { class: 'tabs', role: 'tablist' }, tabs.map(function (t) {
        return h('button', { class: 'tab' + (sideTab === t[0] ? ' on' : ''), role: 'tab', type: 'button', 'aria-selected': sideTab === t[0] ? 'true' : 'false', onclick: function () { sideTab = t[0]; renderGame(true); } }, t[1]);
      })),
      h('div', { class: 'tab-body', role: 'tabpanel' }, body));
  }

  function viewSig() {
    const r = E.get();
    const v = r.view;
    return [r.slots.total, v.kind, v.id || '', v.page, r.history.length, r.rngState].join('|');
  }

  function optionButton(o, i) {
    const label = h('span', { class: 'opt-label' }, h('span', { class: 'opt-key mono', 'aria-hidden': 'true' }, String(i + 1)), o.label);
    return h('button', {
      class: 'opt' + (o.kind === 'next' ? ' next' : '') + (o.kind === 'move' ? ' move' : ''),
      type: 'button', disabled: !o.enabled || busy, 'data-opt': o.id, 'data-enabled': o.enabled ? '1' : '0',
      onclick: function () { pick(o); },
    }, label,
      o.desc ? h('span', { class: 'opt-desc' }, o.desc) : null,
      o.sub ? h('span', { class: 'opt-sub' }, o.sub) : null,
      !o.enabled && o.reason ? h('span', { class: 'opt-why' }, '— ', o.reason) : null);
  }

  async function pick(o) {
    if (busy || !o.enabled) return;
    if (revealing) { finishReveal(); return; }
    if (o.confirm) {
      const ok = await BG.confirm('확인', o.confirm, '넘어가기');
      if (!ok) return;
    }
    busy = true;
    try {
      E.act(o.id);
    } catch (err) {
      console.error(err);
      showBanner('진행 중 오류가 발생했습니다: ' + err.message + ' — 저장 관리에서 내보낸 뒤 알려 주세요.', [{ label: 'JSON 내보내기', fn: exportAll }]);
    }
    renderGame();
    // 연속 클릭으로 같은 처리가 두 번 일어나지 않도록 잠깐 잠근 뒤 풀어 준다(NFR-04)
    setTimeout(function () {
      busy = false;
      app.querySelectorAll('.opt').forEach(function (b) { b.disabled = b.dataset.enabled !== '1'; });
    }, 120);
  }

  function finishReveal() {
    clearTimeout(revealTimer);
    revealing = false;
    const st = app.querySelector('.stage');
    if (st) st.classList.remove('revealing');
  }

  function renderSummary() {
    const s = E.summary();
    const ok = s.romanceCompleted;
    return h('div', { class: 'summary' },
      h('p', { class: 'mono small dim' }, '귀환 기록 · 시드 ' + s.seed + ' · 콘텐츠 ' + s.contentVersion),
      h('h2', null, ok ? '공략 완료 — ' + s.interestName : BG.josa(s.interestName, '와') + '의 기록'),
      h('div', { class: 'sum-grid' },
        h('div', { class: 'sum-box' },
          h('h3', null, '사건 결과'),
          h('ol', null, s.cases.map(function (c) { return h('li', null, h('span', { class: 'mono' }, c.no), ' ', c.title, ' — ', h('strong', null, c.label), h('span', { class: 'dim small' }, ' (변형 ' + c.variant + ')')); })),
          h('p', null, '최종: ', h('strong', null, s.eventLabel)),
          h('p', { class: 'small dim' }, '사용 슬롯 ' + s.slots + ' · 균열 ' + s.res.crack + ' · 체력 ' + s.res.hp + ' · 침착 ' + s.res.comp + (s.rescueUsed ? ' · 구조 사용' : ''))),
        h('div', { class: 'sum-box' + (ok ? ' good' : '') },
          h('h3', null, '관계 결과'),
          h('p', { class: 'big-line' }, ok ? '♥ ' : '', s.relLabel),
          h('p', { class: 'mile' }, s.romanceMilestones.map(function (m) { return h('span', { class: m.ok ? 'on' : '' }, (m.ok ? '■ ' : '□ ') + m.label); })),
          h('p', null, '핵심 약속 — ', s.promise.label, ': ', h('strong', null, { kept: '지킴', set: '맺었지만 지켜 보이지 못함', broken: '깨짐', none: '맺지 않음' }[s.promise.state])),
          h('p', { class: 'small' }, '관계 상태 — ', s.labels.trust, ' · ', s.labels.intimacy),
          s.gaps.length ? h('div', null, h('p', { class: 'small' }, '연인 성립에 모자랐던 것'), h('ul', { class: 'small warn-list' }, s.gaps.map(function (g) { return h('li', null, g); }))) : null)),
      h('div', { class: 'sum-box' },
        h('h3', null, '관계가 움직인 이유'),
        s.log.length ? h('ol', { class: 'rel-log' }, s.log.map(function (x) { return h('li', null, (x.k === 'trust' ? '신뢰 ' : '마음 ') + (x.d > 0 ? '▲' : '▼') + ' — ' + x.why); })) : h('p', { class: 'small dim' }, '기록 없음')),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', type: 'button', onclick: function () { S.clearRun(); E.clear(); newRunFlow(); } }, '새 조사'),
        h('button', { class: 'btn', type: 'button', onclick: function () {
          const t = E.summaryText();
          if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { BG.alert('복사함', '결과 텍스트를 클립보드에 복사했습니다. 개인정보는 포함되지 않습니다(탐사자 이름 제외).'); }, function () { BG.alert('결과 텍스트', t); });
          else BG.alert('결과 텍스트', t);
        } }, '결과 텍스트 복사'),
        h('button', { class: 'btn', type: 'button', onclick: function () { UI.go('records'); } }, '조사기록 보기'),
        h('button', { class: 'btn', type: 'button', onclick: function () { UI.go('title'); } }, '타이틀로')));
  }

  function renderGame(keepScroll) {
    const r = E.get();
    if (!r) { UI.go('title'); return; }
    const v = r.view;
    const hd = E.header();
    const sig = viewSig();
    const fresh = sig !== lastViewSig;
    lastViewSig = sig;
    const stageScroll = keepScroll ? window.scrollY : 0;

    if (BG.audio) BG.audio.mood(v.kind === 'confront' || (v.kind === 'final' && r.fin && r.fin.step >= 5) ? 'tension' : r.phase === 'interlude' ? 'quiet' : 'calm');

    let stageBody;
    let opts = [];
    if (v.kind === 'summary') {
      stageBody = renderSummary();
    } else {
      const page = v.pages[v.page] || [];
      opts = E.options();
      stageBody = h('div', null,
        v.title ? h('p', { class: 'view-title mono small' }, v.title) : null,
        h('div', { class: 'lines', 'aria-live': 'polite' }, page.map(lineNode)),
        v.pages.length > 1 ? h('p', { class: 'pager mono small dim' }, (v.page + 1) + ' / ' + v.pages.length) : null,
        h('div', { class: 'opts', role: 'group', 'aria-label': '선택지' }, opts.map(optionButton)));
    }
    const skip = v.kind === 'scene' && E.pageViewed() && v.page < v.pages.length - 1;
    const stage = h('section', { class: 'stage' + (fresh && v.kind !== 'summary' && settings.textSpeed !== 'instant' && !settings.reduceMotion ? ' revealing speed-' + settings.textSpeed : ''), onclick: function (e) { if (revealing && !e.target.closest('.opt')) finishReveal(); } },
      h('div', { class: 'mini-res' }, resBlock(true), h('button', { class: 'btn small', type: 'button', 'aria-controls': 'side', 'aria-expanded': drawer ? 'true' : 'false', onclick: function () { drawer = true; renderGame(true); } }, '상태·기록')),
      stageBody);
    const top = h('header', { class: 'g-top' },
      h('div', { class: 'g-loc' },
        h('span', { class: 'mono chip' }, hd.code || hd.label),
        h('span', { class: 'g-title' }, hd.code ? hd.label + ' · ' + hd.title : hd.title)),
      h('div', { class: 'g-right' },
        hd.slotsMax ? h('span', { class: 'mono small', title: '이번 구간 슬롯 / 누적 슬롯' }, '슬롯 ' + hd.slotsPhase + '/' + hd.slotsMax + ' · 누적 ' + hd.total + '/60') : null,
        skip ? h('button', { class: 'btn small', type: 'button', onclick: function () { E.skipRead(); renderGame(); } }, '읽은 장면 넘기기 ▸▸') : null,
        h('button', { class: 'btn small', type: 'button', onclick: openMenu, 'aria-label': '메뉴 열기' }, '메뉴')));
    const node = h('div', { class: 'game' + (drawer ? ' drawer-open' : '') }, top, h('div', { class: 'g-body' }, stage, sidePanel()));
    BG.clear(app).appendChild(node);

    if (stage.classList.contains('revealing')) {
      revealing = true;
      const per = { fast: 70, normal: 160, slow: 320 }[settings.textSpeed] || 70;
      const n = (v.pages[v.page] || []).length;
      clearTimeout(revealTimer);
      revealTimer = setTimeout(finishReveal, per * n + 250);
    } else revealing = false;

    if (keepScroll) window.scrollTo(0, stageScroll);
    else if (fresh) {
      window.scrollTo(0, 0);
      const first = stage.querySelector('.opt:not([disabled])');
      if (first && document.activeElement === document.body) first.focus({ preventScroll: true });
    }
  }

  async function openMenu() {
    const r = E.get();
    const pick = await BG.modal({
      title: '메뉴', body: ['진행 상황은 선택할 때마다 자동으로 저장됩니다.'],
      actions: [
        { label: '계속하기', value: 'close', primary: true },
        { label: '설정', value: 'settings' },
        { label: '저장 파일 내보내기', value: 'export' },
        { label: '조사기록', value: 'records' },
        { label: '타이틀로', value: 'title' },
      ],
      cancelValue: 'close',
    });
    if (pick === 'settings') { UI.returnTo = 'game'; UI.go('settings'); }
    else if (pick === 'export') exportAll();
    else if (pick === 'records') { UI.returnTo = 'game'; UI.go('records'); }
    else if (pick === 'title') UI.go('title');
    void r;
  }

  /* ───────── 조사기록 (도감) ───────── */
  function renderRecords() {
    const tabs = [['endings', '결말'], ['people', '인물'], ['cases', '사건'], ['runs', '지난 조사'], ['notes', '메모']];
    let body;
    if (recordsTab === 'endings') {
      const rels = ['lovers', 'apart', 'colleague', 'distance'];
      body = h('div', null,
        h('p', { class: 'small dim' }, '본 결말만 표시합니다. 결말 도감은 기록일 뿐, 다음 판의 호감으로 이어지지 않습니다.'),
        h('table', { class: 'grid-table' },
          h('thead', null, h('tr', null, h('th', null, '인물'), rels.map(function (k) { return h('th', null, E.LABELS.rel[k]); }))),
          h('tbody', null, BG.INITIAL.map(function (id) {
            return h('tr', null, h('th', null, BG.chars[id].name), rels.map(function (k) {
              const n = meta.endings.filter(function (e) { return e.interest === id && e.rel === k; }).length;
              return h('td', { class: n ? 'on' : '' }, n ? (k === 'lovers' ? '♥ ' : '■ ') + n + '회' : '□');
            }));
          }))));
    } else if (recordsTab === 'people') {
      body = h('div', { class: 'people-list' }, Object.keys(BG.chars).filter(function (id) { return !BG.chars[id].npc; }).map(function (id) {
        const c = BG.chars[id];
        const met = !!meta.met[id];
        return h('div', { class: 'person' + (met ? '' : ' locked') },
          h('p', null, h('strong', null, met ? c.name : '아직 만나지 않음'), c.romance && met ? h('span', { class: 'tag' }, '공략') : null),
          met ? [h('p', { class: 'small dim' }, c.role), c.blurb ? h('p', { class: 'small' }, c.blurb) : null] : null);
      }));
    } else if (recordsTab === 'cases') {
      body = h('div', null, BG.CASE_POOL.map(function (id) {
        const d = BG.content.cases[id];
        const m = meta.cases[d.no];
        return h('div', { class: 'person' + (m ? '' : ' locked') },
          h('p', null, h('span', { class: 'mono' }, d.no), ' ', h('strong', null, m ? d.title : '미조사')),
          m ? [h('p', { class: 'small' }, '질문 — ', d.question),
            h('p', { class: 'small dim' }, '조사 ' + m.seen + '회 · 최고 결과 ' + E.LABELS.outcome[m.best] + ' · 본 변형 ' + Object.keys(m.variants).sort().join(', '))] : null);
      }));
    } else if (recordsTab === 'runs') {
      body = meta.runs.length ? h('div', null, meta.runs.map(function (x) {
        return h('details', { class: 'run-item' },
          h('summary', null, new Date(x.at).toLocaleString('ko-KR'), ' · ', BG.chars[x.interest].name, ' · ', E.LABELS.rel[x.rel] || '—', x.completed ? ' ♥' : ''),
          h('pre', { class: 'small' }, x.text));
      })) : h('p', { class: 'small dim' }, '아직 끝낸 조사가 없습니다.');
    } else {
      const ta = h('textarea', { rows: 12, maxlength: 4000, placeholder: '다음 판에서 바꿔 볼 선택, 알아낸 규칙 등을 적어 두세요. 이 메모는 이 브라우저에만 저장됩니다.', oninput: function (e) { meta.notes = e.target.value; saveMetaSoon(); } });
      ta.value = meta.notes || '';
      body = h('div', null, ta);
    }
    const back = UI.returnTo === 'game' && E.get();
    const node = h('div', { class: 'page' },
      h('header', { class: 'page-head' },
        h('button', { class: 'btn ghost', type: 'button', onclick: function () { const g = back; UI.returnTo = null; UI.go(g ? 'game' : 'title'); } }, back ? '← 조사로' : '← 타이틀'),
        h('h1', null, '조사기록')),
      h('div', { class: 'tabs', role: 'tablist' }, tabs.map(function (t) {
        return h('button', { class: 'tab' + (recordsTab === t[0] ? ' on' : ''), role: 'tab', type: 'button', 'aria-selected': recordsTab === t[0] ? 'true' : 'false', onclick: function () { recordsTab = t[0]; renderRecords(); } }, t[1]);
      })),
      h('section', { class: 'sec' }, body));
    BG.clear(app).appendChild(node);
  }

  /* ───────── 설정 ───────── */
  function renderSettings() {
    function seg(label, key, options) {
      return h('fieldset', { class: 'group' }, h('legend', null, label),
        h('div', { class: 'seg' }, options.map(function (o) {
          const on = settings[key] === o[0];
          return h('label', { class: 'seg-item' + (on ? ' on' : '') },
            h('input', { type: 'radio', name: key, checked: on, onchange: function () { settings[key] = o[0]; saveSettings(); renderSettings(); } }), h('span', null, o[1]));
        })));
    }
    function toggle(label, key, hint) {
      return h('label', { class: 'toggle' },
        h('input', { type: 'checkbox', checked: !!settings[key], onchange: function (e) { settings[key] = e.target.checked; saveSettings(); renderSettings(); } }),
        h('span', null, label), hint ? h('span', { class: 'field-hint' }, hint) : null);
    }
    const back = UI.returnTo === 'game' && E.get();
    const v = settings.debug ? BG.validate() : null;
    const node = h('div', { class: 'page' },
      h('header', { class: 'page-head' },
        h('button', { class: 'btn ghost', type: 'button', onclick: function () { const g = back; UI.returnTo = null; UI.go(g ? 'game' : 'title'); } }, back ? '← 조사로' : '← 타이틀'),
        h('h1', null, '설정')),
      h('section', { class: 'sec' },
        h('h2', null, '읽기'),
        seg('글자 크기', 'fontSize', [[16, '작게'], [18, '기본'], [20, '크게'], [22, '더 크게'], [24, '가장 크게']]),
        seg('텍스트 표시', 'textSpeed', [['instant', '즉시'], ['fast', '빠르게'], ['normal', '보통'], ['slow', '천천히']]),
        toggle('본문을 명조체로', 'serif', '끄면 고딕체. 시스템 글꼴만 사용합니다.'),
        seg('화면 색', 'theme', [['auto', '시스템 따라'], ['dark', '먹색'], ['light', '종이색']]),
        toggle('움직임 줄이기', 'reduceMotion', '문장 나타남·화면 효과를 끕니다.')),
      h('section', { class: 'sec' },
        h('h2', null, '공포 표현'),
        toggle('잔혹 묘사 축소', 'reducedHorror', '출혈·시신·신체 훼손의 세부를 줄입니다. 단서·선택·관계·결말은 같습니다.')),
      h('section', { class: 'sec' },
        h('h2', null, '소리'),
        toggle('환경음 켜기', 'sound', '빗소리와 긴장음. 외부 음원 없이 브라우저에서 만듭니다. 소리 없이도 모든 정보를 확인할 수 있습니다.'),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, '음량'),
          h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: settings.volume, oninput: function (e) { settings.volume = Number(e.target.value); saveSettings(); } }))),
      h('section', { class: 'sec' },
        h('h2', null, '검수'),
        toggle('검수 모드', 'debug', '관계 수치·플래그·시드·콘텐츠 자동 검수 결과를 보여 줍니다.'),
        v ? h('div', { class: 'small mono debug' },
          h('p', null, '장면 ' + v.stats.scenes + ' · 사건 ' + v.stats.cases + ' · 루트 ' + v.stats.routes + ' · 오류 ' + v.errors.length + ' · 경고 ' + v.warnings.length),
          v.errors.map(function (e) { return h('p', { class: 'warn-text' }, '✕ ' + e); }),
          v.warnings.map(function (e) { return h('p', { class: 'dim' }, '△ ' + e); })) : null));
    BG.clear(app).appendChild(node);
  }

  /* ───────── 저장 관리 ───────── */
  function renderData() {
    const node = h('div', { class: 'page' },
      topNav('저장 관리'),
      h('section', { class: 'sec' },
        h('h2', null, '저장 위치'),
        h('p', null, '프로필, 진행 중인 조사, 조사기록, 설정은 모두 이 브라우저의 로컬 저장소(localStorage)에만 저장됩니다. 서버로 보내지 않습니다.'),
        h('p', null, '브라우저의 사이트 데이터를 지우거나, 다른 브라우저·기기로 옮기거나, 비공개 창을 닫으면 저장이 사라집니다. 중요한 진행은 아래에서 JSON 파일로 내보내 백업하세요.'),
        h('p', { class: 'small dim' }, '로컬 저장 사용 가능: ' + (S.available ? '예' : '아니요'))),
      h('section', { class: 'sec' },
        h('h2', null, '내보내기·가져오기'),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn primary', type: 'button', onclick: exportAll }, '전체 저장 내보내기 (JSON)'),
          h('button', { class: 'btn', type: 'button', onclick: importAll }, '저장 파일 가져오기')),
        h('p', { class: 'small dim' }, '가져오기 전에 형식과 버전을 검사합니다. 손상된 파일이나 규칙에 맞지 않는 프로필(성별·나이·능력치)은 거절합니다. 덮어쓰기 전에 다시 묻습니다.')),
      h('section', { class: 'sec' },
        h('h2', null, '지우기'),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn', type: 'button', onclick: async function () {
            if (!(await BG.confirm('진행 중인 조사 지우기', '진행 중인 조사만 지웁니다. 프로필과 조사기록은 남습니다.', '지우기', true))) return;
            S.clearRun(); E.clear(); renderData();
          } }, '진행 중인 조사 지우기'),
          h('button', { class: 'btn danger', type: 'button', onclick: async function () {
            if (!(await BG.confirm('모든 데이터 지우기', '프로필, 진행 중인 조사, 조사기록, 설정을 모두 지웁니다. 되돌릴 수 없습니다. 먼저 내보내기를 권합니다.', '모두 지우기', true))) return;
            S.clearAll(); E.clear(); settings = S.loadSettings(); meta = S.loadMeta(); profiles = S.loadProfiles(); applySettings(); UI.go('title');
          } }, '모든 데이터 지우기'))));
    BG.clear(app).appendChild(node);
  }
  function importAll() {
    const inp = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
    inp.addEventListener('change', function () {
      const f = inp.files && inp.files[0];
      if (!f) return;
      f.text().then(async function (t) {
        const r = S.parseImport(t);
        if (!r.ok) { BG.alert('가져오기 실패', r.errors.concat(['기존 데이터는 바뀌지 않았습니다.'])); return; }
        if (r.kind === 'profile') { BG.alert('프로필 파일', '이 파일은 프로필 하나입니다. 새 조사 화면의 ‘프로필 파일 가져오기’를 사용해 주세요.'); return; }
        const body = ['이 파일의 프로필 ' + r.data.profiles.profiles.filter(Boolean).length + '개, 끝낸 조사 ' + r.data.meta.runs.length + '개' + (r.data.run ? ', 진행 중인 조사 1개' : '') + '로 지금 데이터를 덮어씁니다.'].concat(r.errors.map(function (e) { return '▲ ' + e; }));
        if (!(await BG.confirm('덮어쓰기 확인', body, '덮어쓰기', true))) return;
        const ok = S.applyImport(r.data);
        settings = S.loadSettings(); meta = S.loadMeta(); profiles = S.loadProfiles(); E.clear();
        applySettings();
        BG.alert(ok ? '가져오기 완료' : '일부 저장 실패', ok ? '데이터를 불러왔습니다.' : '저장 공간 문제로 일부를 저장하지 못했습니다.');
        UI.go('title');
      });
    });
    document.body.appendChild(inp);
    inp.click();
    setTimeout(function () { inp.remove(); }, 60000);
  }

  /* ───────── 키보드 ───────── */
  document.addEventListener('keydown', function (e) {
    if (screen !== 'game' || !E.get()) return;
    if (document.getElementById('modal-root').hidden === false) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'Escape') { e.preventDefault(); if (drawer) { drawer = false; renderGame(true); } else openMenu(); return; }
    if (revealing && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); finishReveal(); return; }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) {
      const opts = E.options();
      const o = opts[n - 1];
      if (o) { e.preventDefault(); pick(o); }
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && (!e.target.closest || !e.target.closest('button'))) {
      const opts = E.options();
      if (opts.length === 1 && opts[0].kind === 'next') { e.preventDefault(); pick(opts[0]); }
    }
  });
  window.addEventListener('pointerdown', function () { if (settings.sound && BG.audio) BG.audio.set(true, settings.volume); }, { once: true });

  /* ───────── 시작 ───────── */
  applySettings();
  if (settings.debug) {
    const v = BG.validate();
    if (v.errors.length) console.warn('[검수] 오류', v.errors);
    if (v.warnings.length) console.info('[검수] 경고', v.warnings);
  }
  UI.go('title');
})();
