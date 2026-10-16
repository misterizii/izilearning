/* Halaman murid: masuk room, mengerjakan soal, melihat nilai & pembahasan. */
(function () {
  'use strict';
  const IZI = window.IZI;
  const { h, $, $$ } = IZI;
  const KEY = 'izi-student';

  const S = {
    code: '',
    clientId: '',
    name: '',
    avatar: '',
    peer: null,
    conn: null,
    everConnected: false,
    attempts: 0,
    retryT: null,
    terminal: false,
    phase: 'join', // join | wait | lobby | countdown | play | waitresult | result | review | msg
    room: null,
    questions: [],
    qmap: {},
    images: {},
    queue: [],
    order: [], // urutan soal yang sudah dijawab
    answers: {}, // qid -> { c, ok, key, pending, ms }
    startLocal: 0,
    endLocal: 0,
    points: 0,
    streak: 0,
    result: null,
    review: null,
    rank: null,
    ended: false,
    stage: null,
    cur: null,
    qStart: 0,
    busy: false,
    timeUp: false,
    waiters: {},
    lastTick: -1,
    leftTab: false,
  };

  // =============== JOIN ===============
  function initJoin() {
    const params = new URLSearchParams(location.search);
    const urlCode = IZI.normCode(params.get('kode') || params.get('code'));
    const saved = IZI.ls.get(KEY, null);
    const box = $('#j-avatars');
    S.avatar = (saved && saved.avatar) || IZI.AVATARS[IZI.randInt(IZI.AVATARS.length)];
    IZI.AVATARS.forEach((a) =>
      box.append(
        h(
          'button',
          {
            type: 'button',
            class: 'av-pick' + (a === S.avatar ? ' on' : ''),
            onclick: (e) => {
              S.avatar = a;
              $$('.av-pick').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
              IZI.sound.play('click');
            },
          },
          a
        )
      )
    );
    $('#j-code').value = urlCode || '';
    if (saved && saved.name) $('#j-name').value = saved.name;
    $('#j-code').addEventListener('input', (e) => (e.target.value = IZI.normCode(e.target.value)));
    $('#join-form').addEventListener('submit', (e) => {
      e.preventDefault();
      join();
    });
    $('#wait-cancel').addEventListener('click', () => leave());

    const fresh = saved && Date.now() - (saved.ts || 0) < 12 * 3600 * 1000;
    if (fresh && saved.code && saved.clientId && (!urlCode || urlCode === saved.code)) {
      Object.assign(S, { code: saved.code, clientId: saved.clientId, name: saved.name, avatar: saved.avatar });
      S.everConnected = true; // sesi lama: jangan langsung menyerah jika guru sedang menyambung ulang
      showWait('Menyambung kembali…', `sebagai ${saved.avatar} ${saved.name} · room ${saved.code}`);
      connect();
    } else if (urlCode) {
      $('#j-name').focus();
    }
  }

  function join() {
    IZI.sound.unlock();
    const code = IZI.normCode($('#j-code').value);
    const name = IZI.cleanName($('#j-name').value);
    if (code.length !== 6) return joinError('Kode room harus 6 karakter.');
    if (name.length < 2) return joinError('Tulis nama kamu (minimal 2 huruf).');
    const saved = IZI.ls.get(KEY, null);
    S.code = code;
    S.name = name;
    S.clientId = saved && saved.code === code && saved.name === name ? saved.clientId : IZI.uid();
    S.everConnected = false;
    S.terminal = false;
    S.attempts = 0;
    $('#j-err').hidden = true;
    showWait('Menghubungkan ke room ' + code + '…', 'Pastikan HP terhubung ke internet.');
    connect();
  }

  function joinError(msg) {
    S.phase = 'join';
    const e = $('#j-err');
    e.textContent = '❌ ' + msg;
    e.hidden = false;
    IZI.show('scr-join');
    IZI.sound.play('wrong');
  }

  function showWait(title, sub) {
    if (!['play', 'countdown'].includes(S.phase)) {
      S.phase = 'wait';
      $('#wait-text').textContent = title;
      $('#wait-sub').textContent = sub || '';
      IZI.show('scr-wait');
    }
  }

  function saveSession() {
    IZI.ls.set(KEY, { code: S.code, clientId: S.clientId, name: S.name, avatar: S.avatar, ts: Date.now() });
  }

  function leave() {
    S.terminal = true;
    IZI.ls.del(KEY);
    cleanupPeer();
    location.href = 'murid.html' + (IZI.peerQuery().toString() ? '?' + IZI.peerQuery().toString() : '');
  }

  function cleanupPeer() {
    clearTimeout(S.retryT);
    try {
      S.peer && S.peer.destroy();
    } catch (e) {}
    S.peer = null;
    S.conn = null;
  }

  // =============== JARINGAN ===============
  function setNet(state) {
    const n = $('#net');
    n.hidden = state === 'online' && !['play', 'countdown'].includes(S.phase);
    n.className = 'net ' + state;
    n.textContent = { online: '🟢', reconnecting: '🟠 Menyambung ulang…', offline: '🔴 Offline' }[state];
  }

  function connect() {
    clearTimeout(S.retryT);
    if (S.terminal) return;
    if (!S.peer || S.peer.destroyed) {
      const p = (S.peer = new Peer(IZI.peerOptions()));
      p.on('open', () => p === S.peer && openConn());
      p.on('error', (err) => p === S.peer && onPeerError(err));
      p.on('disconnected', () => {
        if (p !== S.peer || p.destroyed) return;
        setTimeout(() => {
          if (p === S.peer && !p.destroyed && p.disconnected) p.reconnect();
        }, 2000);
      });
    } else if (S.peer.open) openConn();
    else if (S.peer.disconnected) S.peer.reconnect();
  }

  function openConn() {
    if (S.terminal || (S.conn && S.conn.open)) return;
    if (S.conn) {
      const old = S.conn;
      S.conn = null;
      try {
        old.close();
      } catch (e) {}
    }
    const conn = S.peer.connect(IZI.peerId(S.code), { reliable: true });
    S.conn = conn;
    const to = setTimeout(() => {
      if (S.conn === conn && !conn.open) failAttempt();
    }, 12000);
    conn.on('open', () => {
      clearTimeout(to);
      if (S.conn !== conn) return;
      S.attempts = 0;
      setNet('online');
      IZI.safeSend(conn, { t: 'hello', clientId: S.clientId, name: S.name, avatar: S.avatar, have: Object.keys(S.images) });
    });
    conn.on('data', (m) => {
      if (S.conn !== conn) return;
      try {
        onMsg(m);
      } catch (e) {
        console.error(e);
      }
    });
    const lost = () => {
      clearTimeout(to);
      if (S.conn === conn) {
        S.conn = null;
        onLost();
      }
    };
    conn.on('close', lost);
    conn.on('error', lost);
  }

  function failAttempt() {
    if (S.terminal) return;
    if (!S.everConnected) {
      S.attempts++;
      if (S.attempts >= 2) {
        cleanupPeer();
        return joinError(`Room ${S.code} tidak ditemukan. Periksa kodenya, atau pastikan guru sudah membuat room.`);
      }
      S.retryT = setTimeout(connect, 1500);
    } else onLost();
  }

  function onPeerError(err) {
    console.warn('Peer error', err.type, err);
    if (err.type === 'peer-unavailable') {
      if (S.conn && !S.conn.open) {
        const c = S.conn;
        S.conn = null;
        try {
          c.close();
        } catch (e) {}
      }
      return failAttempt();
    }
    if (err.type === 'browser-incompatible') {
      S.terminal = true;
      return joinError('Browser ini tidak mendukung. Gunakan Google Chrome versi terbaru.');
    }
    if (S.peer && !S.peer.open) {
      setNet('offline');
      cleanupPeer();
      if (!S.everConnected && S.phase === 'wait') $('#wait-sub').textContent = 'Koneksi internet bermasalah, mencoba lagi…';
      S.retryT = setTimeout(connect, 3000);
    }
  }

  function onLost() {
    if (S.terminal) return;
    if (S.phase === 'result' && S.review && S.ended) return; // sudah lengkap
    setNet('reconnecting');
    clearTimeout(S.retryT);
    S.retryT = setTimeout(connect, 2500);
  }

  const send = (m) => IZI.safeSend(S.conn, m);

  // =============== PESAN DARI GURU ===============
  function onMsg(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'reject':
        S.terminal = true;
        cleanupPeer();
        return joinError(m.reason || 'Tidak bisa masuk room.');
      case 'welcome':
        return onWelcome(m);
      case 'lobby':
        return renderLobbyPlayers(m.players || []);
      case 'img':
        S.images[m.id] = m.data;
        $$(`img[data-img="${m.id}"]`).forEach((i) => {
          i.src = m.data;
          i.classList.remove('loading');
        });
        return;
      case 'start':
        S.room = m.room;
        setQuestions(m.questions, {});
        setTiming(m.startInMs, m.remainingMs);
        return beginCountdown();
      case 'ack':
        return onAck(m);
      case 'time':
        S.endLocal = Date.now() + m.remainingMs;
        if (S.phase === 'play') IZI.toast('⏱️ Guru menambah waktu!', 'ok');
        return;
      case 'result':
        S.result = m.result;
        if (['play', 'countdown', 'waitresult', 'wait'].includes(S.phase)) showResult();
        else if (S.phase === 'result') renderResult(false);
        return;
      case 'review':
        S.review = m.items;
        return updateReviewBtn();
      case 'rank':
        S.rank = m;
        if (S.result) S.result.rank = m.rank;
        return renderRank();
      case 'ended':
        S.ended = true;
        updateReviewBtn();
        if (!S.result && S.phase !== 'msg') showMsg('🏁', 'Sesi sudah berakhir', 'Guru telah mengakhiri sesi.');
        return;
      case 'kicked':
        S.terminal = true;
        IZI.ls.del(KEY);
        cleanupPeer();
        return showMsg('🚪', 'Kamu keluar dari room', m.reason || 'Guru mengeluarkanmu dari room.');
    }
  }

  function onWelcome(m) {
    S.everConnected = true;
    S.room = m.room;
    S.name = m.you.name;
    S.avatar = m.you.avatar;
    saveSession();
    if (m.review) S.review = m.review;
    if (m.result) S.result = m.result;
    if (m.status === 'lobby') return showLobby(m.lobby || []);
    if (m.questions) setQuestions(m.questions, m.answered || {});
    if (m.points != null) S.points = m.points;
    if (m.streak != null) S.streak = m.streak;

    if (S.result) {
      if (S.phase === 'result' || S.phase === 'review') {
        updateReviewBtn();
        renderResult(false);
      } else showResult();
      return;
    }
    if (m.status === 'playing') {
      // kirim ulang jawaban yang belum tercatat di laptop guru
      const got = m.answered || {};
      for (const qid of S.order) {
        const a = S.answers[qid];
        if (a && !got[qid] && S.qmap[qid]) {
          a.pending = true;
          send({ t: 'answer', qid, choice: a.c, ms: a.ms || 0 });
        }
      }
      setTiming(m.startInMs, m.remainingMs);
      if (S.phase === 'waitresult') return send({ t: 'finish' });
      if (S.phase === 'play') {
        S.stage && S.stage.update(stageState());
        if (!S.busy && (!S.cur || S.answers[S.cur])) showQuestion();
        return;
      }
      if (m.startInMs > 0) return beginCountdown();
      return enterPlay();
    }
    showMsg('🏁', 'Sesi sudah berakhir', 'Guru telah mengakhiri sesi.');
  }

  function setQuestions(qs, answered) {
    S.questions = qs || [];
    S.qmap = Object.fromEntries(S.questions.map((q) => [q.id, q]));
    for (const [qid, a] of Object.entries(answered)) {
      S.answers[qid] = { c: a.c, ok: a.ok == null ? null : a.ok, key: a.key || null, pending: false };
    }
    S.order = S.order.filter((id) => S.answers[id] && S.qmap[id]);
    Object.keys(S.answers).forEach((id) => S.qmap[id] && !S.order.includes(id) && S.order.push(id));
    const ids = S.questions.map((q) => q.id);
    const kept = S.queue.filter((id) => S.qmap[id] && !S.answers[id]);
    S.queue = kept.concat(ids.filter((id) => !S.answers[id] && !kept.includes(id)));
  }

  function setTiming(startInMs, remainingMs) {
    const now = Date.now();
    S.startLocal = now + (startInMs || 0);
    S.endLocal = now + remainingMs;
    if (remainingMs > 0) S.timeUp = false;
  }

  function stageState() {
    return {
      seq: S.order.map((id) => (S.answers[id] ? S.answers[id].ok : null)),
      total: S.questions.length,
      streak: S.streak,
      feedback: !!(S.room && S.room.feedback),
    };
  }

  // =============== LOBBY ===============
  function showLobby(players) {
    S.phase = 'lobby';
    $('#lobby-av').textContent = S.avatar;
    $('#lobby-name').textContent = S.name;
    const g = IZI.GAMES[S.room.game] || IZI.GAMES.classic;
    $('#lobby-game').innerHTML = '';
    $('#lobby-game').append(h('span', { class: 'ge' }, g.emoji), h('div', null, h('b', null, g.name), h('small', null, g.desc)));
    $('#lobby-info').textContent = `${S.room.title} · ${S.room.total} soal · ${S.room.durationMin} menit · KKM ${S.room.kkm}`;
    renderLobbyPlayers(players);
    IZI.show('scr-lobby');
    setNet('online');
    IZI.keepAwake();
  }
  function renderLobbyPlayers(players) {
    $('#lobby-count').textContent = players.length;
    const box = $('#lobby-players');
    box.innerHTML = '';
    players.forEach((p) => box.append(h('span', { class: 'mini-p' + (p.n === S.name ? ' me' : '') }, `${p.a} ${p.n}`)));
  }

  // =============== MAIN ===============
  function beginCountdown() {
    S.phase = 'countdown';
    IZI.show('scr-play');
    buildStage();
    $('#qcard').style.visibility = 'hidden';
    $('#answers').innerHTML = '';
    S.lastTick = -1;
  }

  function buildStage() {
    S.stage = IZI.createStage(S.room.game, $('#stage'), { total: S.questions.length, feedback: S.room.feedback });
    S.stage.update(stageState());
    renderPts();
    renderRank();
  }

  function enterPlay() {
    $('#countdown').hidden = true;
    S.phase = 'play';
    IZI.show('scr-play');
    buildStage();
    $('#qcard').style.visibility = '';
    setNet(S.conn && S.conn.open ? 'online' : 'reconnecting');
    IZI.keepAwake();
    showQuestion();
  }

  function renderPts() {
    const el = $('#pts');
    el.hidden = !S.room.feedback;
    el.textContent = `🏅 ${S.points.toLocaleString('id-ID')}`;
  }

  function renderRank() {
    const el = $('#mini-rank');
    if (!S.room || !S.room.showRank || !S.rank) {
      el.hidden = true;
    } else {
      el.hidden = false;
      el.innerHTML = '';
      el.append(
        h('div', null, h('b', null, `🏆 Peringkatmu #${S.rank.rank}`), ` dari ${S.rank.of}`),
        h('div', { class: 'top' }, S.rank.top.slice(0, 3).map((t, i) => h('span', null, `${['🥇', '🥈', '🥉'][i]} ${t.a} ${t.n} · ${t.p}`)))
      );
    }
    if (S.phase === 'result') {
      const r = $('#res-rank');
      if (r && S.result && S.result.rank) r.textContent = `🏆 Peringkat ${S.result.rank} dari ${S.result.of}`;
    }
  }

  function renderImage(container, image) {
    container.innerHTML = '';
    if (!image) return;
    const src = image.url || S.images[image.id] || '';
    const img = h('img', {
      src: src || null,
      alt: 'Gambar soal',
      class: src ? '' : 'loading',
      dataset: image.id ? { img: image.id } : null,
      onclick: (e) => e.currentTarget.classList.toggle('zoom'),
    });
    container.append(img);
  }

  function showQuestion() {
    if (S.phase !== 'play') return;
    S.queue = S.queue.filter((id) => !S.answers[id]);
    if (!S.queue.length) return finishLocal();
    const q = S.qmap[S.queue[0]];
    S.cur = q.id;
    S.qStart = Date.now();
    S.busy = false;
    $('#qnum').textContent = `Soal ${S.order.length + 1} dari ${S.questions.length}`;
    renderImage($('#qimg'), q.image);
    $('#qtext').textContent = q.text;
    S.stage.update(stageState());
    S.stage.answers($('#answers'), q.options, pick);
    $('#btn-skip').hidden = S.queue.length < 2;
    const card = $('#qcard');
    card.classList.remove('enter');
    void card.offsetWidth;
    card.classList.add('enter');
  }

  function waitAck(qid, ms) {
    return new Promise((res) => {
      const t = setTimeout(() => {
        delete S.waiters[qid];
        res(null);
      }, ms);
      S.waiters[qid] = (m) => {
        clearTimeout(t);
        res(m);
      };
    });
  }

  function onAck(m) {
    const a = S.answers[m.qid];
    if (a) {
      a.pending = false;
      if (m.ok != null) {
        a.ok = m.ok;
        a.key = m.key;
      }
    }
    if (m.points != null) S.points = m.points;
    if (m.streak != null) S.streak = m.streak;
    const w = S.waiters[m.qid];
    if (w) {
      delete S.waiters[m.qid];
      w(m);
    } else if (S.phase === 'play' && S.stage) {
      S.stage.update(stageState());
      renderPts();
    }
  }

  async function pick(k, btn) {
    if (S.busy || S.phase !== 'play' || S.timeUp) return;
    S.busy = true;
    const qid = S.cur;
    $$('#answers .ans').forEach((b) => (b.disabled = true));
    btn.classList.add('chosen');
    const ms = Date.now() - S.qStart;
    S.answers[qid] = { c: k, ok: null, key: null, pending: true, ms };
    S.order.push(qid);
    S.queue = S.queue.filter((x) => x !== qid);
    send({ t: 'answer', qid, choice: k, ms });

    let ok = null;
    if (S.room.feedback) {
      const res = await waitAck(qid, 4000);
      if (res && res.ok != null) {
        ok = res.ok;
        btn.classList.add(ok ? 'right' : 'wrong');
        if (!ok) {
          const kb = $(`#answers .ans[data-k="${res.key}"]`);
          kb && kb.classList.add('right');
        }
        IZI.sound.play(ok ? 'correct' : 'wrong');
        showFeedback(ok ? 'good' : 'bad', ok ? `Benar! +${res.pts}` : 'Belum tepat 😅', ok && S.streak >= 2 ? `🔥 ${S.streak} beruntun` : '');
        renderPts();
      } else {
        IZI.sound.play('answer');
      }
    } else {
      IZI.sound.play('answer');
    }
    S.stage.update(stageState());
    S.stage.hit(ok);
    setTimeout(
      () => {
        hideFeedback();
        if (S.phase === 'play' && !S.timeUp) showQuestion();
      },
      S.room.feedback ? 1300 : 550
    );
  }

  function showFeedback(cls, title, sub) {
    const f = $('#feedback');
    f.className = 'feedback ' + cls;
    f.innerHTML = '';
    IZI.add(f, h('b', null, title), sub ? h('small', null, sub) : null);
    f.hidden = false;
  }
  function hideFeedback() {
    $('#feedback').hidden = true;
  }

  function skip() {
    if (S.busy || S.queue.length < 2) return;
    S.queue.push(S.queue.shift());
    IZI.sound.play('click');
    showQuestion();
  }

  async function submitEarly() {
    const left = S.questions.length - S.order.length;
    const ok = await IZI.confirm('Kumpulkan sekarang?', left ? `Masih ada ${left} soal yang belum dijawab. Soal kosong dihitung salah.` : 'Semua soal sudah dijawab.', 'Kumpulkan');
    if (ok) finishLocal();
  }

  function finishLocal() {
    if (S.phase !== 'play' && S.phase !== 'countdown') return;
    S.phase = 'waitresult';
    hideFeedback();
    send({ t: 'finish' });
    if (S.result) return showResult();
    $('#wait-text').textContent = 'Jawaban terkirim! Menghitung nilai…';
    $('#wait-sub').textContent = S.conn && S.conn.open ? '' : 'Menunggu koneksi ke guru…';
    $('#wait-cancel').hidden = true;
    IZI.show('scr-wait');
  }

  function timeUp() {
    S.timeUp = true;
    $$('#answers .ans').forEach((b) => (b.disabled = true));
    showFeedback('warn', '⏰ Waktu habis!', 'Jawabanmu dikumpulkan otomatis');
    IZI.sound.play('lose');
    setTimeout(finishLocal, 1500);
  }

  function tick() {
    const now = Date.now();
    if (S.phase === 'countdown') {
      const n = Math.ceil((S.startLocal - now) / 1000);
      const cd = $('#countdown');
      if (n <= 0) {
        cd.textContent = 'MULAI!';
        IZI.sound.play('go');
        setTimeout(() => (cd.hidden = true), 600);
        enterPlay();
        cd.hidden = false;
      } else if (n !== S.lastTick) {
        S.lastTick = n;
        cd.hidden = false;
        cd.textContent = n;
        IZI.sound.play('count');
      }
      $('#timer').textContent = IZI.fmtTime(S.endLocal - S.startLocal);
    } else if (S.phase === 'play') {
      const left = S.endLocal - now;
      const t = $('#timer');
      t.textContent = IZI.fmtTime(left);
      t.classList.toggle('danger', left < 60000);
      const sec = Math.ceil(left / 1000);
      if (sec <= 10 && sec > 0 && sec !== S.lastTick) {
        S.lastTick = sec;
        IZI.sound.play('tick');
      }
      if (left <= 0 && !S.timeUp) timeUp();
    }
  }
  setInterval(tick, 200);

  // =============== HASIL ===============
  function showResult() {
    S.phase = 'result';
    hideFeedback();
    $('#countdown').hidden = true;
    renderResult(true);
    IZI.show('scr-result');
    setNet(S.conn && S.conn.open ? 'online' : 'reconnecting');
  }

  function renderResult(animate) {
    const r = S.result;
    const card = $('#result-card');
    card.innerHTML = '';
    const num = h('b', { class: 'ring-num' }, animate ? '0' : r.score);
    const ring = h('div', { class: 'ring ' + (r.passed ? 'pass' : 'fail'), style: { '--p': animate ? 0 : r.score } }, num);
    IZI.add(card, 
      h('div', { class: 'hero-emoji' }, r.passed ? '🎉' : '💪'),
      h('div', { class: 'muted' }, `${S.avatar} ${S.name}`),
      h('h2', null, 'Nilai Kamu'),
      ring,
      h('div', { class: 'badge ' + (r.passed ? 'pass' : 'fail') }, r.passed ? '✅ LULUS' : '📚 BELUM LULUS'),
      h('div', { class: 'muted small' }, `KKM ${r.kkm}`),
      h(
        'div',
        { class: 'stat-row' },
        h('div', { class: 'stat' }, h('span', null, '✅'), h('b', null, r.correct), h('small', null, 'Benar')),
        h('div', { class: 'stat' }, h('span', null, '❌'), h('b', null, r.wrong), h('small', null, 'Salah')),
        h('div', { class: 'stat' }, h('span', null, '⬜'), h('b', null, r.empty), h('small', null, 'Kosong')),
        S.room && (S.room.feedback || S.room.showRank)
          ? h('div', { class: 'stat' }, h('span', null, '🏅'), h('b', null, r.points.toLocaleString('id-ID')), h('small', null, 'Poin'))
          : null
      ),
      S.room && S.room.showRank && r.rank ? h('div', { class: 'rank-line', id: 'res-rank' }, `🏆 Peringkat ${r.rank} dari ${r.of}`) : null,
      h('p', { class: 'msg' }, r.passed ? 'Hebat! Kamu lulus. Pertahankan ya! 🌟' : 'Jangan menyerah! Pelajari pembahasannya dan coba lagi lain kali. 💡')
    );
    updateReviewBtn();
    if (!animate) return;
    let v = 0;
    const step = Math.max(1, Math.round(r.score / 40));
    const iv = setInterval(() => {
      v = Math.min(r.score, v + step);
      num.textContent = v;
      ring.style.setProperty('--p', v);
      if (v >= r.score) clearInterval(iv);
    }, 25);
    setTimeout(() => {
      if (r.passed) {
        IZI.sound.play('win');
        IZI.confetti();
      } else IZI.sound.play('lose');
    }, 900);
  }

  function updateReviewBtn() {
    const b = $('#btn-review');
    const note = $('#review-note');
    if (S.review) {
      b.disabled = false;
      b.textContent = '📖 Lihat Pembahasan';
      note.textContent = '';
    } else {
      b.disabled = true;
      b.textContent = '🔒 Pembahasan';
      note.textContent =
        S.room && S.room.reviewWhen === 'end' && !S.ended ? 'Pembahasan bisa dibuka setelah guru mengakhiri sesi. Tunggu di halaman ini ya.' : 'Memuat pembahasan…';
    }
  }

  function showReview() {
    if (!S.review) return;
    S.phase = 'review';
    const list = $('#review-list');
    list.innerHTML = '';
    let ok = 0;
    S.review.forEach((it, i) => {
      const right = it.chosen === it.key;
      if (right) ok++;
      const imgBox = h('div', { class: 'qimg' });
      renderImage(imgBox, it.image);
      list.append(
        h(
          'div',
          { class: 'card rv ' + (right ? 'ok' : 'no') },
          h('div', { class: 'rv-head' }, h('b', null, `Soal ${i + 1}`), h('span', { class: 'badge sm ' + (right ? 'pass' : 'fail') }, right ? '✅ Benar' : it.chosen ? '❌ Salah' : '⬜ Tidak dijawab')),
          imgBox,
          h('div', { class: 'qtext' }, it.text),
          h(
            'div',
            { class: 'rv-opts' },
            it.options.map((o, j) =>
              h(
                'div',
                { class: 'rv-opt' + (o.k === it.key ? ' key' : '') + (o.k === it.chosen && o.k !== it.key ? ' wrong' : '') },
                h('span', { class: 'lbl' }, IZI.LABELS[j]),
                h('span', { class: 'txt' }, o.text),
                o.k === it.key ? h('span', { class: 'tag' }, '✔ Kunci') : null,
                o.k === it.chosen ? h('span', { class: 'tag me' }, 'Jawabanmu') : null
              )
            )
          ),
          it.explanation ? h('div', { class: 'explain' }, h('b', null, '💡 Pembahasan: '), it.explanation) : null
        )
      );
    });
    $('#review-sum').textContent = `✅ ${ok} / ${S.review.length} benar`;
    IZI.show('scr-review');
  }

  function showMsg(emoji, title, text) {
    S.phase = 'msg';
    $('#msg-emoji').textContent = emoji;
    $('#msg-title').textContent = title;
    $('#msg-text').textContent = text || '';
    $('#countdown').hidden = true;
    IZI.show('scr-msg');
  }

  // =============== ANTI-CONTEK RINGAN ===============
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && S.phase === 'play') {
      send({ t: 'tab' });
      S.leftTab = true;
    } else if (document.visibilityState === 'visible' && S.leftTab) {
      S.leftTab = false;
      IZI.confirm('⚠️ Kamu keluar dari halaman ujian', 'Guru menerima pemberitahuan setiap kali kamu meninggalkan halaman ini. Tetap fokus ya!', 'Oke, lanjut', null);
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (S.phase === 'play' || S.phase === 'countdown') {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  // jaga koneksi tetap hidup
  setInterval(() => S.conn && S.conn.open && send({ t: 'ping' }), 15000);

  document.addEventListener('DOMContentLoaded', () => {
    IZI.bindMute();
    document.addEventListener('pointerdown', () => IZI.sound.unlock(), { once: true });
    $('#btn-skip').addEventListener('click', skip);
    $('#btn-submit').addEventListener('click', submitEarly);
    $('#btn-review').addEventListener('click', showReview);
    $('#btn-back').addEventListener('click', () => {
      S.phase = 'result';
      IZI.show('scr-result');
    });
    $('#btn-leave').addEventListener('click', async () => {
      if (await IZI.confirm('Keluar dari room?', 'Kamu tidak bisa melihat nilai & pembahasan ini lagi setelah keluar.', 'Keluar')) leave();
    });
    initJoin();
  });

  window.__student = S; // untuk pengujian otomatis
})();
