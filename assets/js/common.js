/* Utilitas bersama untuk halaman guru dan murid. */
(function () {
  'use strict';
  const C = window.IZI_CONFIG;
  const IZI = (window.IZI = {});

  // ---------- DOM ----------
  IZI.$ = (s, r = document) => r.querySelector(s);
  IZI.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /** Membuat elemen: h('div', {class:'x', onclick: fn}, 'teks', anak2...) */
  IZI.h = function (tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  };

  /** Seperti el.append(), tetapi melewati null/false (append() asli menulis teks "null"). */
  IZI.add = function (el, ...kids) {
    kids.flat(Infinity).forEach((c) => c != null && c !== false && el.append(c));
    return el;
  };

  IZI.show = function (id) {
    IZI.$$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
    window.scrollTo(0, 0);
  };

  // ---------- Acak & ID ----------
  IZI.randInt = function (n) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  };
  IZI.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = IZI.randInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  IZI.genCode = function (len = 6) {
    let s = '';
    for (let i = 0; i < len; i++) s += CODE_CHARS[IZI.randInt(CODE_CHARS.length)];
    return s;
  };
  IZI.normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  IZI.uid = function () {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + IZI.genCode(10);
  };

  // ---------- Format ----------
  IZI.fmtTime = function (ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const p = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  };
  IZI.fmtDuration = function (ms) {
    if (ms == null || ms < 0) return '-';
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    return m ? `${m} mnt ${s % 60} dtk` : `${s} dtk`;
  };
  IZI.cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);

  // ---------- PeerJS ----------
  /** Opsi PeerJS. Bisa ditimpa lewat URL: ?peerhost=..&peerport=..&peerpath=..&peersecure=0|1 */
  IZI.peerOptions = function () {
    const p = new URLSearchParams(location.search);
    const o = { debug: 1 };
    if (C.PEER_SERVER) Object.assign(o, C.PEER_SERVER);
    if (p.get('peerhost')) {
      o.host = p.get('peerhost');
      o.port = Number(p.get('peerport') || 9000);
      o.path = p.get('peerpath') || '/';
      o.secure = p.get('peersecure') === '1';
    }
    if (C.ICE_SERVERS) o.config = { iceServers: C.ICE_SERVERS };
    return o;
  };
  /** Parameter server peer dari URL, diteruskan ke link murid. */
  IZI.peerQuery = function () {
    const p = new URLSearchParams(location.search);
    const out = new URLSearchParams();
    ['peerhost', 'peerport', 'peerpath', 'peersecure'].forEach((k) => p.get(k) && out.set(k, p.get(k)));
    return out;
  };
  IZI.peerId = (code) => C.PEER_PREFIX + code;
  IZI.safeSend = function (conn, msg) {
    try {
      if (conn && conn.open) {
        conn.send(msg);
        return true;
      }
    } catch (e) {
      console.warn('Gagal kirim', e);
    }
    return false;
  };

  // ---------- Penyimpanan lokal (hanya di browser ini) ----------
  IZI.ls = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (e) {}
    },
    del(k) {
      try {
        localStorage.removeItem(k);
      } catch (e) {}
    },
  };

  let dbp = null;
  function openDb() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open('izilearning', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbp;
  }
  function idbReq(mode, fn) {
    return openDb().then(
      (db) =>
        new Promise((res, rej) => {
          const req = fn(db.transaction('kv', mode).objectStore('kv'));
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(req.error);
        })
    );
  }
  IZI.db = {
    get: (k) => idbReq('readonly', (s) => s.get(k)).catch(() => undefined),
    set: (k, v) => idbReq('readwrite', (s) => s.put(v, k)).catch((e) => console.warn('IDB', e)),
    del: (k) => idbReq('readwrite', (s) => s.delete(k)).catch(() => {}),
  };

  // ---------- Suara (disintesis, tanpa file) ----------
  IZI.sound = (function () {
    let ctx = null;
    let muted = IZI.ls.get('izi-muted', false);
    function ac() {
      if (!ctx) {
        const A = window.AudioContext || window.webkitAudioContext;
        if (!A) return null;
        ctx = new A();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, dur, { type = 'sine', vol = 0.15, delay = 0, slide = 0 } = {}) {
      const a = ac();
      if (!a || muted) return;
      const t = a.currentTime + delay;
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(a.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    const fx = {
      click: () => tone(660, 0.06, { type: 'square', vol: 0.04 }),
      answer: () => tone(620, 0.1, { type: 'triangle' }),
      correct: () => {
        tone(523, 0.12);
        tone(659, 0.12, { delay: 0.1 });
        tone(784, 0.22, { delay: 0.2 });
      },
      wrong: () => tone(220, 0.3, { type: 'sawtooth', vol: 0.07, slide: 0.55 }),
      tick: () => tone(880, 0.05, { type: 'triangle', vol: 0.06 }),
      count: () => tone(440, 0.15, { type: 'triangle' }),
      go: () => {
        tone(523, 0.1);
        tone(1046, 0.35, { delay: 0.1 });
      },
      pop: () => tone(900, 0.09, { type: 'triangle', slide: 0.3, vol: 0.14 }),
      hit: () => tone(160, 0.18, { type: 'square', vol: 0.08, slide: 0.5 }),
      join: () => {
        tone(700, 0.08);
        tone(1050, 0.12, { delay: 0.07 });
      },
      win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.28, { delay: i * 0.12 })),
      lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.32, { delay: i * 0.18, type: 'triangle' })),
    };
    return {
      play(n) {
        try {
          fx[n] && fx[n]();
        } catch (e) {}
      },
      unlock: ac,
      get muted() {
        return muted;
      },
      toggle() {
        muted = !muted;
        IZI.ls.set('izi-muted', muted);
        return muted;
      },
    };
  })();

  /** Tombol mute: <button data-mute>. */
  IZI.bindMute = function () {
    IZI.$$('[data-mute]').forEach((b) => {
      const upd = () => (b.textContent = IZI.sound.muted ? '🔇' : '🔊');
      upd();
      b.addEventListener('click', () => {
        IZI.sound.toggle();
        upd();
      });
    });
  };

  // ---------- Efek ----------
  IZI.confetti = function (count = 160) {
    const cv = IZI.h('canvas', { class: 'confetti' });
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d');
    const W = (cv.width = innerWidth);
    const H = (cv.height = innerHeight);
    const colors = ['#FF4D6D', '#3A86FF', '#FFBE0B', '#2EC4B6', '#8338EC', '#FB5607'];
    const ps = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: -20 - Math.random() * H * 0.5,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      vy: 2 + Math.random() * 4,
      vx: -2 + Math.random() * 4,
      r: Math.random() * Math.PI,
      vr: -0.2 + Math.random() * 0.4,
      c: colors[IZI.randInt(colors.length)],
    }));
    const t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, W, H);
      ps.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (t - t0 < 4000) requestAnimationFrame(frame);
      else cv.remove();
    })(t0);
  };

  IZI.toast = function (msg, type = 'info', ms = 2800) {
    let wrap = IZI.$('.toasts');
    if (!wrap) document.body.appendChild((wrap = IZI.h('div', { class: 'toasts' })));
    const t = IZI.h('div', { class: 'toast ' + type }, msg);
    wrap.appendChild(t);
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 400);
  };

  /** Modal konfirmasi. Mengembalikan Promise<boolean>. */
  IZI.confirm = function (title, text, okLabel = 'Ya', cancelLabel = 'Batal') {
    return new Promise((res) => {
      const close = (v) => {
        m.remove();
        res(v);
      };
      const m = IZI.h(
        'div',
        { class: 'modal-bg' },
        IZI.h(
          'div',
          { class: 'modal card' },
          IZI.h('h3', null, title),
          text ? IZI.h('p', null, text) : null,
          IZI.h(
            'div',
            { class: 'row end' },
            cancelLabel ? IZI.h('button', { class: 'btn ghost', onclick: () => close(false) }, cancelLabel) : null,
            IZI.h('button', { class: 'btn primary', onclick: () => close(true) }, okLabel)
          )
        )
      );
      document.body.appendChild(m);
    });
  };

  /** Mencegah layar mati selama game (jika didukung browser). */
  IZI.keepAwake = function () {
    if (!('wakeLock' in navigator)) return;
    let lock = null;
    const req = () => navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {});
    req();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && (!lock || lock.released)) req();
    });
  };

  IZI.AVATARS = ['🦊', '🐼', '🐯', '🐸', '🐵', '🦁', '🐨', '🐙', '🦄', '🐧', '🐶', '🐱', '🐰', '🐻', '🐲', '🦖', '🐳', '🦉', '🐝', '🐢', '🦋', '🐬', '🦜', '🐹'];

  IZI.scoreOf = (correct, total) => (total ? Math.round((correct / total) * 100) : 0);
})();
