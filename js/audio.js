/* 백일의 틈 — audio: 선택 음향. 외부 음원 없이 Web Audio로 생성한다.
 * 기본값은 꺼짐. 소리 없이도 모든 정보를 확인할 수 있다(FR-31). */
(function () {
  'use strict';
  const BG = window.BG;
  const A = (BG.audio = {});
  let ctx = null, master = null, rain = null, rainGain = null, drone = null, droneGain = null;
  let enabled = false, volume = 0.4, mood = 'calm';

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // 빗소리: 갈색 잡음 + 저역 통과
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    rain = ctx.createBufferSource();
    rain.buffer = buf;
    rain.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0.5;
    rain.connect(lp).connect(rainGain).connect(master);
    rain.start();

    // 긴장음: 낮은 두 음의 맥놀이
    droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    droneGain.connect(master);
    drone = [55, 55.7].map(function (f) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(droneGain);
      o.start();
      return o;
    });
    return true;
  }
  function apply() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(enabled ? volume : 0, t, 0.4);
    const r = mood === 'tension' ? 0.25 : mood === 'quiet' ? 0.15 : 0.5;
    const dr = mood === 'tension' ? 0.35 : 0;
    rainGain.gain.setTargetAtTime(r, t, 0.8);
    droneGain.gain.setTargetAtTime(dr, t, 0.8);
  }
  A.set = function (on, vol) {
    enabled = !!on;
    if (typeof vol === 'number') volume = Math.max(0, Math.min(1, vol));
    if (enabled && !init()) enabled = false;
    if (ctx && ctx.state === 'suspended' && enabled) ctx.resume();
    apply();
  };
  A.mood = function (m) {
    if (m === mood) return;
    mood = m;
    apply();
  };
})();
