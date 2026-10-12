/* 백일의 틈 — validate: 콘텐츠 자동 검수(NFR-08).
 * 필수 장면 누락, 존재하지 않는 인물·단서·장면 참조, 알 수 없는 템플릿 토큰을 찾는다. */
(function () {
  'use strict';
  const BG = window.BG;

  const ROUTE_SCENES = ['meet', 'c1', 'c2', 'c3', 'c4', 'il1', 'il2', 'il3', 'promise', 'finalPact', 'confession', 'couple', 'end.lovers', 'end.apart', 'end.colleague', 'end.distance'];
  const ROUTE_ARRAYS = ['collab', 'rescue', 'confrontComp', 'finalComp', 'finalIntro', 'early'];

  function strings(x, out) {
    out = out || [];
    if (x == null) return out;
    if (typeof x === 'string') out.push(x);
    else if (Array.isArray(x)) x.forEach(function (y) { strings(y, out); });
    else if (typeof x === 'object') Object.keys(x).forEach(function (k) { if (k !== 'if') strings(x[k], out); });
    return out;
  }

  BG.validate = function () {
    const errors = [];
    const warnings = [];
    const C = BG.content;
    const tokenSet = new Set(BG.text.tokens);

    function checkText(where, list) {
      strings(list).forEach(function (s) {
        const re = /\{([a-zA-Z]+)(?::[^{}]*)?\}/g;
        let m;
        while ((m = re.exec(s))) {
          if (!tokenSet.has(m[1])) errors.push(where + ': 알 수 없는 토큰 {' + m[1] + '}');
        }
        const sp = /^([^\s:[\]{}]{1,10})(?:\[([^\]]+)\])?:\s/.exec(s);
        if (sp && sp[1] !== '나' && !BG.alias[sp[1]] && /[가-힣]/.test(sp[1]) && sp[1].length <= 4) {
          warnings.push(where + ': 등록되지 않은 화자처럼 보임 “' + sp[1] + '”');
        }
        if (sp && sp[2] && BG.LAYERS.indexOf(sp[2]) < 0) errors.push(where + ': 알 수 없는 시간층 [' + sp[2] + ']');
      });
    }

    BG.CASE_POOL.forEach(function (id) {
      const d = C.cases[id];
      if (!d) { errors.push('사건 없음: ' + id); return; }
      if (!BG.chars[d.owner]) errors.push(id + ': 관련 인물 ID 없음 ' + d.owner);
      ['intro', 'ownerIntro', 'outro.stable', 'outro.temp', 'outro.retreat'].forEach(function (s) {
        if (!C.scenes[id + '.' + s]) errors.push(id + ': 장면 없음 ' + s);
      });
      BG.INITIAL.forEach(function (c) {
        if (c !== d.owner && !(d.greet && d.greet[c])) errors.push(id + ': ' + c + ' 동행 인사 없음');
      });
      const clueIds = Object.keys(d.clues || {});
      const core = clueIds.filter(function (k) { return d.clues[k].core; });
      if (core.length !== 2) errors.push(id + ': 핵심 사실은 2개여야 함 (현재 ' + core.length + ')');
      d.actions.forEach(function (a) {
        [a.okFx, a.ngFx, a.fx].forEach(function (fx) {
          if (!fx) return;
          [].concat(fx.clue || [], fx.verify || []).forEach(function (cid) {
            if (clueIds.indexOf(cid) < 0) errors.push(id + '.' + a.id + ': 없는 단서 ' + cid);
          });
        });
        if (a.stat && !BG.STATS[a.stat]) errors.push(id + '.' + a.id + ': 없는 능력치 ' + a.stat);
        checkText(id + '.' + a.id, [a.label, a.desc, a.text, a.ok, a.ng]);
      });
      core.forEach(function (cid) {
        const gets = d.actions.some(function (a) {
          return [a.okFx, a.ngFx, a.fx].some(function (fx) { return fx && [].concat(fx.clue || []).indexOf(cid) >= 0; });
        });
        const both = d.actions.some(function (a) { return a.stat && a.ngFx && [].concat(a.ngFx.clue || []).indexOf(cid) >= 0; });
        if (!gets) errors.push(id + ': 핵심 사실 ' + cid + '을 얻을 방법이 없음');
        if (!both) warnings.push(id + ': 핵심 사실 ' + cid + '이 판정 실패 시 보장되지 않음 (FR-08)');
      });
      d.rules.forEach(function (r) {
        (r.uses || []).forEach(function (cid) { if (clueIds.indexOf(cid) < 0) errors.push(id + '.' + r.id + ': 규칙 근거 단서 없음 ' + cid); });
        if (r.contra && clueIds.indexOf(r.contra) < 0) errors.push(id + '.' + r.id + ': 반증 단서 없음 ' + r.contra);
      });
      ['A', 'B'].forEach(function (v) {
        if (!d.rules.some(function (r) { return r.kind === 'safe' && r.correct === v; })) errors.push(id + ': 변형 ' + v + '의 안전 해결 규칙 없음');
      });
      const cf = d.confront || {};
      ['threat', 'turn2', 'stat', 'directLabel', 'directStat', 'rule', 'ok', 'ng', 'ngFx', 'forced', 'retreat'].forEach(function (k) {
        if (cf[k] == null) errors.push(id + ': 대치 항목 없음 ' + k);
      });
      checkText(id, [d.intro, d.ownerIntro, d.greet, d.outro, d.confront, d.clues, d.teaser]);
    });

    BG.INITIAL.forEach(function (rid) {
      const r = C.routes[rid];
      if (!r) { errors.push('루트 없음: ' + rid); return; }
      if (!r.promise || !r.promiseLabel) errors.push(rid + ': 핵심 약속 정의 없음');
      ROUTE_SCENES.forEach(function (s) { if (!C.scenes[rid + '.' + s]) errors.push(rid + ': 장면 없음 ' + s); });
      ROUTE_ARRAYS.forEach(function (k) { if (!r[k] || !r[k].length) errors.push(rid + ': 원고 없음 ' + k); });
      if (!r.finalComp || r.finalComp.length < 2) errors.push(rid + ': finalComp는 2줄 필요');
      ['stable', 'temp', 'retreat'].forEach(function (o) { if (!r.reactions || !r.reactions[o]) errors.push(rid + ': 사건 반응 없음 ' + o); });
      [1, 2, 3].forEach(function (n) { if (!r.interlude || !r.interlude[n]) errors.push(rid + ': 막간 대사 없음 ' + n); });
      const conf = C.scenes[rid + '.confession'];
      if (conf) {
        const kinds = strings(conf.choices.map(function (c) { return c.fx && c.fx.ending; }));
        ['apart', 'colleague', 'distance'].forEach(function (k) { if (kinds.indexOf(k) < 0) errors.push(rid + ': 고백 장면에 ' + k + ' 분기 없음'); });
        if (!conf.choices.some(function (c) { return c.req && c.req.ready === true && c.next; })) errors.push(rid + ': 연인 성립으로 가는 고백 선택 없음');
      }
      const couple = C.scenes[rid + '.couple'];
      if (couple && !couple.choices.some(function (c) { return c.fx && c.fx.ending === 'lovers' && c.fx.milestone === 'coupleAgreement'; })) {
        errors.push(rid + ': 연인 합의 선택 없음');
      }
      checkText(rid, [r.collab, r.rescue, r.confrontComp, r.finalComp, r.finalIntro, r.early, r.reactions, r.interlude]);
      if (!BG.E_validOrder) { /* 엔진 로드 전 */ }
      if (BG.engine && !BG.engine.validOrder(BG.TUTORIAL[rid], rid)) errors.push(rid + ': 튜토리얼 사건 조합이 제약을 만족하지 않음');
    });

    Object.keys(C.scenes).forEach(function (sid) {
      const sc = C.scenes[sid];
      checkText(sid, [sc.text, sc.title]);
      (sc.choices || []).forEach(function (c, i) {
        checkText(sid + '#' + i, [c.label, c.say, c.text, c.sub]);
        if (c.next && !C.scenes[c.next]) errors.push(sid + '#' + i + ': 없는 다음 장면 ' + c.next);
        if (c.fx && c.fx.ending && !C.scenes[sid.split('.')[0] + '.end.' + c.fx.ending]) errors.push(sid + '#' + i + ': 결말 장면 없음 ' + c.fx.ending);
      });
    });
    ['common.prologue', 'common.interlude.1', 'common.interlude.2', 'common.interlude.3', 'common.final.intro',
      'common.final.outro.stable', 'common.final.outro.temp', 'common.final.outro.retreat', 'common.early.isolated', 'common.early.collapse'].forEach(function (s) {
      if (!C.scenes[s]) errors.push('공통 장면 없음: ' + s);
    });

    return {
      errors: errors, warnings: warnings,
      stats: { cases: Object.keys(C.cases).length, routes: Object.keys(C.routes).length, scenes: Object.keys(C.scenes).length },
    };
  };
})();
