(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function link(cls, text, href) { var a = el('a', cls, text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function money(v) { return '$' + (Math.round(v * 100) / 100).toFixed(2); }
  function fmtTime(s) { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function fmtSize(b) { return b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? Math.round(b / 1e6) + ' MB' : Math.round(b / 1e3) + ' KB'; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* =========================================================== spectrum drawing */
  /* opts.wall marks an encoder cutoff; opts.compare adds the missing range and an estimated full-quality line. */
  function drawSpectrum(cv, db, sr, opts) {
    opts = opts || {};
    var wall = opts.wall;
    var dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 600, h = cv.clientHeight || 170;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    var padL = 2, padR = 2, padT = 12, padB = 20, pw = w - padL - padR, ph = h - padT - padB;
    var nyq = sr / 2, half = db.length, cols = Math.max(40, Math.floor(pw)), ys = new Float64Array(cols), peak = -Infinity, x, k;
    for (x = 0; x < cols; x++) {
      var a = Math.floor(x / cols * half), b = Math.max(a + 1, Math.floor((x + 1) / cols * half)), s = 0;
      for (k = a; k < b; k++) s += db[k];
      ys[x] = s / (b - a); if (ys[x] > peak) peak = ys[x];
    }
    var topDb = peak + 6, range = 110;
    var Y = function (v) { return padT + ph * Math.min(1, Math.max(0, (topDb - v) / range)); };
    var X = function (f) { return padL + pw * f / nyq; };
    var colX = function (i) { return padL + (i + 0.5) / cols * pw; };
    g.font = '500 11px Montserrat, system-ui, sans-serif'; g.textBaseline = 'alphabetic'; g.textAlign = 'center';
    g.strokeStyle = cssVar('--line'); g.fillStyle = cssVar('--muted'); g.lineWidth = 1;
    var step = nyq > 30000 ? 10000 : 5000;
    for (var f = step; f < nyq - 500; f += step) {
      var gx = Math.round(X(f)) + 0.5;
      g.beginPath(); g.moveTo(gx, padT); g.lineTo(gx, padT + ph); g.stroke();
      g.fillText((f / 1000) + ' kHz', gx, h - 5);
    }
    g.beginPath(); g.moveTo(padL, padT + ph + 0.5); g.lineTo(padL + pw, padT + ph + 0.5); g.stroke();
    var bad = cssVar('--bad'), accent = cssVar('--accent');
    if (wall && opts.compare) {
      var wx0 = X(wall.freq);
      g.globalAlpha = 0.13; g.fillStyle = bad; g.fillRect(wx0, padT, padL + pw - wx0, ph); g.globalAlpha = 1;
      /* Estimated full-quality line: carry the level and slope from just below the cutoff on to the top of the range. */
      var hz = nyq / cols, avg = function (f1, f2) { var i1 = Math.max(0, Math.floor(f1 / hz)), i2 = Math.max(i1 + 1, Math.floor(f2 / hz)), s2 = 0; for (var i = i1; i < i2; i++) s2 += ys[i]; return s2 / (i2 - i1); };
      var lvl = avg(wall.freq - 2500, wall.freq - 600), lvl2 = avg(wall.freq - 7000, wall.freq - 5000);
      var slope = Math.min(0, (lvl - lvl2) / 4.25);
      var startF = wall.freq - 1500;
      g.setLineDash([6, 5]); g.strokeStyle = cssVar('--muted'); g.lineWidth = 1.5;
      g.beginPath();
      for (var ff = startF; ff <= nyq; ff += hz) { var yy = Y(lvl + slope * (ff - startF) / 1000 - 2); if (ff === startF) g.moveTo(X(ff), yy); else g.lineTo(X(ff), yy); }
      g.stroke(); g.setLineDash([]);
    }
    g.beginPath(); g.moveTo(padL, padT + ph);
    for (x = 0; x < cols; x++) g.lineTo(colX(x), Y(ys[x]));
    g.lineTo(padL + pw, padT + ph); g.closePath();
    g.globalAlpha = 0.16; g.fillStyle = accent; g.fill(); g.globalAlpha = 1;
    g.beginPath();
    for (x = 0; x < cols; x++) { if (x) g.lineTo(colX(x), Y(ys[x])); else g.moveTo(colX(x), Y(ys[x])); }
    g.strokeStyle = accent; g.lineWidth = 1.6; g.lineJoin = 'round'; g.stroke();
    if (wall) {
      var wx = Math.round(X(wall.freq)) + 0.5;
      g.setLineDash([5, 4]); g.strokeStyle = bad; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(wx, padT - 6); g.lineTo(wx, padT + ph); g.stroke(); g.setLineDash([]);
      g.fillStyle = bad; g.font = '600 11px Montserrat, system-ui, sans-serif';
      var label = opts.compare ? 'missing above ' + Core.khz(wall.freq) : 'stops at ' + Core.khz(wall.freq), tw = g.measureText(label).width;
      g.textAlign = wx + 8 + tw > w ? 'right' : 'left';
      g.fillText(label, g.textAlign === 'right' ? wx - 7 : wx + 7, padT + 4);
    }
  }
  var plots = [];
  function plot(cv, db, sr, opts) { plots.push([cv, db, sr, opts]); requestAnimationFrame(function () { drawSpectrum(cv, db, sr, opts); }); }
  function redraw() { plots = plots.filter(function (p) { return p[0].isConnected; }); plots.forEach(function (p) { drawSpectrum.apply(null, p); }); }
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(redraw, 120); });
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw); } catch (e) {}
  try { new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) {}

  /* =========================================================== key signature on a staff */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  var SHARP_POS = [8, 5, 9, 6, 3, 7, 4], FLAT_POS = [4, 7, 3, 6, 2, 5, 1];
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

  /* =========================================================== tabs */
  var VIEWS = ['dig', 'crate', 'check'];
  function show(view, push) {
    if (VIEWS.indexOf(view) < 0) view = 'dig';
    VIEWS.forEach(function (v) { $('view-' + v).hidden = v !== view; });
    [].forEach.call(document.querySelectorAll('.tab'), function (t) { if (t.dataset.view === view) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    if (push !== false && location.hash !== '#' + view) { try { history.replaceState(null, '', '#' + view); } catch (e) { location.hash = view; } }
    if (view === 'crate') renderCrate();
    if (view === 'check') redraw();
    window.scrollTo(0, 0);
  }
  [].forEach.call(document.querySelectorAll('.tab'), function (t) { t.addEventListener('click', function () { show(t.dataset.view); }); });
  window.addEventListener('hashchange', function () { var h = location.hash.slice(1); if (/^sync-/.test(h)) joinFromText(location.href); else if (VIEWS.indexOf(h) >= 0) show(h, false); });

  /* =========================================================== crate data */
  var LS = 'clean-crate-v2', LS1 = 'clean-crate-v1', LS_SYNC = 'clean-crate-sync';
  var state = { items: [], filter: 'all', sort: 'new', mix: null };
  var remote = { mode: 'local', col: null, key: null, timer: null, pending: false };

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function loadLocal() {
    var v2 = null; try { v2 = JSON.parse(lsGet(LS) || 'null'); } catch (e) {}
    if (v2 && Array.isArray(v2.items)) return v2.items.map(function (i) { if (i.found === 'pending' && Date.now() - (i.updatedAt || 0) > 120000) i.found = 'error'; return i; });
    var v1 = []; try { v1 = JSON.parse(lsGet(LS1) || '[]') || []; } catch (e) {}
    return v1.filter(function (o) { return o && o.q; }).map(function (o) {
      return { id: o.id || newId(), q: o.q, status: o.got ? 'got' : 'get', found: 'pending', from: 'search', added: o.added || Date.now(), updatedAt: Date.now() };
    });
  }
  function saveLocal() {
    var cutoff = Date.now() - 30 * 864e5;
    state.items = state.items.filter(function (i) { return !i.deleted || (i.updatedAt || 0) > cutoff; });
    lsSet(LS, JSON.stringify({ items: state.items }));
  }
  function newId() {
    var b = new Uint8Array(9); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach(function (_, i) { b[i] = Math.random() * 256; });
    return 't' + [].map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }
  function liveItems() { return state.items.filter(function (i) { return !i.deleted; }); }
  function findByQuery(q) { var k = Core.crateKey(q); return liveItems().filter(function (i) { return Core.crateKey(i.q) === k; })[0] || null; }
  function getItem(id) { return state.items.filter(function (i) { return i.id === id; })[0] || null; }

  function commit(item) {
    item.updatedAt = Date.now();
    var i = state.items.indexOf(item);
    if (i < 0) { var j = -1; state.items.forEach(function (x, n) { if (x.id === item.id) j = n; }); if (j >= 0) state.items[j] = item; else state.items.push(item); }
    saveLocal();
    if (remote.mode === 'claude') {
      var ref = remote.col.doc(item.id);
      (item.deleted ? ref.delete() : ref.set(JSON.parse(JSON.stringify(item)))).catch(function () { setDot('Could not save that change', 'bad'); });
    } else if (remote.mode === 'kv') schedulePush();
    renderBadge();
    if (!$('view-crate').hidden) renderCrate();
  }
  function removeItem(item) { item.deleted = true; commit(item); }

  function group(i) {
    if (i.status === 'got') return 'got';
    if (i.found === 'pending') return 'pending';
    if (i.found === 'error') return 'error';
    if (i.found === 'none') return 'none';
    if (i.best && i.best.free) return 'free';
    if (i.best) return 'buy';
    return 'check';
  }
  function displayName(i) { return i.artist && i.title ? i.artist + ' – ' + i.title : i.q; }

  /* =========================================================== sync */
  function setDot(text, cls) { var d = $('sync-dot'); d.textContent = text; d.className = 'sync-state' + (cls ? ' ' + cls : ''); }
  function syncLinkFor(key) { return location.origin + location.pathname + '#sync-' + key; }
  function newKey() {
    var b = new Uint8Array(18); crypto.getRandomValues(b);
    return btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function kvUrl() { return Core.HELPER + 'sync?key=' + encodeURIComponent(remote.key); }
  function kvGet() { return fetch(kvUrl(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function kvPull() {
    return kvGet().then(function (d) {
      state.items = Core.mergeCrates(state.items, d.items || []);
      saveLocal(); renderBadge(); if (!$('view-crate').hidden) renderCrate(); renderRecent();
      setDot('Synced', 'ok');
    }).catch(function () { setDot('Sync offline, saved here', 'bad'); });
  }
  function kvPush() {
    if (remote.pending) { remote.again = true; return Promise.resolve(); }
    remote.pending = true;
    return kvGet().then(function (d) {
      state.items = Core.mergeCrates(state.items, d.items || []);
      saveLocal();
      return fetch(kvUrl(), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: state.items }) });
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); setDot('Synced', 'ok'); })
      .catch(function () { setDot('Sync offline, saved here', 'bad'); })
      .then(function () { remote.pending = false; if (remote.again) { remote.again = false; schedulePush(); } });
  }
  function schedulePush() { clearTimeout(remote.timer); setDot('Saving…'); remote.timer = setTimeout(kvPush, 1200); }
  function startKv(key) {
    remote = { mode: 'kv', col: null, key: key, timer: null, pending: false };
    lsSet(LS_SYNC, key);
    renderSync();
    return kvPull().then(kvPush);
  }
  function stopKv() { lsSet(LS_SYNC, null); remote = { mode: 'local' }; setDot('This device'); renderSync(); }
  function joinFromText(text) {
    var m = String(text || '').match(/sync-([A-Za-z0-9_-]{24,64})/);
    if (!m) { $('sync-text').textContent = 'That doesn’t look like a Clean Crate sync link.'; return false; }
    if (remote.mode === 'claude') return false;
    startKv(m[1]);
    try { history.replaceState(null, '', '#crate'); } catch (e) {}
    show('crate', false);
    return true;
  }
  function renderSync() {
    var on = remote.mode === 'kv', claude = remote.mode === 'claude';
    $('sync-off').hidden = on || claude;
    $('sync-on').hidden = !on;
    $('sync-join-row').hidden = claude;
    $('sync-text').textContent = claude ? 'Synced through your Claude account. For your phone, use tadeuszvs.github.io/clean-crate and turn on sync there.'
      : on ? 'Sync is on. Changes on any connected device show up on the others.'
      : 'Your crate is saved on this device only. Turn on sync to share it with your other devices.';
    if (on) $('sync-link').textContent = syncLinkFor(remote.key);
  }
  $('sync-start').addEventListener('click', function () { startKv(newKey()); });
  $('sync-stop').addEventListener('click', stopKv);
  $('sync-copy').addEventListener('click', function () { copyText(syncLinkFor(remote.key), $('sync-copy'), 'Copy link'); });
  $('sync-join-go').addEventListener('click', function () { if (joinFromText($('sync-join').value)) $('sync-join').value = ''; });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && remote.mode === 'kv') kvPull(); });
  function copyText(text, btn, label) {
    var done = function (t) { btn.textContent = t; setTimeout(function () { btn.textContent = label; }, 1600); };
    try { navigator.clipboard.writeText(text).then(function () { done('Copied'); }, function () { done('Copy was blocked'); }); } catch (e) { done('Copy was blocked'); }
  }

  /* =========================================================== lookups */
  function fetchHelper(query) {
    return fetch(Core.HELPER + '?q=' + encodeURIComponent(query)).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function fetchApple(query) {
    return fetch('https://itunes.apple.com/search?entity=song&limit=10&country=US&term=' + encodeURIComponent(query.replace(/\s+[-–—]\s+/, ' ')))
      .then(function (r) { return r.json(); }).then(function (j) { return Core.appleItems(j, query); }).catch(function () { return []; });
  }
  function applyLookup(item, data, apple) {
    var vm = Core.viewModel(data, apple);
    item.checkedAt = Date.now();
    if (!data) { item.found = 'error'; return vm; }
    var hasLossless = vm.rows.some(function (r) { return !r.none && r.lossless; });
    item.found = vm.best || hasLossless ? 'ok' : 'none';
    var b = data.best;
    item.best = b ? { store: Core.storeName(b.store), url: b.url, free: !!b.free, price: b.price ? b.price.display : null, priceValue: b.free ? 0 : (b.price && (!b.price.currency || b.price.currency === 'USD') ? b.price.value : null), quality: b.quality || null, match: b.match } : null;
    if (!item.best && hasLossless) {
      var r0 = vm.rows.filter(function (r) { return !r.none && r.lossless; })[0];
      item.lead = { store: r0.store, url: r0.url };
    } else item.lead = null;
    if (vm.facts) {
      item.title = vm.facts.title || item.title; item.artist = vm.facts.artist || item.artist;
      item.bpm = vm.facts.bpm || item.bpm || null;
      if (vm.facts.key) { var kd = Core.keyFromName(vm.facts.key); if (kd) { item.keyName = kd.name; item.camelot = kd.camelot; } }
      item.year = vm.facts.year || item.year || null;
    }
    return vm;
  }
  function lookupItem(item, opts) {
    opts = opts || {};
    item.found = 'pending'; commit(item);
    var helper = fetchHelper(item.q).catch(function () { return null; });
    var apple = opts.apple ? fetchApple(item.q) : Promise.resolve([]);
    return Promise.all([helper, apple]).then(function (res) {
      var live = getItem(item.id);
      if (!live || live.deleted) return null;
      var vm = applyLookup(live, res[0], res[1]);
      commit(live);
      return vm;
    });
  }
  function addOrGet(q, from, extra) {
    var it = findByQuery(q);
    if (!it) { it = { id: newId(), q: q, status: 'get', found: 'pending', from: from || 'search', added: Date.now() }; }
    if (extra) for (var k in extra) it[k] = extra[k];
    return it;
  }

  /* =========================================================== dig */
  function reveal(node) { setTimeout(function () { node.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); }, 200); }
  function manualLinks(query, parsed) {
    var box = $('manual-links'); box.textContent = '';
    var want = ['Bandcamp', 'Beatport', 'Traxsource', 'Juno Download', 'Qobuz', 'SoundCloud', 'Discogs', 'WhoSampled', 'MusicBrainz'];
    var seen = {};
    Core.stores(query, parsed).forEach(function (g) {
      g.items.forEach(function (it) { if (want.indexOf(it.name) >= 0 && !seen[it.name]) { seen[it.name] = 1; box.appendChild(link('chip', it.name, it.url)); } });
    });
    $('manual').hidden = false;
  }
  function renderLookup(vm, item) {
    var box = $('lookup'); box.textContent = '';
    if (vm.best) {
      var b = el('div', 'best' + (vm.best.free ? ' free' : ''));
      b.appendChild(el('span', 'best-label', vm.best.free ? 'Free lossless download' : 'Cheapest lossless copy'));
      var main = el('div', 'best-main');
      main.appendChild(el('span', 'best-title', vm.best.artist + ' – ' + vm.best.title));
      main.appendChild(el('span', 'best-price', vm.best.free ? 'Free' : (vm.best.price || '')));
      b.appendChild(main);
      b.appendChild(el('span', 'best-sub', vm.best.store + (vm.best.quality ? ' · ' + vm.best.quality : '') + ' · ' + (vm.best.match === 'exact' ? 'exact match' : vm.best.match)));
      b.appendChild(link(null, 'Open on ' + vm.best.store, vm.best.url));
      box.appendChild(b);
    } else if (item.found === 'error') {
      box.appendChild(el('p', 'status', 'Live lookup isn’t reachable from here. Use the store searches below.'));
    } else {
      box.appendChild(el('p', 'status', vm.rows.some(function (r) { return !r.none; }) ? 'No price found automatically. Tap a match below to check it.' : 'No lossless copy found automatically for “' + item.q + '”. Try the store searches below, or check the spelling.'));
    }
    var f = vm.facts;
    if (f) {
      var line = el('div', 'facts-line');
      var kd = f.key ? Core.keyFromName(f.key) : null;
      [f.album, f.year, f.length, f.bpm ? f.bpm + ' BPM' : null, kd ? kd.camelot + ' · ' + kd.name : f.key, f.label].filter(Boolean)
        .forEach(function (t) { line.appendChild(el('span', null, String(t))); });
      if (line.childNodes.length) box.appendChild(line);
    }
    var saved = el('div', 'saved');
    saved.appendChild(el('span', null, '✓ Saved to your crate'));
    var undo = el('button', 'linkish', 'Undo'); undo.type = 'button';
    undo.addEventListener('click', function () { var it = getItem(item.id); if (it) removeItem(it); saved.textContent = 'Removed from your crate.'; });
    var open = el('button', 'linkish', 'Open crate'); open.type = 'button';
    open.addEventListener('click', function () { show('crate'); });
    saved.appendChild(undo); saved.appendChild(open);
    box.appendChild(saved);
    var rows = vm.rows.filter(function (r) { return !r.none; });
    if (rows.length) {
      box.appendChild(el('h3', null, 'Matches found'));
      var list = el('div', 'list');
      rows.forEach(function (r) {
        var row = link('item', null, r.url);
        var m = el('div', 'item-main');
        var top = el('span', 'item-top', r.store + ': ' + r.title);
        var tagCls = !r.lossless ? 'tag tag-muted' : (r.match === 'exact' || r.match === 'same song') ? 'tag tag-good' : 'tag tag-warn';
        top.appendChild(el('span', tagCls, !r.lossless ? 'lossy' : r.match));
        m.appendChild(top);
        m.appendChild(el('span', 'item-sub', r.artist + (r.detail ? ' · ' + r.detail : '')));
        row.appendChild(m);
        row.appendChild(el('span', 'price' + (r.free ? ' free' : ''), r.price || 'Check'));
        list.appendChild(row);
      });
      box.appendChild(list);
    }
    var missing = vm.rows.filter(function (r) { return r.none; }).map(function (r) { return r.store; });
    var notes = [];
    if (missing.length) notes.push('Not on ' + missing.join(', ') + '.');
    if (vm.unchecked.length) notes.push(vm.unchecked.map(Core.storeName).join(', ') + ' can’t be checked automatically.');
    if (notes.length) box.appendChild(el('p', 'status', notes.join(' ')));
  }
  var digSeq = 0;
  function runFind(text) {
    var p = Core.parseInput(text);
    $('find-input').blur();
    var note = $('find-note');
    if (!p.ok) { note.textContent = p.note; note.hidden = false; return; }
    note.hidden = !p.note; note.textContent = p.note || '';
    $('dig-empty').hidden = true;
    var seq = ++digSeq;
    var item = addOrGet(p.query, 'search');
    var box = $('lookup'); box.textContent = '';
    box.appendChild(el('p', 'status loading', 'Checking Beatport, Bandcamp and Apple for “' + p.query + '”…'));
    manualLinks(p.query, p);
    reveal(box);
    lookupItem(item, { apple: true }).then(function (vm) { if (seq === digSeq && vm) renderLookup(vm, getItem(item.id) || item); });
  }
  $('find-form').addEventListener('submit', function (e) { e.preventDefault(); runFind($('find-input').value); });
  $('find-input').addEventListener('paste', function () { setTimeout(function () { var v = $('find-input').value.trim(); if (/^https?:\/\//.test(v)) runFind(v); }, 0); });

  function renderRecent() {
    var box = $('recent'); box.textContent = '';
    var items = liveItems().slice().sort(function (a, b) { return (b.added || 0) - (a.added || 0); }).slice(0, 5);
    if (!items.length) return;
    box.appendChild(el('h3', null, 'Recent'));
    var list = el('div', 'list'); list.style.marginTop = '10px';
    items.forEach(function (i) {
      var row = el('button', 'item'); row.type = 'button'; row.style.cssText = 'width:100%;border-radius:0;background:none;font-weight:400;text-align:left;color:inherit';
      var m = el('div', 'item-main');
      m.appendChild(el('span', 'item-top', displayName(i)));
      m.appendChild(el('span', 'item-sub', summaryLine(i)));
      row.appendChild(m);
      row.addEventListener('click', function () { $('find-input').value = i.q; runFind(i.q); });
      list.appendChild(row);
    });
    box.appendChild(list);
  }
  function summaryLine(i) {
    var g = group(i);
    var bits = [];
    if (g === 'free') bits.push('Free on ' + i.best.store);
    else if (g === 'buy') bits.push((i.best.price || '') + ' on ' + i.best.store);
    else if (g === 'check') bits.push('On ' + (i.lead ? i.lead.store : 'a store') + ', check price');
    else if (g === 'none') bits.push('Not found automatically');
    else if (g === 'error') bits.push('Not checked yet');
    else if (g === 'pending') bits.push('Checking…');
    else if (g === 'got') bits.push('In your library');
    if (i.bpm) bits.push(i.bpm + ' BPM');
    if (i.camelot) bits.push(i.camelot);
    return bits.join(' · ');
  }

  /* =========================================================== batch */
  $('batch-toggle').addEventListener('click', function () {
    var open = $('batch').hidden;
    $('batch').hidden = !open; this.setAttribute('aria-expanded', String(open));
    this.textContent = open ? 'Search one track instead' : 'Paste a whole tracklist';
    if (open) { $('batch-input').focus(); $('dig-empty').hidden = true; }
  });
  function batchLines() { return Core.parseTracklist($('batch-input').value); }
  $('batch-input').addEventListener('input', function () {
    var n = batchLines().length;
    $('batch-go').disabled = !n || running;
    $('batch-go').textContent = n ? 'Look up ' + n + ' track' + (n === 1 ? '' : 's') : 'Look up tracks';
    $('batch-count').textContent = n > 199 ? 'Up to 200 at a time' : '';
  });
  var running = false;
  /* Looks up many queries two at a time; calls progress(done, total) and resolves with the crate items. */
  function runQueue(queries, from, extraFor, progress) {
    var seen = {}, keep = [];
    queries.forEach(function (q, n) { var k = Core.crateKey(q); if (!seen[k]) { seen[k] = 1; keep.push(n); } });
    var srcExtra = extraFor;
    extraFor = srcExtra ? function (n) { return srcExtra(keep[n]); } : null;
    queries = keep.map(function (n) { return queries[n]; });
    var items = queries.map(function (q, n) { var it = addOrGet(q, from, extraFor ? extraFor(n) : null); it.found = 'pending'; commit(it); return it; });
    var i = 0, done = 0;
    function next() {
      if (i >= items.length) return Promise.resolve();
      var it = items[i++];
      return lookupItem(it, { apple: false }).catch(function () {}).then(function () { done++; progress(done, items.length); return sleep(150); }).then(next);
    }
    progress(0, items.length);
    return Promise.all([next(), next()]).then(function () { return items.map(function (it) { return getItem(it.id) || it; }); });
  }
  function batchSummary(items) {
    var free = 0, buy = 0, cost = 0, none = 0, check = 0, err = 0;
    items.forEach(function (it) {
      var g = group(it);
      if (g === 'free') free++; else if (g === 'buy') { buy++; cost += it.best.priceValue || 0; } else if (g === 'none') none++; else if (g === 'check') check++; else if (g === 'error') err++;
    });
    var parts = [];
    if (buy) parts.push(buy + ' to buy, ' + money(cost) + ' total');
    if (free) parts.push(free + ' free');
    if (check) parts.push(check + ' found, price to check');
    if (none) parts.push(none + ' not found');
    if (err) parts.push(err + ' couldn’t be checked');
    return parts.join(' · ');
  }
  $('batch-go').addEventListener('click', function () {
    var lines = batchLines(); if (!lines.length || running) return;
    running = true; $('batch-go').disabled = true; $('batch-run').hidden = false;
    var t0 = Date.now();
    runQueue(lines, 'list', null, function (d, n) {
      $('batch-bar').style.width = (n ? d / n * 100 : 0) + '%';
      var left = d ? Math.round((Date.now() - t0) / d * (n - d) / 1000) : null;
      $('batch-status').textContent = 'Checked ' + d + ' of ' + n + (left && d < n ? ' · about ' + fmtTime(left) + ' left' : '');
      $('batch-status').className = 'status' + (d < n ? ' loading' : '');
    }).then(function (items) {
      running = false; $('batch-go').disabled = false;
      $('batch-status').textContent = 'Done: ' + batchSummary(items) + '. Everything is in your crate.';
      var open = el('button', 'linkish', 'Open crate'); open.type = 'button'; open.style.marginLeft = '8px';
      open.addEventListener('click', function () { show('crate'); });
      $('batch-status').appendChild(open);
    });
  });

  /* =========================================================== crate view */
  var FILTERS = [['all', 'All'], ['buy', 'To buy'], ['free', 'Free'], ['got', 'Got it'], ['none', 'Not found'], ['upgrade', 'Upgrades']];
  function inFilter(i, f) {
    var g = group(i);
    if (f === 'all') return true;
    if (f === 'buy') return g === 'buy' || g === 'check' || g === 'pending';
    if (f === 'none') return g === 'none' || g === 'error';
    if (f === 'upgrade') return i.from === 'upgrade';
    return g === f;
  }
  function camSortKey(c) { var m = String(c || '').match(/^(\d+)([AB])$/); return m ? (+m[1]) * 2 + (m[2] === 'B' ? 1 : 0) : 999; }
  function sorted(items) {
    var s = state.sort;
    return items.slice().sort(function (a, b) {
      if (s === 'price') { var pa = group(a) === 'free' ? 0 : a.best && a.best.priceValue != null ? a.best.priceValue : 1e9, pb = group(b) === 'free' ? 0 : b.best && b.best.priceValue != null ? b.best.priceValue : 1e9; return pa - pb; }
      if (s === 'bpm') return (a.bpm || 1e9) - (b.bpm || 1e9);
      if (s === 'key') return camSortKey(a.camelot) - camSortKey(b.camelot) || (a.bpm || 0) - (b.bpm || 0);
      return (b.added || 0) - (a.added || 0);
    });
  }
  function renderBadge() {
    var n = liveItems().filter(function (i) { var g = group(i); return g === 'buy' || g === 'free' || g === 'check'; }).length;
    var b = $('crate-badge'); b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n);
  }
  function renderTotals(items) {
    var box = $('totals'); box.textContent = '';
    var cost = 0, buyN = 0, freeN = 0, gotN = 0;
    items.forEach(function (i) { var g = group(i); if (g === 'buy') { buyN++; cost += i.best.priceValue || 0; } else if (g === 'free') freeN++; else if (g === 'got') gotN++; });
    var tile = function (big, small, cls) { var t = el('div', 'tile' + (cls ? ' ' + cls : '')); t.appendChild(el('b', null, big)); t.appendChild(el('span', null, small)); box.appendChild(t); };
    tile(money(cost), 'to buy ' + buyN + ' track' + (buyN === 1 ? '' : 's'), 'accent');
    tile(String(freeN), 'free to grab');
    tile(String(gotN), 'in your library');
  }
  function renderFilters(items) {
    var box = $('filters'); box.textContent = '';
    FILTERS.forEach(function (f) {
      var n = items.filter(function (i) { return inFilter(i, f[0]); }).length;
      if (f[0] === 'upgrade' && !n) return;
      var b = el('button', 'chip'); b.type = 'button';
      b.setAttribute('aria-pressed', String(state.filter === f[0]));
      b.appendChild(document.createTextNode(f[1])); b.appendChild(el('span', 'n', String(n)));
      b.addEventListener('click', function () { state.filter = f[0]; renderCrate(); });
      box.appendChild(b);
    });
  }
  function trackRow(i, anchor) {
    var g = group(i);
    var row = el('div', 'track' + (g === 'got' ? ' got' : ''));
    var cb = el('input', 'big-check'); cb.type = 'checkbox'; cb.id = 'got-' + i.id; cb.checked = g === 'got';
    cb.setAttribute('aria-label', 'In my library: ' + displayName(i));
    cb.addEventListener('change', function () { i.status = cb.checked ? 'got' : 'get'; commit(i); });
    var main = el('div', 'track-main');
    var title = el('label', 'track-title', displayName(i)); title.htmlFor = cb.id;
    main.appendChild(title);
    var meta = el('div', 'track-meta');
    if (g === 'free') meta.appendChild(el('span', 'pill ok', 'Free · ' + i.best.store));
    else if (g === 'buy') meta.appendChild(el('span', 'pill', (i.best.price || '') + ' · ' + i.best.store));
    else if (g === 'check') meta.appendChild(el('span', 'pill', 'On ' + (i.lead ? i.lead.store : 'a store') + ' · check price'));
    else if (g === 'pending') meta.appendChild(el('span', 'loading', 'Checking…'));
    else if (g === 'none') meta.appendChild(el('span', null, 'Not found automatically'));
    else if (g === 'error') meta.appendChild(el('span', null, 'Not checked yet'));
    else if (g === 'got') meta.appendChild(el('span', null, 'In your library'));
    if (i.bpm) meta.appendChild(el('span', 'pill', i.bpm + ' BPM'));
    if (i.camelot) { var c = el('span', 'pill cam', i.camelot); c.title = i.keyName || ''; meta.appendChild(c); }
    if (i.keyName) meta.appendChild(el('span', null, i.keyName));
    if (i.from === 'upgrade' && i.file) meta.appendChild(el('span', null, 'Replaces ' + i.file));
    if (anchor && anchor !== i) {
      var km = Core.keysMix(anchor.camelot, i.camelot), bm = Core.bpmsMix(anchor.bpm, i.bpm);
      if (km) meta.appendChild(el('span', 'tag tag-good', 'key fits'));
      if (bm) meta.appendChild(el('span', 'tag tag-good', 'tempo fits'));
    }
    main.appendChild(meta);
    var acts = el('div', 'track-acts');
    var url = i.best ? i.best.url : i.lead ? i.lead.url : null;
    if (url && g !== 'got') acts.appendChild(link('btn secondary', g === 'free' ? 'Download' : 'Open', url));
    if ((i.camelot || i.bpm) && (!anchor || anchor !== i)) {
      var mix = el('button', 'ghost', 'Mixes with'); mix.type = 'button';
      mix.addEventListener('click', function () { state.mix = i.id; renderCrate(); window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); });
      acts.appendChild(mix);
    }
    var re = el('button', 'ghost', 'Re-check'); re.type = 'button';
    re.addEventListener('click', function () { lookupItem(i, { apple: false }); });
    var rm = el('button', 'ghost danger', 'Remove'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove ' + displayName(i));
    rm.addEventListener('click', function () { removeItem(i); });
    if (g !== 'pending') acts.appendChild(re);
    acts.appendChild(rm);
    main.appendChild(acts);
    row.appendChild(cb); row.appendChild(main);
    return row;
  }
  function renderCrate() {
    var items = liveItems();
    renderTotals(items); renderFilters(items); renderBadge();
    var list = $('crate-list'); list.textContent = '';
    var anchor = state.mix ? getItem(state.mix) : null;
    if (anchor && anchor.deleted) anchor = null;
    $('mixbar').hidden = !anchor;
    $('crate-tools').hidden = !!anchor;
    var shown;
    if (anchor) {
      $('mix-label').textContent = 'Mixes with ' + displayName(anchor) + [anchor.bpm ? ' · ' + anchor.bpm + ' BPM' : '', anchor.camelot ? ' · ' + anchor.camelot : ''].join('');
      var others = items.filter(function (i) {
        if (i === anchor) return false;
        var km = anchor.camelot && i.camelot ? Core.keysMix(anchor.camelot, i.camelot) : null;
        var bm = anchor.bpm && i.bpm ? Core.bpmsMix(anchor.bpm, i.bpm) : null;
        if (km === false || bm === false) return false;
        return km || bm;
      });
      others.sort(function (a, b) { return Math.abs((a.bpm || 999) - (anchor.bpm || 0)) - Math.abs((b.bpm || 999) - (anchor.bpm || 0)); });
      shown = [anchor].concat(others);
      if (!others.length) $('mix-label').textContent += '. No other tracks in your crate fit both key and tempo yet.';
    } else {
      shown = sorted(items.filter(function (i) { return inFilter(i, state.filter); }));
    }
    shown.forEach(function (i) { list.appendChild(trackRow(i, anchor)); });
    $('crate-list').hidden = !shown.length;
    $('crate-empty').hidden = !!shown.length;
    $('crate-empty').textContent = items.length ? 'Nothing in this view.' : 'Nothing here yet. Every track you look up on Dig lands here with its price, BPM and key.';
    $('copy-list').hidden = $('recheck-all').hidden = !items.length;
    renderSync();
  }
  $('sort').addEventListener('change', function () { state.sort = this.value; renderCrate(); });
  $('mix-clear').addEventListener('click', function () { state.mix = null; renderCrate(); });
  $('copy-list').addEventListener('click', function () {
    var lines = sorted(liveItems().filter(function (i) { return inFilter(i, state.filter); })).map(function (i) {
      var g = group(i);
      return (g === 'got' ? '[x] ' : '[ ] ') + displayName(i) + (summaryLine(i) ? '  (' + summaryLine(i) + ')' : '');
    });
    copyText(lines.join('\n'), $('copy-list'), 'Copy list');
  });
  $('recheck-all').addEventListener('click', function () {
    var btn = this, todo = liveItems().filter(function (i) { return group(i) !== 'got'; }).map(function (i) { return i.q; });
    if (!todo.length) return;
    btn.disabled = true;
    runQueue(todo, null, null, function (d, n) { btn.textContent = 'Checking ' + d + ' of ' + n + '…'; })
      .then(function () { btn.disabled = false; btn.textContent = 'Re-check prices'; });
  });

  /* =========================================================== check: reading files */
  var AUDIO = /\.(wav|wave|aif|aiff|aifc|flac|mp3|m4a|aac|alac|ogg|oga|opus|mp4)$/i;
  function decode(buf, rate) {
    var Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Ctx) return Promise.reject(new Error('This browser cannot decode audio.'));
    var ctx; try { ctx = new Ctx(2, 2, rate); } catch (e) { ctx = new Ctx(2, 2, 44100); }
    return new Promise(function (res, rej) { var p = ctx.decodeAudioData(buf, res, rej); if (p && p.catch) p.catch(rej); });
  }
  function readSlice(file, a, b) { return file.slice(a, b).arrayBuffer(); }

  /* Uncompressed files: read a few seconds from 14 places rather than the whole file. */
  async function pcmSource(file, full) {
    var head = await readSlice(file, 0, Math.min(file.size, 2 * 1024 * 1024));
    var info = Core.parseWav(head) || Core.parseAiff(head);
    if (!info) return null;
    var frames = Math.min(info.declaredFrames || info.frames, Math.floor((file.size - info.offset) / info.blockAlign));
    if (full && file.size < 450 * 1024 * 1024) {
      var whole = await file.arrayBuffer();
      var info2 = Core.parseWav(whole) || Core.parseAiff(whole);
      return { info: info2, sr: info2.sampleRate, total: info2.frames, getFrame: Core.pcmReader(whole, info2), duration: info2.frames / info2.sampleRate };
    }
    var n = 14, per = Math.min(Math.round(info.sampleRate * 2.5), Math.floor(frames / n));
    if (per < 4096) {
      var all = await file.arrayBuffer(); var i3 = Core.parseWav(all) || Core.parseAiff(all);
      return { info: i3, sr: i3.sampleRate, total: i3.frames, getFrame: Core.pcmReader(all, i3), duration: i3.frames / i3.sampleRate };
    }
    var bytes = per * info.blockAlign, joined = new Uint8Array(bytes * n);
    for (var k = 0; k < n; k++) {
      var startFrame = Math.floor((frames - per) * (0.06 + 0.88 * k / (n - 1)));
      var off = info.offset + startFrame * info.blockAlign;
      joined.set(new Uint8Array(await readSlice(file, off, off + bytes)), k * bytes);
    }
    var pinfo = Object.assign({}, info, { offset: 0, frames: per * n });
    return { info: info, sr: info.sampleRate, total: per * n, getFrame: Core.pcmReader(joined.buffer, pinfo), duration: frames / info.sampleRate };
  }

  /* Compressed files: decode the browser way; for big MP3s decode an 8 MB stretch from the middle. */
  async function decodedSource(file, full) {
    var head = await readSlice(file, 0, Math.min(file.size, 512 * 1024));
    var info = Core.sniff(head, file.name);
    var mp3 = info.container === 'MP3' ? Core.mp3Info(head, file.size) : null;
    var tags = Core.id3Tags(head);
    var native = (mp3 && mp3.sampleRate) || info.sampleRate || 44100;
    var rate = Math.min(native, 48000);
    var audio = null, partial = false;
    if (info.container === 'MP3' && file.size > 12 * 1024 * 1024 && !full) {
      var a = Math.floor(file.size * 0.3);
      try { audio = await decode(await readSlice(file, a, a + 8 * 1024 * 1024), rate); partial = true; } catch (e) { audio = null; }
    }
    if (!audio) {
      if (file.size > 160 * 1024 * 1024) throw new Error('This file is too large to check in the browser.');
      try { audio = await decode(await file.arrayBuffer(), rate); }
      catch (e) { throw new Error('This browser couldn’t read this file.'); }
    }
    var chans = []; for (var c = 0; c < audio.numberOfChannels; c++) chans.push(audio.getChannelData(c));
    var duration = partial && mp3 && mp3.kbps ? file.size * 8 / (mp3.kbps * 1000) : audio.length / audio.sampleRate;
    return {
      info: info, mp3: mp3, tags: tags, sr: audio.sampleRate, native: native, total: audio.length, duration: duration,
      getFrame: function (start, N) {
        var out = new Float32Array(N);
        for (var ch = 0; ch < chans.length; ch++) { var d = chans[ch]; for (var i = 0; i < N; i++) out[i] += (d[start + i] || 0) / chans.length; }
        return out;
      }
    };
  }
  function shrink(db, bins) {
    var out = new Float32Array(bins), per = db.length / bins;
    for (var i = 0; i < bins; i++) { var a = Math.floor(i * per), b = Math.max(a + 1, Math.floor((i + 1) * per)), s = 0; for (var k = a; k < b; k++) s += db[k]; out[i] = s / (b - a); }
    return out;
  }
  async function analyzeFile(file, full) {
    var src = AUDIO.test(file.name) && /\.(wav|wave|aif|aiff|aifc)$/i.test(file.name) ? await pcmSource(file, full) : null;
    if (!src) src = await decodedSource(file, full);
    var sr = src.sr, N = sr > 50000 ? 16384 : 8192;
    if (src.total < N * 6) throw new Error('Too short to judge.');
    var spec = Core.averageSpectrum(src.getFrame, src.total, N, full ? 48 : 36);
    if (spec.used < 4) throw new Error('Too quiet to judge.');
    var wall = Core.detectWall(spec.db, sr);
    var info = src.info;
    var gr = Core.grade(info, wall, src.native || info.sampleRate || sr, src.mp3);
    var res = {
      name: file.name, path: file.webkitRelativePath || file.relPath || file.name, size: file.size,
      grade: gr.grade, label: gr.label, why: gr.why,
      container: info.container, bits: info.bits || null, float: !!info.float, sr: src.native || info.sampleRate || sr,
      kbps: src.mp3 ? src.mp3.kbps : null, vbr: src.mp3 ? src.mp3.vbr : false,
      cutoff: wall ? wall.freq : null, duration: src.duration,
      db: shrink(spec.db, 1024), dbSr: sr, query: Core.queryFromFile(file.name, src.tags), limited: sr < (src.native || sr)
    };
    if (full) {
      try { res.tempo = Core.tempo(src.getFrame, src.total, sr); } catch (e) {}
      try { res.key = Core.key(src.getFrame, src.total, sr); } catch (e) {}
    }
    return res;
  }

  /* =========================================================== check: running and showing */
  var check = { files: [], filter: null, open: null, busy: false };
  async function collectEntries(items) {
    var files = [];
    async function walk(entry, path) {
      if (!entry) return;
      if (entry.isFile) {
        await new Promise(function (res) { entry.file(function (f) { try { f.relPath = path + f.name; } catch (e) {} files.push(f); res(); }, function () { res(); }); });
      } else if (entry.isDirectory) {
        var reader = entry.createReader(), batch;
        do {
          batch = await new Promise(function (res) { reader.readEntries(res, function () { res([]); }); });
          for (var i = 0; i < batch.length; i++) await walk(batch[i], path + entry.name + '/');
        } while (batch.length);
      }
    }
    for (var i = 0; i < items.length; i++) {
      var en = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
      if (en) await walk(en, ''); else { var f = items[i].getAsFile && items[i].getAsFile(); if (f) files.push(f); }
    }
    return files;
  }
  async function runCheck(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) { return AUDIO.test(f.name) && f.size > 0 && !/^\._/.test(f.name); });
    var skipped = (fileList.length || 0) - files.length;
    if (!files.length) { $('check-run').hidden = false; $('check-status').textContent = 'No audio files found there.'; $('check-bar').style.width = '0'; return; }
    if (check.busy) return;
    check.busy = true;
    var full = files.length <= 5;
    files.sort(function (a, b) { return (a.webkitRelativePath || a.relPath || a.name).localeCompare(b.webkitRelativePath || b.relPath || b.name); });
    check.files = []; check.filter = null; check.open = full && files.length === 1 ? 0 : null;
    $('check-run').hidden = false; $('check-results').hidden = false;
    var t0 = Date.now(), lastDraw = 0;
    for (var i = 0; i < files.length; i++) {
      var res;
      try { res = await analyzeFile(files[i], full); }
      catch (e) { res = { name: files[i].name, path: files[i].webkitRelativePath || files[i].relPath || files[i].name, size: files[i].size, grade: 'none', label: 'Not checked', why: (e && e.message) || 'Couldn’t read this file.' }; }
      check.files.push(res);
      var left = Math.round((Date.now() - t0) / (i + 1) * (files.length - i - 1) / 1000);
      $('check-bar').style.width = ((i + 1) / files.length * 100) + '%';
      $('check-status').textContent = 'Checked ' + (i + 1) + ' of ' + files.length + (i + 1 < files.length && i > 1 ? ' · about ' + fmtTime(left) + ' left' : '') + (skipped > 0 ? ' · ' + skipped + ' non-audio file' + (skipped === 1 ? '' : 's') + ' skipped' : '');
      $('check-status').className = 'status' + (i + 1 < files.length ? ' loading' : '');
      if (Date.now() - lastDraw > 700 || i === files.length - 1) { renderCheck(); lastDraw = Date.now(); }
      await sleep(0);
    }
    check.busy = false;
    renderCheck();
  }
  var GRADES = [['good', 'Club ready'], ['fine', 'Good enough'], ['low', 'Low quality']];
  function fileFacts(f) {
    var bits = [f.container];
    if (f.kbps) bits.push((f.vbr ? '~' : '') + f.kbps + ' kbps');
    if (f.bits) bits.push(f.bits + '-bit' + (f.float ? ' float' : ''));
    if (f.sr) bits.push(f.sr / 1000 + ' kHz');
    if (f.duration) bits.push(fmtTime(f.duration));
    if (f.grade !== 'none') bits.push(f.cutoff ? 'stops at ' + Core.khz(f.cutoff) : 'full range');
    return bits.filter(Boolean).join(' · ');
  }
  function renderCheck() {
    var files = check.files;
    var counts = { good: 0, fine: 0, low: 0, none: 0 };
    files.forEach(function (f) { counts[f.grade]++; });
    var g = $('grades'); g.textContent = '';
    GRADES.forEach(function (gr) {
      var b = el('button', 'grade-tile ' + gr[0]); b.type = 'button';
      b.setAttribute('aria-pressed', String(check.filter === gr[0]));
      b.appendChild(el('b', null, String(counts[gr[0]]))); b.appendChild(el('span', null, gr[1]));
      b.addEventListener('click', function () { check.filter = check.filter === gr[0] ? null : gr[0]; renderCheck(); });
      g.appendChild(b);
    });
    $('grade-help').textContent = check.filter === 'good' ? 'Full-bandwidth lossless files. Safe on any system and for sampling.'
      : check.filter === 'fine' ? 'High-bitrate MP3 or AAC. Most people can’t hear the difference on a club system, but heavy EQ, pitching or sampling can bring out artifacts.'
      : check.filter === 'low' ? 'Missing high frequencies or low bitrate. These are the ones to replace before playing out.'
      : 'Tap a group to filter, and tap a file to see what’s missing.' + (counts.none ? ' ' + counts.none + ' file' + (counts.none === 1 ? '' : 's') + ' couldn’t be checked.' : '');
    var acts = $('check-actions'); acts.textContent = '';
    var lows = files.filter(function (f) { return f.grade === 'low'; });
    if (lows.length && !check.busy) {
      var up = el('button', 'primary', 'Find better copies of ' + lows.length + ' low-quality file' + (lows.length === 1 ? '' : 's')); up.type = 'button';
      up.addEventListener('click', function () { upgrade(lows, up); });
      acts.appendChild(up);
      var cp = el('button', 'ghost', 'Copy list of low-quality files'); cp.type = 'button';
      cp.addEventListener('click', function () { copyText(lows.map(function (f) { return f.path + '  (' + f.why.split('.')[0] + ')'; }).join('\n'), cp, 'Copy list of low-quality files'); });
      acts.appendChild(cp);
    }
    var list = $('file-list'); list.textContent = '';
    var order = { low: 0, none: 1, fine: 2, good: 3 };
    var shown = files.map(function (f, i) { return { f: f, i: i }; })
      .filter(function (x) { return !check.filter || x.f.grade === check.filter; })
      .sort(function (a, b) { return order[a.f.grade] - order[b.f.grade] || a.i - b.i; });
    var cap = 400;
    shown.slice(0, cap).forEach(function (x) { list.appendChild(fileRow(x.f, x.i)); });
    if (shown.length > cap) list.appendChild(el('p', 'status', 'Showing ' + cap + ' of ' + shown.length + '. Filter by group to see the rest.')).style.padding = '14px 16px';
    list.hidden = !shown.length;
  }
  function fileRow(f, idx) {
    var wrap = el('div', 'file');
    var b = el('button'); b.type = 'button'; b.setAttribute('aria-expanded', String(check.open === idx));
    b.appendChild(el('span', 'dot ' + f.grade));
    var m = el('span', 'item-main');
    m.appendChild(el('span', 'item-top', f.path));
    m.appendChild(el('span', 'item-sub', f.grade === 'none' ? f.why : fileFacts(f)));
    b.appendChild(m);
    b.appendChild(el('span', 'tag ' + (f.grade === 'good' ? 'tag-good' : f.grade === 'fine' ? 'tag-warn' : f.grade === 'low' ? 'tag-bad' : 'tag-muted'), f.label));
    b.addEventListener('click', function () { check.open = check.open === idx ? null : idx; renderCheck(); });
    wrap.appendChild(b);
    if (check.open === idx && f.db) {
      var d = el('div', 'file-detail');
      d.appendChild(el('p', null, f.why));
      var cv = el('canvas', 'spec'); cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', 'Frequency content of ' + f.name + (f.cutoff ? ', stopping at ' + Core.khz(f.cutoff) : ', reaching the top of the range'));
      d.appendChild(cv);
      var lg = el('div', 'legend-row');
      var item = function (cls, text) { var s = el('span'); s.appendChild(el('i', cls)); s.appendChild(document.createTextNode(text)); lg.appendChild(s); };
      item('', 'This file');
      if (f.cutoff) { item('gap', 'Missing range'); item('ref', 'A full-quality copy (estimate)'); }
      d.appendChild(lg);
      if (f.tempo || f.key) d.appendChild(djBlock(f));
      if (f.grade === 'low' || f.grade === 'fine') {
        var bt = el('button', 'secondary', 'Find a better copy'); bt.type = 'button';
        bt.addEventListener('click', function () { upgrade([f], bt); });
        d.appendChild(bt);
      }
      wrap.appendChild(d);
      plot(cv, f.db, f.dbSr, { wall: f.cutoff ? { freq: f.cutoff } : null, compare: true });
    }
    return wrap;
  }
  function djBlock(f) {
    var dj = el('div', 'dj');
    var b1 = el('div', 'dj-item'); b1.appendChild(el('span', 'dj-label', 'Tempo'));
    b1.appendChild(el('span', 'dj-value', f.tempo ? f.tempo.bpm + ' BPM' : 'No steady beat'));
    if (f.tempo && f.tempo.alt) b1.appendChild(el('span', 'dj-alt', 'or ' + f.tempo.alt + (f.tempo.alt < f.tempo.bpm ? ' half-time' : ' double-time')));
    var b2 = el('div', 'dj-item'); b2.appendChild(el('span', 'dj-label', 'Key'));
    b2.appendChild(el('span', 'dj-value', f.key ? f.key.name : 'Not clear'));
    if (f.key) {
      var line = el('div', 'track-meta');
      line.appendChild(el('span', 'pill cam', f.key.camelot));
      line.appendChild(el('span', null, f.key.short + ' · ' + f.key.sigText));
      b2.appendChild(line);
      b2.appendChild(staff(f.key.sig, f.key.name + ', ' + f.key.sigText));
      if (f.key.margin < 0.05) b2.appendChild(el('span', 'dj-alt', 'Close call with ' + f.key.alt.name + ' (' + f.key.alt.camelot + ')'));
    }
    dj.appendChild(b1); dj.appendChild(b2);
    return dj;
  }
  function upgrade(files, btn) {
    var label = btn.textContent;
    btn.disabled = true;
    runQueue(files.map(function (f) { return f.query; }), 'upgrade', function (n) { return { file: files[n].name, from: 'upgrade' }; }, function (d, n) { btn.textContent = 'Looking up ' + d + ' of ' + n + '…'; })
      .then(function (items) {
        btn.disabled = false; btn.textContent = label;
        state.filter = 'upgrade';
        var s = $('check-status'); s.className = 'status';
        s.textContent = 'Added to your crate: ' + batchSummary(items) + '. ';
        var open = el('button', 'linkish', 'Open crate'); open.type = 'button';
        open.addEventListener('click', function () { show('crate'); });
        s.appendChild(open);
      });
  }
  var drop = $('drop');
  $('folder-input').addEventListener('change', function () { runCheck(this.files); this.value = ''; });
  $('file-input').addEventListener('change', function () { runCheck(this.files); this.value = ''; });
  ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) {
    var dt = e.dataTransfer; if (!dt) return;
    if (dt.items && dt.items.length && dt.items[0].webkitGetAsEntry) collectEntries([].slice.call(dt.items)).then(runCheck);
    else runCheck(dt.files);
  });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });
  $('check-clear').addEventListener('click', function () { check.files = []; check.open = null; $('check-results').hidden = true; $('check-run').hidden = true; });
  if (IOS || !('webkitdirectory' in document.createElement('input'))) { $('folder-label').hidden = true; $('drop').querySelector('strong').textContent = 'Choose files to check'; }
  else $('drop-hint').textContent = 'Point it at a whole folder of your DJ drive, or drop files here. WAV, AIFF, FLAC, MP3 and M4A.';

  /* =========================================================== start */
  async function initStore() {
    state.items = loadLocal();
    saveLocal(); renderBadge(); renderRecent();
    var hashKey = (location.hash.match(/^#sync-([A-Za-z0-9_-]{24,64})$/) || [])[1];
    var claudeApi = window.claude && typeof window.claude.use === 'function';
    if (claudeApi) {
      setDot('Connecting…');
      var db = null, user = null, uid = null;
      try { var got = await Promise.all([window.claude.use('db'), window.claude.use('user')]); db = got[0]; user = got[1]; } catch (e) {}
      try { uid = user ? await user.id() : null; } catch (e) {}
      if (db && uid) {
        var col; try { col = db.doc('data/users/' + uid + '/crate').collection('tracks'); } catch (e) { col = null; }
        if (col) {
          var live = false, timer = setTimeout(function () { setDot('Saved here; Claude sync not reached yet'); }, 10000);
          col.onSnapshot(function (snap) {
            var cloud = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).filter(function (d) { return d.q; });
            if (!snap.metadata.fromCache && !live) {
              live = true; clearTimeout(timer); remote = { mode: 'claude', col: col }; setDot('Synced', 'ok');
              var have = {}; cloud.forEach(function (c) { have[c.id] = 1; });
              state.items.filter(function (l) { return !l.deleted && !have[l.id]; }).forEach(function (l) { col.doc(l.id).set(JSON.parse(JSON.stringify(l))).catch(function () {}); });
            }
            if (live) { state.items = Core.mergeCrates(state.items.filter(function (l) { return !l.deleted; }), cloud); saveLocal(); renderBadge(); renderRecent(); if (!$('view-crate').hidden) renderCrate(); renderSync(); }
          }, function () { clearTimeout(timer); setDot('This device'); });
          renderSync();
          return;
        }
      }
      setDot('This device');
    }
    if (hashKey) { startKv(hashKey); try { history.replaceState(null, '', '#crate'); } catch (e) {} show('crate', false); return; }
    var saved = lsGet(LS_SYNC);
    if (saved) startKv(saved); else renderSync();
  }
  var startView = location.hash.slice(1);
  show(VIEWS.indexOf(startView) >= 0 ? startView : 'dig', false);
  initStore();
})();
