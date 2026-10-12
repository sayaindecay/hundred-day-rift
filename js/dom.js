/* 백일의 틈 — dom: 작은 DOM 도우미와 모달.
 * 사용자 입력 문자열은 언제나 텍스트 노드로만 넣는다(innerHTML 미사용). */
(function () {
  'use strict';
  const BG = window.BG;

  function append(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(e, x); }); return; }
    if (c instanceof Node) e.appendChild(c);
    else e.appendChild(document.createTextNode(String(c)));
  }

  BG.h = function (tag, props) {
    const e = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        const v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'style') e.style.cssText = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') e[k] = v;
        else e.setAttribute(k, v === true ? '' : String(v));
      });
    }
    for (let i = 2; i < arguments.length; i++) append(e, arguments[i]);
    return e;
  };

  /* SVG 요소(장식용 균열선 등) */
  BG.svg = function (tag, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    for (let i = 2; i < arguments.length; i++) if (arguments[i]) e.appendChild(arguments[i]);
    return e;
  };

  BG.clear = function (node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  };

  /* 모달: 확인·선택용. Promise로 고른 값을 돌려준다. Esc는 취소 */
  BG.modal = function (opts) {
    const h = BG.h;
    const root = document.getElementById('modal-root');
    const prev = document.activeElement;
    return new Promise(function (resolve) {
      function close(v) {
        document.removeEventListener('keydown', onKey, true);
        BG.clear(root);
        root.hidden = true;
        if (prev && prev.focus) prev.focus();
        resolve(v);
      }
      function onKey(ev) {
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(opts.cancelValue != null ? opts.cancelValue : null); }
        if (ev.key === 'Tab') {
          const f = box.querySelectorAll('button, input, textarea, select, a[href]');
          if (!f.length) return;
          const first = f[0], last = f[f.length - 1];
          if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
          else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
        }
      }
      const actions = (opts.actions || [{ label: '확인', value: true, primary: true }]).map(function (a) {
        return h('button', { class: 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : ''), type: 'button', onclick: function () { close(a.value); } }, a.label);
      });
      const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
        h('div', { class: 'win-bar' }, h('span', { class: 'sq', 'aria-hidden': 'true' }),
          h('h2', { id: 'modal-title', class: 'modal-title' }, opts.title || '')),
        opts.body instanceof Node ? opts.body : h('div', { class: 'modal-body' }, [].concat(opts.body || []).map(function (t) { return h('p', null, t); })),
        h('div', { class: 'modal-actions' }, actions));
      BG.clear(root);
      root.hidden = false;
      root.appendChild(h('div', { class: 'modal-back', onclick: function (ev) { if (ev.target === ev.currentTarget && opts.dismissable !== false) close(opts.cancelValue != null ? opts.cancelValue : null); } }, box));
      document.addEventListener('keydown', onKey, true);
      setTimeout(function () {
        const p = box.querySelector('.btn.primary') || box.querySelector('button');
        if (p) p.focus();
      }, 0);
    });
  };
  BG.confirm = function (title, text, okLabel, danger) {
    return BG.modal({
      title: title, body: text,
      actions: [{ label: '취소', value: false }, { label: okLabel || '확인', value: true, primary: !danger, danger: !!danger }],
      cancelValue: false,
    });
  };
  BG.alert = function (title, text) {
    return BG.modal({ title: title, body: text, actions: [{ label: '확인', value: true, primary: true }] });
  };
})();
