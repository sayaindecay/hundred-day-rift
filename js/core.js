/* 백일의 틈 — core: 이름공간, 상수, 난수, 텍스트 템플릿
 * UI·DOM에 의존하지 않는다. 엔진·콘텐츠·검수 도구가 공유한다. */
(function () {
  'use strict';
  const BG = (window.BG = window.BG || {});

  BG.VERSION = {
    schema: 1,
    content: '0.1.0-beta',
    title: '백일의 틈',
    subtitle: '당신과 돌아오는 조사기록',
  };

  BG.content = BG.content || { scenes: {}, cases: {}, routes: {}, common: {} };

  /* ───────── 규칙 상수 (설계 가안) ───────── */
  BG.STATS = { obs: '관찰', neg: '교섭', act: '행동', rec: '기록' };
  BG.STAT_KEYS = ['obs', 'neg', 'act', 'rec'];
  BG.STAT_DESC = {
    obs: '현장의 어긋남을 알아본다. 사물·공간·시각의 이상을 찾는 판정.',
    neg: '사람에게서 이야기를 얻고 협력을 끌어낸다. 증언·설득·진정 판정.',
    act: '몸을 움직여 위험을 통과한다. 구조·이동·탈출·버티기 판정.',
    rec: '기록과 날짜를 대조한다. 문서·사진·시각의 모순을 잡는 판정.',
  };
  BG.STAT_BUDGET = 8;
  BG.STAT_MIN = 1;
  BG.STAT_MAX = 3;

  BG.LAYERS = ['현재', '과거 기록', '기억', '극본', '미확인'];

  BG.RULES = {
    hpMax: 12, compMax: 12, supplyStart: 4, supplyMax: 8,
    caseInv: 8, caseConclude: 2, interlude: 4, final: 8,
    crackMarks: [40, 70], crackEnd: 100, rescueCrack: 8,
    caseSurge: 3, finalSurge: 4, // 규칙을 정하고 대치에 들어설 때 겹침이 정점에 이른다
  };

  BG.CASE_POOL = ['M01', 'M02', 'M03', 'M04', 'M08'];
  // 관심 인물별 고정 튜토리얼 조합
  BG.TUTORIAL = {
    shinbaek: ['M01', 'M03', 'M04', 'M02'],
    gukse: ['M02', 'M01', 'M03', 'M04'],
    sangbeom: ['M04', 'M01', 'M02', 'M03'],
    seongbaek: ['M03', 'M04', 'M01', 'M08'],
    yunyoung: ['M08', 'M03', 'M04', 'M02'],
  };
  BG.INITIAL = ['shinbaek', 'gukse', 'sangbeom', 'seongbaek', 'yunyoung'];

  /* ───────── 플레이어 생성 선택지 ───────── */
  BG.BACKGROUNDS = {
    record: {
      label: '기록을 쫓는 사람', stats: { obs: 3, neg: 1, act: 1, rec: 3 }, tool: 'notebook',
      desc: '날짜가 맞지 않는 기록, 정정된 문서, 남은 메모를 끝까지 대조해 온 사람.',
    },
    people: {
      label: '사람을 찾는 사람', stats: { obs: 1, neg: 3, act: 2, rec: 2 }, tool: 'contacts',
      desc: '연락이 끊긴 사람을 찾고, 이야기를 들어 주며 길을 묻던 사람.',
    },
    field: {
      label: '현장을 지키는 사람', stats: { obs: 2, neg: 1, act: 3, rec: 2 }, tool: 'kit',
      desc: '사람이 다치는 자리에서 먼저 손을 쓰고 끝까지 남아 있던 사람.',
    },
  };
  BG.BG_KEYS = ['record', 'people', 'field'];

  BG.TOOLS = {
    notebook: { label: '날짜를 대조하는 수첩', stat: 'rec', desc: '기록 판정 +10 (사건마다 1회)' },
    contacts: { label: '연락처 수첩과 손전등', stat: 'neg', desc: '교섭 판정 +10 (사건마다 1회)' },
    kit: { label: '간단한 응급 물품과 장갑', stat: null, desc: '사건마다 1회, 물자 없이 응급 처치' },
    flashlight: { label: '튼튼한 손전등', stat: 'obs', desc: '관찰 판정 +10 (사건마다 1회)' },
    gloves: { label: '작업용 장갑과 끈', stat: 'act', desc: '행동 판정 +10 (사건마다 1회)' },
  };

  BG.PERSONALITY = {
    social: { label: '대인 표현', options: ['신중하게 마음을 여는 편', '중간', '먼저 말을 거는 편'] },
    risk: { label: '위험 접근', options: ['확인하고 움직임', '중간', '먼저 시도함'] },
    voice: { label: '의사 표현', options: ['완곡함', '중간', '직설적임'] },
  };
  BG.TRAITS = ['다정함', '유머', '호기심', '독립심', '책임감', '침착함'];

  BG.APPEARANCE = {
    hair: ['짧은 머리', '단발', '어깨에 닿는 머리', '긴 머리', '하나로 묶은 머리'],
    hairColor: ['검은 머리', '짙은 갈색 머리', '밝은 갈색 머리', '물들인 머리'],
    eyes: ['검은 눈', '짙은 갈색 눈', '옅은 갈색 눈'],
    height: ['작은 편', '보통', '큰 편', '말하지 않음'],
    build: ['마른 편', '보통', '탄탄한 편', '둥근 편', '말하지 않음'],
    outfit: ['평상복', '주머니 많은 실용복', '단정한 차림', '편한 운동복'],
    features: ['안경', '손목시계', '귀걸이', '반지', '흉터', '주근깨', '모자'],
  };

  BG.LIMITS = { name: 12, addressForm: 12, selfText: 200, bgText: 300, lookText: 300, custom: 20 };

  /* ───────── 인물 (게임 안에서 보여 주는 소개) ───────── */
  BG.chars = {
    shinbaek: {
      name: '고신백', short: '신백', romance: true, gender: 'male', adult: true, ownCase: 'M01',
      role: '서울경찰청 강력범죄수사대 팀장',
      blurb: '무뚝뚝한 존댓말 아래, 상대가 다음 순간을 살아갈 조건부터 챙기는 형사. 보호를 위해 판단을 혼자 쥐는 버릇이 있다.',
      spec: { stat: 'act', name: '현장 엄호', desc: '행동 판정 +10. 사건마다 처음 받는 체력 피해를 막는다.' },
    },
    gukse: {
      name: '이국세', short: '국세', romance: true, gender: 'male', adult: true, ownCase: 'M02',
      role: '국립과학수사연구원 법의관 · 서울 출장 공조 중',
      blurb: '농담과 노래, 그리고 정밀한 검안을 한 호흡에 하는 법의관. 무서워하면서도 사람을 돕는다. 지키려고 진실을 늦추기도 한다.',
      spec: { stat: 'obs', name: '모순 대조', desc: '관찰 판정 +10. 역할을 맞추면 미확인 증언 하나를 대조한다.' },
    },
    sangbeom: {
      name: '남상범', short: '상범', romance: true, gender: 'male', adult: true, ownCase: 'M04',
      role: '경찰청 특수사건수사팀 팀장',
      blurb: '말수가 적고 정중하다. 위험은 정확히 알리고 결정은 대신하지 않는다. 자기 이야기에는 여전히 선이 있다.',
      spec: { stat: 'rec', name: '위험 고지', desc: '기록 판정 +10. 사건마다 한 번, 대치 성공률 +10.' },
    },
    seongbaek: {
      name: '한성백', short: '성백', romance: true, gender: 'male', adult: true, ownCase: 'M03',
      role: '크로노 사건의 생존자 · 자전거를 타는 사람',
      blurb: '감탄사와 먹을거리 농담, ‘영혼의 동반자’라 부르는 저렴한 자전거. 위기에는 상황을 정리하고 같이 들자고 한다.',
      spec: { stat: 'neg', name: '분위기 전환', desc: '교섭 판정 +10. 사건마다 처음 받는 침착 피해를 막는다.' },
    },
    yunyoung: {
      name: '한윤영', short: '윤영', romance: true, gender: 'male', adult: true, ownCase: 'M08',
      role: '전 양궁 국가대표 · 사진을 찍는 사람',
      blurb: '상대가 답할 자리를 남기는 부드러운 말투. 남에게는 손을 뻗으라 하면서 자기 피로는 괜찮다고 줄여 말한다.',
      spec: { stat: 'obs', name: '함께 버티기', desc: '관찰 판정 +10. 사건마다 처음 받는 피해를 절반으로 나눠 진다.' },
    },

    doyul: { name: '백도율', short: '도율', role: '강력범죄수사대 형사 · 고신백 팀', blurb: '격식 있는 질문과 동의 확인. 기록으로 선택을 보장한다.' },
    daeho: { name: '강대호', short: '대호', role: '강력범죄수사대 형사 · 고신백 팀', blurb: '이동과 안전 확인. 정보의 경계를 분명히 안내한다.' },
    taehu: { name: '서태후', short: '태후', role: '국립과학수사연구원 법의관', blurb: '이국세의 전문성을 존중하고, 혼자 감당하게 두지 않는다. 함께 알기를 요구한다.' },
    jihan: { name: '김지한', short: '지한', role: '국립과학수사연구원 검시과 · 부검 보조와 검체 정리', blurb: '쌤 호칭과 웃음, 정중한 연락과 지원.' },
    sua: { name: '신수아', short: '수아', role: '한성백의 소꿉친구', blurb: '혼자 책임지는 구조에 이의를 제기하고 역할을 분명히 요구한다.' },
    siwoo: { name: '성시우', short: '시우', role: '한성백·한윤영의 친구', blurb: '계획을 혼자 떠안던 사람. 경찰을 쉽게 믿지 않는다.' },
    jina: { name: '유진아', short: '진아', role: '특수사건수사팀 외부고문', blurb: '가설의 한계를 먼저 말한다. 교수 대신 ‘유 고문’으로 불러 달라고 한다.' },
    gyeokhwan: { name: '지격환', short: '격환', layer: '과거 기록', role: '과거 기록 속 강력팀 형사', blurb: '기록 속 목소리. 이 사건으로 그의 현재를 확인할 수는 없다.' },
    yunhee: { name: '한윤희', short: '윤희', role: '한윤영의 여동생 · 병원 근무', blurb: '정리와 돌봄에 능숙하고, 오빠 앞에서는 화도 낸다.' },
    won: { name: '범원', short: '범원', role: '양궁 선수 · 한윤영의 후배', blurb: '두려워하면서도 구조와 동행을 먼저 한다.' },

    broadcast: { name: '안내 방송', short: '방송', layer: '미확인', npc: true },
    voice: { name: '목소리', short: '목소리', layer: '미확인', npc: true },
    guard: { name: '경비원', short: '경비원', npc: true },
    manager: { name: '관리인', short: '관리인', npc: true },
    tailor: { name: '수선집 주인', short: '수선집', npc: true },
    staff: { name: '시설 직원', short: '직원', npc: true },
    passenger: { name: '승객', short: '승객', npc: true },
    evacuee: { name: '대피하던 사람', short: '대피자', layer: '과거 기록', npc: true },
    worker: { name: '야간 작업자', short: '작업자', npc: true },
    rangekeeper: { name: '연습장 관리인', short: '관리인2', npc: true },
    junior: { name: '어린 회원', short: '회원', npc: true },
  };

  BG.alias = {};
  Object.keys(BG.chars).forEach(function (id) {
    const c = BG.chars[id];
    BG.alias[c.short] = id;
    BG.alias[c.name] = id;
  });

  /* ───────── 난수: mulberry32. 상태는 정수 하나로 저장된다 ───────── */
  BG.rngStep = function (state) {
    const next = (state + 0x6d2b79f5) | 0;
    let t = next;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
  };

  /* ───────── 조사(助詞) ───────── */
  const JOSA = {
    은: ['은', '는'], 는: ['은', '는'], 이: ['이', '가'], 가: ['이', '가'],
    을: ['을', '를'], 를: ['을', '를'], 과: ['과', '와'], 와: ['과', '와'],
    아: ['아', '야'], 야: ['아', '야'], 이에요: ['이에요', '예요'], 예요: ['이에요', '예요'],
    이랑: ['이랑', '랑'], 랑: ['이랑', '랑'], 이나: ['이나', '나'], 나: ['이나', '나'],
    이라고: ['이라고', '라고'], 라고: ['이라고', '라고'], 이야: ['이야', '야'],
  };
  function tail(word) {
    const ch = String(word).trim().slice(-1);
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) {
      const j = (c - 0xac00) % 28;
      return { batchim: j !== 0, rieul: j === 8 };
    }
    if (/[0136780]/.test(ch)) return { batchim: true, rieul: /[178]/.test(ch) };
    if (/[lmnLMN]/.test(ch)) return { batchim: true, rieul: /[lL]/.test(ch) };
    return { batchim: false, rieul: false };
  }
  BG.josa = function (word, j) {
    if (!j) return word;
    const t = tail(word);
    if (j === '으로' || j === '로') return word + (t.batchim && !t.rieul ? '으로' : '로');
    const pair = JOSA[j];
    if (!pair) return word + j;
    return word + (t.batchim ? pair[0] : pair[1]);
  };

  /* ───────── 텍스트 템플릿 ─────────
   * {name:은} {call:이} {comp:와} {compFull} {owner}
   * {tone:신중|중간|먼저} {risk:..} {voice:..}  (성격 3축, 0·1·2)
   * {trait:유머=…;호기심=…;*=기본}  {bg:기록|사람|현장}
   * {v:변형A|변형B}  {gore:원문|축소문}
   * {danger} {place} {object}  (현재 사건의 고정 표현)
   * {look} {watch} {outfit} {hair} {age}  */
  function pick(arg, i) {
    const parts = String(arg).split('|');
    return parts[Math.max(0, Math.min(i, parts.length - 1))];
  }
  function word(w, arg) {
    return arg ? BG.josa(w, arg) : w;
  }
  function axis(p, key) {
    const v = (p.personality || {})[key];
    return typeof v === 'number' ? v : 1;
  }
  function lookPhrase(p) {
    const a = p.appearance || {};
    const f = a.features || [];
    if (f.indexOf('안경') >= 0) return '안경에 맺힌 물기를 닦고';
    const h = a.hair || '';
    if (/긴|어깨|묶은/.test(h)) return '젖은 머리카락을 귀 뒤로 넘기고';
    if (/짧은|단발/.test(h)) return '이마에 붙은 머리카락을 털어 내고';
    return '소매로 얼굴의 물기를 훔치고';
  }
  const TOK = {
    name: (c, a) => word(c.p.name, a),
    call: (c, a) => word(c.p.addressForm || c.p.name + ' 씨', a),
    comp: (c, a) => word(c.compShort, a),
    compFull: (c, a) => word(c.compName, a),
    owner: (c, a) => word(c.ownerShort || c.compShort, a),
    tone: (c, a) => pick(a, axis(c.p, 'social')),
    risk: (c, a) => pick(a, axis(c.p, 'risk')),
    voice: (c, a) => pick(a, axis(c.p, 'voice')),
    bg: (c, a) => pick(a, Math.max(0, BG.BG_KEYS.indexOf(c.p.background))),
    v: (c, a) => pick(a, c.variant === 'B' ? 1 : 0),
    gore: (c, a) => pick(a, c.reduced ? 1 : 0),
    trait: (c, a) => {
      let def = '';
      const traits = c.p.traits || [];
      const opts = String(a).split(';');
      for (let i = 0; i < opts.length; i++) {
        const k = opts[i].indexOf('=');
        if (k < 0) continue;
        const key = opts[i].slice(0, k).trim();
        const val = opts[i].slice(k + 1);
        if (key === '*') def = val;
        else if (traits.indexOf(key) >= 0) return val;
      }
      return def;
    },
    danger: (c, a) => word(c.hook.danger, a),
    place: (c, a) => word(c.hook.place, a),
    object: (c, a) => word(c.hook.object, a),
    look: (c) => lookPhrase(c.p),
    watch: (c, a) => word((((c.p.appearance || {}).features || []).indexOf('손목시계') >= 0 ? '손목시계' : '휴대전화'), a),
    outfit: (c, a) => word((c.p.appearance || {}).outfit || '평상복', a),
    hair: (c, a) => word((c.p.appearance || {}).hair || '머리', a),
    age: (c) => String(c.p.age),
    tool: (c, a) => word((BG.TOOLS[c.p.tool] || BG.TOOLS.notebook).label, a),
  };
  BG.text = {};
  /* 안쪽 토큰부터 바꾸도록 여러 번 돌린다: {v:… {compFull:이} …} */
  BG.text.render = function (str, ctx) {
    let s = String(str);
    for (let pass = 0; pass < 4; pass++) {
      const next = s.replace(/\{([a-zA-Z]+)(?::([^{}]*))?\}/g, function (m, key, arg) {
        const fn = TOK[key];
        if (!fn || !ctx) return m;
        try {
          return fn(ctx, arg == null ? '' : arg);
        } catch (e) {
          return m;
        }
      });
      if (next === s) break;
      s = next;
    }
    return s;
  };
  BG.text.tokens = Object.keys(TOK);

  /* 한 줄을 표시 단위로 바꾼다.
   * "# …" 장소·시각 / "※ …" 안내 / "! …" 경고 / "이름[층]: 대사" / "나: 대사" / 그 외 서술 */
  BG.text.parseLine = function (s) {
    if (s.indexOf('# ') === 0) return { k: 'head', text: s.slice(2) };
    if (s.indexOf('※') === 0) return { k: 'note', text: s.replace(/^※\s*/, '') };
    if (s.indexOf('! ') === 0) return { k: 'warn', text: s.slice(2) };
    if (s.indexOf('> ') === 0) return { k: 'narr', text: s.slice(2) };
    const m = /^([^\s:[\]]{1,10})(?:\[([^\]]+)\])?:\s+([\s\S]+)$/.exec(s);
    if (m) {
      if (m[1] === '나') return { k: 'me', text: m[3] };
      const id = BG.alias[m[1]];
      if (id) {
        const ch = BG.chars[id];
        return { k: 'say', who: id, name: ch.name, layer: m[2] || ch.layer || '현재', text: m[3] };
      }
    }
    return { k: 'narr', text: s };
  };

  /* 원고 배열 → 페이지 배열. 원고 항목은 문자열 또는 {if, then, else} */
  BG.text.flatten = function (arr, run, out) {
    out = out || [];
    if (arr == null) return out;
    if (!Array.isArray(arr)) arr = [arr];
    arr.forEach(function (item) {
      if (item == null) return;
      if (typeof item === 'string') out.push(item);
      else if (Array.isArray(item)) BG.text.flatten(item, run, out);
      else if (typeof item === 'object') {
        if (BG.cond(item.if, run)) BG.text.flatten(item.then, run, out);
        else BG.text.flatten(item.else, run, out);
      }
    });
    return out;
  };
  BG.text.build = function (arr, ctx, run) {
    const flat = BG.text.flatten(arr, run);
    const pages = [[]];
    flat.forEach(function (raw) {
      if (raw === '---') {
        if (pages[pages.length - 1].length) pages.push([]);
        return;
      }
      const s = BG.text.render(raw, ctx).trim();
      if (!s) return;
      pages[pages.length - 1].push(BG.text.parseLine(s));
    });
    if (!pages[pages.length - 1].length && pages.length > 1) pages.pop();
    return pages;
  };

  /* ───────── 조건식 ───────── */
  BG.cond = function (c, run) {
    if (!c) return true;
    if (!run) return false;
    const r = run.rel || {};
    const keys = Object.keys(c);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = c[k];
      let ok = true;
      switch (k) {
        case 'trust': ok = r.trust >= v; break;
        case 'intimacy': ok = r.intimacy >= v; break;
        case 'trustLt': ok = r.trust < v; break;
        case 'intimacyLt': ok = r.intimacy < v; break;
        case 'flag': ok = [].concat(v).every((f) => run.flags[f]); break;
        case 'noFlag': ok = [].concat(v).every((f) => !run.flags[f]); break;
        case 'promise': ok = !!r.promises[v]; break;
        case 'noPromise': ok = !r.promises[v]; break;
        case 'promiseSet': ok = r.promises[v] === 'set'; break;
        case 'kept': ok = r.promises[v] === 'kept'; break;
        case 'broken': ok = r.promises[v] === 'broken'; break;
        case 'milestone': ok = [].concat(v).every((m) => r.milestones[m]); break;
        case 'noMilestone': ok = [].concat(v).every((m) => !r.milestones[m]); break;
        case 'boundary':
          ok = v === true
            ? Object.keys(r.boundaries).some((b) => !r.boundaries[b].resolved)
            : !!(r.boundaries[v] && !r.boundaries[v].resolved);
          break;
        case 'noBoundary':
          ok = v === true
            ? !Object.keys(r.boundaries).some((b) => !r.boundaries[b].resolved)
            : !(r.boundaries[v] && !r.boundaries[v].resolved);
          break;
        case 'variant': ok = run.cs ? run.variants[run.cs.id] === v : false; break;
        case 'clue': ok = [].concat(v).every((id) => run.clues[id]); break;
        case 'noClue': ok = [].concat(v).every((id) => !run.clues[id]); break;
        case 'chapter': ok = run.chapter === v; break;
        case 'interest': ok = [].concat(v).indexOf(run.interest) >= 0; break;
        case 'notInterest': ok = [].concat(v).indexOf(run.interest) < 0; break;
        case 'hurt': ok = BG.engine && BG.engine.companionHurt ? BG.engine.companionHurt() === v : false; break;
        case 'trait': ok = (run.profile.traits || []).indexOf(v) >= 0; break;
        case 'bg': ok = run.profile.background === v; break;
        case 'outcome': ok = run.results.length ? run.results[run.results.length - 1].outcome === v : false; break;
        case 'finalOutcome': ok = run.fin ? run.fin.outcome === v : false; break;
        case 'endType': ok = !!run.over && run.over.type === v; break;
        case 'endRel': ok = !!run.over && run.over.rel === v; break;
        case 'supply': ok = run.res.supply >= v; break;
        case 'ready': ok = (BG.engine && BG.engine.romanceReady ? BG.engine.romanceReady() : false) === v; break;
        case 'any': ok = v.some((x) => BG.cond(x, run)); break;
        case 'all': ok = v.every((x) => BG.cond(x, run)); break;
        case 'not': ok = !BG.cond(v, run); break;
        default: ok = true;
      }
      if (!ok) return false;
    }
    return true;
  };

  /* ───────── 콘텐츠 등록 ───────── */
  BG.defineScene = function (id, sc) {
    if (Array.isArray(sc)) sc = { text: sc };
    sc.id = id;
    BG.content.scenes[id] = sc;
  };

  BG.defineCase = function (def) {
    BG.content.cases[def.id] = def;
    BG.defineScene(def.id + '.intro', { text: def.intro, title: def.title });
    BG.defineScene(def.id + '.ownerIntro', { text: def.ownerIntro });
    ['stable', 'temp', 'retreat'].forEach(function (o) {
      BG.defineScene(def.id + '.outro.' + o, { text: def.outro[o] });
    });
  };

  BG.defineRoute = function (def) {
    BG.content.routes[def.id] = def;
    Object.keys(def.scenes).forEach(function (k) {
      BG.defineScene(def.id + '.' + k, def.scenes[k]);
    });
  };

  BG.clone = function (o) {
    return JSON.parse(JSON.stringify(o));
  };
})();
