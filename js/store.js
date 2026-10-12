/* 백일의 틈 — store: 로컬 저장, 프로필 검증, JSON 가져오기·내보내기.
 * 모든 데이터는 이 브라우저의 localStorage에만 남는다. 외부로 전송하지 않는다(NFR-10). */
(function () {
  'use strict';
  const BG = window.BG;
  const S = (BG.store = {});
  const SCHEMA = BG.VERSION.schema;
  const KEY = {
    profiles: 'baekil.profiles.v1',
    run: 'baekil.run.v1',
    meta: 'baekil.meta.v1',
    settings: 'baekil.settings.v1',
  };
  S.KEY = KEY;
  S.lastError = null;

  S.available = (function () {
    try {
      const k = '__baekil_test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  })();

  function get(key, fallback) {
    try {
      const s = window.localStorage.getItem(key);
      return s ? JSON.parse(s) : fallback;
    } catch (e) {
      S.lastError = e;
      return fallback;
    }
  }
  function set(key, val) {
    try {
      window.localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      S.lastError = e;
      return false;
    }
  }
  function del(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* 무시 */ }
  }

  /* ───────── 기본값 ───────── */
  S.defaultSettings = function () {
    return {
      fontSize: 18, textSpeed: 'fast', reducedHorror: false, sound: false, volume: 0.4,
      reduceMotion: false, theme: 'auto', serif: true, debug: false,
    };
  };
  S.emptyMeta = function () {
    return { schemaVersion: SCHEMA, viewed: {}, endings: [], runs: [], met: {}, notes: '', cases: {} };
  };
  S.emptyProfiles = function () {
    return { schemaVersion: SCHEMA, profiles: [null, null, null], selectedProfileId: null };
  };

  S.newProfile = function (bgKey) {
    const b = BG.BACKGROUNDS[bgKey || 'record'];
    return {
      id: 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      name: '서하', gender: 'female', age: 26, addressForm: '서하 씨',
      personality: { social: 1, risk: 1, voice: 1 }, traits: [], selfText: '',
      background: bgKey || 'record', bgText: '', tool: b.tool,
      stats: BG.clone(b.stats),
      appearance: { hair: '어깨에 닿는 머리', hairColor: '검은 머리', eyes: '짙은 갈색 눈', height: '보통', build: '보통', outfit: '평상복', features: [] },
      lookText: '',
      createdAt: Date.now(), updatedAt: Date.now(),
    };
  };

  /* ───────── 프로필 검증 (FR-02, FR-37, FR-39) ───────── */
  function cleanText(s, max) {
    return String(s == null ? '' : s).replace(/[{}]/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
  }
  function cleanShort(s, max) {
    return cleanText(s, max).replace(/\s+/g, ' ').trim();
  }
  S.statSum = function (st) {
    return BG.STAT_KEYS.reduce(function (a, k) { return a + (Number(st && st[k]) || 0); }, 0);
  };
  S.validateProfile = function (raw) {
    const errors = [];
    if (!raw || typeof raw !== 'object') return { ok: false, errors: ['프로필 형식이 아닙니다.'] };
    if (raw.gender != null && raw.gender !== 'female') errors.push('탐사자의 성별은 여성으로 고정되어 있습니다. 다른 성별의 프로필은 불러올 수 없습니다.');
    const p = {};
    p.id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : 'p' + Date.now().toString(36);
    p.gender = 'female';
    p.name = cleanShort(raw.name, BG.LIMITS.name);
    if (!p.name) errors.push('이름을 입력해 주세요.');
    const age = Number(raw.age);
    if (!Number.isInteger(age) || age < 20 || age > 80) errors.push('나이는 20~80 사이의 정수여야 합니다.');
    p.age = Number.isInteger(age) ? Math.max(20, Math.min(80, age)) : 26;
    p.addressForm = cleanShort(raw.addressForm, BG.LIMITS.addressForm) || (p.name ? p.name + ' 씨' : '');
    const per = raw.personality || {};
    p.personality = {};
    ['social', 'risk', 'voice'].forEach(function (k) {
      const v = Number(per[k]);
      p.personality[k] = v === 0 || v === 1 || v === 2 ? v : 1;
    });
    p.traits = (Array.isArray(raw.traits) ? raw.traits : []).filter(function (t) { return BG.TRAITS.indexOf(t) >= 0; }).slice(0, 2);
    p.selfText = cleanText(raw.selfText, BG.LIMITS.selfText);
    p.background = BG.BACKGROUNDS[raw.background] ? raw.background : 'record';
    p.bgText = cleanText(raw.bgText, BG.LIMITS.bgText);
    p.tool = BG.TOOLS[raw.tool] ? raw.tool : BG.BACKGROUNDS[p.background].tool;
    p.stats = {};
    const st = raw.stats || {};
    BG.STAT_KEYS.forEach(function (k) {
      const v = Number(st[k]);
      if (!Number.isInteger(v) || v < BG.STAT_MIN || v > BG.STAT_MAX) errors.push(BG.STATS[k] + ' 능력치는 ' + BG.STAT_MIN + '~' + BG.STAT_MAX + ' 사이여야 합니다.');
      p.stats[k] = Number.isInteger(v) ? Math.max(BG.STAT_MIN, Math.min(BG.STAT_MAX, v)) : 2;
    });
    if (S.statSum(st) !== BG.STAT_BUDGET) errors.push('능력치 합계는 ' + BG.STAT_BUDGET + '이어야 합니다. (현재 ' + S.statSum(st) + ')');
    const ap = raw.appearance || {};
    p.appearance = {};
    ['hair', 'hairColor', 'eyes', 'height', 'build', 'outfit'].forEach(function (k) {
      p.appearance[k] = cleanShort(ap[k], BG.LIMITS.custom);
    });
    p.appearance.features = (Array.isArray(ap.features) ? ap.features : []).map(function (f) { return cleanShort(f, BG.LIMITS.custom); }).filter(Boolean).slice(0, 4);
    p.lookText = cleanText(raw.lookText, BG.LIMITS.lookText);
    p.createdAt = Number(raw.createdAt) || Date.now();
    p.updatedAt = Date.now();
    return { ok: errors.length === 0, errors: errors, profile: p };
  };

  /* ───────── 읽기·쓰기 ───────── */
  S.loadSettings = function () {
    return Object.assign(S.defaultSettings(), get(KEY.settings, {}));
  };
  S.saveSettings = function (s) { return set(KEY.settings, s); };

  S.loadMeta = function () {
    const m = get(KEY.meta, null);
    if (!m || m.schemaVersion !== SCHEMA) return S.emptyMeta();
    return Object.assign(S.emptyMeta(), m);
  };
  S.saveMeta = function (m) { return set(KEY.meta, m); };

  S.loadProfiles = function () {
    const p = get(KEY.profiles, null);
    if (!p || p.schemaVersion !== SCHEMA || !Array.isArray(p.profiles)) return S.emptyProfiles();
    while (p.profiles.length < 3) p.profiles.push(null);
    p.profiles = p.profiles.slice(0, 3);
    return p;
  };
  S.saveProfiles = function (p) { return set(KEY.profiles, p); };

  /* 진행 중인 판: 스키마가 다르면 원본은 그대로 두고 알린다(NFR-09) */
  S.loadRun = function () {
    const r = get(KEY.run, null);
    if (!r) return { run: null };
    if (r.schemaVersion !== SCHEMA) return { run: null, error: '저장된 조사의 형식(버전 ' + r.schemaVersion + ')을 이 빌드가 지원하지 않습니다. 원본은 지우지 않고 보관합니다. 데이터 화면에서 내보낼 수 있습니다.' };
    const warn = r.contentVersion !== BG.VERSION.content ? '저장된 조사는 콘텐츠 ' + r.contentVersion + '에서 시작되었습니다. 현재는 ' + BG.VERSION.content + '입니다. 일부 문장이 달라질 수 있습니다.' : null;
    return { run: r, warn: warn };
  };
  S.saveRun = function (r) { return set(KEY.run, r); };
  S.clearRun = function () { del(KEY.run); };
  S.rawRun = function () { return get(KEY.run, null); };

  S.clearAll = function () {
    Object.keys(KEY).forEach(function (k) { del(KEY[k]); });
  };

  /* ───────── 내보내기·가져오기 (FR-30) ───────── */
  S.exportAll = function () {
    return JSON.stringify({
      format: 'baekil-save', schemaVersion: SCHEMA, contentVersion: BG.VERSION.content, exportedAt: new Date().toISOString(),
      profiles: S.loadProfiles(), meta: S.loadMeta(), run: S.rawRun(), settings: S.loadSettings(),
    }, null, 2);
  };
  S.parseImport = function (text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { return { ok: false, errors: ['JSON 형식이 아닙니다. 파일이 손상되었을 수 있습니다.'] }; }
    if (!d || typeof d !== 'object') return { ok: false, errors: ['알 수 없는 파일입니다.'] };
    if (d.format === 'baekil-profile') {
      const v = S.validateProfile(d.profile);
      return v.ok ? { ok: true, kind: 'profile', profile: v.profile } : { ok: false, errors: v.errors };
    }
    if (d.format !== 'baekil-save') return { ok: false, errors: ['백일의 틈 저장 파일이 아닙니다.'] };
    if (d.schemaVersion !== SCHEMA) return { ok: false, errors: ['지원하지 않는 저장 형식 버전입니다 (' + d.schemaVersion + '). 기존 데이터는 바뀌지 않았습니다.'] };
    const errors = [];
    const profiles = S.emptyProfiles();
    if (d.profiles && Array.isArray(d.profiles.profiles)) {
      d.profiles.profiles.slice(0, 3).forEach(function (p, i) {
        if (!p) return;
        const v = S.validateProfile(p);
        if (v.ok) profiles.profiles[i] = v.profile;
        else errors.push('프로필 ' + (i + 1) + ': ' + v.errors.join(' '));
      });
    }
    if (d.run && d.run.schemaVersion !== SCHEMA) errors.push('진행 중 조사의 형식이 맞지 않아 제외합니다.');
    if (d.run && d.run.profile) {
      const v = S.validateProfile(d.run.profile);
      if (!v.ok) errors.push('진행 중 조사의 탐사자 정보가 규칙과 맞지 않아 제외합니다.');
    }
    const runOk = d.run && d.run.schemaVersion === SCHEMA && d.run.profile && S.validateProfile(d.run.profile).ok && d.run.view;
    return {
      ok: true, kind: 'save', errors: errors,
      data: {
        profiles: profiles,
        meta: d.meta && d.meta.schemaVersion === SCHEMA ? Object.assign(S.emptyMeta(), d.meta) : S.emptyMeta(),
        run: runOk ? d.run : null,
        settings: Object.assign(S.defaultSettings(), d.settings || {}),
      },
    };
  };
  S.applyImport = function (data) {
    const ok = [S.saveProfiles(data.profiles), S.saveMeta(data.meta), S.saveSettings(data.settings)];
    if (data.run) ok.push(S.saveRun(data.run));
    else S.clearRun();
    return ok.every(Boolean);
  };
  S.exportProfile = function (p) {
    return JSON.stringify({ format: 'baekil-profile', schemaVersion: SCHEMA, profile: p }, null, 2);
  };

  S.download = function (filename, text) {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 500);
  };
})();
