/* 백일의 틈 — engine: 한 판의 상태 전이.
 * DOM을 쓰지 않는다. UI와 자동 검수(tools/sim.html)가 같은 API를 쓴다.
 *   E.newRun(opts) · E.view() · E.options() · E.act(id) · E.summary()
 * 처리 순서: 비용·판정 → 균열 경계 → 균열 100 → 체력/침착 0과 구조 → 다음 장면 */
(function () {
  'use strict';
  const BG = window.BG;
  const RULES = BG.RULES;
  const E = (BG.engine = {});
  let run = null;

  E.hooks = {
    save: null, // (run) => boolean
    settings: function () { return {}; },
    viewed: null, // (key) => boolean
    markViewed: null, // (key)
    onMet: null, // (charId)
    onRunEnd: null, // (run, summary)
  };

  E.get = function () { return run; };
  E.load = function (r) { run = r; };
  E.clear = function () { run = null; };

  E.LABELS = {
    outcome: { stable: '안정화', temp: '임시 봉합', retreat: '철수', isolated: '고립', collapse: '조기 귀환' },
    rel: {
      lovers: '깊은 사랑과 확정된 연인',
      apart: '사랑하지만 헤어짐 · 재회를 기다림',
      colleague: '연애 미성립 · 동료',
      distance: '거절 · 거리 두기',
    },
    milestone: { attraction: '연애적 끌림', emotionReveal: '감정 공개', mutualConfession: '상호 고백', coupleAgreement: '연인 합의' },
    trust: ['경계함', '말을 듣기 시작함', '함께 움직임', '함께 판단함', '서로 맡김', '등을 맡김'],
    intimacy: ['낯섦', '눈길이 감', '마음을 열기 시작함', '곁에 두고 싶음', '깊이 아낌', '마음을 숨기지 않음'],
  };

  /* ───────── 기본 도구 ───────── */
  function S() { return (E.hooks.settings && E.hooks.settings()) || {}; }
  function rand() {
    const p = BG.rngStep(run.rngState);
    run.rngState = p[1];
    return p[0];
  }
  function randInt(n) { return Math.floor(rand() * n); }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function caseDef() { return run && run.cs ? BG.content.cases[run.cs.id] : null; }
  function route() { return BG.content.routes[run.interest]; }
  function comp() { return BG.chars[run.interest]; }
  function cn(j) { return BG.josa(comp().short, j); }
  function lastHook() {
    for (let i = run.results.length - 1; i >= 0; i--) {
      const d = BG.content.cases[run.results[i].id];
      if (d) return d.hook;
    }
    return { danger: '어긋난 문', place: '그곳', object: '기록' };
  }
  function ctx() {
    const d = caseDef();
    return {
      p: run.profile,
      run: run,
      compShort: comp().short,
      compName: comp().name,
      ownerShort: d ? BG.chars[d.owner].short : null,
      variant: d ? run.variants[d.id] : 'A',
      hook: d ? d.hook : lastHook(),
      reduced: !!S().reducedHorror,
    };
  }
  function render(s) { return BG.text.render(s, ctx()); }
  E.render = function (s) { return run ? render(s) : s; };
  function chg(tone, text) { return { k: 'chg', tone: tone, text: text }; }
  function dbg(t) { return S().debug ? ' [' + t + ']' : ''; }

  function buildPages(parts) {
    const c = ctx();
    const pages = [[]];
    (function walk(arr) {
      if (arr == null) return;
      if (!Array.isArray(arr)) arr = [arr];
      arr.forEach(function (it) {
        if (it == null) return;
        if (typeof it === 'string') {
          if (it === '---') {
            if (pages[pages.length - 1].length) pages.push([]);
            return;
          }
          const s = BG.text.render(it, c).trim();
          if (s) pages[pages.length - 1].push(BG.text.parseLine(s));
        } else if (Array.isArray(it)) walk(it);
        else if (it.k) pages[pages.length - 1].push(it);
        else if ('if' in it) walk(BG.cond(it.if, run) ? it.then : it.else);
      });
    })(parts);
    if (pages.length > 1 && !pages[pages.length - 1].length) pages.pop();
    return pages;
  }

  function markMet(pages) {
    pages.forEach(function (p) {
      p.forEach(function (l) {
        if (l.k !== 'say') return;
        const ch = BG.chars[l.who];
        if (!ch || ch.npc) return;
        if (!run.met[l.who]) run.met[l.who] = l.layer;
        if (E.hooks.onMet) E.hooks.onMet(l.who);
      });
    });
  }

  /* ───────── 새 판 ───────── */
  function freshSp() { return { neg: false, tool: false, warn: false }; }

  E.validOrder = function (order, interest) {
    const own = BG.chars[interest] && BG.chars[interest].ownCase;
    return (
      Array.isArray(order) && order.length === 4 && new Set(order).size === 4 && order[0] === own &&
      order.every(function (id) { return !!BG.content.cases[id]; }) && !!BG.content.routes[interest]
    );
  };

  function genOrder(interest, mode) {
    if (mode !== 'random') return BG.TUTORIAL[interest].slice();
    const own = BG.chars[interest].ownCase;
    for (let t = 0; t < 20; t++) {
      const others = shuffle(BG.CASE_POOL.filter(function (c) { return c !== own; })).slice(0, 3);
      const order = [own].concat(others);
      if (E.validOrder(order, interest)) return order;
    }
    return BG.TUTORIAL[interest].slice();
  }

  E.newRun = function (o) {
    let seed = o.seed >>> 0;
    if (!seed) seed = (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
    const p = BG.clone(o.profile);
    run = {
      schemaVersion: BG.VERSION.schema,
      contentVersion: BG.VERSION.content,
      seed: seed,
      rngState: seed,
      createdAt: Date.now(),
      profile: p,
      interest: o.interest,
      mode: o.mode === 'random' ? 'random' : 'tutorial',
      order: [],
      variants: {},
      phase: 'prologue',
      chapter: -1,
      slots: { total: 0, phase: 0, phaseMax: 0 },
      res: {
        hp: RULES.hpMax, hpMax: RULES.hpMax, comp: RULES.compMax, compMax: RULES.compMax,
        supply: RULES.supplyStart, supplyMax: RULES.supplyMax, crack: 0,
      },
      marks: {},
      rel: { trust: 0, intimacy: 0, promises: {}, milestones: {}, boundaries: {}, log: [] },
      clues: {},
      flags: {},
      items: [p.tool],
      sp: freshSp(),
      rescueUsed: false,
      carryPrep: 0,
      cs: null,
      il: null,
      fin: null,
      results: [],
      met: {},
      queue: [],
      view: null,
      history: [],
      over: null,
      finalized: false,
    };
    run.order = genOrder(o.interest, run.mode);
    BG.CASE_POOL.forEach(function (id) { run.variants[id] = rand() < 0.5 ? 'A' : 'B'; });
    run.queue.push({ id: 'common.prologue', opts: { append: BG.content.cases[run.order[0]].teaser } });
    resume();
    save();
    return run;
  };

  function save() {
    if (E.hooks.save) return E.hooks.save(run);
    return true;
  }
  E.save = save;

  /* ───────── 상태 질의 ───────── */
  E.companionHurt = function () {
    return !!(run && ((run.cs && run.cs.hurt) || (run.fin && run.fin.hurt)));
  };
  E.canRescue = function () {
    return !!run && !run.rescueUsed && !E.companionHurt() && run.rel.trust >= 2 && run.res.crack < RULES.crackEnd;
  };
  E.romanceReady = function () {
    if (!run) return false;
    const r = run.rel;
    const rt = route();
    return (
      r.trust >= 3 && r.intimacy >= 3 && r.promises[rt.promise] === 'kept' &&
      !!r.milestones.attraction && !!r.milestones.emotionReveal &&
      !Object.keys(r.boundaries).some(function (b) { return !r.boundaries[b].resolved; })
    );
  };
  E.romanceGaps = function () {
    const r = run.rel;
    const rt = route();
    const gaps = [];
    if (r.trust < 3) gaps.push('신뢰가 ‘함께 판단함’에 이르지 못함');
    if (r.intimacy < 3) gaps.push('마음이 ‘곁에 두고 싶음’에 이르지 못함');
    const ps = r.promises[rt.promise];
    if (!ps) gaps.push('핵심 약속을 맺지 않음 — ' + rt.promiseLabel);
    else if (ps === 'set') gaps.push('핵심 약속을 맺었지만 지켜 보이지 못함');
    else if (ps === 'broken') gaps.push('핵심 약속이 깨짐');
    if (!r.milestones.attraction) gaps.push('이정표 미달 — 연애적 끌림');
    if (!r.milestones.emotionReveal) gaps.push('이정표 미달 — 감정 공개');
    Object.keys(r.boundaries).forEach(function (b) {
      if (!r.boundaries[b].resolved) gaps.push('해명되지 않은 일 — ' + ((rt.boundaries || {})[b] || b));
    });
    return gaps;
  };
  E.relLabels = function () {
    const r = run.rel;
    return { trust: E.LABELS.trust[r.trust], intimacy: E.LABELS.intimacy[r.intimacy] };
  };

  /* ───────── 판정 ───────── */
  function statVal(s) { return (run.profile.stats && run.profile.stats[s]) || 1; }
  function tool() { return BG.TOOLS[run.items[0]]; }
  function rateFor(stat, diff, opt) {
    opt = opt || {};
    const parts = [];
    let r = 55 + statVal(stat) * 10 - diff * 10;
    if (comp().spec.stat === stat && !E.companionHurt()) { r += 10; parts.push('동행 +10'); }
    const t = tool();
    if (t && t.stat === stat && !run.sp.tool) { r += 10; parts.push('도구 +10'); }
    if (stat === 'neg' && run.flags.rescueBonus && !run.flags.rescueBonusUsed) { r += 10; parts.push('구조한 시민 +10'); }
    if (opt.confront) {
      const st = run.cs || run.fin;
      const pr = Math.min(2, (st && st.prep) || 0);
      if (pr) { r += pr * 10; parts.push('준비 +' + pr * 10); }
      if (run.interest === 'sangbeom' && !E.companionHurt() && !run.sp.warn) { r += 10; parts.push('위험 고지 +10'); }
      if (opt.extra) { r += opt.extra; parts.push(opt.extraLabel + ' +' + opt.extra); }
    }
    return { rate: Math.max(20, Math.min(90, r)), parts: parts };
  }
  function consume(stat, opt) {
    const t = tool();
    if (t && t.stat === stat) run.sp.tool = true;
    if (stat === 'neg' && run.flags.rescueBonus) run.flags.rescueBonusUsed = true;
    if (opt && opt.confront && run.interest === 'sangbeom' && !E.companionHurt()) run.sp.warn = true;
  }
  function roll(stat, diff, out, opt) {
    const info = rateFor(stat, diff, opt);
    const ok = rand() * 100 < info.rate;
    consume(stat, opt);
    out.push(chg('roll', '판정 — ' + BG.STATS[stat] + ' ' + info.rate + '%' +
      (info.parts.length ? ' (' + info.parts.join(', ') + ')' : '') + ' → ' + (ok ? '성공' : '실패')));
    return ok;
  }
  function compRate(extra) {
    const st = run.cs || run.fin;
    const pr = Math.min(2, (st && st.prep) || 0);
    let r = 45 + run.rel.trust * 10 + pr * 10 + (extra || 0);
    if (run.interest === 'sangbeom' && !run.sp.warn) r += 10;
    return Math.max(20, Math.min(90, r));
  }
  function rollComp(out, extra) {
    const r = compRate(extra);
    const ok = rand() * 100 < r;
    if (run.interest === 'sangbeom') run.sp.warn = true;
    out.push(chg('roll', '판정 — ' + comp().short + '에게 맡김 ' + r + '% (신뢰·준비 반영) → ' + (ok ? '성공' : '실패')));
    return ok;
  }
  function checkSub(stat, diff, opt) {
    const info = rateFor(stat, diff, opt);
    return BG.STATS[stat] + ' 판정 ' + info.rate + '%' + (info.parts.length ? ' (' + info.parts.join(', ') + ')' : '');
  }
  function riskText(fx) {
    if (!fx) return '';
    const m = { hp: '체력', comp: '침착', supply: '물자', crack: '균열' };
    const parts = [];
    Object.keys(m).forEach(function (k) {
      if (fx[k] && ((k === 'crack' && fx[k] > 0) || (k !== 'crack' && fx[k] < 0))) {
        parts.push(m[k] + ' ' + (fx[k] > 0 ? '+' : '') + fx[k]);
      }
    });
    return parts.join(', ');
  }

  /* ───────── 효과 적용 ───────── */
  function mitigate(k, d, out) {
    if (E.companionHurt() || run.sp.neg || !(run.cs || run.fin)) return d;
    const id = run.interest;
    if (id === 'shinbaek' && k === 'hp') {
      run.sp.neg = true;
      out.push(chg('info', '신백이 먼저 막아섰다 — 체력 피해 무효 (현장 엄호)'));
      return 0;
    }
    if (id === 'seongbaek' && k === 'comp') {
      run.sp.neg = true;
      out.push(chg('info', '성백이 숨 돌릴 틈을 만들었다 — 침착 피해 무효 (분위기 전환)'));
      return 0;
    }
    if (id === 'yunyoung') {
      run.sp.neg = true;
      out.push(chg('info', '윤영이 같이 버텼다 — 피해 절반 (함께 버티기)'));
      return Math.trunc(d / 2);
    }
    return d;
  }
  const RES_LABEL = { hp: '체력', comp: '침착', supply: '물자', crack: '균열' };
  function res(k, d, out, damage) {
    if (!d) return;
    if (d < 0 && damage && (k === 'hp' || k === 'comp')) d = mitigate(k, d, out);
    if (!d) return;
    const R = run.res;
    const max = k === 'hp' ? R.hpMax : k === 'comp' ? R.compMax : k === 'supply' ? R.supplyMax : RULES.crackEnd;
    const before = R[k];
    R[k] = Math.max(0, Math.min(max, R[k] + d));
    const real = R[k] - before;
    if (!real) return;
    out.push(chg(k === 'crack' ? 'crack' : real > 0 ? 'up' : 'down',
      RES_LABEL[k] + ' ' + (real > 0 ? '+' : '') + real + ' → ' + R[k] + (k === 'crack' ? '' : '/' + max)));
  }
  function spend(n, out) {
    if (!n) return;
    run.slots.total += n;
    run.slots.phase += n;
    const before = run.res.crack;
    run.res.crack = Math.min(RULES.crackEnd, before + n);
    out.push(chg('slot', n + '슬롯 사용 · 균열 +' + (run.res.crack - before) + ' → ' + run.res.crack));
  }
  function surge(n, out) {
    const before = run.res.crack;
    run.res.crack = Math.min(RULES.crackEnd, before + n);
    out.push(chg('crack', '겹침이 정점에 이른다 — 균열 +' + (run.res.crack - before) + ' → ' + run.res.crack));
  }
  function relChange(k, d, why, out) {
    const r = run.rel;
    const before = r[k];
    r[k] = Math.max(0, Math.min(5, r[k] + d));
    const real = r[k] - before;
    if (!real) return;
    r.log.push({ k: k, d: real, why: why || '', ch: run.chapter, phase: run.phase });
    const txt = k === 'trust'
      ? real > 0 ? cn('와') + '의 신뢰가 깊어졌다' : cn('와') + '의 신뢰가 흔들렸다'
      : real > 0 ? comp().short + '의 마음이 가까워졌다' : cn('와') + ' 사이에 거리가 생겼다';
    out.push(chg('rel', txt + (why ? ' — ' + why : '') + dbg((k === 'trust' ? '신뢰 ' : '친밀 ') + before + '→' + r[k])));
  }
  function clueDef(id) {
    const c = BG.content.cases[String(id).split('.')[0]];
    return c && c.clues[id];
  }
  E.clueDef = clueDef;
  function gainClue(id, out) {
    if (run.clues[id]) return;
    const d = clueDef(id);
    if (!d) return;
    run.clues[id] = { verified: d.type === '증언' ? null : true, ch: run.chapter, variant: run.variants[id.split('.')[0]] };
    out.push(chg('clue', '단서 기록 — ' + render(d.title) + ' [' + d.type + ']'));
  }
  function verifyClue(id, out) {
    const st = run.clues[id];
    if (!st || st.verified !== null) return false;
    const d = clueDef(id);
    st.verified = d.truth !== false;
    out.push(chg('clue', '증언 대조 — ' + render(d.title) + ': ' + (st.verified ? '확인됨' : '반증됨')));
    return true;
  }
  function unverified(caseId) {
    return Object.keys(run.clues).filter(function (id) {
      return run.clues[id].verified === null && (!caseId || id.indexOf(caseId + '.') === 0);
    });
  }
  function applyFx(fx, out, opt) {
    if (!fx) return;
    opt = opt || {};
    ['hp', 'comp', 'supply', 'crack'].forEach(function (k) { if (fx[k]) res(k, fx[k], out, opt.damage); });
    if (fx.trust) relChange('trust', fx.trust, fx.why, out);
    if (fx.intimacy) relChange('intimacy', fx.intimacy, fx.why, out);
    if (fx.flag) [].concat(fx.flag).forEach(function (f) { run.flags[f] = true; });
    if (fx.unflag) [].concat(fx.unflag).forEach(function (f) { delete run.flags[f]; });
    const rt = route();
    if (fx.promise && !run.rel.promises[fx.promise]) {
      run.rel.promises[fx.promise] = 'set';
      out.push(chg('promise', '약속을 맺었다 — ' + rt.promiseLabel));
    }
    if (fx.repromise && run.rel.promises[fx.repromise] === 'broken') {
      run.rel.promises[fx.repromise] = 'set';
      out.push(chg('promise', '약속을 다시 맺었다 — ' + rt.promiseLabel));
    }
    if (fx.keep && run.rel.promises[fx.keep] === 'set') {
      run.rel.promises[fx.keep] = 'kept';
      out.push(chg('promise', '약속을 지켰다 — ' + rt.promiseLabel));
    }
    if (fx.break && run.rel.promises[fx.break] && run.rel.promises[fx.break] !== 'broken') {
      run.rel.promises[fx.break] = 'broken';
      out.push(chg('bound', '약속이 깨졌다 — ' + rt.promiseLabel));
    }
    if (fx.milestone) {
      [].concat(fx.milestone).forEach(function (m) {
        if (run.rel.milestones[m]) return;
        run.rel.milestones[m] = true;
        out.push(chg('mile', '관계 이정표 — ' + E.LABELS.milestone[m]));
      });
    }
    if (fx.boundary) {
      [].concat(fx.boundary).forEach(function (b) {
        if (run.rel.boundaries[b] && !run.rel.boundaries[b].resolved) return;
        run.rel.boundaries[b] = { resolved: false, ch: run.chapter };
        out.push(chg('bound', '해명이 필요한 일 — ' + ((rt.boundaries || {})[b] || b)));
      });
    }
    if (fx.resolve) {
      [].concat(fx.resolve).forEach(function (b) {
        const x = run.rel.boundaries[b];
        if (!x || x.resolved) return;
        x.resolved = true;
        out.push(chg('promise', '해명했다 — ' + ((rt.boundaries || {})[b] || b)));
      });
    }
    if (fx.clue) [].concat(fx.clue).forEach(function (id) { gainClue(id, out); });
    if (fx.verify) [].concat(fx.verify).forEach(function (id) { verifyClue(id, out); });
    if (fx.verifyAny) {
      const u = unverified(run.cs ? run.cs.id : null);
      if (u.length) verifyClue(u[0], out);
    }
    if (fx.prep) {
      const st = run.cs || run.fin;
      if (st) {
        st.prep = (st.prep || 0) + fx.prep;
        out.push(chg('up', '대치 준비 +' + fx.prep + ' (현재 ' + Math.min(2, st.prep) + '/2)'));
      }
    }
    if (fx.hurt) {
      const st = run.cs || run.fin;
      if (st && !st.hurt) {
        st.hurt = true;
        out.push(chg('down', comp().short + ' 부상 · 탈진 — 이번 사건 동안 동행 보정·특기 사용 불가'));
      }
    }
    if (fx.ending) setEnding(fx.ending);
  }
  E._applyFx = function (fx) { const out = []; applyFx(fx, out); return out; };

  /* ───────── 처리 뒤 공통 검사 ───────── */
  function postResolve(out) {
    if (run.over && run.phase === 'ending') return;
    RULES.crackMarks.forEach(function (t) {
      if (run.res.crack >= t && !run.marks[t]) {
        run.marks[t] = true;
        out.push(chg('crack', '균열 ' + t + ' — ' + (t === 40 ? '장소 변형' : '최종 압박 예고')));
        out.push.apply(out, BG.content.common.crack[t]);
        res('comp', -1, out, false);
      }
    });
    if (run.res.crack >= RULES.crackEnd) {
      endEarly('isolated', out);
      return;
    }
    if (run.res.hp <= 0 || run.res.comp <= 0) {
      if (E.canRescue()) doRescue(out);
      else endEarly('collapse', out);
    }
  }
  function doRescue(out) {
    run.rescueUsed = true;
    out.push('---');
    out.push.apply(out, route().rescue);
    if (run.res.hp <= 0) res('hp', 2 - run.res.hp, out);
    if (run.res.comp <= 0) res('comp', 2 - run.res.comp, out);
    const before = run.res.crack;
    run.res.crack = Math.min(RULES.crackEnd, before + RULES.rescueCrack);
    out.push(chg('crack', '구조의 대가 — 균열 +' + (run.res.crack - before) + ' → ' + run.res.crack));
    applyFx({ hurt: true }, out);
    out.push(chg('info', '구조 기회를 사용했다 (한 판에 1회)'));
    if (run.res.crack >= RULES.crackEnd) endEarly('isolated', out);
  }
  function earlyRel() {
    const r = run.rel;
    if (Object.keys(r.boundaries).some(function (b) { return !r.boundaries[b].resolved; }) && r.trust < 2) return 'distance';
    if (r.milestones.emotionReveal && r.intimacy >= 3) return 'apart';
    return 'colleague';
  }
  function endEarly(type, out) {
    if (run.over) return;
    run.over = { type: type, rel: earlyRel(), at: run.phase, chapter: run.chapter };
    if (run.cs && !run.cs.recorded) {
      run.cs.recorded = true;
      const d = caseDef();
      run.results.push({ id: d.id, no: d.no, title: d.title, variant: run.variants[d.id], outcome: type });
    }
    if (run.fin && !run.fin.outcome) run.fin.outcome = type;
    run.phase = 'ending';
    run.queue = [{ id: 'common.early.' + type, opts: { append: route().early } }];
    out.push('---');
    out.push(chg('bound', type === 'isolated' ? '균열 100 — 겹침에 휩쓸렸다. 조사가 끝난다.' : '체력 또는 침착 0 — 더는 버틸 수 없다. 조사가 끝난다.'));
  }
  function setEnding(kind) {
    run.over = run.over || { type: 'complete' };
    if (kind === 'lovers' && !(run.rel.milestones.mutualConfession && run.rel.milestones.coupleAgreement)) kind = 'apart';
    run.over.rel = kind;
    run.phase = 'ending';
    run.queue.unshift({ id: run.interest + '.end.' + kind });
  }

  /* ───────── 보기(view) ───────── */
  function openScene(id, opts) {
    const sc = BG.content.scenes[id];
    if (!sc) throw new Error('장면 없음: ' + id);
    let src = sc.text || [];
    if (opts && opts.prepend) src = opts.prepend.concat(src);
    if (opts && opts.append) src = src.concat(opts.append);
    const pages = buildPages(src);
    if (!pages[0].length) pages[0].push({ k: 'narr', text: '…' });
    markMet(pages);
    run.view = { kind: 'scene', id: id, pages: pages, page: 0, title: sc.title ? render(sc.title) : null };
    if (sc.fx) applyFx(sc.fx, []);
  }
  function openResult(parts, title) {
    const pages = buildPages(parts);
    markMet(pages);
    run.view = { kind: 'result', pages: pages, page: 0, title: title || null };
  }
  function openPanel(kind, parts, title) {
    run.view = { kind: kind, pages: buildPages(parts), page: 0, title: title || null };
  }

  E.view = function () { return run ? run.view : null; };
  E.header = function () {
    if (!run) return null;
    const d = caseDef();
    const h = { phase: run.phase, slotsPhase: run.slots.phase, slotsMax: run.slots.phaseMax, total: run.slots.total };
    if (run.phase === 'case' && d) {
      h.label = '사건 ' + (run.chapter + 1) + '/4';
      h.code = d.no;
      h.title = d.title;
      h.question = d.question;
    } else if (run.phase === 'interlude' && run.il) {
      h.label = '막간 ' + (run.il.n + 1) + '/3';
      h.title = '숨 고르는 시간';
    } else if (run.phase === 'final' || run.phase === 'confession') {
      h.label = '최종';
      h.title = '최종 겹침';
    } else if (run.phase === 'prologue') {
      h.label = '서장';
      h.title = '첫 기록';
    } else {
      h.label = '귀환 기록';
      h.title = '조사 종료';
    }
    return h;
  };

  /* ───────── 진행 ───────── */
  function resume() {
    if (run.queue.length) {
      const q = run.queue.shift();
      openScene(q.id, q.opts);
      return;
    }
    switch (run.phase) {
      case 'prologue': startCase(0); break;
      case 'case': caseResume(); break;
      case 'interlude': interludeResume(); break;
      case 'final': openFinalHub(); break;
      case 'confession':
        setEnding(earlyRel());
        resume();
        break;
      case 'ending': default: openSummary(); break;
    }
  }

  /* ───── 사건 ───── */
  function startCase(i) {
    const id = run.order[i];
    const d = BG.content.cases[id];
    run.phase = 'case';
    run.chapter = i;
    run.il = null;
    run.cs = {
      id: id, step: 'intro', inv: 0, count: 0, done: {}, prep: run.carryPrep || 0,
      hurt: false, scene: false, rule: null, turn: 0, outcome: null, rescued: false,
    };
    run.carryPrep = 0;
    run.sp = freshSp();
    run.slots.phase = 0;
    run.slots.phaseMax = RULES.caseInv + RULES.caseConclude;
    run.queue.push({ id: id + '.intro' });
    if (d.owner === run.interest) run.queue.push({ id: run.interest + '.meet' });
    else run.queue.push({ id: id + '.ownerIntro', opts: { append: (d.greet && d.greet[run.interest]) || [] } });
    resume();
  }
  function stageScene() { return run.interest + '.c' + (run.chapter + 1); }

  function caseResume() {
    const cs = run.cs;
    if (cs.step === 'intro') cs.step = 'hub';
    if (cs.step === 'hub') {
      if (!cs.scene && cs.count >= 3) { cs.scene = true; openScene(stageScene()); return; }
      if (cs.inv >= RULES.caseInv) cs.step = 'conclude';
      else { openHub(); return; }
    }
    if (cs.step === 'conclude') {
      if (!cs.scene) { cs.scene = true; openScene(stageScene()); return; }
      openConclude();
      return;
    }
    if (cs.step === 'confront') { openConfront(); return; }
    if (cs.step === 'outro') {
      const d = caseDef();
      cs.step = 'record';
      run.queue.push({ id: d.id + '.outro.' + cs.outcome, opts: { append: (route().reactions || {})[cs.outcome] } });
      resume();
      return;
    }
    if (cs.step === 'record') { recordCase(); return; }
    if (cs.step === 'done') {
      if (run.chapter < 3) startInterlude(run.chapter);
      else startFinal();
    }
  }

  function recordCase() {
    const cs = run.cs;
    const d = caseDef();
    const out = [];
    out.push('# 사건 기록 — ' + d.no + ' ' + d.title);
    out.push({ k: 'stamp', text: E.LABELS.outcome[cs.outcome], tone: cs.outcome });
    out.push(chg('info', '사건 결과: ' + E.LABELS.outcome[cs.outcome] + ' · 변형 ' + run.variants[d.id]));
    if (cs.outcome === 'stable') {
      out.push('현장은 조용해졌다. 남은 물건 가운데 쓸 만한 것을 챙긴다.');
      res('supply', 1, out);
    } else if (cs.outcome === 'temp') {
      out.push('봉합한 자리가 계속 당긴다. 다음 겹침에서 이 틈이 조금 더 벌어질 것이다.');
      const b = run.res.crack;
      run.res.crack = Math.min(RULES.crackEnd, b + 2);
      out.push(chg('crack', '균열 +' + (run.res.crack - b) + ' → ' + run.res.crack));
    } else if (cs.outcome === 'retreat') {
      out.push('살아서 나왔다. 그래도 그 안에 두고 온 것이 마음에 걸린다.');
      res('comp', -1, out);
    }
    if (cs.rescued) {
      run.flags.rescueBonus = true;
      run.flags.rescueBonusUsed = false;
      out.push(chg('info', '구조한 사람들이 다음 사건의 증언을 돕는다 — 다음 교섭 판정 1회 +10'));
    }
    if (!cs.recorded) {
      cs.recorded = true;
      run.results.push({ id: d.id, no: d.no, title: d.title, variant: run.variants[d.id], outcome: cs.outcome, rule: cs.rule && cs.rule.id });
    }
    run.history.push(d.id + '.done');
    cs.step = 'done';
    postResolve(out);
    openResult(out, '사건 기록');
  }

  function openHub() {
    const d = caseDef();
    const cs = run.cs;
    const parts = ['# 조사 — ' + d.place];
    parts.push('※ 이 사건의 질문: ' + d.question);
    parts.push('※ 남은 조사 슬롯 ' + (RULES.caseInv - cs.inv) + '/' + RULES.caseInv + ' · 결론 2슬롯은 따로 예약되어 있다.');
    if (run.marks[40]) parts.push(d.distort || '! 공간이 조금씩 어긋나 있다. 같은 문이 두 번째로 보인다.');
    if (cs.hurt) parts.push('! ' + comp().short + '는 부상으로 지쳐 있다. 이번 사건에서는 동행 보정과 특기를 쓸 수 없다.');
    parts.push(cs.count === 0 ? d.hubFirst || '어디서부터 볼지 정해야 한다.' : d.hubMore || '다음으로 무엇을 확인할까.');
    openPanel('hub', parts);
  }

  function actionAvailable(a) {
    const cs = run.cs;
    const d = caseDef();
    if (cs.done[a.id] && a.once !== false) return { show: false };
    if (a.ownerOnly && d.owner === run.interest) return { show: false };
    if (a.interest && [].concat(a.interest).indexOf(run.interest) < 0) return { show: false };
    if (a.req && !BG.cond(a.req, run)) return { show: !!a.showLocked, ok: false, why: a.lockedWhy || '아직 조건이 맞지 않는다' };
    if ((a.slots || 1) > RULES.caseInv - cs.inv) return { show: true, ok: false, why: '남은 조사 슬롯이 부족하다' };
    if (a.supply && run.res.supply < a.supply) return { show: true, ok: false, why: '물자가 부족하다' };
    return { show: true, ok: true };
  }
  function hubOptions() {
    const d = caseDef();
    const cs = run.cs;
    const opts = [];
    d.actions.forEach(function (a) {
      const av = actionAvailable(a);
      if (!av.show) return;
      let sub = (a.slots || 1) + '슬롯';
      if (a.supply) sub += ' · 물자 ' + a.supply;
      if (a.cost && a.cost.crack) sub += ' · 위험 접근 균열 +' + a.cost.crack;
      if (a.stat) {
        sub += ' · ' + checkSub(a.stat, a.diff || 2);
        const rt = riskText(a.ngFx);
        if (rt) sub += ' · 실패 시 ' + rt;
      } else sub += ' · 확정';
      if (a.tag) sub += ' · ' + a.tag;
      opts.push({ id: 'a:' + a.id, kind: 'action', label: render(a.label), desc: a.desc ? render(a.desc) : '', sub: sub, enabled: av.ok, reason: av.why || '' });
    });
    const left = RULES.caseInv - cs.inv;
    if (!cs.done.collab) {
      opts.push({
        id: 'g:collab', kind: 'action', label: cn('와') + ' 역할을 맞춘다',
        desc: comp().spec.name + ' — ' + comp().spec.desc,
        sub: '1슬롯 · 확정 · 대치 준비 +1',
        enabled: left >= 1 && !cs.hurt, reason: cs.hurt ? comp().short + '는 지금 움직이기 어렵다' : left < 1 ? '남은 조사 슬롯이 부족하다' : '',
      });
    }
    if (!cs.done.breathe) {
      opts.push({ id: 'g:breathe', kind: 'action', label: '숨을 고른다', sub: '1슬롯 · 확정 · 침착 +2 (사건마다 1회)', enabled: left >= 1 && run.res.comp < run.res.compMax, reason: left < 1 ? '남은 조사 슬롯이 부족하다' : '침착이 이미 가득하다' });
    }
    const kitFree = run.items[0] === 'kit' && !cs.done.kit;
    opts.push({
      id: 'g:aid', kind: 'action', label: '응급 처치를 한다',
      sub: '1슬롯 · ' + (kitFree ? '응급 물품 사용(물자 소모 없음)' : '물자 1') + ' · 체력 +3',
      enabled: left >= 1 && (kitFree || run.res.supply >= 1) && run.res.hp < run.res.hpMax,
      reason: left < 1 ? '남은 조사 슬롯이 부족하다' : run.res.hp >= run.res.hpMax ? '체력이 이미 가득하다' : '물자가 부족하다',
    });
    opts.push({
      id: 'g:conclude', kind: 'move', label: '결론으로 넘어간다',
      sub: left > 0 ? '비용 없음 · 남은 조사 슬롯 ' + left + '개를 쓰지 않는다' : '비용 없음',
      enabled: true, confirm: left > 0 ? '남은 조사 슬롯 ' + left + '개를 쓰지 않고 결론으로 넘어갈까요?' : null,
    });
    return opts;
  }

  function doAction(a) {
    const cs = run.cs;
    const out = [];
    out.push.apply(out, a.text || []);
    if (a.supply) res('supply', -a.supply, out);
    if (a.cost) applyFx(a.cost, out);
    let ok = true;
    if (a.stat) {
      ok = roll(a.stat, a.diff || 2, out);
      out.push.apply(out, (ok ? a.ok : a.ng) || []);
      applyFx(ok ? a.okFx : a.ngFx, out, { damage: !ok });
    } else {
      out.push.apply(out, a.ok || []);
      applyFx(a.fx, out);
    }
    if (a.rescue && ok) cs.rescued = true;
    spend(a.slots || 1, out);
    cs.done[a.id] = true;
    cs.inv += a.slots || 1;
    cs.count += 1;
    run.history.push(cs.id + '.' + a.id);
    postResolve(out);
    openResult(out, render(a.label));
  }

  function doGeneric(id) {
    const cs = run.cs;
    const out = [];
    if (id === 'conclude') {
      cs.step = 'conclude';
      caseResume();
      return;
    }
    if (id === 'collab') {
      out.push.apply(out, route().collab);
      applyFx({ prep: 1 }, out);
      if (run.interest === 'gukse') applyFx({ verifyAny: true }, out);
      if (!run.flags.collabTrust) {
        run.flags.collabTrust = true;
        applyFx({ trust: 1, why: '역할을 함께 맞춤' }, out);
      }
      cs.done.collab = true;
    } else if (id === 'breathe') {
      out.push('벽에 등을 대고 숨을 센다. 넷까지 들이쉬고, 여섯까지 내쉰다. 손끝의 떨림이 조금 가라앉는다.');
      res('comp', 2, out);
      cs.done.breathe = true;
    } else if (id === 'aid') {
      out.push('상처를 씻고 단단히 감는다. 아픈 곳을 아프다고 확인하는 것도 조사의 일부다.');
      if (run.items[0] === 'kit' && !cs.done.kit) {
        cs.done.kit = true;
        out.push(chg('info', '챙겨 온 응급 물품을 썼다 (사건마다 1회)'));
      } else res('supply', -1, out);
      res('hp', 3, out);
    }
    spend(1, out);
    cs.inv += 1;
    cs.count += 1;
    postResolve(out);
    openResult(out, id === 'collab' ? '역할 맞추기' : id === 'breathe' ? '숨 고르기' : '응급 처치');
  }

  function openConclude() {
    const d = caseDef();
    const parts = ['# 규칙 대조 — ' + d.title];
    parts.push('※ 핵심 사실 두 개를 모두 확보했다면 안전한 해결을 고를 수 있다. 부족하면 대가가 큰 임시 봉합이나 철수를 고른다.');
    parts.push('※ 남은 슬롯 2 — 규칙 확정 1, 대치 1. 규칙을 정하면 겹침이 정점에 이른다(균열 +' + RULES.caseSurge + ').');
    const held = Object.keys(d.clues).filter(function (id) { return run.clues[id]; });
    if (!held.length) parts.push('! 확보한 사실이 없다.');
    held.forEach(function (id) {
      const c = d.clues[id];
      const st = run.clues[id];
      parts.push({
        k: 'clue', title: render(c.title), type: c.type, core: !!c.core,
        status: st.verified === null ? '미확인' : st.verified ? '확인됨' : '반증됨',
        text: render(c.text) + (st.verified === false && c.refuted ? ' — ' + render(c.refuted) : ''),
      });
    });
    openPanel('conclude', parts);
  }
  function concludeOptions() {
    const d = caseDef();
    const v = run.variants[d.id];
    const opts = [];
    d.rules.forEach(function (r) {
      let enabled = true, why = '', sub = '1슬롯';
      if (r.kind === 'safe') {
        const have = r.uses.map(function (id) { return !!run.clues[id]; });
        sub += ' · 근거: ' + r.uses.map(function (id, i) {
          return render(d.clues[id].title) + (have[i] ? ' ✓' : ' ✗');
        }).join(' + ');
        if (!have.every(Boolean)) { enabled = false; why = '필요한 사실을 모두 확보하지 못했다'; }
        else if (r.correct && r.correct !== v) sub += ' · ▲ 확보한 사실과 충돌한다';
      } else if (r.kind === 'temp') {
        sub += ' · 임시 봉합 — 대치에 성공해도 결과는 임시 봉합';
      } else {
        sub += ' · 근거 불충분';
        if (r.contra && run.clues[r.contra]) sub += ' · ▲ 확보한 사실(' + render(d.clues[r.contra].title) + ')과 충돌한다';
        else if (r.supportedBy && run.clues[r.supportedBy]) sub += ' · 증언에 근거함';
      }
      opts.push({ id: 'r:' + r.id, kind: 'rule', label: render(r.label), sub: sub + ' · 정점 균열 +' + RULES.caseSurge, enabled: enabled, reason: why });
    });
    opts.push({ id: 'r:retreat', kind: 'rule', label: '여기서 철수한다', sub: '1슬롯 · 사건 결과: 철수 · 침착 -1', enabled: true });
    return opts;
  }
  function doRule(id) {
    const d = caseDef();
    const cs = run.cs;
    const out = [];
    if (id === 'retreat') {
      out.push.apply(out, d.confront.retreat);
      spend(1, out);
      cs.outcome = 'retreat';
      cs.step = 'outro';
      postResolve(out);
      openResult(out, '철수');
      return;
    }
    const r = d.rules.filter(function (x) { return x.id === id; })[0];
    const v = run.variants[d.id];
    const correct = r.kind === 'safe' && (!r.correct || r.correct === v);
    cs.rule = { id: r.id, kind: r.kind, correct: correct };
    cs.turn = 1;
    out.push('※ 정한 규칙 — ' + r.label);
    out.push.apply(out, r.say || []);
    spend(1, out);
    surge(RULES.caseSurge, out);
    cs.step = 'confront';
    postResolve(out);
    openResult(out, '규칙 확정');
  }
  function openConfront() {
    const d = caseDef();
    const cs = run.cs;
    const parts = ['# 대치 — ' + cs.turn + '턴 / 최대 2턴'];
    parts.push('! ' + (cs.turn === 1 ? d.confront.threat : d.confront.turn2));
    parts.push('※ 정한 규칙 — ' + render(d.rules.filter(function (x) { return x.id === cs.rule.id; })[0].label));
    if (cs.turn === 2) parts.push('※ 2턴째는 슬롯을 쓰지 않지만 균열 +2. 실패하면 거친 임시 봉합으로 끝난다.');
    openPanel('confront', parts);
  }
  function confrontOptions() {
    const d = caseDef();
    const cs = run.cs;
    const cf = d.confront;
    const opts = [];
    const ruleDiff = cs.rule.kind === 'temp' ? 2 : 3;
    const fail = riskText(cf.ngFx);
    opts.push({
      id: 't:rule', kind: 'confront', label: render(cf.ruleLabel || '정한 규칙대로 움직인다'),
      sub: cs.rule.correct ? '확정 성공 — 두 사실이 이 행동을 뒷받침한다' : checkSub(cf.stat, ruleDiff, { confront: true }) + ' · 실패 시 ' + fail,
      enabled: true,
    });
    opts.push({
      id: 't:direct', kind: 'confront', label: render(cf.directLabel),
      sub: checkSub(cf.directStat, 2, { confront: true }) + ' · 실패 시 ' + fail, enabled: true,
    });
    opts.push({
      id: 't:comp', kind: 'confront', label: cn('에게') + ' 맡긴다',
      sub: '동행 판정 ' + compRate() + '% · 실패 시 ' + fail,
      enabled: !cs.hurt, reason: cs.hurt ? comp().short + '는 부상으로 움직일 수 없다' : '',
    });
    opts.push({ id: 't:retreat', kind: 'confront', label: '탈출한다', sub: '확정 · 사건 결과: 철수', enabled: true });
    return opts;
  }
  function doTurn(o) {
    const d = caseDef();
    const cs = run.cs;
    const cf = d.confront;
    const out = [];
    if (cs.turn === 1) spend(1, out);
    else {
      const b = run.res.crack;
      run.res.crack = Math.min(RULES.crackEnd, b + 2);
      out.push(chg('crack', '2턴째 — 균열 +' + (run.res.crack - b) + ' → ' + run.res.crack));
    }
    if (o === 'retreat') {
      out.push.apply(out, cf.retreat);
      cs.outcome = 'retreat';
      cs.step = 'outro';
      postResolve(out);
      openResult(out, '탈출');
      return;
    }
    let ok;
    if (o === 'rule') {
      if (cs.rule.correct) {
        ok = true;
        out.push(chg('roll', '판정 없음 — 확보한 사실로 확정된 해결'));
      } else ok = roll(cf.stat, cs.rule.kind === 'temp' ? 2 : 3, out, { confront: true });
    } else if (o === 'direct') ok = roll(cf.directStat, 2, out, { confront: true });
    else ok = rollComp(out);
    if (ok) {
      if (o === 'rule' && cs.rule.correct) out.push.apply(out, cf.rule);
      else if (o === 'comp') out.push.apply(out, route().confrontComp);
      else out.push.apply(out, cf.ok);
      if (o === 'comp' && !run.flags.reliedOnce) {
        run.flags.reliedOnce = true;
        applyFx({ trust: 1, why: '위기를 믿고 맡김' }, out);
      }
      cs.outcome = cs.rule.correct ? 'stable' : 'temp';
      if (!cs.rule.correct) out.push(chg('info', '정한 규칙이 현상의 기준과 맞지 않았다 — 결과는 임시 봉합'));
      cs.step = 'outro';
    } else {
      out.push.apply(out, cf.ng);
      applyFx(cf.ngFx, out, { damage: true });
      if (cs.turn === 1 && !run.over) {
        cs.turn = 2;
      } else if (!run.over) {
        out.push.apply(out, cf.forced);
        applyFx({ hp: -1, comp: -1, crack: 3 }, out, { damage: true });
        cs.outcome = 'temp';
        cs.step = 'outro';
      }
    }
    postResolve(out);
    openResult(out, '대치');
  }

  /* ───── 막간 ───── */
  function startInterlude(n) {
    run.phase = 'interlude';
    run.cs = null;
    run.il = { n: n, used: 0, done: {}, rest: { hp: 0, comp: 0 } };
    run.slots.phase = 0;
    run.slots.phaseMax = RULES.interlude;
    run.queue.push({ id: 'common.interlude.' + (n + 1), opts: { append: (route().interlude || {})[n + 1] } });
    resume();
  }
  function interludeResume() {
    if (run.il.ended) { endInterlude(); return; }
    if (run.il.used >= RULES.interlude) { endInterlude(); return; }
    const parts = ['# 막간 ' + (run.il.n + 1) + ' — 남은 시간 ' + (RULES.interlude - run.il.used) + '/' + RULES.interlude];
    parts.push('※ 막간의 행동도 슬롯을 쓰고 균열이 1씩 오른다. 회복과 대화, 준비 사이에서 고른다.');
    parts.push(BG.content.common.interludeHub[run.il.n]);
    openPanel('interlude', parts);
  }
  function interludeOptions() {
    const il = run.il;
    const opts = [];
    const R = run.res;
    const nm = comp().short;
    opts.push({ id: 'i:resthp', label: '눈을 붙인다 — 체력', sub: '1슬롯 · 체력 +' + (il.rest.hp ? 1 : 2), enabled: R.hp < R.hpMax, reason: '체력이 이미 가득하다' });
    opts.push({ id: 'i:restcomp', label: '조용히 쉰다 — 침착', sub: '1슬롯 · 침착 +' + (il.rest.comp ? 1 : 2), enabled: R.comp < R.compMax, reason: '침착이 이미 가득하다' });
    opts.push({ id: 'i:aid', label: '상처를 제대로 치료한다', sub: '1슬롯 · 물자 1 · 체력 +3', enabled: R.supply >= 1 && R.hp < R.hpMax, reason: R.supply < 1 ? '물자가 부족하다' : '체력이 이미 가득하다' });
    if (!il.done.talk) opts.push({ id: 'i:talk', label: BG.josa(nm, '와') + ' 이야기한다', sub: '1슬롯 · 개인 대화', enabled: true });
    if (!il.done.promise) opts.push({ id: 'i:promise', label: '약속과 역할을 점검한다', sub: '1슬롯 · 대화 · ' + route().promiseLabel, enabled: true });
    if (!il.done.notes) opts.push({ id: 'i:notes', label: '기록을 정리한다', sub: '1슬롯 · 다음 사건 대치 준비 +1 · 미확인 증언 1건 대조', enabled: true });
    if (!il.done.supply) opts.push({ id: 'i:supply', label: '편의점에서 물자를 채운다', sub: '1슬롯 · 물자 +1', enabled: R.supply < R.supplyMax, reason: '물자가 이미 가득하다' });
    const left = RULES.interlude - il.used;
    opts.push({ id: 'i:leave', kind: 'move', label: '다음 사건으로 간다', sub: left ? '비용 없음 · 남은 막간 슬롯 ' + left + '개를 쓰지 않는다' : '비용 없음', enabled: true, confirm: left ? '남은 막간 슬롯 ' + left + '개를 쓰지 않고 출발할까요?' : null });
    return opts;
  }
  function doInterlude(id) {
    const il = run.il;
    const out = [];
    const C = BG.content.common;
    if (id === 'leave') { il.ended = true; endInterlude(); return; }
    if (id === 'talk' || id === 'promise') {
      il.done[id] = true;
      spend(1, out);
      il.used += 1;
      run.queue.unshift({ id: id === 'talk' ? run.interest + '.il' + (il.n + 1) : run.interest + '.promise' });
      postResolve(out);
      if (out.length > 1 || run.over) openResult(out);
      else resume();
      return;
    }
    if (id === 'resthp') { out.push.apply(out, C.rest.hp); res('hp', il.rest.hp ? 1 : 2, out); il.rest.hp += 1; }
    else if (id === 'restcomp') { out.push.apply(out, C.rest.comp); res('comp', il.rest.comp ? 1 : 2, out); il.rest.comp += 1; }
    else if (id === 'aid') { out.push.apply(out, C.rest.aid); res('supply', -1, out); res('hp', 3, out); }
    else if (id === 'notes') {
      il.done.notes = true;
      out.push.apply(out, C.rest.notes);
      run.carryPrep = 1;
      out.push(chg('up', '다음 사건 대치 준비 +1'));
      const u = unverified(null);
      if (u.length) verifyClue(u[0], out);
    } else if (id === 'supply') {
      il.done.supply = true;
      out.push.apply(out, C.rest.supply);
      res('supply', 1, out);
    }
    spend(1, out);
    il.used += 1;
    postResolve(out);
    openResult(out, '막간');
  }
  function endInterlude() {
    const n = run.il.n;
    run.il = null;
    startCase(n + 1);
  }

  /* ───── 최종 겹침 ───── */
  function startFinal() {
    run.phase = 'final';
    run.cs = null;
    run.chapter = 4;
    run.fin = { step: 0, links: [], basis: 0, method: null, turn: 0, wins: 0, hurt: false, prep: run.carryPrep || 0, outcome: null };
    run.carryPrep = 0;
    run.sp = freshSp();
    run.slots.phase = 0;
    run.slots.phaseMax = RULES.final;
    run.queue.push({ id: 'common.final.intro', opts: { append: route().finalIntro } });
    resume();
  }
  function finalThreat(turn) {
    if (turn === 1) {
      const m = run.results.map(function (x) { return BG.content.cases[x.id].motif; }).join(', ');
      return '네 사건의 소리가 한꺼번에 겹친다 — ' + m + '. 다음 소리가 겹치는 순간 발밑의 길이 지워진다.';
    }
    if (turn === 2) return '바닥이 날짜로 갈라진다. 오늘과 내일 사이, 디딜 칸이 하나씩 사라진다.';
    return '마지막 출구가 닫히기 시작한다. 문틈으로 첫 사건의 공기가 새어 나온다.';
  }
  function openFinalHub() {
    const f = run.fin;
    const parts = [];
    if (f.step <= 1) {
      parts.push('# 최종 겹침 — 기록 대조 ' + (f.step + 1) + '/2');
      parts.push('※ 네 사건의 기록 가운데 둘을 이어 귀환의 근거를 만든다. 안정화한 기록은 단단하고, 봉합하거나 놓고 온 기록은 흔들린다.');
      parts.push('※ 현재 근거 ' + f.basis + ' · ‘정확한 규칙 확인’에는 근거 2가 필요하다.');
    } else if (f.step === 2) {
      parts.push('# 최종 겹침 — 귀환 방식');
      parts.push('※ 근거 ' + f.basis + ' · 신뢰 상태: ' + E.relLabels().trust);
      parts.push('어떤 방식으로 돌아갈지 정해야 한다. 방식에 따라 대치에서 기대는 힘이 달라진다.');
    } else if (f.step === 3) {
      parts.push('# 최종 겹침 — 역할 합의');
      parts.push(cn('이') + ' 당신을 본다. 마지막 길을 누가 어떻게 맡을지, 지금 정해야 한다.');
    } else if (f.step === 4) {
      parts.push('# 최종 겹침 — 마지막 준비');
      parts.push('※ 대치 전에 한 번 더 몸과 마음을 정비할 수 있다. 준비를 마치면 겹침이 정점에 이른다(균열 +' + RULES.finalSurge + ').');
    } else {
      const need = f.method === 'safe' ? 1 : 2;
      parts.push('# 최종 대치 — ' + f.turn + '턴 / 최대 3턴 · 성공 ' + f.wins + '/' + need);
      parts.push('! ' + finalThreat(f.turn));
      if (run.marks[70] && f.turn === 1) parts.push('! 최종 압박 — 첫 실패의 피해가 1 더 커진다.');
      parts.push('※ 귀환 방식 — ' + { precise: '정확한 규칙 확인', together: '협력 확보', safe: '안전한 귀환' }[f.method]);
    }
    openPanel('final', parts);
  }
  function finalOptions() {
    const f = run.fin;
    const R = run.res;
    const nm = comp().short;
    const opts = [];
    if (f.step <= 1) {
      run.results.forEach(function (x, i) {
        const eff = x.outcome === 'stable' ? '근거 +1' : x.outcome === 'temp' ? '근거 없음 · 침착 -1' : '근거 없음 · 균열 +2';
        opts.push({ id: 'f:link:' + i, label: x.no + ' ‘' + x.title + '’의 기록을 잇는다', sub: '1슬롯 · ' + E.LABELS.outcome[x.outcome] + ' — ' + eff, enabled: f.links.indexOf(i) < 0, reason: '이미 이은 기록이다' });
      });
    } else if (f.step === 2) {
      opts.push({ id: 'f:m:precise', label: '정확한 규칙 확인 — 기록이 가리키는 출구로 간다', sub: '1슬롯 · 대치: 관찰·기록 중 높은 능력 +10 · 2회 성공 시 안정화', enabled: f.basis >= 2, reason: '이은 기록의 근거가 2에 미치지 못한다' });
      opts.push({ id: 'f:m:together', label: '협력 확보 — ' + BG.josa(nm, '와') + ' 함께 길을 연다', sub: '1슬롯 · 대치: 함께 버티기 +20 · 2회 성공 시 안정화', enabled: run.rel.trust >= 3 && !f.hurt, reason: f.hurt ? nm + '는 부상 중이다' : '신뢰가 ‘함께 판단함’에 이르지 못했다' });
      opts.push({ id: 'f:m:safe', label: '안전한 귀환 — 출구만 확보한다', sub: '1슬롯 · 대치 1회 성공으로 귀환 · 결과는 임시 봉합', enabled: true });
    } else if (f.step === 3) {
      opts.push({ id: 'f:pact', label: BG.josa(nm, '와') + ' 마지막 역할을 정한다', sub: '1슬롯 · 대화', enabled: true });
    } else if (f.step === 4) {
      opts.push({ id: 'f:p:hp', label: '숨을 고르고 상처를 살핀다 — 체력', sub: '1슬롯 · 체력 +2', enabled: R.hp < R.hpMax, reason: '체력이 이미 가득하다' });
      opts.push({ id: 'f:p:comp', label: '눈을 감고 지금을 센다 — 침착', sub: '1슬롯 · 침착 +2', enabled: R.comp < R.compMax, reason: '침착이 이미 가득하다' });
      opts.push({ id: 'f:p:aid', label: '마지막 응급 처치', sub: '1슬롯 · 물자 1 · 체력 +3', enabled: R.supply >= 1 && R.hp < R.hpMax, reason: R.supply < 1 ? '물자가 부족하다' : '체력이 이미 가득하다' });
      opts.push({ id: 'f:p:prep', label: '출구까지의 동선을 맞춘다', sub: '1슬롯 · 물자 1 · 대치 준비 +1', enabled: R.supply >= 1, reason: '물자가 부족하다' });
    } else {
      const fail = riskText(finalFailFx(f.turn));
      const best = statVal('obs') >= statVal('rec') ? 'obs' : 'rec';
      const precise = f.method === 'precise';
      opts.push({ id: 'f:t:rule', label: '기록이 가리키는 대로 움직인다', sub: checkSub(best, precise ? 2 : 3, { confront: true, extra: precise ? 10 : 0, extraLabel: '정확한 규칙' }) + ' · 실패 시 ' + fail, enabled: true });
      opts.push({ id: 'f:t:comp', label: BG.josa(nm, '와') + ' 함께 버틴다', sub: '동행 판정 ' + compRate(f.method === 'together' ? 20 : 0) + '% · 실패 시 ' + fail, enabled: !f.hurt, reason: nm + '는 부상으로 움직일 수 없다' });
      opts.push({ id: 'f:t:direct', label: '직접 길을 연다', sub: checkSub('act', 2, { confront: true }) + ' · 실패 시 ' + fail, enabled: true });
      opts.push({ id: 'f:t:retreat', label: '철수한다', sub: '확정 · 최종 결과: 철수', enabled: true });
    }
    return opts;
  }
  function finalFailFx(turn) {
    if (turn === 1) return { comp: run.marks[70] ? -3 : -2, crack: 2 };
    if (turn === 2) return { hp: -2, crack: 2 };
    return { hp: -1, comp: -1, crack: 2 };
  }
  function doFinal(id) {
    const f = run.fin;
    const out = [];
    const C = BG.content.common.final;
    const p = id.split(':');
    if (p[1] === 'link') {
      const i = +p[2];
      const x = run.results[i];
      f.links.push(i);
      out.push(C.link[x.outcome].replace('{case}', x.title));
      if (x.outcome === 'stable') { f.basis += 1; out.push(chg('up', '귀환 근거 +1 → ' + f.basis)); }
      else if (x.outcome === 'temp') res('comp', -1, out);
      else {
        const b = run.res.crack;
        run.res.crack = Math.min(RULES.crackEnd, b + 2);
        out.push(chg('crack', '균열 +' + (run.res.crack - b) + ' → ' + run.res.crack));
      }
      spend(1, out);
      f.step += 1;
    } else if (p[1] === 'm') {
      f.method = p[2];
      out.push.apply(out, C.method[p[2]]);
      spend(1, out);
      f.step = 3;
    } else if (p[1] === 'pact') {
      spend(1, out);
      f.step = 4;
      run.queue.unshift({ id: run.interest + '.finalPact' });
      postResolve(out);
      if (out.length > 1 || run.over) openResult(out);
      else resume();
      return;
    } else if (p[1] === 'p') {
      if (p[2] === 'hp') { out.push(C.prep.hp); res('hp', 2, out); }
      else if (p[2] === 'comp') { out.push(C.prep.comp); res('comp', 2, out); }
      else if (p[2] === 'aid') { out.push(C.prep.aid); res('supply', -1, out); res('hp', 3, out); }
      else { out.push(C.prep.prep); res('supply', -1, out); applyFx({ prep: 1 }, out); }
      spend(1, out);
      surge(RULES.finalSurge, out);
      f.step = 5;
      f.turn = 1;
    } else if (p[1] === 't') {
      spend(1, out);
      if (p[2] === 'retreat') {
        out.push.apply(out, C.retreat);
        finishFinal('retreat', out);
        return;
      }
      let ok;
      if (p[2] === 'rule') {
        const best = statVal('obs') >= statVal('rec') ? 'obs' : 'rec';
        ok = f.method === 'precise'
          ? roll(best, 2, out, { confront: true, extra: 10, extraLabel: '정확한 규칙' })
          : roll(best, 3, out, { confront: true });
      } else if (p[2] === 'comp') ok = rollComp(out, f.method === 'together' ? 20 : 0);
      else ok = roll('act', 2, out, { confront: true });
      if (ok) {
        f.wins += 1;
        out.push(p[2] === 'comp' ? route().finalComp[Math.min(f.wins, 2) - 1] : C.win[Math.min(f.wins, 2) - 1]);
      } else {
        out.push(C.lose[f.turn - 1]);
        applyFx(finalFailFx(f.turn), out, { damage: true });
      }
      postResolve(out);
      if (run.over) { openResult(out, '최종 대치'); return; }
      const need = f.method === 'safe' ? 1 : 2;
      if (f.wins >= need) { finishFinal(f.method === 'safe' ? 'temp' : 'stable', out); return; }
      if (f.turn >= 3) {
        out.push.apply(out, C.forced);
        applyFx({ hp: -1, comp: -1, crack: 3 }, out, { damage: true });
        postResolve(out);
        if (run.over) { openResult(out, '최종 대치'); return; }
        finishFinal('temp', out);
        return;
      }
      f.turn += 1;
      f.step += 1;
      openResult(out, '최종 대치');
      return;
    }
    postResolve(out);
    openResult(out, '최종 겹침');
  }
  function finishFinal(outcome, out) {
    const f = run.fin;
    f.outcome = outcome;
    postResolve(out);
    if (run.over) { openResult(out, '최종 대치'); return; }
    out.push(chg('info', '최종 결과: ' + E.LABELS.outcome[outcome]));
    run.phase = 'confession';
    run.queue.push({ id: 'common.final.outro.' + outcome });
    run.queue.push({ id: run.interest + '.confession' });
    openResult(out, '최종 대치');
  }

  /* ───── 끝 ───── */
  function openSummary() {
    run.phase = 'ending';
    if (!run.over) run.over = { type: 'complete', rel: earlyRel() };
    run.view = { kind: 'summary', pages: [[]], page: 0 };
    if (!run.finalized) {
      run.finalized = true;
      if (E.hooks.onRunEnd) E.hooks.onRunEnd(run, E.summary());
    }
  }

  E.summary = function () {
    if (!run) return null;
    const r = run.rel;
    const rt = route();
    const m = r.milestones;
    const completed = !!(run.over && run.over.rel === 'lovers' && m.mutualConfession && m.coupleAgreement);
    const finalOutcome = run.fin ? run.fin.outcome : null;
    let eventOutcome = run.over && run.over.type !== 'complete' ? run.over.type : finalOutcome;
    return {
      name: run.profile.name,
      interest: run.interest,
      interestName: comp().name,
      cases: run.results.map(function (x) {
        return { no: x.no, title: x.title, variant: x.variant, outcome: x.outcome, label: E.LABELS.outcome[x.outcome] };
      }),
      eventOutcome: eventOutcome,
      eventLabel: eventOutcome ? E.LABELS.outcome[eventOutcome] : '—',
      endType: run.over ? run.over.type : null,
      relationshipOutcome: run.over ? run.over.rel : null,
      relLabel: run.over && run.over.rel ? E.LABELS.rel[run.over.rel] : '—',
      romanceCompleted: completed,
      romanceMilestones: Object.keys(E.LABELS.milestone).map(function (k) { return { key: k, label: E.LABELS.milestone[k], ok: !!m[k] }; }),
      mutualConfession: !!m.mutualConfession,
      coupleAgreement: !!m.coupleAgreement,
      promise: { label: rt.promiseLabel, state: r.promises[rt.promise] || 'none' },
      boundaries: Object.keys(r.boundaries).map(function (b) { return { label: (rt.boundaries || {})[b] || b, resolved: r.boundaries[b].resolved }; }),
      gaps: completed ? [] : E.romanceGaps(),
      trust: r.trust,
      intimacy: r.intimacy,
      labels: E.relLabels(),
      log: r.log.slice(),
      res: BG.clone(run.res),
      slots: run.slots.total,
      rescueUsed: run.rescueUsed,
      seed: run.seed,
      mode: run.mode,
      contentVersion: run.contentVersion,
      endedAt: Date.now(),
    };
  };

  E.summaryText = function () {
    const s = E.summary();
    const lines = [];
    lines.push(BG.VERSION.title + ' — 귀환 기록');
    lines.push('탐사자: ' + s.name + ' · 관심 인물: ' + s.interestName + ' · ' + (s.mode === 'random' ? '무작위 조합' : '튜토리얼 조합'));
    s.cases.forEach(function (c, i) { lines.push('사건 ' + (i + 1) + ' ' + c.no + ' ' + c.title + ' (변형 ' + c.variant + '): ' + c.label); });
    lines.push('최종: ' + s.eventLabel);
    lines.push('관계: ' + s.relLabel + (s.romanceCompleted ? ' — 공략 완료' : ''));
    lines.push('이정표: ' + s.romanceMilestones.map(function (x) { return (x.ok ? '■ ' : '□ ') + x.label; }).join(' · '));
    lines.push('사용 슬롯 ' + s.slots + ' · 균열 ' + s.res.crack + ' · 시드 ' + s.seed + ' · 콘텐츠 ' + s.contentVersion);
    return lines.join('\n');
  };

  /* ───────── 선택지 ───────── */
  function sceneChoices(v) {
    const sc = BG.content.scenes[v.id];
    if (!sc.choices || !sc.choices.length) return [{ id: 'next', kind: 'next', enabled: true, label: sc.nextLabel || '계속' }];
    const list = [];
    sc.choices.forEach(function (c, i) {
      const ok = !c.req || BG.cond(c.req, run);
      if (!ok && c.hide !== false) return;
      let sub = c.sub ? render(c.sub) : '';
      const rk = riskText(c.fx);
      if (rk && !c.sub) sub = '대가: ' + rk;
      list.push({ id: 'c' + i, kind: 'choice', label: render(c.label), sub: sub, enabled: ok, reason: ok ? '' : c.why || '' });
    });
    if (!list.length) return [{ id: 'next', kind: 'next', enabled: true, label: '계속' }];
    return shuffleFor(list, run.seed + '|' + v.id);
  }
  /* 선택지 순서를 판마다 섞는다. 판정용 난수는 쓰지 않으므로 같은 판에서는 다시 열어도 순서가 같다 */
  function shuffleFor(list, key) {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    let s = h >>> 0 || 1;
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const p = BG.rngStep(s);
      s = p[1];
      const j = Math.floor(p[0] * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function doChoice(i) {
    const v = run.view;
    const sc = BG.content.scenes[v.id];
    const c = sc.choices[i];
    const out = [];
    if (c.say) out.push('나: ' + c.say);
    out.push.apply(out, c.text || []);
    run.history.push(v.id + '#' + i);
    if (c.next) run.queue.unshift({ id: c.next });
    applyFx(c.fx, out);
    postResolve(out);
    if (out.length) openResult(out, v.title);
    else resume();
  }

  E.options = function () {
    if (!run || !run.view) return [];
    const v = run.view;
    if ((v.kind === 'scene' || v.kind === 'result') && v.page < v.pages.length - 1) {
      return [{ id: 'next', kind: 'next', enabled: true, label: '계속' }];
    }
    switch (v.kind) {
      case 'scene': return sceneChoices(v);
      case 'result': return [{ id: 'next', kind: 'next', enabled: true, label: '계속' }];
      case 'hub': return hubOptions();
      case 'conclude': return concludeOptions();
      case 'confront': return confrontOptions();
      case 'interlude': return interludeOptions();
      case 'final': return finalOptions();
      default: return [];
    }
  };

  function viewedKey(v, page) { return v.id ? v.id + ':' + page : null; }
  E.pageViewed = function () {
    const v = run && run.view;
    if (!v || v.kind !== 'scene' || !E.hooks.viewed) return false;
    return E.hooks.viewed(viewedKey(v, v.page));
  };
  function markViewed() {
    const v = run.view;
    if (v && v.kind === 'scene' && E.hooks.markViewed) E.hooks.markViewed(viewedKey(v, v.page));
  }

  E.act = function (id) {
    if (!run || !run.view) return false;
    const opts = E.options();
    const o = opts.filter(function (x) { return x.id === id; })[0];
    if (!o || o.enabled === false) return false;
    const v = run.view;
    if (id === 'next') {
      markViewed();
      if (v.page < v.pages.length - 1) v.page += 1;
      else resume();
    } else if (id[0] === 'c') { markViewed(); doChoice(+id.slice(1)); }
    else if (id.indexOf('a:') === 0) {
      const a = caseDef().actions.filter(function (x) { return x.id === id.slice(2); })[0];
      doAction(a);
    } else if (id.indexOf('g:') === 0) doGeneric(id.slice(2));
    else if (id.indexOf('r:') === 0) doRule(id.slice(2));
    else if (id.indexOf('t:') === 0) doTurn(id.slice(2));
    else if (id.indexOf('i:') === 0) doInterlude(id.slice(2));
    else if (id.indexOf('f:') === 0) doFinal(id);
    save();
    return true;
  };

  /* 읽은 페이지 빠르게 넘기기: 선택이나 처음 보는 페이지에서 멈춘다 */
  E.skipRead = function () {
    const v = run && run.view;
    if (!v || v.kind !== 'scene') return false;
    let moved = false;
    while (v.page < v.pages.length - 1 && E.hooks.viewed && E.hooks.viewed(viewedKey(v, v.page))) {
      v.page += 1;
      moved = true;
    }
    if (moved) save();
    return moved;
  };

  E.debug = function () {
    if (!run) return null;
    return {
      seed: run.seed, rngState: run.rngState, order: run.order, variants: run.variants,
      phase: run.phase, chapter: run.chapter, rel: run.rel, flags: run.flags,
      cs: run.cs, il: run.il, fin: run.fin, res: run.res, ready: E.romanceReady(),
    };
  };
})();
