/* Membaca soal dari Excel, membuat template, dan mengekspor rekap nilai. */
(function () {
  'use strict';
  const IZI = window.IZI;
  const LETTERS = ['A', 'B', 'C', 'D'];

  const HEADERS = {
    no: ['no', 'no.', 'nomor', '#'],
    text: ['soal', 'pertanyaan', 'question', 'butir soal'],
    A: ['a', 'pilihan a', 'opsi a', 'jawaban a'],
    B: ['b', 'pilihan b', 'opsi b', 'jawaban b'],
    C: ['c', 'pilihan c', 'opsi c', 'jawaban c'],
    D: ['d', 'pilihan d', 'opsi d', 'jawaban d'],
    key: ['kunci', 'kunci jawaban', 'jawaban', 'jawaban benar', 'kunci jawab', 'answer', 'key'],
    image: ['gambar', 'image', 'foto', 'link gambar', 'url gambar', 'gambar soal'],
    explanation: ['pembahasan', 'penjelasan', 'explanation', 'keterangan'],
  };
  const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.:]+$/, '');

  function cellText(ws, r, c) {
    const cell = ws[XLSX.utils.encode_cell({ r, c })];
    if (!cell || cell.v == null) return '';
    if (cell.t === 'n' && cell.w != null) return String(cell.w).trim();
    return String(cell.v).trim();
  }
  function cellFormula(ws, r, c) {
    const cell = ws[XLSX.utils.encode_cell({ r, c })];
    return cell && cell.f ? String(cell.f) : '';
  }

  /** Cari baris header (yang memuat kolom Soal & Kunci) di sebuah sheet. */
  function findHeader(ws) {
    if (!ws || !ws['!ref']) return null;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 15); r++) {
      const cols = {};
      for (let c = range.s.c; c <= range.e.c; c++) {
        const v = norm(cellText(ws, r, c));
        if (!v) continue;
        for (const [k, names] of Object.entries(HEADERS)) {
          if (cols[k] == null && names.includes(v)) {
            cols[k] = c;
            break;
          }
        }
      }
      if (cols.text != null && cols.key != null && cols.A != null && cols.B != null) return { row: r, cols, range };
    }
    return null;
  }

  // ---------- Gambar yang ditempel di dalam Excel ----------
  function xmlDoc(str) {
    return new DOMParser().parseFromString(str, 'application/xml');
  }
  function byLocal(doc, name) {
    return Array.from(doc.getElementsByTagNameNS('*', name));
  }
  function resolvePath(baseFile, target) {
    if (target.startsWith('/')) return target.slice(1);
    const parts = baseFile.split('/').slice(0, -1);
    for (const seg of target.split('/')) {
      if (seg === '..') parts.pop();
      else if (seg && seg !== '.') parts.push(seg);
    }
    return parts.join('/');
  }
  function relsPath(file) {
    const i = file.lastIndexOf('/');
    return file.slice(0, i) + '/_rels/' + file.slice(i + 1) + '.rels';
  }
  async function readRels(zip, file) {
    const f = zip.file(relsPath(file));
    const map = {};
    if (!f) return map;
    byLocal(xmlDoc(await f.async('string')), 'Relationship').forEach((r) => {
      map[r.getAttribute('Id')] = { target: resolvePath(file, r.getAttribute('Target')), type: r.getAttribute('Type') || '' };
    });
    return map;
  }
  const rIdOf = (el, local) => {
    for (const a of Array.from(el.attributes)) if (a.localName === local) return a.value;
    return null;
  };

  /**
   * Mengembalikan Map: nomor baris (0-based) -> path file gambar di dalam zip.
   * Mendukung gambar "melayang di atas sel" (drawing) dan gambar "di dalam sel" (Excel 365).
   */
  async function embeddedImagesByRow(zip, sheetIndex) {
    const out = new Map();
    const wbFile = 'xl/workbook.xml';
    if (!zip.file(wbFile)) return out;
    const sheets = byLocal(xmlDoc(await zip.file(wbFile).async('string')), 'sheet');
    const sheetEl = sheets[sheetIndex];
    if (!sheetEl) return out;
    const wbRels = await readRels(zip, wbFile);
    const sheetRel = wbRels[rIdOf(sheetEl, 'id')];
    if (!sheetRel) return out;
    const sheetFile = sheetRel.target;
    const sheetRels = await readRels(zip, sheetFile);

    // 1) Gambar melayang (drawing)
    for (const rel of Object.values(sheetRels)) {
      if (!/\/drawing$/.test(rel.type) || !zip.file(rel.target)) continue;
      const dDoc = xmlDoc(await zip.file(rel.target).async('string'));
      const dRels = await readRels(zip, rel.target);
      const anchors = [...byLocal(dDoc, 'twoCellAnchor'), ...byLocal(dDoc, 'oneCellAnchor')];
      for (const a of anchors) {
        const from = byLocal(a, 'from')[0];
        const blip = byLocal(a, 'blip')[0];
        if (!from || !blip) continue;
        const row = parseInt(byLocal(from, 'row')[0]?.textContent, 10);
        const media = dRels[rIdOf(blip, 'embed')];
        if (!isNaN(row) && media && !out.has(row)) out.set(row, media.target);
      }
    }

    // 2) Gambar di dalam sel (Place in Cell / IMAGE di Excel 365)
    try {
      const rvFile = zip.file('xl/richData/rdrichvalue.xml');
      const relFile = 'xl/richData/richValueRel.xml';
      if (rvFile && zip.file(relFile)) {
        const structs = byLocal(xmlDoc(await zip.file('xl/richData/rdrichvaluestructure.xml').async('string')), 's').map((s) =>
          byLocal(s, 'k').map((k) => k.getAttribute('n'))
        );
        const rvs = byLocal(xmlDoc(await rvFile.async('string')), 'rv');
        const rels = byLocal(xmlDoc(await zip.file(relFile).async('string')), 'rel').map((r) => rIdOf(r, 'id'));
        const relMap = await readRels(zip, relFile);
        const sDoc = xmlDoc(await zip.file(sheetFile).async('string'));
        for (const c of byLocal(sDoc, 'c')) {
          const vm = parseInt(c.getAttribute('vm'), 10);
          if (!vm) continue;
          const rv = rvs[vm - 1];
          if (!rv) continue;
          const keys = structs[parseInt(rv.getAttribute('s'), 10)] || [];
          const pos = keys.indexOf('_rvRel:LocalImageIdentifier');
          const vals = byLocal(rv, 'v').map((v) => v.textContent);
          const relIdx = parseInt(vals[pos >= 0 ? pos : 0], 10);
          const media = relMap[rels[relIdx]];
          const row = XLSX.utils.decode_cell(c.getAttribute('r')).r;
          if (media && !out.has(row)) out.set(row, media.target);
        }
      }
    } catch (e) {
      console.warn('Gagal membaca gambar di dalam sel', e);
    }
    return out;
  }

  /** Mengecilkan gambar supaya ringan dikirim ke HP murid. */
  IZI.compressImage = function (blob, max = 960) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * s));
        const hgt = Math.max(1, Math.round(img.naturalHeight * s));
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = hgt;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, hgt);
        ctx.drawImage(img, 0, 0, w, hgt);
        URL.revokeObjectURL(url);
        res(cv.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        rej(new Error('Format gambar tidak didukung'));
      };
      img.src = url;
    });
  };

  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };

  function normKey(raw, q) {
    const s = String(raw || '').trim();
    if (!s) return null;
    const m = s.toUpperCase().match(/^\(?([A-D])(\)|\.|\s|$)/);
    if (m && q.options[m[1]]) return m[1];
    // Kunci ditulis berupa teks jawabannya
    const found = LETTERS.find((L) => q.options[L] && norm(q.options[L]) === norm(s));
    return found || null;
  }

  /**
   * Membaca file soal (.xlsx/.xls/.csv).
   * Hasil: { questions:[{id,no,text,options:{A..D},key,image,explanation}], images:{id:dataURL}, warnings:[] }
   */
  IZI.parseQuestionFile = async function (file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellFormula: true });
    let sheetIndex = -1;
    let head = null;
    for (let i = 0; i < wb.SheetNames.length; i++) {
      head = findHeader(wb.Sheets[wb.SheetNames[i]]);
      if (head) {
        sheetIndex = i;
        break;
      }
    }
    if (!head) {
      throw new Error('Kolom tidak ditemukan. Pastikan baris judul berisi kolom: Soal, A, B, C, D, dan Kunci. Gunakan tombol "Download Template".');
    }
    const ws = wb.Sheets[wb.SheetNames[sheetIndex]];
    const { cols, range } = head;
    const warnings = [];

    let rowImages = new Map();
    let zip = null;
    try {
      zip = await JSZip.loadAsync(buf);
      rowImages = await embeddedImagesByRow(zip, sheetIndex);
    } catch (e) {
      /* bukan xlsx (mis. csv/xls) -> tidak ada gambar tertempel */
    }

    const questions = [];
    const images = {};
    const mediaCache = {};
    for (let r = head.row + 1; r <= range.e.r; r++) {
      const text = cellText(ws, r, cols.text);
      const options = {};
      LETTERS.forEach((L) => {
        if (cols[L] != null) {
          const v = cellText(ws, r, cols[L]);
          if (v) options[L] = v;
        }
      });
      const rawKey = cellText(ws, r, cols.key);
      const rowNo = r + 1;
      if (!text && !Object.keys(options).length && !rawKey) continue;
      if (!text) {
        warnings.push(`Baris ${rowNo}: kolom Soal kosong, dilewati.`);
        continue;
      }
      if (Object.keys(options).length < 2) {
        warnings.push(`Baris ${rowNo}: pilihan jawaban kurang dari 2, dilewati.`);
        continue;
      }
      const q = {
        id: 'q' + (questions.length + 1),
        no: questions.length + 1,
        row: rowNo,
        text,
        options,
        key: null,
        image: null,
        explanation: cols.explanation != null ? cellText(ws, r, cols.explanation) : '',
      };
      q.key = normKey(rawKey, q);
      if (!q.key) {
        warnings.push(`Baris ${rowNo}: kunci "${rawKey || '(kosong)'}" tidak valid (harus A/B/C/D dan pilihannya terisi), dilewati.`);
        continue;
      }

      // Gambar: tertempel di baris ini, atau link di kolom Gambar
      const mediaPath = rowImages.get(r);
      if (mediaPath && zip) {
        try {
          if (!mediaCache[mediaPath]) {
            const ext = mediaPath.split('.').pop().toLowerCase();
            const blob = new Blob([await zip.file(mediaPath).async('arraybuffer')], { type: MIME[ext] || 'application/octet-stream' });
            mediaCache[mediaPath] = await IZI.compressImage(blob);
          }
          const imgId = 'img' + (Object.keys(images).length + 1);
          images[imgId] = mediaCache[mediaPath];
          q.image = { id: imgId };
        } catch (e) {
          warnings.push(`Baris ${rowNo}: gambar tidak bisa dibaca (${mediaPath.split('/').pop()}). Simpan ulang gambar sebagai PNG/JPG.`);
        }
      }
      if (!q.image && cols.image != null) {
        const v = cellText(ws, r, cols.image);
        const f = cellFormula(ws, r, cols.image);
        const fm = f.match(/IMAGE\(\s*"([^"]+)"/i);
        const url = fm ? fm[1] : v;
        if (/^https?:\/\//i.test(url)) q.image = { url: driveDirect(url) };
      }
      questions.push(q);
    }
    if (!questions.length) throw new Error('Tidak ada soal yang valid di file ini.');
    return { questions, images, warnings, sheetName: wb.SheetNames[sheetIndex], fileName: file.name };
  };

  /** Link Google Drive "file/d/ID/view" diubah agar bisa tampil sebagai gambar. */
  function driveDirect(url) {
    const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/);
    return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000` : url;
  }

  function download(wb, name) {
    XLSX.writeFile(wb, name, { compression: true });
  }
  const safeName = (s) => String(s || 'Ujian').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 60);
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  IZI.downloadTemplate = function () {
    const rows = [
      ['No', 'Soal', 'A', 'B', 'C', 'D', 'Kunci', 'Gambar', 'Pembahasan'],
      [1, 'Ibu kota negara Indonesia adalah ...', 'Bandung', 'Jakarta', 'Surabaya', 'Medan', 'B', '', 'Jakarta adalah ibu kota negara Indonesia.'],
      [2, 'Hasil dari 7 × 8 adalah ...', '54', '56', '58', '64', 'B', '', '7 × 8 = 56'],
      [3, 'Planet yang paling dekat dengan Matahari adalah ...', 'Venus', 'Bumi', 'Merkurius', 'Mars', 'C', '', 'Merkurius adalah planet terdekat dari Matahari.'],
      [4, 'Hewan yang berkembang biak dengan cara bertelur disebut ...', 'Vivipar', 'Ovipar', 'Ovovivipar', 'Fotosintesis', 'B', '', 'Ovipar = bertelur.'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 55 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 7 }, { wch: 30 }, { wch: 40 }];
    const info = [
      ['PETUNJUK PENGISIAN SOAL IZILEARNING'],
      [''],
      ['1. Isi soal di sheet "Soal". Satu baris = satu soal. Jangan mengubah baris judul kolom.'],
      ['2. Kolom A, B, C, D berisi pilihan jawaban (minimal A dan B wajib diisi).'],
      ['3. Kolom Kunci diisi satu huruf: A, B, C, atau D.'],
      ['4. Kolom Pembahasan (boleh kosong) akan tampil saat murid membuka pembahasan.'],
      [''],
      ['CARA MENAMBAHKAN GAMBAR (pilih salah satu):'],
      ['a. Tempel/insert gambar langsung di Excel pada BARIS soal tersebut (posisi pojok kiri atas gambar harus di baris soal).'],
      ['   Bisa "Insert > Pictures > Place over Cells" maupun "Place in Cell".'],
      ['b. Atau isi kolom Gambar dengan link gambar (https://...). Link Google Drive harus diatur "Siapa saja yang memiliki link".'],
      [''],
      ['Tips: ukuran gambar otomatis dikecilkan supaya cepat dikirim ke HP murid.'],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(info);
    ws2['!cols'] = [{ wch: 110 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Soal');
    XLSX.utils.book_append_sheet(wb, ws2, 'Petunjuk');
    download(wb, 'Template_Soal_IziLearning.xlsx');
  };

  /** Ringkasan per murid (dipakai halaman guru & ekspor). */
  IZI.summarizePlayer = function (room, p) {
    const total = p.order ? p.order.length : room.settings.questionCount || room.questions.length;
    let correct = 0;
    let answered = 0;
    for (const a of Object.values(p.answers || {})) {
      answered++;
      if (a.ok) correct++;
    }
    const score = IZI.scoreOf(correct, total);
    return {
      total,
      answered,
      correct,
      wrong: answered - correct,
      empty: total - answered,
      score,
      passed: score >= room.settings.kkm,
      points: p.points || 0,
      duration: p.finishedAt && room.startAt ? p.finishedAt - Math.max(room.startAt, p.joinedAt || 0) : null,
    };
  };

  IZI.exportResults = function (room) {
    const players = Object.values(room.players).filter((p) => !p.kicked);
    const rows = players
      .map((p) => ({ p, s: IZI.summarizePlayer(room, p) }))
      .sort((a, b) => b.s.score - a.s.score || b.s.points - a.s.points || a.p.name.localeCompare(b.p.name));
    const S = room.settings;
    const kkm = S.kkm;
    const fmtDate = (t) => (t ? new Date(t).toLocaleString('id-ID') : '-');

    const rekap = [['No', 'Nama', 'Benar', 'Salah', 'Tidak Dijawab', 'Jumlah Soal', 'Nilai', 'Status', 'Poin Game', 'Lama Mengerjakan', 'Pindah Tab', 'Waktu Selesai']];
    rows.forEach(({ p, s }, i) =>
      rekap.push([i + 1, p.name, s.correct, s.wrong, s.empty, s.total, s.score, s.passed ? 'LULUS' : 'TIDAK LULUS', s.points, IZI.fmtDuration(s.duration), p.tabSwitches || 0, fmtDate(p.finishedAt)])
    );
    const scores = rows.map((r) => r.s.score);
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const info = [
      ['Judul', S.title || '-'],
      ['Tanggal', fmtDate(room.startAt || room.createdAt)],
      ['Kode Room', room.code],
      ['Jenis Game', (IZI.GAMES[S.game] || {}).name || S.game],
      ['Durasi', S.durationMin + ' menit'],
      ['KKM', kkm],
      ['Jumlah Soal per Murid', rows[0] ? rows[0].s.total : S.questionCount || room.questions.length],
      ['Jumlah Murid', rows.length],
      ['Rata-rata Nilai', Math.round(avg * 10) / 10],
      ['Nilai Tertinggi', scores.length ? Math.max(...scores) : '-'],
      ['Nilai Terendah', scores.length ? Math.min(...scores) : '-'],
      ['Lulus', rows.filter((r) => r.s.passed).length],
      ['Tidak Lulus', rows.filter((r) => !r.s.passed).length],
    ];

    const analisis = [['No', 'Soal', 'Kunci', 'Dikerjakan Oleh', 'Jawab Benar', '% Benar', 'Tingkat Kesulitan', 'Pilih A', 'Pilih B', 'Pilih C', 'Pilih D', 'Kosong']];
    room.questions.forEach((q) => {
      let got = 0,
        ok = 0,
        empty = 0;
      const pick = { A: 0, B: 0, C: 0, D: 0 };
      players.forEach((p) => {
        if (!p.order || !p.order.includes(q.id)) return;
        got++;
        const a = p.answers[q.id];
        if (!a) empty++;
        else {
          pick[a.c] = (pick[a.c] || 0) + 1;
          if (a.ok) ok++;
        }
      });
      const pct = got ? Math.round((ok / got) * 100) : null;
      const lvl = pct == null ? '-' : pct >= 70 ? 'Mudah' : pct >= 30 ? 'Sedang' : 'Sulit';
      analisis.push([q.no, q.text, q.key, got, ok, pct == null ? '-' : pct, lvl, pick.A, pick.B, pick.C, pick.D, empty]);
    });

    const jawab = [['Nama', 'Nilai', ...room.questions.map((q) => 'Soal ' + q.no)]];
    rows.forEach(({ p, s }) =>
      jawab.push([
        p.name,
        s.score,
        ...room.questions.map((q) => {
          if (!p.order || !p.order.includes(q.id)) return '';
          const a = p.answers[q.id];
          return a ? a.c + (a.ok ? ' ✓' : ' ✗') : '-';
        }),
      ])
    );

    const wb = XLSX.utils.book_new();
    const w1 = XLSX.utils.aoa_to_sheet(rekap);
    w1['!cols'] = [{ wch: 4 }, { wch: 28 }, { wch: 7 }, { wch: 7 }, { wch: 13 }, { wch: 11 }, { wch: 7 }, { wch: 13 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 20 }];
    const w2 = XLSX.utils.aoa_to_sheet(info);
    w2['!cols'] = [{ wch: 22 }, { wch: 40 }];
    const w3 = XLSX.utils.aoa_to_sheet(analisis);
    w3['!cols'] = [{ wch: 4 }, { wch: 50 }, { wch: 6 }, { wch: 14 }, { wch: 11 }, { wch: 8 }, { wch: 16 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 }];
    const w4 = XLSX.utils.aoa_to_sheet(jawab);
    w4['!cols'] = [{ wch: 28 }, { wch: 7 }, ...room.questions.map(() => ({ wch: 8 }))];
    XLSX.utils.book_append_sheet(wb, w1, 'Rekap Nilai');
    XLSX.utils.book_append_sheet(wb, w2, 'Info Ujian');
    XLSX.utils.book_append_sheet(wb, w3, 'Analisis Soal');
    XLSX.utils.book_append_sheet(wb, w4, 'Jawaban Murid');
    download(wb, `Nilai_${safeName(S.title)}_${today()}.xlsx`);
  };
})();
