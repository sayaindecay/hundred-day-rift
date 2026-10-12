/* 백일의 틈 — creator: 여성 고정 탐사자 생성·편집 (FR-02, FR-35~39).
 * 성격·외모는 문장에만 반영되고 판정·호감에는 들어가지 않는다. */
(function () {
  'use strict';
  const BG = window.BG;
  const h = BG.h;
  const STEPS = ['기본', '성격', '배경', '능력치', '외모', '미리보기'];

  const SAMPLES = {
    social: '{tone:…괜찮아요. 고마워요.|괜찮아요. 덕분에요.|괜찮아요. 근데 조금만 더 이러고 있어도 돼요?}',
    risk: '{risk:한 칸씩 손전등으로 확인하며 계단을 내려간다.|계단을 내려간다.|망설임 없이 계단을 내려간다.}',
    voice: '{voice:혹시 출입을 좀 막아 주실 수 있을까요.|출입 통제 부탁드려요.|출입 막아 주세요. 지금요.}',
    trait: '{trait:유머=그건 국밥 다 먹고 디저트 사 주시면 말할게요.;다정함=천천히 드세요. 저 안 가요.;호기심=그런데 그건 왜 그런 거예요? 궁금해요.;*=그건 다음에요. 지금은 국밥이 식어요.}',
    look: '{look} 고개를 든다. 신백이 당신이 젖지 않았는지 다시 확인하고 있다.',
  };

  function ctxFor(p) {
    return { p: p, compShort: '신백', compName: '고신백', ownerShort: '신백', variant: 'A', hook: { danger: '계단', place: '상가 지하', object: '전화' }, reduced: false };
  }
  function rateText(v, diff) {
    return Math.max(20, Math.min(90, 55 + v * 10 - diff * 10)) + '%';
  }

  BG.profileSummary = function (p) {
    const a = p.appearance || {};
    const look = [a.hairColor, a.hair, a.eyes].filter(Boolean).join(', ');
    const body = [a.height && a.height !== '말하지 않음' ? '키 ' + a.height : '', a.build && a.build !== '말하지 않음' ? a.build + ' 체형' : ''].filter(Boolean).join(', ');
    const feat = (a.features || []).join(', ');
    return {
      head: p.name + ' · ' + p.age + '세 · 여성',
      call: '동행이 부르는 말: ' + (p.addressForm || p.name + ' 씨'),
      persona: ['social', 'risk', 'voice'].map(function (k) { return BG.PERSONALITY[k].label + ' — ' + BG.PERSONALITY[k].options[p.personality[k]]; }).join(' · ') + ((p.traits || []).length ? ' · 성향: ' + p.traits.join(', ') : ''),
      bg: BG.BACKGROUNDS[p.background].label + ' · 시작 도구: ' + BG.TOOLS[p.tool].label + ' (' + BG.TOOLS[p.tool].desc + ')',
      stats: BG.STAT_KEYS.map(function (k) { return BG.STATS[k] + ' ' + p.stats[k]; }).join(' · '),
      look: [look, body, a.outfit, feat].filter(Boolean).join(' / '),
    };
  };

  /* 미리보기 패널이 화면 높이 안에 다 들어갈 때만 고정한다(자체 스크롤바를 만들지 않기 위해) */
  function fitPin() {
    const side = document.querySelector('.creator-side');
    if (side) side.classList.toggle('pin', side.offsetHeight + 32 <= window.innerHeight);
  }
  window.addEventListener('resize', fitPin);

  /* 마지막 조작이 손가락·마우스였는지 기억한다. 다시 그린 뒤 초점을 되돌리는 건 키보드 사용자에게만 한다
   * (모바일에서 select에 초점을 다시 주면 선택 창이 한 번 더 열린다) */
  let pointerUsed = false;
  document.addEventListener('pointerdown', function () { pointerUsed = true; }, true);
  document.addEventListener('keydown', function () { pointerUsed = false; }, true);

  BG.creator = {};
  BG.creator.open = function (opts) {
    const app = document.getElementById('app');
    let p = BG.clone(opts.profile);
    let step = 0;
    let errorsEl = null;

    function set(path, v) {
      const ks = path.split('.');
      let o = p;
      for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
      o[ks[ks.length - 1]] = v;
    }
    function field(label, input, hint) {
      return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'field-hint' }, hint) : null);
    }
    function textInput(path, max, placeholder) {
      const ks = path.split('.');
      let v = p;
      ks.forEach(function (k) { v = v[k]; });
      return h('input', { type: 'text', maxlength: max, value: v || '', placeholder: placeholder || '', oninput: function (e) { set(path, e.target.value); refreshPreview(); } });
    }
    function textArea(path, max, placeholder) {
      const counter = h('span', { class: 'counter' }, (p[path] || '').length + '/' + max);
      const ta = h('textarea', { maxlength: max, rows: 3, placeholder: placeholder || '', oninput: function (e) { p[path] = e.target.value; counter.textContent = e.target.value.length + '/' + max; refreshPreview(); } });
      ta.value = p[path] || '';
      return h('div', { class: 'ta-wrap' }, ta, counter);
    }
    /* 고르기·칩·드롭다운은 화면 전체를 다시 그리지 않고 제자리에서 표시만 바꾼다.
     * (다시 그리면 모바일에서 선택 창이 다시 열리거나 누른 자리에 hover·초점 흔적이 남는다) */
    function changed() {
      refreshPreview();
      Array.prototype.forEach.call(app.querySelectorAll('[data-sample]'), function (el) {
        el.textContent = sampleText(el.getAttribute('data-sample'));
      });
    }
    function markOn(box, idx) {
      Array.prototype.forEach.call(box.children, function (el, j) { el.classList.toggle('on', j === idx); });
    }
    function radioGroup(name, options, current, onPick) {
      const box = h('div', { class: 'seg', role: 'radiogroup' });
      options.forEach(function (o, i) {
        const id = name + '-' + i;
        box.appendChild(h('label', { class: 'seg-item' + (current === i ? ' on' : ''), for: id },
          h('input', { type: 'radio', id: id, name: name, checked: current === i, onchange: function () { onPick(i); markOn(box, i); changed(); } }),
          h('span', null, o)));
      });
      return box;
    }
    /* 최대 max개까지 고르는 칩 묶음. get()은 지금 목록, put(list)는 새 목록 저장 */
    function chipGroup(items, max, get, put) {
      const box = h('div', { class: 'chips' });
      function sync() {
        const list = get();
        Array.prototype.forEach.call(box.children, function (lab, i) {
          const on = list.indexOf(items[i]) >= 0;
          const input = lab.firstChild;
          input.checked = on;
          input.disabled = !on && list.length >= max;
          lab.classList.toggle('on', on);
          lab.classList.toggle('off', input.disabled);
        });
      }
      items.forEach(function (t) {
        box.appendChild(h('label', { class: 'chip' },
          h('input', { type: 'checkbox', onchange: function (e) {
            const list = get();
            if (e.target.checked) { if (list.length < max) put(list.concat([t])); }
            else put(list.filter(function (x) { return x !== t; }));
            sync();
            changed();
          } }), t));
      });
      sync();
      return box;
    }
    function sampleText(key) {
      return '예시 — ' + BG.text.render(SAMPLES[key], ctxFor(p));
    }
    function sample(key) {
      return h('p', { class: 'sample', 'data-sample': key }, sampleText(key));
    }

    let previewEl = null;
    /* 텍스트 프로필: 신상 기록표. 지금 편집 중인 단계의 칸에 붉은 표시를 붙인다 */
    const STEP_SEC = ['id', 'persona', 'bg', 'stats', 'look', null];
    function previewNode() {
      const a = p.appearance || {};
      const per = BG.PERSONALITY;
      const cur = STEP_SEC[step];
      const sum = BG.store.statSum(p.stats);
      function row(k, v, sub) {
        return h('div', { class: 'pv-row' }, h('dt', null, k), h('dd', null, v || '—', sub ? h('span', { class: 'pv-sub' }, sub) : null));
      }
      function sec(key, title, body, warn) {
        return h('section', { class: 'pv-sec' + (cur === key ? ' on' : '') },
          h('h3', { class: 'pv-h' + (warn ? ' warn-text' : '') }, title), body);
      }
      const name = String(p.name || '').trim();
      const plain = function (v) { return v && v !== '말하지 않음' ? v : ''; };
      const free = [['자기 설명', p.selfText], ['배경 설명', p.bgText], ['외모 설명', p.lookText]].filter(function (x) { return String(x[1] || '').trim(); });
      return h('div', { class: 'pv' },
        h('header', { class: 'pv-id' + (cur === 'id' ? ' on' : '') },
          h('p', { class: 'pv-name' }, name || '이름 없음'),
          h('p', { class: 'pv-meta' }, (Number.isInteger(p.age) ? p.age + '세' : '나이 미정') + ' · 여성'),
          h('p', { class: 'pv-call' }, h('span', { class: 'pv-k' }, '부르는 말'), String(p.addressForm || '').trim() || (name ? name + ' 씨' : '—'))),
        sec('persona', '성격', h('dl', null,
          row(per.social.label, per.social.options[p.personality.social]),
          row(per.risk.label, per.risk.options[p.personality.risk]),
          row(per.voice.label, per.voice.options[p.personality.voice]),
          row('성향', (p.traits || []).join(', ') || '없음'))),
        sec('bg', '배경', h('dl', null,
          row('배경', BG.BACKGROUNDS[p.background].label),
          row('시작 도구', BG.TOOLS[p.tool].label, BG.TOOLS[p.tool].desc))),
        sec('stats', '능력치 · 합계 ' + sum + '/' + BG.STAT_BUDGET, h('div', { class: 'pv-stats' }, BG.STAT_KEYS.map(function (k) {
          const v = p.stats[k];
          return h('div', { class: 'pv-stat' },
            h('span', { class: 'pv-stat-k' }, BG.STATS[k]),
            h('span', { class: 'pv-pips', 'aria-hidden': 'true' }, '■'.repeat(v) + '□'.repeat(BG.STAT_MAX - v)),
            h('span', { class: 'pv-stat-v' }, v + '/' + BG.STAT_MAX));
        })), sum !== BG.STAT_BUDGET),
        sec('look', '외모', h('dl', null,
          row('머리', [a.hairColor, a.hair].filter(Boolean).join(', ')),
          row('눈', a.eyes),
          row('키 · 체형', [plain(a.height) ? '키 ' + a.height : '', plain(a.build) ? a.build + ' 체형' : ''].filter(Boolean).join(' · ') || '말하지 않음'),
          row('복장', a.outfit),
          row('특징', (a.features || []).join(', ') || '없음'))),
        free.length ? sec('free', '자유 설명', free.map(function (x) {
          return h('blockquote', { class: 'pv-quote' }, h('span', { class: 'pv-k' }, x[0]), x[1]);
        })) : null);
    }
    function refreshPreview() {
      if (!previewEl) return;
      BG.clear(previewEl).appendChild(previewNode());
      fitPin();
    }

    function stepBasic() {
      const ageIn = h('input', { type: 'number', min: 20, max: 80, step: 1, value: p.age, inputmode: 'numeric', oninput: function (e) { p.age = parseInt(e.target.value, 10); refreshPreview(); } });
      return [
        h('p', { class: 'lead' }, '당신은 겹침을 조사하는 민간 협력자입니다. 경찰이나 의사의 권한은 없습니다. 이름과 나이, 동행이 당신을 부를 말을 정해 주세요.'),
        field('이름', textInput('name', BG.LIMITS.name, '예: 서하'), '최대 ' + BG.LIMITS.name + '자'),
        field('나이', ageIn, '20~80세. 성인 탐사자만 만들 수 있습니다.'),
        field('호칭', textInput('addressForm', BG.LIMITS.addressForm, '예: 서하 씨'), '동행이 당신을 부르는 말. 비우면 “이름 씨”가 됩니다.'),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, '성별'), h('p', { class: 'fixed' }, '여성 (고정)'), h('span', { class: 'field-hint' }, '이 게임의 탐사자는 여성으로 고정되어 있습니다. 성별로 성격·직업·호칭이 자동으로 정해지지는 않습니다.')),
      ];
    }
    function stepPersona() {
      const out = [h('p', { class: 'lead' }, '성격은 역할극의 출발점입니다. 몇몇 문장의 말투와 서술이 바뀔 뿐, 선택을 막거나 호감을 올리지 않습니다. 모든 중요한 선택은 직접 고릅니다.')];
      ['social', 'risk', 'voice'].forEach(function (k) {
        out.push(h('fieldset', { class: 'group' }, h('legend', null, BG.PERSONALITY[k].label),
          radioGroup('per-' + k, BG.PERSONALITY[k].options, p.personality[k], function (i) { p.personality[k] = i; }),
          sample(k)));
      });
      out.push(h('fieldset', { class: 'group' }, h('legend', null, '성향 태그 (최대 2개)'),
        chipGroup(BG.TRAITS, 2, function () { return p.traits; }, function (l) { p.traits = l; }),
        sample('trait')));
      out.push(field('자기 설명 (선택)', textArea('selfText', BG.LIMITS.selfText, '프로필에 그대로 표시됩니다. 규칙에는 쓰이지 않습니다.')));
      return out;
    }
    function stepBackground() {
      const out = [h('p', { class: 'lead' }, '배경은 행동의 성향과 시작 도구를 정합니다. 실제 전문 자격이나 인물과의 친분은 생기지 않습니다. 진짜 전문 판단은 동행과의 협력으로 얻습니다.'),
        h('p', { class: 'small dim' }, '배경을 고르면 능력치와 도구가 추천값으로 바뀝니다. 다음 단계에서 자유롭게 다시 나눌 수 있습니다.')];
      const toolSel = h('select', { onchange: function (e) { p.tool = e.target.value; refreshPreview(); } },
        Object.keys(BG.TOOLS).map(function (t) { return h('option', { value: t, selected: p.tool === t }, BG.TOOLS[t].label + ' — ' + BG.TOOLS[t].desc); }));
      const cards = h('div', { class: 'cards', role: 'radiogroup' });
      BG.BG_KEYS.forEach(function (k, i) {
        const b = BG.BACKGROUNDS[k];
        const on = p.background === k;
        cards.appendChild(h('label', { class: 'card pick' + (on ? ' on' : '') },
          h('input', { type: 'radio', name: 'bg', checked: on, onchange: function () {
            p.background = k; p.tool = b.tool; p.stats = BG.clone(b.stats);
            toolSel.value = b.tool;
            markOn(cards, i);
            changed();
          } }),
          h('strong', null, b.label),
          h('span', null, b.desc),
          h('span', { class: 'mono small' }, '추천 능력 — ' + BG.STAT_KEYS.map(function (s) { return BG.STATS[s] + ' ' + b.stats[s]; }).join(' · ')),
          h('span', { class: 'small' }, '추천 도구 — ' + BG.TOOLS[b.tool].label)));
      });
      out.push(cards);
      out.push(field('시작 도구', toolSel, '정해진 목록에서만 고릅니다. 도구는 결말에 필요한 단서를 독점하지 않습니다.'));
      out.push(field('배경 설명 (선택)', textArea('bgText', BG.LIMITS.bgText, '출발 동기, 일상 경험, 약점 등. 텍스트로만 저장되며 규칙에 영향을 주지 않습니다.')));
      return out;
    }
    function stepStats() {
      const sum = BG.store.statSum(p.stats);
      const left = BG.STAT_BUDGET - sum;
      const rows = BG.STAT_KEYS.map(function (k) {
        const v = p.stats[k];
        return h('div', { class: 'stat-row' },
          h('div', { class: 'stat-name' }, h('strong', null, BG.STATS[k]), h('span', { class: 'small' }, BG.STAT_DESC[k])),
          h('div', { class: 'stepper' },
            h('button', { type: 'button', class: 'btn sq', 'aria-label': BG.STATS[k] + ' 낮추기', disabled: v <= BG.STAT_MIN, onclick: function () { p.stats[k] = v - 1; render(); } }, '−'),
            h('span', { class: 'stat-val', 'aria-live': 'polite' }, String(v)),
            h('button', { type: 'button', class: 'btn sq', 'aria-label': BG.STATS[k] + ' 올리기', disabled: v >= BG.STAT_MAX || left <= 0, onclick: function () { p.stats[k] = v + 1; render(); } }, '+')),
          h('div', { class: 'stat-rate small mono' }, '난도1 ' + rateText(v, 1) + ' · 난도2 ' + rateText(v, 2) + ' · 난도3 ' + rateText(v, 3)));
      });
      return [
        h('p', { class: 'lead' }, '네 능력은 각 1~3, 합계 ' + BG.STAT_BUDGET + '입니다. 배경과 상관없이 자유롭게 나눌 수 있습니다.'),
        h('p', { class: 'points ' + (left === 0 ? 'ok' : 'warn') }, left === 0 ? '✓ 배분 완료 — 합계 8' : left > 0 ? '▲ 남은 포인트 ' + left : '▲ ' + -left + '포인트 초과'),
        h('div', { class: 'stats' }, rows),
        h('p', { class: 'small' }, '판정식(가안): 성공률 = 55 + 능력×10 − 난도×10 + 준비·동행·도구 보정, 20~90%로 제한. 예) 능력 2·난도 2 → 55%, 동행 특기까지 맞으면 65%.'),
        h('button', { type: 'button', class: 'btn', onclick: function () { p.stats = BG.clone(BG.BACKGROUNDS[p.background].stats); render(); } }, '배경 추천값으로 되돌리기'),
      ];
    }
    function apSelect(key, label) {
      const opts = BG.APPEARANCE[key];
      const cur = p.appearance[key] || '';
      const showCustom = cur === '' || opts.indexOf(cur) < 0;
      const own = h('input', { type: 'text', id: 'ap-' + key, maxlength: BG.LIMITS.custom, value: cur, placeholder: '짧게 직접 입력', hidden: !showCustom, oninput: function (e) { p.appearance[key] = e.target.value; changed(); } });
      const sel = h('select', { onchange: function (e) {
        const custom = e.target.value === '__custom';
        p.appearance[key] = custom ? '' : e.target.value;
        own.value = p.appearance[key];
        own.hidden = !custom;
        changed();
        if (custom) own.focus();
      } },
        opts.map(function (o) { return h('option', { value: o, selected: cur === o }, o); }),
        h('option', { value: '__custom', selected: showCustom }, '직접 입력…'));
      return h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), sel, own);
    }
    function stepLook() {
      return [
        h('p', { class: 'lead' }, '외모는 문장으로만 표현됩니다. 이미지는 만들지 않습니다. 키·체형·복장은 판정, 호감, 결말 조건에 영향을 주지 않습니다.'),
        h('div', { class: 'grid2' },
          apSelect('hairColor', '머리 색'), apSelect('hair', '머리 모양'), apSelect('eyes', '눈'),
          apSelect('height', '키'), apSelect('build', '체형'), apSelect('outfit', '복장')),
        h('fieldset', { class: 'group' }, h('legend', null, '특징·소품 (최대 4개)'),
          chipGroup(BG.APPEARANCE.features, 4, function () { return p.appearance.features; }, function (l) { p.appearance.features = l; }),
          sample('look')),
        field('자유 외모 설명 (선택)', textArea('lookText', BG.LIMITS.lookText, '프로필에 원문 그대로 표시됩니다.')),
      ];
    }
    function stepPreview() {
      const v = BG.store.validateProfile(p);
      return [
        h('p', { class: 'lead' }, '텍스트 프로필을 확인하세요. 조사를 시작하면 이 프로필의 복사본이 그 판에 고정됩니다. 이후 원본을 고쳐도 진행 중인 판은 바뀌지 않습니다.'),
        h('div', { class: 'profile-card' }, previewNode()),
        h('div', { class: 'samples' },
          h('h3', null, '문장이 이렇게 달라집니다'),
          sample('social'), sample('risk'), sample('voice'), sample('look')),
        v.ok ? h('p', { class: 'points ok' }, '✓ 저장할 수 있습니다.') : h('ul', { class: 'errors' }, v.errors.map(function (e) { return h('li', null, '▲ ' + e); })),
      ];
    }

    function validateStep() {
      if (step === 0) {
        const errs = [];
        if (!String(p.name || '').trim()) errs.push('이름을 입력해 주세요.');
        if (!Number.isInteger(p.age) || p.age < 20 || p.age > 80) errs.push('나이는 20~80 사이의 정수여야 합니다.');
        return errs;
      }
      if (step === 3 && BG.store.statSum(p.stats) !== BG.STAT_BUDGET) return ['능력치 합계를 ' + BG.STAT_BUDGET + '에 맞춰 주세요.'];
      return [];
    }

    /* 같은 단계 안에서 다시 그릴 때는 스크롤 위치와 키보드 초점을 그대로 둔다.
     * 단계를 옮길 때만 맨 위로 올린다. */
    let renderedStep = -1;
    function focusables() {
      return Array.prototype.slice.call(app.querySelectorAll('input, select, textarea, button'));
    }
    function render() {
      const stepChanged = step !== renderedStep;
      const keepY = window.scrollY;
      const focusIdx = stepChanged ? -1 : focusables().indexOf(document.activeElement);
      const builders = [stepBasic, stepPersona, stepBackground, stepStats, stepLook, stepPreview];
      previewEl = h('div', { class: 'live-preview' }, previewNode());
      errorsEl = h('div', { class: 'step-errors', role: 'alert' });
      const nav = h('div', { class: 'step-nav' },
        h('button', { type: 'button', class: 'btn', onclick: function () { if (step === 0) opts.onCancel(); else { step -= 1; render(); } } }, step === 0 ? '취소' : '이전'),
        step < STEPS.length - 1
          ? h('button', { type: 'button', class: 'btn primary', onclick: next }, '다음')
          : [h('button', { type: 'button', class: 'btn', onclick: function () { finish(false); } }, '저장'),
            h('button', { type: 'button', class: 'btn primary', onclick: function () { finish(true); } }, '저장하고 계속')]);
      const body = h('div', { class: 'creator' },
        h('header', { class: 'creator-head' },
          h('p', { class: 'mono small' }, '탐사자 기록 — 슬롯 ' + (opts.slot + 1)),
          h('h1', null, opts.isNew ? '탐사자 만들기' : '탐사자 편집'),
          h('ol', { class: 'stepper-bar' }, STEPS.map(function (s, i) {
            return h('li', { class: i === step ? 'on' : i < step ? 'done' : '' },
              h('button', { type: 'button', class: 'linkish', 'aria-current': i === step ? 'step' : null, onclick: function () { if (i < step || validateStep().length === 0) { step = i; render(); } } }, (i + 1) + '. ' + s));
          }))),
        h('div', { class: 'creator-grid' },
          h('section', { class: 'creator-main' }, builders[step](), errorsEl, nav),
          step < 5 ? h('aside', { class: 'creator-side', 'aria-label': '텍스트 프로필 미리보기' },
            h('section', { class: 'win' },
              h('div', { class: 'win-bar' }, h('span', { class: 'sq', 'aria-hidden': 'true' }), h('span', null, 'PROFILE · 텍스트 프로필'), h('span', { class: 'grow' })),
              h('div', { class: 'win-body' }, previewEl)),
            h('p', { class: 'pv-legend' }, h('span', { class: 'pv-mark', 'aria-hidden': 'true' }), '지금 고치는 칸')) : null));
      BG.clear(app).appendChild(body);
      renderedStep = step;
      fitPin();
      if (stepChanged) {
        app.focus({ preventScroll: true });
        window.scrollTo(0, 0);
      } else {
        window.scrollTo(0, keepY);
        const el = focusIdx >= 0 && !pointerUsed ? focusables()[focusIdx] : null;
        if (el && !el.disabled) el.focus({ preventScroll: true });
      }
    }
    function next() {
      const errs = validateStep();
      if (errs.length) {
        BG.clear(errorsEl);
        errs.forEach(function (e) { errorsEl.appendChild(h('p', { class: 'warn-text' }, '▲ ' + e)); });
        return;
      }
      step += 1;
      render();
    }
    function finish(go) {
      const v = BG.store.validateProfile(p);
      if (!v.ok) {
        BG.clear(errorsEl);
        v.errors.forEach(function (e) { errorsEl.appendChild(h('p', { class: 'warn-text' }, '▲ ' + e)); });
        return;
      }
      opts.onSave(v.profile, go);
    }
    render();
  };
})();
