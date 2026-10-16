/*
 * Jenis-jenis game. Semua game memakai soal pilihan ganda & nilai yang sama
 * (benar / jumlah soal × 100). Yang berbeda adalah tampilan & suasananya:
 *  - Stage  : tampilan di HP murid
 *  - Arena  : tampilan layar guru / proyektor
 */
(function () {
  'use strict';
  const IZI = window.IZI;
  const h = IZI.h;

  IZI.GAMES = {
    classic: { name: 'Kuis Klasik', emoji: '🎯', desc: 'Kartu jawaban warna-warni ala kuis TV. Simpel & cepat.' },
    race: { name: 'Balap Roket', emoji: '🚀', desc: 'Setiap jawaban mendorong roket menuju garis finis.' },
    monster: { name: 'Lawan Monster', emoji: '👾', desc: 'Jawab soal untuk menyerang monster. Sekelas melawan Bos Naga!' },
    balloon: { name: 'Pecah Balon', emoji: '🎈', desc: 'Pilihan jawaban berupa balon yang melayang. Letuskan yang benar!' },
    treasure: { name: 'Berburu Harta', emoji: '💎', desc: 'Setiap soal adalah peti harta. Kumpulkan permata sebanyak-banyaknya!' },
  };

  const SHAPES = ['▲', '◆', '●', '■'];
  const LABELS = ['A', 'B', 'C', 'D'];
  IZI.LABELS = LABELS;

  const floatText = (parent, text, cls = '') => {
    const f = h('div', { class: 'float-text ' + cls }, text);
    parent.appendChild(f);
    setTimeout(() => f.remove(), 1200);
  };
  const pulse = (el, cls, ms = 600) => {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  };

  // ---------- Tombol jawaban ----------
  function tileAnswers(container, options, onPick) {
    const long = options.some((o) => o.text.length > 38);
    container.className = 'answers tiles' + (long ? ' one-col' : '');
    container.innerHTML = '';
    options.forEach((o, i) => {
      const b = h(
        'button',
        { class: 'ans c' + i, dataset: { k: o.k }, onclick: () => onPick(o.k, b) },
        h('span', { class: 'shape' }, SHAPES[i]),
        h('span', { class: 'lbl' }, LABELS[i]),
        h('span', { class: 'txt' }, o.text)
      );
      container.appendChild(b);
    });
  }
  function balloonAnswers(container, options, onPick) {
    container.className = 'answers balloons';
    container.innerHTML = '';
    options.forEach((o, i) => {
      const size = o.text.length > 60 ? 'xs' : o.text.length > 30 ? 'sm' : '';
      const b = h(
        'button',
        {
          class: `ans balloon c${i} ${size}`,
          dataset: { k: o.k },
          style: { animationDelay: `${(i * 0.37).toFixed(2)}s` },
          onclick: () => {
            b.classList.add('popped');
            IZI.sound.play('pop');
            onPick(o.k, b);
          },
        },
        h('span', { class: 'lbl' }, LABELS[i]),
        h('span', { class: 'txt' }, o.text)
      );
      container.appendChild(b);
    });
  }

  // ---------- Stage murid ----------
  // st = { seq: [true|false|null,...] (hasil tiap jawaban berurutan), total, streak, feedback }
  const STAGES = {
    classic(root) {
      const bar = h('div', { class: 'seg-bar' });
      const info = h('div', { class: 'cl-info' });
      root.append(bar, info);
      return {
        update(st) {
          bar.innerHTML = '';
          const many = st.total > 40;
          if (many) {
            bar.appendChild(h('div', { class: 'bar' }, h('i', { style: { width: (st.seq.length / st.total) * 100 + '%' } })));
          } else {
            for (let i = 0; i < st.total; i++) {
              const v = st.seq[i];
              bar.appendChild(h('span', { class: 'sg ' + (i < st.seq.length ? (v === true ? 'ok' : v === false ? 'no' : 'done') : i === st.seq.length ? 'cur' : '') }));
            }
          }
          info.innerHTML = '';
          IZI.add(info, 
            h('span', null, `Soal ${Math.min(st.seq.length + 1, st.total)} / ${st.total}`),
            st.feedback && st.streak >= 2 ? h('span', { class: 'streak' }, `🔥 ${st.streak} beruntun`) : null
          );
        },
        hit(ok) {
          if (ok === true) floatText(root, '+1 ✨', 'good');
        },
        answers: tileAnswers,
      };
    },

    race(root) {
      const rocket = h('div', { class: 'rocket' }, h('span', { class: 'flame' }), h('span', { class: 'ship' }, '🚀'));
      const track = h('div', { class: 'track' }, h('div', { class: 'stars' }), h('div', { class: 'finish' }, '🏁'), rocket);
      const info = h('div', { class: 'cl-info' });
      root.append(track, info);
      return {
        update(st) {
          rocket.style.left = `calc(${(st.seq.length / st.total) * 88}% + 4px)`;
          const ok = st.seq.filter((v) => v === true).length;
          info.innerHTML = '';
          IZI.add(info, 
            h('span', null, `Jarak ${st.seq.length}/${st.total}`),
            st.feedback ? h('span', null, `⭐ ${ok} boost`) : null,
            st.feedback && st.streak >= 2 ? h('span', { class: 'streak' }, `🔥 ${st.streak}`) : null
          );
        },
        hit(ok) {
          pulse(rocket, ok === false ? 'wobble' : 'boost', 900);
          if (ok === true) floatText(track, 'BOOST! ⚡', 'good');
          if (ok === false) floatText(track, 'Mesin batuk… 💨', 'bad');
        },
        answers: tileAnswers,
      };
    },

    monster(root, ctx) {
      const MONS = [
        ['👾', 'Alien Iseng'],
        ['👹', 'Raksasa Merah'],
        ['🦖', 'Dino Lapar'],
        ['🐙', 'Gurita Raksasa'],
        ['🤖', 'Robot Rusak'],
        ['👻', 'Hantu Usil'],
        ['🐉', 'Naga Api'],
      ];
      const PER = 5;
      const hpList = [];
      for (let left = ctx.total; left > 0; left -= PER) hpList.push(Math.min(PER, left));
      const face = h('div', { class: 'mon-face' });
      const name = h('div', { class: 'mon-name' });
      const hpFill = h('i');
      const hpTxt = h('span');
      const box = h('div', { class: 'mon-box' }, face, h('div', { class: 'mon-side' }, name, h('div', { class: 'hp' }, hpFill), hpTxt));
      const info = h('div', { class: 'cl-info' });
      root.append(box, info);
      let lastIdx = -1;
      let dmgNow = 0;
      function state(dmg) {
        let i = 0;
        let d = dmg;
        while (i < hpList.length - 1 && d >= hpList[i]) {
          d -= hpList[i];
          i++;
        }
        return { i, hp: Math.max(0, hpList[i] - d), max: hpList[i] };
      }
      return {
        update(st) {
          dmgNow = st.feedback ? st.seq.filter((v) => v === true).length : st.seq.length;
          const s = state(dmgNow);
          const [emo, nm] = MONS[s.i % MONS.length];
          if (s.i !== lastIdx) {
            face.textContent = emo;
            if (lastIdx !== -1) pulse(face, 'spawn', 700);
            lastIdx = s.i;
          }
          face.classList.toggle('dead', s.hp === 0);
          name.textContent = `${nm} (${s.i + 1}/${hpList.length})`;
          hpFill.style.width = (s.hp / s.max) * 100 + '%';
          hpTxt.textContent = `HP ${s.hp}/${s.max}`;
          info.innerHTML = '';
          IZI.add(info, h('span', null, `Soal ${Math.min(st.seq.length + 1, st.total)} / ${st.total}`), h('span', null, `⚔️ ${dmgNow} serangan`));
        },
        hit(ok) {
          if (ok === false) {
            floatText(box, 'Meleset! 😝', 'bad');
            pulse(root, 'shake', 500);
            IZI.sound.play('hit');
          } else {
            pulse(face, 'hurt', 500);
            floatText(box, ok === true ? 'KRITIS! 💥' : 'Serang! 💥', 'good');
            const s = state(dmgNow);
            if ((s.hp === hpList[s.i] && s.i > 0) || s.hp === 0) setTimeout(() => floatText(box, 'Monster kalah! 🏆', 'gold'), 300);
          }
        },
        answers: tileAnswers,
      };
    },

    balloon(root) {
      const sky = h('div', { class: 'sky' });
      const info = h('div', { class: 'cl-info' });
      root.append(sky, info);
      return {
        update(st) {
          sky.innerHTML = '';
          const show = Math.min(st.total, 30);
          const per = st.total / show;
          for (let i = 0; i < show; i++) {
            const idx = Math.floor(i * per);
            const popped = idx < st.seq.length;
            const v = st.seq[idx];
            sky.appendChild(h('span', { class: 'mini-b ' + (popped ? (v === false ? 'miss' : 'pop') : '') }, popped ? (v === false ? '💨' : '✨') : '🎈'));
          }
          info.innerHTML = '';
          IZI.add(info, 
            h('span', null, `🎈 ${st.seq.length}/${st.total} balon`),
            st.feedback ? h('span', null, `🎯 ${st.seq.filter((v) => v === true).length} tepat`) : null,
            st.feedback && st.streak >= 2 ? h('span', { class: 'streak' }, `🔥 ${st.streak}`) : null
          );
        },
        hit(ok) {
          if (ok === true) floatText(sky, 'POP! 🎉', 'good');
          if (ok === false) floatText(sky, 'Balon salah 💨', 'bad');
        },
        answers: balloonAnswers,
      };
    },

    treasure(root) {
      const grid = h('div', { class: 'chests' });
      const info = h('div', { class: 'cl-info' });
      root.append(grid, info);
      return {
        update(st) {
          grid.innerHTML = '';
          for (let i = 0; i < st.total; i++) {
            const v = st.seq[i];
            const open = i < st.seq.length;
            grid.appendChild(
              h('span', { class: 'chest ' + (open ? 'open' : '') + (i === st.seq.length ? ' cur' : '') }, open ? (v === true ? '💎' : v === false ? '🪨' : '🪙') : '')
            );
          }
          const gems = st.seq.filter((v) => v === true).length;
          info.innerHTML = '';
          IZI.add(info, 
            h('span', null, `Peti ${Math.min(st.seq.length + 1, st.total)} / ${st.total}`),
            st.feedback ? h('span', null, `💎 ${gems} permata`) : h('span', null, `🪙 ${st.seq.length} peti dibuka`)
          );
        },
        hit(ok) {
          const last = grid.querySelectorAll('.chest.open');
          pulse(last[last.length - 1], 'bounce', 700);
          if (ok === true) floatText(grid, 'Permata! 💎', 'good');
          if (ok === false) floatText(grid, 'Cuma batu… 🪨', 'bad');
        },
        answers: tileAnswers,
      };
    },
  };

  IZI.createStage = function (game, root, ctx) {
    root.innerHTML = '';
    root.className = 'stage stage-' + (STAGES[game] ? game : 'classic');
    return (STAGES[game] || STAGES.classic)(root, ctx);
  };

  // ---------- Arena guru (proyektor) ----------
  // list item: { id, name, avatar, answered, total, correct, points, finished, connected }
  function keyedRows(root, list, rowH, build, fill) {
    root.style.height = list.length * rowH + 'px';
    const seen = new Set();
    list.forEach((p, i) => {
      let row = root.querySelector(`[data-id="${CSS.escape(p.id)}"]`);
      if (!row) {
        row = build(p);
        row.dataset.id = p.id;
        root.appendChild(row);
      }
      row.style.transform = `translateY(${i * rowH}px)`;
      fill(row, p, i);
      seen.add(p.id);
    });
    Array.from(root.children).forEach((c) => !seen.has(c.dataset.id) && c.remove());
  }

  const ARENAS = {
    leaderboard(root, icon) {
      const rows = h('div', { class: 'lb-rows' });
      root.append(rows);
      return {
        update(list, o) {
          const val = (p) => (o.showScores ? p.points : p.answered);
          const sorted = list.slice().sort((a, b) => val(b) - val(a) || a.name.localeCompare(b.name));
          const max = Math.max(1, ...sorted.map(val));
          keyedRows(
            rows,
            sorted,
            58,
            (p) =>
              h(
                'div',
                { class: 'lb-row' },
                h('span', { class: 'rank' }),
                h('span', { class: 'av' }, p.avatar),
                h('span', { class: 'nm' }),
                h('div', { class: 'lb-bar' }, h('i')),
                h('span', { class: 'val' })
              ),
            (row, p, i) => {
              row.querySelector('.rank').textContent = o.showScores ? ['🥇', '🥈', '🥉'][i] || i + 1 : '';
              row.querySelector('.nm').textContent = p.name;
              row.querySelector('.lb-bar i').style.width = (val(p) / max) * 100 + '%';
              row.querySelector('.val').textContent = o.showScores
                ? `${icon ? icon + ' ' + p.correct + ' · ' : ''}${p.points}`
                : `${p.answered}/${p.total}${p.finished ? ' ✅' : ''}`;
              row.classList.toggle('off', !p.connected);
            }
          );
        },
      };
    },
    race(root) {
      const lanes = h('div', { class: 'lanes' });
      root.append(lanes);
      return {
        update(list, o) {
          keyedRows(
            lanes,
            list,
            56,
            (p) =>
              h(
                'div',
                { class: 'lane' },
                h('span', { class: 'nm' }),
                h('div', { class: 'lane-track' }, h('span', { class: 'flag' }, '🏁'), h('span', { class: 'racer' }, h('span', { class: 'av' }, p.avatar), '🚀'))
              ),
            (row, p) => {
              row.querySelector('.nm').textContent = p.name + (o.showScores ? ` · ${p.points}` : '');
              row.querySelector('.racer').style.left = `calc(${(p.answered / Math.max(1, p.total)) * 86}%)`;
              row.classList.toggle('done', p.finished);
              row.classList.toggle('off', !p.connected);
            }
          );
        },
      };
    },
    monster(root) {
      const boss = h('div', { class: 'boss' }, '🐉');
      const hp = h('i');
      const hpTxt = h('div', { class: 'boss-hp-txt' });
      const chips = h('div', { class: 'chips' });
      const wrap = h('div', { class: 'boss-wrap' }, boss, h('div', { class: 'boss-name' }, 'Bos Naga Api'), h('div', { class: 'hp big' }, hp), hpTxt);
      root.append(wrap, chips);
      let lastDmg = 0;
      return {
        update(list, o) {
          const total = list.reduce((a, p) => a + p.total, 0) || 1;
          const dmg = list.reduce((a, p) => a + (o.showScores ? p.correct : p.answered), 0);
          const left = Math.max(0, total - dmg);
          hp.style.width = (left / total) * 100 + '%';
          hpTxt.textContent = `HP ${left} / ${total}`;
          if (dmg > lastDmg) {
            pulse(boss, 'hurt', 500);
            floatText(wrap, `-${dmg - lastDmg} 💥`, 'good');
          }
          lastDmg = dmg;
          boss.classList.toggle('dead', left === 0);
          chips.innerHTML = '';
          list.forEach((p) =>
            chips.appendChild(
              h('span', { class: 'chip' + (p.connected ? '' : ' off') + (p.finished ? ' done' : '') }, `${p.avatar} ${p.name} ⚔️${o.showScores ? p.correct : p.answered}`)
            )
          );
        },
      };
    },
    balloon(root) {
      const grid = h('div', { class: 'bl-grid' });
      root.append(grid);
      return {
        update(list, o) {
          grid.innerHTML = '';
          list.forEach((p) => {
            const pct = (p.answered / Math.max(1, p.total)) * 100;
            grid.appendChild(
              h(
                'div',
                { class: 'bl-card' + (p.connected ? '' : ' off') + (p.finished ? ' done' : '') },
                h('div', { class: 'bl-ball', style: { transform: `scale(${1 - (pct / 100) * 0.55})` } }, p.finished ? '🎉' : '🎈'),
                h('div', { class: 'nm' }, `${p.avatar} ${p.name}`),
                h('div', { class: 'bar' }, h('i', { style: { width: pct + '%' } })),
                h('div', { class: 'val' }, o.showScores ? `🎯 ${p.correct} · ${p.points} poin` : `${p.answered}/${p.total} balon`)
              )
            );
          });
        },
      };
    },
  };

  IZI.createArena = function (game, root) {
    root.innerHTML = '';
    root.className = 'arena arena-' + game;
    if (game === 'race') return ARENAS.race(root);
    if (game === 'monster') return ARENAS.monster(root);
    if (game === 'balloon') return ARENAS.balloon(root);
    return ARENAS.leaderboard(root, game === 'treasure' ? '💎' : '');
  };
})();
