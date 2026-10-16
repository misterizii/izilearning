/* Halaman guru: membuat room, menjadi "server" P2P, menilai jawaban. */
(function () {
  'use strict';
  const IZI = window.IZI;
  const C = window.IZI_CONFIG;
  const { h, $, $$ } = IZI;
  const SAVE_KEY = 'host-room';

  let parsed = null; // hasil baca Excel
  let room = null; // state sesi (disimpan di IndexedDB browser guru)
  let peer = null;
  const conns = new Map(); // clientId -> DataConnection
  let arena = null;
  let downloaded = false;

  const settings = {
    game: 'classic',
    preset: 'ujian',
  };
  const PRESETS = {
    ujian: { feedback: false, rank: false, reviewNow: false },
    challenge: { feedback: true, rank: true, reviewNow: true },
  };

  // =============== SETUP ===============
  function initSetup() {
    const grid = $('#game-grid');
    Object.entries(IZI.GAMES).forEach(([k, g]) => {
      grid.appendChild(
        h(
          'button',
          { class: 'game-card' + (k === settings.game ? ' on' : ''), dataset: { game: k }, onclick: () => pickGame(k) },
          h('span', { class: 'ge' }, g.emoji),
          h('b', null, g.name),
          h('small', null, g.desc)
        )
      );
    });
    $$('#preset button').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
    applyPreset('ujian');
    $('#f-kkm').value = C.DEFAULT_KKM;

    const file = $('#file');
    file.addEventListener('change', () => file.files[0] && loadFile(file.files[0]));
    const drop = $('#drop');
    ['dragenter', 'dragover'].forEach((e) =>
      drop.addEventListener(e, (ev) => {
        ev.preventDefault();
        drop.classList.add('over');
      })
    );
    ['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (ev) => {
      ev.preventDefault();
      if (ev.dataTransfer.files[0]) loadFile(ev.dataTransfer.files[0]);
    });
    $('#btn-template').addEventListener('click', () => IZI.downloadTemplate());
    $('#btn-create').addEventListener('click', createRoom);
  }

  function pickGame(k) {
    settings.game = k;
    $$('.game-card').forEach((c) => c.classList.toggle('on', c.dataset.game === k));
    IZI.sound.play('click');
  }
  function applyPreset(name) {
    settings.preset = name;
    $$('#preset button').forEach((b) => b.classList.toggle('on', b.dataset.preset === name));
    const p = PRESETS[name];
    $('#f-feedback').checked = p.feedback;
    $('#f-rank').checked = p.rank;
    $('#f-reviewNow').checked = p.reviewNow;
  }

  async function loadFile(f) {
    const out = $('#parse-result');
    out.innerHTML = '';
    $('#drop-txt').innerHTML = `⏳ Membaca <b>${escapeHtml(f.name)}</b>…`;
    try {
      parsed = await IZI.parseQuestionFile(f);
      $('#drop-txt').innerHTML = `✅ <b>${escapeHtml(f.name)}</b> · klik untuk ganti file`;
      const nImg = parsed.questions.filter((q) => q.image).length;
      if (!$('#f-title').value) $('#f-title').value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
      $('#f-count').max = parsed.questions.length;
      IZI.add(out, 
        h('div', { class: 'ok-note' }, `📚 ${parsed.questions.length} soal siap dipakai${nImg ? ` · 🖼️ ${nImg} soal bergambar` : ''}.`),
        parsed.warnings.length
          ? h('details', { class: 'warn-note' }, h('summary', null, `⚠️ ${parsed.warnings.length} baris dilewati (klik untuk lihat)`), h('ul', null, parsed.warnings.map((w) => h('li', null, w))))
          : null,
        h(
          'details',
          { class: 'preview' },
          h('summary', null, '👀 Lihat daftar soal'),
          h(
            'ol',
            null,
            parsed.questions.map((q) =>
              h(
                'li',
                null,
                h('div', { class: 'pv-q' }, q.text),
                q.image ? h('img', { class: 'pv-img', src: q.image.id ? parsed.images[q.image.id] : q.image.url, alt: '' }) : null,
                h(
                  'div',
                  { class: 'pv-opts' },
                  Object.entries(q.options).map(([k, v]) => h('span', { class: k === q.key ? 'key' : '' }, `${k}. ${v}`))
                )
              )
            )
          )
        )
      );
      $('#btn-create').disabled = false;
      IZI.sound.play('correct');
    } catch (e) {
      console.error(e);
      parsed = null;
      $('#btn-create').disabled = true;
      $('#drop-txt').innerHTML = `<b>Klik untuk pilih file</b> atau seret file Excel ke sini`;
      IZI.add(out, h('div', { class: 'err-note' }, '❌ ' + (e.message || 'File tidak bisa dibaca.')));
      IZI.sound.play('wrong');
    }
    $('#file').value = '';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  async function createRoom() {
    if (!parsed) return;
    const saved = await IZI.db.get(SAVE_KEY);
    if (saved && saved.status === 'ended' && !saved.downloaded) {
      const ok = await IZI.confirm('Nilai sesi sebelumnya belum di-download', `Sesi "${saved.settings.title}" akan terhapus. Lanjut membuat room baru?`, 'Ya, buat baru');
      if (!ok) return;
    }
    const n = parsed.questions.length;
    let count = parseInt($('#f-count').value, 10) || 0;
    if (count <= 0 || count > n) count = 0;
    room = {
      v: 1,
      code: IZI.genCode(),
      createdAt: Date.now(),
      status: 'lobby',
      startAt: null,
      endAt: null,
      endedAt: null,
      downloaded: false,
      settings: {
        title: $('#f-title').value.trim() || 'Ujian',
        game: settings.game,
        preset: settings.preset,
        durationMin: Math.min(300, Math.max(1, parseInt($('#f-duration').value, 10) || 30)),
        kkm: Math.min(100, Math.max(0, parseInt($('#f-kkm').value, 10) || 0)),
        questionCount: count,
        shuffleQuestions: $('#f-shuffleQ').checked,
        shuffleOptions: $('#f-shuffleO').checked,
        feedback: $('#f-feedback').checked,
        showRank: $('#f-rank').checked,
        reviewWhen: $('#f-reviewNow').checked ? 'finish' : 'end',
      },
      questions: parsed.questions,
      images: parsed.images,
      players: {},
    };
    downloaded = false;
    persistImages();
    persistNow();
    openPeer(true);
    enterLobby();
  }

  // =============== RESUME ===============
  async function checkResume() {
    const saved = await IZI.db.get(SAVE_KEY);
    if (!saved || !saved.code) return;
    const box = $('#resume');
    const nP = Object.values(saved.players || {}).filter((p) => !p.kicked).length;
    const when = new Date(saved.createdAt).toLocaleString('id-ID');
    box.hidden = false;
    box.innerHTML = '';
    if (saved.status === 'ended') {
      box.append(
        h('h3', null, '🗂️ Sesi terakhir'),
        h('p', null, `"${saved.settings.title}" · ${nP} murid · ${when}${saved.downloaded ? '' : ' · ⚠️ nilai belum di-download'}`),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn primary', onclick: () => resume(saved) }, '📊 Lihat Hasil'),
          h('button', { class: 'btn ghost', onclick: () => {
              room = saved;
              IZI.exportResults(saved);
              markDownloaded();
              checkResume();
            } }, '⬇️ Download Nilai'),
          h('button', { class: 'btn ghost', onclick: () => discard() }, '🗑️ Hapus')
        )
      );
    } else {
      box.append(
        h('h3', null, '⏯️ Ada sesi yang belum selesai'),
        h('p', null, `"${saved.settings.title}" · kode ${saved.code} · ${nP} murid · ${when}`),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn primary', onclick: () => resume(saved) }, '▶️ Lanjutkan Sesi'),
          h('button', { class: 'btn ghost', onclick: () => discard() }, '🗑️ Buang')
        )
      );
    }
  }
  async function resume(saved) {
    room = saved;
    room.images = (await IZI.db.get(SAVE_KEY + '-images')) || {};
    downloaded = !!room.downloaded;
    Object.values(room.players).forEach((p) => (p.connected = false));
    $('#resume').hidden = true;
    if (room.status === 'ended') return enterEnd();
    openPeer(false);
    if (room.status === 'lobby') enterLobby();
    else enterPlay();
  }
  async function discard() {
    if (!(await IZI.confirm('Hapus sesi ini?', 'Data sesi di browser ini akan dihapus.', 'Hapus'))) return;
    await IZI.db.del(SAVE_KEY);
    $('#resume').hidden = true;
  }

  // =============== PERSIST ===============
  let saveT = null;
  function persist() {
    clearTimeout(saveT);
    saveT = setTimeout(persistNow, 150);
  }
  // Gambar disimpan terpisah (sekali saja) supaya penyimpanan tiap jawaban tetap ringan.
  function persistNow() {
    if (!room) return;
    clearTimeout(saveT);
    const { images, ...rest } = room;
    const copy = JSON.parse(JSON.stringify(rest));
    Object.values(copy.players).forEach((p) => delete p.connected);
    IZI.db.set(SAVE_KEY, copy);
  }
  function persistImages() {
    IZI.db.set(SAVE_KEY + '-images', room.images || {});
  }

  // =============== JARINGAN ===============
  function setNet(state, text) {
    const n = $('#net');
    n.hidden = false;
    n.className = 'net ' + state;
    n.textContent = text || { connecting: '⏳ Menyiapkan room…', online: '🟢 Online', reconnecting: '🟠 Menyambung ulang…', offline: '🔴 Offline' }[state];
  }

  function openPeer(isNew) {
    setNet('connecting');
    const p = new Peer(IZI.peerId(room.code), IZI.peerOptions());
    peer = p;
    let opened = false;
    p.on('open', () => {
      opened = true;
      setNet('online');
    });
    p.on('connection', setupConn);
    p.on('disconnected', () => {
      if (p !== peer || p.destroyed) return;
      setNet('reconnecting');
      setTimeout(() => {
        if (p === peer && !p.destroyed && p.disconnected) p.reconnect();
      }, 2500);
    });
    p.on('error', (err) => {
      console.warn('Peer error', err.type, err);
      if (p !== peer) return;
      if (err.type === 'peer-unavailable') return; // tidak relevan untuk host
      if (err.type === 'unavailable-id' && !opened) {
        p.destroy();
        const empty = !Object.keys(room.players).length && room.status === 'lobby';
        if (isNew && empty) {
          room.code = IZI.genCode();
          persistNow();
          renderCode();
          openPeer(true);
        } else {
          setNet('reconnecting', '🟠 Kode masih dipakai sesi lama, mencoba lagi…');
          setTimeout(() => openPeer(false), 4000);
        }
        return;
      }
      if (!opened) {
        setNet('offline', '🔴 Tidak bisa terhubung ke internet. Mencoba lagi…');
        p.destroy();
        setTimeout(() => openPeer(isNew), 4000);
      } else if (p.disconnected) {
        setNet('reconnecting');
      }
    });
  }

  function setupConn(conn) {
    conn.on('data', (m) => {
      try {
        onMsg(conn, m);
      } catch (e) {
        console.error(e);
      }
    });
    const closed = () => {
      const id = conn.clientId;
      if (id && conns.get(id) === conn) {
        conns.delete(id);
        const p = room.players[id];
        if (p) p.connected = false;
        rosterChanged();
      }
    };
    conn.on('close', closed);
    conn.on('error', closed);
  }

  const send = (p, msg) => IZI.safeSend(conns.get(p.id), msg);
  const activePlayers = () => Object.values(room.players).filter((p) => !p.kicked);
  const Q = (id) => room.questions.find((q) => q.id === id);

  function onMsg(conn, m) {
    if (!m || typeof m !== 'object' || !room) return;
    if (m.t === 'hello') return onHello(conn, m);
    const p = conn.clientId && room.players[conn.clientId];
    if (!p || p.kicked) return;
    if (m.t === 'answer') onAnswer(p, m);
    else if (m.t === 'finish') {
      if (room.status === 'playing' && Date.now() >= room.startAt) finishPlayer(p);
    } else if (m.t === 'tab') {
      if (room.status === 'playing' && !p.finishedAt) {
        p.tabSwitches = (p.tabSwitches || 0) + 1;
        IZI.toast(`⚠️ ${p.name} keluar dari halaman ujian`, 'warn');
        scheduleRender();
        persist();
      }
    } else if (m.t === 'ping') IZI.safeSend(conn, { t: 'pong' });
  }

  function reject(conn, reason) {
    IZI.safeSend(conn, { t: 'reject', reason });
    setTimeout(() => conn.close(), 500);
  }

  function onHello(conn, m) {
    const id = String(m.clientId || '').slice(0, 64);
    const name = IZI.cleanName(m.name);
    const avatar = IZI.AVATARS.includes(m.avatar) ? m.avatar : IZI.AVATARS[IZI.randInt(IZI.AVATARS.length)];
    if (!id || name.length < 2) return reject(conn, 'Nama minimal 2 huruf.');
    let p = room.players[id];
    if (p) {
      if (p.kicked) return reject(conn, 'Kamu sudah dikeluarkan dari room ini oleh guru.');
      const old = conns.get(id);
      if (old && old !== conn) {
        old.clientId = null;
        try {
          old.close();
        } catch (e) {}
      }
    } else {
      if (room.status === 'ended') return reject(conn, 'Sesi ini sudah berakhir.');
      const act = activePlayers();
      if (act.length >= C.MAX_PLAYERS) return reject(conn, 'Room sudah penuh.');
      if (act.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
        return reject(conn, `Nama "${name}" sudah dipakai teman. Tambahkan nama belakang atau inisial.`);
      }
      p = room.players[id] = {
        id,
        name,
        avatar,
        joinedAt: Date.now(),
        order: null,
        optOrder: null,
        answers: {},
        points: 0,
        streak: 0,
        bestStreak: 0,
        finishedAt: null,
        tabSwitches: 0,
        kicked: false,
      };
      if (room.status === 'playing') {
        assign(p);
        IZI.toast(`${avatar} ${name} bergabung terlambat`, 'info');
      }
      IZI.sound.play('join');
    }
    conn.clientId = id;
    conns.set(id, conn);
    p.connected = true;
    IZI.safeSend(conn, welcomeMsg(p));
    sendImages(conn, p, Array.isArray(m.have) ? m.have : []);
    rosterChanged();
    persist();
  }

  function sendImages(conn, p, have) {
    const ids = new Set();
    const qs = p.order ? p.order.map(Q) : room.questions;
    qs.forEach((q) => q && q.image && q.image.id && ids.add(q.image.id));
    have.forEach((x) => ids.delete(x));
    ids.forEach((id) => room.images[id] && IZI.safeSend(conn, { t: 'img', id, data: room.images[id] }));
  }

  function publicRoom(p) {
    const S = room.settings;
    return {
      title: S.title,
      game: S.game,
      total: p.order ? p.order.length : S.questionCount || room.questions.length,
      feedback: S.feedback,
      showRank: S.showRank,
      kkm: S.kkm,
      durationMin: S.durationMin,
      reviewWhen: S.reviewWhen,
    };
  }

  function questionsFor(p) {
    return p.order.map((qid) => {
      const q = Q(qid);
      return { id: q.id, text: q.text, image: q.image, options: p.optOrder[qid].map((k) => ({ k, text: q.options[k] })) };
    });
  }

  function answeredFor(p) {
    const out = {};
    for (const [qid, a] of Object.entries(p.answers)) {
      out[qid] = room.settings.feedback ? { c: a.c, ok: a.ok, key: Q(qid).key } : { c: a.c };
    }
    return out;
  }

  function welcomeMsg(p) {
    const now = Date.now();
    const m = { t: 'welcome', you: { name: p.name, avatar: p.avatar }, room: publicRoom(p), status: room.status };
    if (room.status === 'lobby') m.lobby = lobbyList();
    if (room.status !== 'lobby' && p.order) {
      m.questions = questionsFor(p);
      m.answered = answeredFor(p);
      m.points = room.settings.feedback ? p.points : null;
      m.streak = room.settings.feedback ? p.streak : 0;
    }
    if (room.status === 'playing') {
      m.startInMs = Math.max(0, room.startAt - now);
      m.remainingMs = room.endAt - now;
    }
    if (p.finishedAt) m.result = resultFor(p);
    if (canReview(p)) m.review = reviewFor(p);
    return m;
  }

  function lobbyList() {
    return activePlayers().map((p) => ({ n: p.name, a: p.avatar }));
  }

  function assign(p) {
    const S = room.settings;
    let ids = room.questions.map((q) => q.id);
    if (S.shuffleQuestions) ids = IZI.shuffle(ids);
    if (S.questionCount > 0 && S.questionCount < ids.length) {
      ids = S.shuffleQuestions ? ids.slice(0, S.questionCount) : IZI.shuffle(ids).slice(0, S.questionCount);
      if (!S.shuffleQuestions) ids.sort((a, b) => Q(a).no - Q(b).no);
    }
    p.order = ids;
    p.optOrder = {};
    ids.forEach((id) => {
      const keys = Object.keys(Q(id).options).sort();
      p.optOrder[id] = S.shuffleOptions ? IZI.shuffle(keys) : keys;
    });
  }

  // =============== GAME ===============
  function startGame() {
    const list = activePlayers();
    if (!list.length) return;
    room.status = 'playing';
    room.startAt = Date.now() + 4000;
    room.endAt = room.startAt + room.settings.durationMin * 60000;
    list.forEach((p) => {
      if (!p.order) assign(p);
      send(p, {
        t: 'start',
        room: publicRoom(p),
        questions: questionsFor(p),
        startInMs: room.startAt - Date.now(),
        remainingMs: room.endAt - Date.now(),
      });
      const conn = conns.get(p.id);
      if (conn) sendImages(conn, p, []);
    });
    persistNow();
    enterPlay();
  }

  function onAnswer(p, m) {
    const now = Date.now();
    const qid = String(m.qid || '');
    const ack = (extra) => send(p, Object.assign({ t: 'ack', qid }, extra));
    if (room.status !== 'playing' || p.finishedAt || now < room.startAt) return ack({ late: true });
    if (now > room.endAt + 5000) return ack({ late: true });
    if (!p.order || !p.order.includes(qid)) return;
    const q = Q(qid);
    const fb = room.settings.feedback;
    if (p.answers[qid]) {
      const a = p.answers[qid];
      return ack(fb ? { ok: a.ok, key: q.key, pts: a.pts, points: p.points, streak: p.streak } : {});
    }
    const choice = ['A', 'B', 'C', 'D'].includes(m.choice) && q.options[m.choice] ? m.choice : null;
    if (!choice) return;
    const ok = choice === q.key;
    const ms = Math.min(3600000, Math.max(0, Number(m.ms) || 0));
    let pts = 0;
    if (ok) {
      p.streak++;
      p.bestStreak = Math.max(p.bestStreak, p.streak);
      pts = 500 + Math.round(500 * Math.max(0, 1 - ms / 30000)) + 100 * Math.min(p.streak - 1, 5);
    } else p.streak = 0;
    p.points += pts;
    p.answers[qid] = { c: choice, ok, ms, at: now, pts };
    ack(fb ? { ok, key: q.key, pts, points: p.points, streak: p.streak } : {});
    rankDirty = true;
    if (Object.keys(p.answers).length >= p.order.length) finishPlayer(p);
    scheduleRender();
    persist();
  }

  function resultFor(p) {
    const s = IZI.summarizePlayer(room, p);
    return {
      correct: s.correct,
      wrong: s.wrong,
      empty: s.empty,
      total: s.total,
      score: s.score,
      passed: s.passed,
      kkm: room.settings.kkm,
      points: p.points,
      bestStreak: p.bestStreak,
      rank: room.settings.showRank ? rankOf(p) : null,
      of: activePlayers().length,
    };
  }
  function rankOf(p) {
    const sorted = activePlayers().sort((a, b) => b.points - a.points);
    return sorted.findIndex((x) => x.id === p.id) + 1;
  }
  function canReview(p) {
    return !!p.finishedAt && (room.settings.reviewWhen === 'finish' || room.status === 'ended');
  }
  function reviewFor(p) {
    return p.order.map((qid) => {
      const q = Q(qid);
      return {
        id: qid,
        text: q.text,
        image: q.image,
        options: p.optOrder[qid].map((k) => ({ k, text: q.options[k] })),
        key: q.key,
        chosen: p.answers[qid] ? p.answers[qid].c : null,
        explanation: q.explanation || '',
      };
    });
  }

  function finishPlayer(p) {
    if (p.finishedAt) return;
    p.finishedAt = Math.min(Date.now(), room.endAt || Date.now());
    send(p, { t: 'result', result: resultFor(p) });
    if (canReview(p)) send(p, { t: 'review', items: reviewFor(p) });
    rankDirty = true;
    scheduleRender();
    persist();
    if (room.status === 'playing' && activePlayers().every((x) => x.finishedAt)) {
      IZI.toast('✅ Semua murid sudah selesai!', 'ok');
      setTimeout(() => room.status === 'playing' && endGame(), 1500);
    }
  }

  function endGame() {
    if (room.status === 'ended') return;
    room.status = 'ended';
    room.endedAt = Date.now();
    activePlayers().forEach((p) => {
      if (!p.order) assign(p);
      finishPlayer(p);
    });
    activePlayers().forEach((p) => {
      send(p, { t: 'result', result: resultFor(p) });
      send(p, { t: 'review', items: reviewFor(p) });
      send(p, { t: 'ended' });
    });
    persistNow();
    IZI.sound.play('win');
    enterEnd();
  }

  let rankDirty = false;
  setInterval(() => {
    if (!room || !rankDirty || !room.settings.showRank || room.status === 'lobby') return;
    rankDirty = false;
    const sorted = activePlayers().sort((a, b) => b.points - a.points);
    const top = sorted.slice(0, 5).map((p) => ({ n: p.name, a: p.avatar, p: p.points }));
    sorted.forEach((p, i) => send(p, { t: 'rank', top, rank: i + 1, of: sorted.length, points: p.points }));
  }, 2000);

  // =============== LOBBY UI ===============
  function joinUrl() {
    const u = new URL('murid.html', location.href);
    const q = IZI.peerQuery();
    q.set('kode', room.code);
    u.search = q.toString();
    u.hash = '';
    return u.toString();
  }
  function renderCode() {
    $('#room-code').textContent = room.code;
    $('#play-code').textContent = room.code;
    const url = joinUrl();
    const short = new URL('murid.html', location.href);
    $('#join-url-short').textContent = location.protocol === 'file:' ? 'murid.html' : short.host + short.pathname.replace(/murid\.html$/, '');
    $('#file-note').hidden = location.protocol !== 'file:';
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      $('#qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    } catch (e) {
      $('#qr').textContent = '';
    }
    $('#join-mini').textContent = `Murid terlambat? Masuk dengan kode ${room.code}`;
  }

  function enterLobby() {
    renderCode();
    const g = IZI.GAMES[room.settings.game];
    $('#lobby-game').textContent = `${g.emoji} ${g.name} · ${room.settings.durationMin} menit · ${room.settings.questionCount || room.questions.length} soal`;
    renderLobby();
    IZI.show('scr-lobby');
    IZI.keepAwake();
  }

  function renderLobby() {
    const list = activePlayers();
    $('#lobby-count').textContent = list.length;
    $('#btn-launch').disabled = !list.length;
    const box = $('#lobby-players');
    box.innerHTML = '';
    if (!list.length) box.append(h('p', { class: 'muted waiting' }, 'Menunggu murid bergabung… 👀'));
    list.forEach((p) =>
      box.append(
        h(
          'button',
          { class: 'player pop-in' + (p.connected ? '' : ' off'), title: 'Keluarkan ' + p.name, onclick: () => kick(p) },
          h('span', { class: 'av' }, p.avatar),
          h('span', { class: 'nm' }, p.name)
        )
      )
    );
  }

  async function kick(p) {
    if (!(await IZI.confirm(`Keluarkan ${p.name}?`, 'Murid ini tidak bisa masuk lagi dengan nama yang sama di perangkat ini.', 'Keluarkan'))) return;
    p.kicked = true;
    send(p, { t: 'kicked' });
    const c = conns.get(p.id);
    setTimeout(() => c && c.close(), 400);
    conns.delete(p.id);
    rosterChanged();
    persist();
    if (room.status === 'playing' && activePlayers().length && activePlayers().every((x) => x.finishedAt)) endGame();
  }

  function rosterChanged() {
    if (!room) return;
    if (room.status === 'lobby') {
      renderLobby();
      const lobby = lobbyList();
      activePlayers().forEach((p) => send(p, { t: 'lobby', players: lobby }));
    } else scheduleRender();
  }

  // =============== PLAY UI ===============
  let renderT = null;
  function scheduleRender() {
    if (renderT) return;
    renderT = setTimeout(() => {
      renderT = null;
      if (room && room.status === 'playing') renderPlay();
    }, 300);
  }

  function arenaList() {
    return activePlayers().map((p) => {
      const s = IZI.summarizePlayer(room, p);
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        answered: s.answered,
        total: s.total,
        correct: s.correct,
        points: p.points,
        finished: !!p.finishedAt,
        connected: !!p.connected,
      };
    });
  }

  function enterPlay() {
    const g = IZI.GAMES[room.settings.game];
    $('#play-title').textContent = `${g.emoji} ${g.name} · ${room.settings.title}`;
    renderCode();
    arena = IZI.createArena(room.settings.game, $('#arena'));
    renderPlay();
    IZI.show('scr-play');
    IZI.keepAwake();
  }

  function renderPlay() {
    const list = arenaList();
    arena.update(list, { showScores: room.settings.showRank });
    const done = list.filter((p) => p.finished).length;
    const online = list.filter((p) => p.connected).length;
    $('#play-stats').textContent = `👥 ${list.length} murid · 🟢 ${online} online · ✅ ${done} selesai`;
    const tb = $('#monitor-body');
    tb.innerHTML = '';
    list
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((p) => {
        const pl = room.players[p.id];
        const score = IZI.scoreOf(p.correct, p.total);
        tb.append(
          h(
            'tr',
            { class: p.connected ? '' : 'off' },
            h('td', null, h('span', { class: 'dot ' + (p.connected ? 'on' : '') }), ` ${p.avatar} ${p.name} `, h('button', { class: 'link', title: 'Keluarkan', onclick: () => kick(pl) }, '✖')),
            h('td', null, h('div', { class: 'bar' }, h('i', { style: { width: (p.answered / Math.max(1, p.total)) * 100 + '%' } })), h('small', null, `${p.answered}/${p.total}`)),
            h('td', null, p.correct),
            h('td', { class: score >= room.settings.kkm ? 'pass' : 'fail' }, score),
            h('td', null, p.points),
            h('td', null, p.finished ? '✅ Selesai' : p.connected ? '✏️ Mengerjakan' : '📴 Terputus'),
            h('td', { class: pl.tabSwitches ? 'fail' : '' }, pl.tabSwitches || 0)
          )
        );
      });
  }

  function hostTick() {
    if (!room || room.status !== 'playing') return;
    const now = Date.now();
    const cd = $('#host-countdown');
    if (now < room.startAt) {
      const n = Math.ceil((room.startAt - now) / 1000);
      cd.hidden = false;
      if (cd.textContent !== String(n)) {
        cd.textContent = n;
        IZI.sound.play('count');
      }
      $('#host-timer').textContent = IZI.fmtTime(room.endAt - room.startAt);
      return;
    }
    if (!cd.hidden) {
      cd.textContent = 'MULAI!';
      IZI.sound.play('go');
      setTimeout(() => (cd.hidden = true), 700);
    }
    const left = room.endAt - now;
    const t = $('#host-timer');
    t.textContent = IZI.fmtTime(left);
    t.classList.toggle('danger', left < 60000);
    if (left <= 0) {
      IZI.toast('⏰ Waktu habis!', 'warn');
      endGame();
    }
  }
  setInterval(hostTick, 250);

  // =============== END UI ===============
  function enterEnd() {
    $('#end-title').textContent = `${room.settings.title} · KKM ${room.settings.kkm}`;
    const rows = activePlayers()
      .map((p) => ({ p, s: IZI.summarizePlayer(room, p) }))
      .sort((a, b) => b.s.score - a.s.score || b.s.points - a.s.points);
    const pod = $('#podium');
    pod.innerHTML = '';
    [1, 0, 2].forEach((i) => {
      const r = rows[i];
      if (!r) return;
      pod.append(
        h(
          'div',
          { class: 'pod p' + (i + 1) },
          h('div', { class: 'av' }, r.p.avatar),
          h('div', { class: 'nm' }, r.p.name),
          h('div', { class: 'block' }, h('b', null, ['🥇', '🥈', '🥉'][i]), h('span', null, r.s.score))
        )
      );
    });
    const scores = rows.map((r) => r.s.score);
    const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
    const pass = rows.filter((r) => r.s.passed).length;
    const st = $('#end-stats');
    st.innerHTML = '';
    [
      ['👥', rows.length, 'Murid'],
      ['📈', avg, 'Rata-rata'],
      ['✅', pass, 'Lulus'],
      ['📚', rows.length - pass, 'Belum lulus'],
      ['🏔️', scores.length ? Math.max(...scores) : '-', 'Tertinggi'],
      ['🔻', scores.length ? Math.min(...scores) : '-', 'Terendah'],
    ].forEach(([e, v, l]) => st.append(h('div', { class: 'stat' }, h('span', null, e), h('b', null, v), h('small', null, l))));

    const tb = $('#end-body');
    tb.innerHTML = '';
    rows.forEach(({ p, s }, i) =>
      tb.append(
        h(
          'tr',
          null,
          h('td', null, i + 1),
          h('td', null, `${p.avatar} ${p.name}`),
          h('td', null, s.correct),
          h('td', null, s.wrong),
          h('td', null, s.empty),
          h('td', { class: s.passed ? 'pass' : 'fail' }, h('b', null, s.score)),
          h('td', null, s.passed ? '✅ Lulus' : '❌ Belum lulus'),
          h('td', null, s.points),
          h('td', { class: p.tabSwitches ? 'fail' : '' }, p.tabSwitches || 0)
        )
      )
    );

    // soal tersulit
    const stats = room.questions
      .map((q) => {
        let got = 0,
          ok = 0;
        activePlayers().forEach((p) => {
          if (p.order && p.order.includes(q.id)) {
            got++;
            if (p.answers[q.id] && p.answers[q.id].ok) ok++;
          }
        });
        return { q, got, pct: got ? Math.round((ok / got) * 100) : null };
      })
      .filter((x) => x.got)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 5);
    const hl = $('#hard-list');
    hl.innerHTML = '';
    $('#hard-card').hidden = !stats.length;
    stats.forEach((x) =>
      hl.append(
        h(
          'div',
          { class: 'hard' },
          h('span', { class: 'pct ' + (x.pct < 50 ? 'fail' : 'pass') }, x.pct + '%'),
          h('span', null, h('b', null, `Soal ${x.q.no}. `), x.q.text.length > 140 ? x.q.text.slice(0, 140) + '…' : x.q.text, h('small', { class: 'muted' }, ` (kunci ${x.q.key})`))
        )
      )
    );
    IZI.show('scr-end');
    if (rows.length) IZI.confetti();
  }

  function markDownloaded() {
    downloaded = true;
    if (room) {
      room.downloaded = true;
      persistNow();
    }
    IZI.toast('✅ File nilai di-download', 'ok');
    return true;
  }

  // =============== TOMBOL ===============
  function bindButtons() {
    $('#btn-launch').addEventListener('click', async () => {
      const off = activePlayers().filter((p) => !p.connected).length;
      if (off && !(await IZI.confirm('Ada murid yang terputus', `${off} murid sedang offline. Mereka tetap bisa lanjut begitu tersambung kembali. Mulai sekarang?`, 'Mulai'))) return;
      startGame();
    });
    $('#btn-cancel').addEventListener('click', async () => {
      if (!(await IZI.confirm('Batalkan room?', 'Semua murid akan keluar dari room.', 'Batalkan'))) return;
      activePlayers().forEach((p) => send(p, { t: 'kicked', reason: 'Room dibatalkan oleh guru.' }));
      await IZI.db.del(SAVE_KEY);
      setTimeout(() => location.reload(), 500);
    });
    $('#btn-end').addEventListener('click', async () => {
      const left = activePlayers().filter((p) => !p.finishedAt).length;
      if (!(await IZI.confirm('Akhiri sesi sekarang?', left ? `${left} murid belum selesai. Jawaban yang belum diisi dianggap salah.` : 'Semua murid sudah selesai.', 'Akhiri'))) return;
      endGame();
    });
    $('#btn-addtime').addEventListener('click', () => {
      if (room.status !== 'playing') return;
      room.endAt += 5 * 60000;
      activePlayers().forEach((p) => !p.finishedAt && send(p, { t: 'time', remainingMs: room.endAt - Date.now() }));
      IZI.toast('⏱️ Waktu ditambah 5 menit', 'ok');
      persist();
    });
    $('#btn-copy').addEventListener('click', () => {
      const url = joinUrl();
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
        .then(() => IZI.toast('🔗 Link disalin', 'ok'))
        .catch(() => prompt('Salin link ini:', url));
    });
    $$('.tabs [data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        $$('.tabs [data-tab]').forEach((x) => x.classList.toggle('on', x === b));
        $$('.tab-pane').forEach((x) => x.classList.toggle('on', x.id === 'tab-' + b.dataset.tab));
      })
    );
    $('#btn-full').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    });
    $('#btn-download').addEventListener('click', () => {
      IZI.exportResults(room);
      markDownloaded();
    });
    $('#btn-new').addEventListener('click', async () => {
      if (!downloaded && !(await IZI.confirm('Nilai belum di-download', 'Yakin membuat room baru? Kamu masih bisa download nilai sesi ini dari halaman awal.', 'Lanjut'))) return;
      if (peer) peer.destroy();
      location.reload();
    });
    window.addEventListener('pagehide', () => persistNow());
    window.addEventListener('beforeunload', (e) => {
      if (room && (room.status === 'playing' || (room.status === 'lobby' && activePlayers().length))) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    IZI.bindMute();
    document.addEventListener('pointerdown', () => IZI.sound.unlock(), { once: true });
    initSetup();
    bindButtons();
    checkResume();
  });

  // Untuk pengujian otomatis
  window.__host = {
    get room() {
      return room;
    },
    endGame: () => endGame(),
  };
})();
