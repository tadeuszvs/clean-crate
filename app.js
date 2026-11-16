(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  /* ---------- header motif: a spectrum that hits a wall ---------- */
  (function () {
    var box = $('bars'), n = 44, cut = 31;
    for (var i = 0; i < n; i++) {
      var b = el('span', i >= cut ? 'bar cut' : 'bar');
      var h = i >= cut ? 6 : Math.round(26 + 62 * Math.pow(1 - i / n, 1.25) * (0.72 + 0.28 * Math.abs(Math.sin(i * 1.9))));
      b.style.height = h + '%';
      box.appendChild(b);
    }
  })();

  /* ---------- spectrum drawing ---------- */
  function drawSpectrum(cv, db, sr, wall) {
    var dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 600, h = cv.clientHeight || 150;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    var padL = 2, padR = 2, padT = 10, padB = 20, pw = w - padL - padR, ph = h - padT - padB;
    var nyq = sr / 2, half = db.length, cols = Math.max(40, Math.floor(pw)), ys = new Float64Array(cols), peak = -Infinity, x, k;
    for (x = 0; x < cols; x++) {
      var a = Math.floor(x / cols * half), b = Math.max(a + 1, Math.floor((x + 1) / cols * half)), s = 0;
      for (k = a; k < b; k++) s += db[k];
      ys[x] = s / (b - a); if (ys[x] > peak) peak = ys[x];
    }
    var topDb = peak + 6, range = 110;
    var Y = function (v) { return padT + ph * Math.min(1, Math.max(0, (topDb - v) / range)); };
    var X = function (f) { return padL + pw * f / nyq; };
    g.font = '500 11px Montserrat, system-ui, sans-serif'; g.textBaseline = 'alphabetic'; g.textAlign = 'center';
    g.strokeStyle = cssVar('--line'); g.fillStyle = cssVar('--muted'); g.lineWidth = 1;
    var step = nyq > 30000 ? 10000 : 5000;
    for (var f = step; f < nyq - 500; f += step) {
      var gx = Math.round(X(f)) + 0.5;
      g.beginPath(); g.moveTo(gx, padT); g.lineTo(gx, padT + ph); g.stroke();
      g.fillText((f / 1000) + ' kHz', gx, h - 5);
    }
    g.beginPath(); g.moveTo(padL, padT + ph + 0.5); g.lineTo(padL + pw, padT + ph + 0.5); g.stroke();
    var accent = cssVar('--accent');
    g.beginPath(); g.moveTo(padL, padT + ph);
    for (x = 0; x < cols; x++) g.lineTo(padL + (x + 0.5) / cols * pw, Y(ys[x]));
    g.lineTo(padL + pw, padT + ph); g.closePath();
    g.globalAlpha = 0.16; g.fillStyle = accent; g.fill(); g.globalAlpha = 1;
    g.beginPath();
    for (x = 0; x < cols; x++) { var px = padL + (x + 0.5) / cols * pw, py = Y(ys[x]); if (x) g.lineTo(px, py); else g.moveTo(px, py); }
    g.strokeStyle = accent; g.lineWidth = 1.5; g.lineJoin = 'round'; g.stroke();
    if (wall) {
      var wx = Math.round(X(wall.freq)) + 0.5, bad = cssVar('--bad');
      g.setLineDash([5, 4]); g.strokeStyle = bad; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(wx, padT - 4); g.lineTo(wx, padT + ph); g.stroke(); g.setLineDash([]);
      g.fillStyle = bad; g.font = '600 11px Montserrat, system-ui, sans-serif';
      var label = 'stops at ' + Core.khz(wall.freq), tw = g.measureText(label).width;
      g.textAlign = wx + 8 + tw > w ? 'right' : 'left';
      g.fillText(label, g.textAlign === 'right' ? wx - 7 : wx + 7, padT + 10);
    }
  }
  var plots = [];
  function plot(cv, db, sr, wall) { plots.push([cv, db, sr, wall]); drawSpectrum(cv, db, sr, wall); }
  function redraw() { plots = plots.filter(function (p) { return p[0].isConnected; }); plots.forEach(function (p) { drawSpectrum.apply(null, p); }); }
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(redraw, 120); });
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw); } catch (e) {}
  try { new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) {}
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);

  /* ---------- key signature on a treble staff ---------- */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  var SHARP_POS = [8, 5, 9, 6, 3, 7, 4], FLAT_POS = [4, 7, 3, 6, 2, 5, 1];  // steps above the bottom line (E4)
  function staff(sig, label) {
    var n = Math.abs(sig), gap = 9, w = 52 + n * 11 + 14, base = 50;
    var s = svg('svg', { viewBox: '0 0 ' + w + ' 66', width: w, height: 66, role: 'img', 'aria-label': label, 'class': 'staff' });
    for (var i = 0; i < 5; i++) s.appendChild(svg('line', { x1: 0, x2: w, y1: base - i * gap, y2: base - i * gap, 'class': 'st-line' }));
    var clef = svg('text', { x: 3, y: base + 8, 'class': 'st-clef' }); clef.textContent = '𝄞'; s.appendChild(clef);
    for (var j = 0; j < n; j++) {
      var x = 44 + j * 11, y = base - (sig > 0 ? SHARP_POS[j] : FLAT_POS[j]) * gap / 2;
      if (sig > 0) {
        s.appendChild(svg('path', { d: 'M' + (x + 1.6) + ' ' + (y - 9) + 'V' + (y + 7) + 'M' + (x + 4.8) + ' ' + (y - 7) + 'V' + (y + 9), 'class': 'st-thin' }));
        s.appendChild(svg('path', { d: 'M' + (x - 0.5) + ' ' + (y - 1.8) + 'L' + (x + 7) + ' ' + (y - 4.2) + 'M' + (x - 0.5) + ' ' + (y + 4.2) + 'L' + (x + 7) + ' ' + (y + 1.8), 'class': 'st-thick' }));
      } else {
        s.appendChild(svg('path', { d: 'M' + x + ' ' + (y - 14) + 'V' + (y + 4.5) + 'C' + (x + 3) + ' ' + (y + 2.5) + ' ' + (x + 8.5) + ' ' + (y - 0.5) + ' ' + (x + 7.4) + ' ' + (y - 3.4) + 'C' + (x + 6.4) + ' ' + (y - 6) + ' ' + (x + 2) + ' ' + (y - 4.5) + ' ' + x + ' ' + (y - 1.5), 'class': 'st-flat' }));
      }
    }
    return s;
  }

  /* ---------- reference shapes (illustrations, not measurements) ---------- */
  (function () {
    var half = 512, sr = 44100, a = new Float64Array(half), b = new Float64Array(half), seed = 7;
    function r() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; }
    for (var k = 0; k < half; k++) {
      var f = k / half * 22050, base = -18 - 34 * Math.pow(f / 22050, 0.8) + r() * 5;
      a[k] = f > 21300 ? base - (f - 21300) / 12 : base;
      b[k] = f > 16000 ? -150 : base;
    }
    plot($('ref-full'), a, sr, null);
    plot($('ref-lossy'), b, sr, { freq: 16000 });
  })();

  /* ---------- finder ---------- */
  var current = null;
  function renderStores(query, parsed) {
    var box = $('find-result'); box.textContent = '';
    Core.stores(query, parsed).forEach(function (grp) {
      var sec = el('div', 'group');
      sec.appendChild(el('h3', null, grp.group));
      var grid = el('div', 'stores');
      grp.items.forEach(function (it) {
        var a = el('a', 'store'); a.href = it.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.appendChild(el('span', 'store-name', it.name));
        a.appendChild(el('span', 'store-get', it.get));
        grid.appendChild(a);
      });
      sec.appendChild(grid); box.appendChild(sec);
    });
  }
  function showFind(parsed, isExample) {
    current = parsed;
    $('find-refine').hidden = false;
    $('find-query').value = parsed.query;
    $('find-source').textContent = isExample ? 'Example' : parsed.source;
    $('find-source').className = 'chip' + (isExample ? ' chip-example' : '');
    var note = $('find-note');
    note.textContent = isExample ? 'This is a sample search. Paste your own link or type a track above.' : (parsed.note || '');
    note.hidden = !note.textContent; note.className = 'note';
    $('add-crate').disabled = !!isExample;
    renderStores(parsed.query, parsed);
  }
  function reveal(el) {
    var smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(function () { el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }); }, 250);
  }
  function runFind(text, fromSubmit) {
    var p = Core.parseInput(text);
    if (fromSubmit) $('find-input').blur();   // drop the phone keyboard so the results can be seen
    if (!p.ok) { var note = $('find-note'); note.textContent = p.note; note.hidden = false; note.className = 'note note-warn'; if (fromSubmit) reveal(note); return; }
    showFind(p, false);
    var box = $('find-refine');
    box.classList.remove('fresh'); void box.offsetWidth; box.classList.add('fresh');
    if (fromSubmit) reveal(box);
  }
  $('find-form').addEventListener('submit', function (e) { e.preventDefault(); runFind($('find-input').value, true); });
  $('find-input').addEventListener('paste', function () { setTimeout(function () { if ($('find-input').value.trim()) runFind($('find-input').value, false); }, 0); });
  $('find-query').addEventListener('input', function () {
    if (!current) return;
    var q = $('find-query').value.trim(); if (!q) return;
    if (current.source === 'Example' || $('find-source').textContent === 'Example') {
      current = { ok: true, source: 'Typed', query: q, note: '' };
      $('find-source').textContent = 'Typed'; $('find-source').className = 'chip'; $('find-note').hidden = true; $('add-crate').disabled = false;
    }
    current.query = q; renderStores(q, current);
  });
  $('add-crate').addEventListener('click', function () {
    if (!current || !current.query) return;
    addItem({ q: current.query, src: current.source || 'Typed', url: current.url || '', got: false, added: Date.now() });
    var b = $('add-crate'), old = b.textContent; b.textContent = 'Added'; setTimeout(function () { b.textContent = old; }, 1400);
  });
  showFind({ ok: true, source: 'Typed', query: 'Floating Points Vocoder', note: '' }, true);

  /* ---------- checker ---------- */
  function decode(buf, rate) {
    var Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Ctx) return Promise.reject(new Error('This browser cannot decode audio.'));
    var ctx; try { ctx = new Ctx(2, 2, rate); } catch (e) { ctx = new Ctx(2, 2, 44100); }
    return new Promise(function (res, rej) { var p = ctx.decodeAudioData(buf, res, rej); if (p && p.catch) p.catch(rej); });
  }
  function fmtTime(s) { s = Math.round(s); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  async function analyze(file) {
    if (file.size > 600 * 1024 * 1024) throw new Error('This file is over 600 MB. Check a shorter one.');
    var buf = await file.arrayBuffer();
    var info = Core.parseWav(buf) || Core.parseAiff(buf), getFrame, total, sr, limited = false;
    if (info) { getFrame = Core.pcmReader(buf, info); total = info.frames; sr = info.sampleRate; }
    else {
      info = Core.sniff(buf, file.name);
      var native = info.sampleRate || 44100;
      limited = native > 48000;
      var audio;
      try { audio = await decode(buf, Math.min(native, 48000)); }
      catch (e) { throw new Error('This browser could not read the file. WAV, AIFF, FLAC, MP3 and M4A work best.'); }
      sr = audio.sampleRate; total = audio.length;
      var chans = []; for (var c = 0; c < audio.numberOfChannels; c++) chans.push(audio.getChannelData(c));
      if (!info.channels) info.channels = chans.length;
      getFrame = function (start, N) {
        var out = new Float32Array(N);
        for (var ch = 0; ch < chans.length; ch++) { var d = chans[ch]; for (var i = 0; i < N; i++) out[i] += (d[start + i] || 0) / chans.length; }
        return out;
      };
    }
    var N = sr > 50000 ? 16384 : 8192;
    if (total < N * 6) throw new Error('This file is too short to judge. Use a clip of at least a few seconds.');
    var spec = Core.averageSpectrum(getFrame, total, N, 48);
    if (spec.used < 4) throw new Error('This file is too quiet to judge.');
    var wall = Core.detectWall(spec.db, sr), tempo = null, key = null;
    try { tempo = Core.tempo(getFrame, total, sr); } catch (e) { tempo = null; }
    try { key = Core.key(getFrame, total, sr); } catch (e) { key = null; }
    return { info: info, sr: sr, db: spec.db, wall: wall, verdict: Core.verdict(info, wall, sr), duration: total / sr, limited: limited, tempo: tempo, key: key };
  }

  function resultCard(name) {
    var card = el('article', 'result');
    var head = el('div', 'result-head');
    head.appendChild(el('h3', 'result-name', name));
    var pill = el('span', 'pill pill-wait', 'Analyzing'); head.appendChild(pill);
    card.appendChild(head);
    var detail = el('p', 'result-detail', 'Reading the file on this device.'); card.appendChild(detail);
    return { card: card, pill: pill, detail: detail };
  }
  async function handleFiles(list) {
    var files = Array.prototype.slice.call(list || []);
    if (!files.length) return;
    var box = $('check-results');
    $('check-empty').hidden = true;
    for (var i = 0; i < files.length; i++) {
      var ui = resultCard(files[i].name);
      box.insertBefore(ui.card, box.firstChild);
      await new Promise(function (r) { setTimeout(r, 30); });
      try {
        var r = await analyze(files[i]);
        ui.pill.className = 'pill pill-' + r.verdict.tone; ui.pill.textContent = r.verdict.label;
        ui.detail.textContent = r.verdict.detail;
        var facts = [r.info.container, (r.info.sampleRate || r.sr) / 1000 + ' kHz'];
        if (r.info.bits) facts.push(r.info.bits + '-bit' + (r.info.float ? ' float' : ''));
        facts.push(fmtTime(r.duration));
        facts.push(r.wall ? 'content to ' + Core.khz(r.wall.freq) : 'content to ' + Core.khz(Math.min(r.sr / 2, 22050)) + (r.sr > 50000 ? ' and above' : ''));
        if (r.limited) facts.push('checked up to 24 kHz');
        var dj = el('div', 'dj');
        var b1 = el('div', 'dj-item'); b1.appendChild(el('span', 'dj-label', 'Tempo'));
        b1.appendChild(el('span', 'dj-value', r.tempo ? r.tempo.bpm + ' BPM' : 'No steady beat found'));
        if (r.tempo && r.tempo.alt) b1.appendChild(el('span', 'dj-alt', 'or ' + r.tempo.alt + (r.tempo.alt < r.tempo.bpm ? ' half-time' : ' double-time')));
        var b2 = el('div', 'dj-item'); b2.appendChild(el('span', 'dj-label', 'Key'));
        b2.appendChild(el('span', 'dj-value', r.key ? r.key.name : 'Not clear'));
        if (r.key) {
          var line = el('div', 'key-line');
          line.appendChild(el('span', 'cam', r.key.camelot));
          line.appendChild(el('span', 'dj-alt', r.key.short + ' · ' + r.key.sigText));
          b2.appendChild(line);
          b2.appendChild(staff(r.key.sig, r.key.name + ', ' + r.key.sigText));
          if (r.key.margin < 0.05) b2.appendChild(el('span', 'dj-alt', 'Close call with ' + r.key.alt.name + ' (' + r.key.alt.camelot + ')'));
        }
        dj.appendChild(b1); dj.appendChild(b2); ui.card.appendChild(dj);
        var fl = el('ul', 'facts'); facts.forEach(function (t) { fl.appendChild(el('li', null, t)); }); ui.card.appendChild(fl);
        var cv = el('canvas', 'spec'); cv.setAttribute('role', 'img');
        cv.setAttribute('aria-label', 'Frequency content of ' + files[i].name + '. ' + r.verdict.detail);
        ui.card.appendChild(cv); plot(cv, r.db, r.sr, r.wall);
      } catch (e) {
        ui.pill.className = 'pill pill-info'; ui.pill.textContent = 'Not checked';
        ui.detail.textContent = (e && e.message) || 'Something went wrong reading this file.';
      }
    }
  }
  var drop = $('drop'), input = $('file-input');
  input.addEventListener('change', function () { handleFiles(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { if (e.dataTransfer) handleFiles(e.dataTransfer.files); });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });

  /* ---------- crate ---------- */
  var LS = 'clean-crate-v1', items = [], store = { mode: 'local', col: null };
  function loadLocal() { try { return JSON.parse(localStorage.getItem(LS) || '[]') || []; } catch (e) { return []; } }
  function saveLocal() { try { localStorage.setItem(LS, JSON.stringify(items)); } catch (e) {} }
  function newId() { return 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
  function body(it) { return { q: it.q, src: it.src || 'Typed', url: it.url || '', got: !!it.got, added: it.added || Date.now() }; }
  function setSync(state) {
    var s = $('sync'), map = {
      local: ['Saved on this device only', 'sync-local'],
      connecting: ['Connecting to your saved crate', 'sync-wait'],
      slow: ['Saved crate not reached yet. Showing what this device has.', 'sync-wait'],
      cloud: ['Synced to your Claude account, on every device', 'sync-ok'],
      error: ['Could not save that change. Try again.', 'sync-bad']
    };
    s.textContent = map[state][0]; s.className = 'sync ' + map[state][1];
  }
  function renderCrate() {
    var list = $('crate-list'); list.textContent = '';
    var sorted = items.slice().sort(function (a, b) { return (a.got - b.got) || (b.added - a.added); });
    $('crate-empty').hidden = sorted.length > 0;
    $('copy-list').hidden = sorted.length === 0;
    var need = sorted.filter(function (i) { return !i.got; }).length;
    $('crate-count').textContent = sorted.length ? need + ' to get, ' + (sorted.length - need) + ' in your library' : '';
    sorted.forEach(function (it) {
      var li = el('li', 'track' + (it.got ? ' got' : ''));
      var cid = 'got-' + it.id;
      var cb = el('input', 'big-check'); cb.type = 'checkbox'; cb.id = cid; cb.checked = !!it.got;
      cb.addEventListener('change', function () { updateItem(it.id, { got: cb.checked }); });
      var lab = el('label', 'track-main'); lab.htmlFor = cid;
      lab.appendChild(el('span', 'track-title', it.q));
      lab.appendChild(el('span', 'track-meta', (it.got ? 'In your library' : 'Still to get') + (it.src && it.src !== 'Typed' ? ' · from ' + it.src : '')));
      var acts = el('div', 'track-acts');
      var find = el('button', 'ghost', 'Find'); find.type = 'button';
      find.addEventListener('click', function () {
        showFind({ ok: true, source: it.src || 'Typed', query: it.q, url: it.url || '', note: '' }, false);
        $('find-input').value = it.url || it.q;
        $('find').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      });
      var rm = el('button', 'ghost danger', 'Remove'); rm.type = 'button';
      rm.setAttribute('aria-label', 'Remove ' + it.q);
      rm.addEventListener('click', function () { removeItem(it.id); });
      acts.appendChild(find); acts.appendChild(rm);
      li.appendChild(cb); li.appendChild(lab); li.appendChild(acts); list.appendChild(li);
    });
  }
  function fail() { setSync('error'); setTimeout(function () { setSync(store.mode === 'cloud' ? 'cloud' : 'local'); }, 4000); }
  function addItem(data) {
    var id = newId();
    if (store.mode === 'cloud') { store.col.doc(id).set(body(data)).catch(fail); }
    else { items.push(Object.assign({ id: id }, body(data))); saveLocal(); renderCrate(); }
  }
  function updateItem(id, patch) {
    var it = items.filter(function (i) { return i.id === id; })[0]; if (!it) return;
    var next = Object.assign({}, it, patch);
    if (store.mode === 'cloud') { store.col.doc(id).set(body(next)).catch(fail); }
    else { items = items.map(function (i) { return i.id === id ? next : i; }); saveLocal(); renderCrate(); }
  }
  function removeItem(id) {
    if (store.mode === 'cloud') { store.col.doc(id).delete().catch(fail); }
    else { items = items.filter(function (i) { return i.id !== id; }); saveLocal(); renderCrate(); }
  }
  $('copy-list').addEventListener('click', function () {
    var text = items.slice().sort(function (a, b) { return (a.got - b.got) || (b.added - a.added); })
      .map(function (i) { return (i.got ? '[x] ' : '[ ] ') + i.q; }).join('\n');
    var b = $('copy-list'), done = function (t) { var old = 'Copy list'; b.textContent = t; setTimeout(function () { b.textContent = old; }, 1500); };
    try { navigator.clipboard.writeText(text).then(function () { done('Copied'); }, function () { done('Copy was blocked'); }); }
    catch (e) { done('Copy was blocked'); }
  });

  async function initStore() {
    items = loadLocal(); renderCrate();
    if (!window.claude || typeof window.claude.use !== 'function') { setSync('local'); return; }
    setSync('connecting');
    var db = null, user = null, uid = null, col = null;
    try { var got = await Promise.all([window.claude.use('db'), window.claude.use('user')]); db = got[0]; user = got[1]; } catch (e) {}
    try { uid = user ? await user.id() : null; } catch (e) { uid = null; }
    if (!db || !uid) { setSync('local'); return; }
    try { col = db.doc('data/users/' + uid + '/crate').collection('tracks'); } catch (e) { setSync('local'); return; }
    var timer = setTimeout(function () { setSync('slow'); }, 10000), migrated = false, live = false;
    col.onSnapshot(function (snap) {
      var cloud = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      if (!snap.metadata.fromCache && !live) {
        live = true; clearTimeout(timer); store = { mode: 'cloud', col: col }; setSync('cloud');
        if (!migrated) {
          migrated = true;
          var have = {}; cloud.forEach(function (c) { have[c.id] = 1; });
          var local = loadLocal().filter(function (l) { return l && l.id && l.q && !have[l.id]; });
          (async function () {
            for (var i = 0; i < local.length; i++) { try { await col.doc(local[i].id).set(body(local[i])); } catch (e) { return; } }
            try { localStorage.removeItem(LS); } catch (e) {}
          })();
        }
      }
      if (live || cloud.length) { items = cloud; renderCrate(); }
    }, function () { clearTimeout(timer); store = { mode: 'local', col: null }; items = loadLocal(); setSync('local'); renderCrate(); });
  }
  initStore();
})();
