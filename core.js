/* Clean Crate core: pure functions, no DOM. Shared by the page and the tests. */
(function (root) {
  'use strict';
  var C = {};

  /* ---------- link parsing ---------- */
  var NOISE = /\b(official|free\s*download|free\s*dl|premiere|out\s*now)\b/gi;
  function tidy(s) {
    return String(s || '').replace(/[-_+]+/g, ' ').replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
  }
  function dec(p) { try { return decodeURIComponent(p); } catch (e) { return p; } }

  C.parseInput = function (raw) {
    var text = String(raw || '').trim();
    if (!text) return { ok: false, note: 'Paste a link or type an artist and title.' };
    var url = null;
    try {
      if (/^https?:\/\//i.test(text)) url = new URL(text);
      else if (/^[\w-]+(\.[\w-]+)+\/\S*$/i.test(text)) url = new URL('https://' + text);
    } catch (e) { url = null; }
    if (!url) return { ok: true, source: 'Typed', query: text.replace(/\s+/g, ' '), note: '' };

    var host = url.hostname.replace(/^(www|m)\./, '').toLowerCase();
    var parts = url.pathname.split('/').filter(Boolean).map(dec);
    var needText = function (name) {
      return { ok: false, source: name, url: url.href, note: name + ' links do not include the track name. Type the artist and title instead.' };
    };

    if (host === 'music.apple.com' || host === 'geo.music.apple.com') {
      var kind = parts[1], slug = parts[2];
      if ((kind === 'album' || kind === 'song' || kind === 'music-video') && slug && !/^\d+$/.test(slug)) {
        var q = tidy(slug).replace(/\s(single|ep)$/i, '');
        return { ok: true, source: 'Apple Music', url: url.href, query: q,
          note: 'Apple Music links carry the title but not the artist. Add the artist name for better matches.' };
      }
      if (kind === 'playlist') return { ok: false, source: 'Apple Music', url: url.href, note: 'That is a playlist link. Paste one track or album at a time.' };
      return needText('This kind of Apple Music');
    }
    if (host === 'soundcloud.com') {
      if (parts.length >= 2 && parts[1] !== 'sets' && parts[0] !== 'search' && parts[0] !== 'discover') {
        return { ok: true, source: 'SoundCloud', url: url.href, query: (tidy(parts[0]) + ' ' + tidy(parts[1])).trim(),
          note: 'SoundCloud handles do not always match the artist name. Edit the search if it looks off.' };
      }
      if (parts[1] === 'sets') return { ok: false, source: 'SoundCloud', url: url.href, note: 'That is a playlist link. Paste one track at a time.' };
      return needText('This kind of SoundCloud');
    }
    if (/\.bandcamp\.com$/.test(host) && (parts[0] === 'track' || parts[0] === 'album') && parts[1]) {
      return { ok: true, source: 'Bandcamp', url: url.href, query: (tidy(host.replace('.bandcamp.com', '')) + ' ' + tidy(parts[1])).trim(),
        note: 'This is already a Bandcamp page, so you can buy the lossless download there directly.' };
    }
    if (host === 'beatport.com' && parts[0] === 'track' && parts[1]) {
      return { ok: true, source: 'Beatport', url: url.href, query: tidy(parts[1]), note: '' };
    }
    if (host === 'open.spotify.com' || host === 'spotify.link') return needText('Spotify');
    if (host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com') return needText('YouTube');
    if (host === 'on.soundcloud.com' || host === 'soundcloud.app.goo.gl') return needText('Short SoundCloud');
    return needText('These');
  };

  C.stores = function (query, parsed) {
    var e = encodeURIComponent(query);
    var free = [
      { name: 'SoundCloud', get: 'Look for a Download button or a free-download link', url: 'https://soundcloud.com/search/sounds?q=' + e },
      { name: 'Free Music Archive', get: 'Creative Commons tracks', url: 'https://freemusicarchive.org/search?quicksearch=' + e }
    ];
    if (parsed && parsed.source === 'SoundCloud' && parsed.url) {
      free.unshift({ name: 'Open the track you pasted', get: 'Check under the waveform for Download, and the description for a free-download link', url: parsed.url });
    }
    return [
      { group: 'Buy a lossless download', items: [
        { name: 'Bandcamp', get: 'WAV, AIFF or FLAC', url: 'https://bandcamp.com/search?q=' + e + '&item_type=t' },
        { name: 'Beatport', get: 'Lossless option at checkout', url: 'https://www.beatport.com/search?q=' + e },
        { name: 'Traxsource', get: 'Lossless option at checkout', url: 'https://www.traxsource.com/search?term=' + e },
        { name: 'Juno Download', get: 'WAV or FLAC', url: 'https://www.junodownload.com/search/?q%5Ball%5D%5B%5D=' + e },
        { name: 'Qobuz', get: 'FLAC, CD quality or hi-res', url: 'https://www.qobuz.com/us-en/search?q=' + e }
      ] },
      { group: 'Free, where the artist allows it', items: free },
      { group: 'Physical copies to rip yourself', items: [
        { name: 'Discogs', get: 'Used CDs and vinyl', url: 'https://www.discogs.com/search/?q=' + e + '&type=release' }
      ] },
      { group: 'Only know the title?', items: [
        { name: 'MusicBrainz', get: 'Every recording with that title, listed with its artist', url: 'https://musicbrainz.org/search?query=' + e + '&type=recording&method=indexed' }
      ] },
      { group: 'For sampling', items: [
        { name: 'WhoSampled', get: 'Where a track has been sampled, and from what', url: 'https://www.whosampled.com/search/?q=' + e },
        { name: 'Tracklib', get: 'Records with clearance built in (search on the site)', url: 'https://www.tracklib.com/' }
      ] }
    ];
  };

  /* ---------- container parsing ---------- */
  function str(dv, o, n) { var s = ''; for (var i = 0; i < n; i++) s += String.fromCharCode(dv.getUint8(o + i)); return s; }

  C.parseWav = function (buf) {
    var dv = new DataView(buf);
    if (dv.byteLength < 44 || str(dv, 0, 4) !== 'RIFF' || str(dv, 8, 4) !== 'WAVE') return null;
    var o = 12, fmt = null, data = null;
    while (o + 8 <= dv.byteLength) {
      var id = str(dv, o, 4), size = dv.getUint32(o + 4, true), body = o + 8;
      if (id === 'fmt ' && size >= 16) {
        var tag = dv.getUint16(body, true);
        if (tag === 0xFFFE && size >= 26) tag = dv.getUint16(body + 24, true);
        fmt = { tag: tag, ch: dv.getUint16(body + 2, true), sr: dv.getUint32(body + 4, true), align: dv.getUint16(body + 12, true), bits: dv.getUint16(body + 14, true) };
      } else if (id === 'data') {
        if (size === 0 || size > dv.byteLength - body) size = dv.byteLength - body;
        data = { offset: body, size: size };
        break;
      }
      o = body + size + (size & 1);
    }
    if (!fmt || !data || !fmt.ch || !fmt.align || !fmt.sr) return null;
    if (fmt.tag !== 1 && fmt.tag !== 3) return null;
    var bytes = fmt.align / fmt.ch;
    if ([1, 2, 3, 4, 8].indexOf(bytes) < 0) return null;
    return { container: 'WAV', lossless: true, sampleRate: fmt.sr, channels: fmt.ch, bits: fmt.bits, float: fmt.tag === 3,
      littleEndian: true, signed8: false, offset: data.offset, frames: Math.floor(data.size / fmt.align), blockAlign: fmt.align, bytes: bytes };
  };

  function ext80(dv, o) {
    var exp = ((dv.getUint8(o) & 0x7F) << 8 | dv.getUint8(o + 1)) - 16383;
    return dv.getUint32(o + 2) * Math.pow(2, exp - 31) + dv.getUint32(o + 6) * Math.pow(2, exp - 63);
  }

  C.parseAiff = function (buf) {
    var dv = new DataView(buf);
    if (dv.byteLength < 54 || str(dv, 0, 4) !== 'FORM') return null;
    var form = str(dv, 8, 4);
    if (form !== 'AIFF' && form !== 'AIFC') return null;
    var o = 12, comm = null, ssnd = null;
    while (o + 8 <= dv.byteLength) {
      var id = str(dv, o, 4), size = dv.getUint32(o + 4), body = o + 8;
      if (id === 'COMM' && size >= 18) {
        comm = { ch: dv.getInt16(body), frames: dv.getUint32(body + 2), bits: dv.getInt16(body + 6), sr: ext80(dv, body + 8), comp: 'NONE' };
        if (form === 'AIFC' && size >= 22) comm.comp = str(dv, body + 18, 4);
      } else if (id === 'SSND') {
        var off = dv.getUint32(body);
        ssnd = { offset: body + 8 + off, size: Math.min(size - 8 - off, dv.byteLength - (body + 8 + off)) };
      }
      if (comm && ssnd) break;
      o = body + size + (size & 1);
    }
    if (!comm || !ssnd || !comm.ch || !comm.sr) return null;
    var c = comm.comp, isFloat = (c === 'fl32' || c === 'FL32' || c === 'fl64' || c === 'FL64');
    if (c !== 'NONE' && c !== 'sowt' && c !== 'twos' && !isFloat) return null;
    var bytes = Math.ceil(comm.bits / 8);
    if ([1, 2, 3, 4, 8].indexOf(bytes) < 0) return null;
    var align = bytes * comm.ch;
    return { container: 'AIFF', lossless: true, sampleRate: Math.round(comm.sr), channels: comm.ch, bits: comm.bits, float: isFloat,
      littleEndian: c === 'sowt', signed8: true, offset: ssnd.offset, frames: Math.min(comm.frames, Math.floor(ssnd.size / align)), blockAlign: align, bytes: bytes };
  };

  /* Returns (startFrame, N) => Float32Array of mono samples in [-1, 1]. */
  C.pcmReader = function (buf, p) {
    var dv = new DataView(buf), le = p.littleEndian;
    function sample(o) {
      switch (p.bytes) {
        case 1: return p.signed8 ? dv.getInt8(o) / 128 : (dv.getUint8(o) - 128) / 128;
        case 2: return dv.getInt16(o, le) / 32768;
        case 3: {
          var b0 = dv.getUint8(o), b1 = dv.getUint8(o + 1), b2 = dv.getUint8(o + 2);
          var v = le ? (b2 << 16 | b1 << 8 | b0) : (b0 << 16 | b1 << 8 | b2);
          if (v & 0x800000) v -= 0x1000000;
          return v / 8388608;
        }
        case 4: return p.float ? dv.getFloat32(o, le) : dv.getInt32(o, le) / 2147483648;
        default: return dv.getFloat64(o, le);
      }
    }
    return function (start, N) {
      var out = new Float32Array(N);
      for (var i = 0; i < N; i++) {
        var f = start + i;
        if (f >= p.frames) break;
        var base = p.offset + f * p.blockAlign, s = 0;
        for (var c = 0; c < p.channels; c++) s += sample(base + c * p.bytes);
        out[i] = s / p.channels;
      }
      return out;
    };
  };

  function hasBytes(u8, word, from, to) {
    var a = word.charCodeAt(0), b = word.charCodeAt(1), c = word.charCodeAt(2), d = word.charCodeAt(3);
    for (var i = Math.max(0, from); i < Math.min(u8.length - 3, to); i++) {
      if (u8[i] === a && u8[i + 1] === b && u8[i + 2] === c && u8[i + 3] === d) return true;
    }
    return false;
  }

  /* Identify compressed containers from their first bytes. */
  C.sniff = function (buf, name) {
    var u8 = new Uint8Array(buf), dv = new DataView(buf);
    var ext = (String(name || '').match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
    if (u8.length > 26 && str(dv, 0, 4) === 'fLaC') {
      var b18 = u8[18], b19 = u8[19], b20 = u8[20], b21 = u8[21];
      return { container: 'FLAC', lossless: true, sampleRate: (b18 << 12) | (b19 << 4) | (b20 >> 4), channels: ((b20 >> 1) & 7) + 1, bits: (((b20 & 1) << 4) | (b21 >> 4)) + 1 };
    }
    if (u8.length > 12 && str(dv, 4, 4) === 'ftyp') {
      var span = 3 * 1024 * 1024;
      var alac = hasBytes(u8, 'alac', 0, span) || hasBytes(u8, 'alac', u8.length - span, u8.length);
      return alac ? { container: 'ALAC', lossless: true } : { container: 'AAC', lossless: false };
    }
    if (u8.length > 4 && str(dv, 0, 4) === 'OggS') return { container: 'Ogg', lossless: false };
    if (u8.length > 3 && (str(dv, 0, 3) === 'ID3' || (u8[0] === 0xFF && (u8[1] & 0xE0) === 0xE0))) return { container: 'MP3', lossless: false };
    if (ext === 'mp3') return { container: 'MP3', lossless: false };
    if (ext === 'm4a' || ext === 'aac' || ext === 'mp4') return { container: 'AAC', lossless: false };
    if (ext === 'ogg' || ext === 'opus') return { container: 'Ogg', lossless: false };
    return { container: ext ? ext.toUpperCase() : 'Audio', lossless: null };
  };

  /* ---------- spectrum ---------- */
  C.fft = function (re, im) {
    var n = re.length, i, j, t;
    for (i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
      for (i = 0; i < n; i += len) {
        var cr = 1, ci = 0;
        for (var k = 0; k < h; k++) {
          var a = i + k, b = a + h;
          var xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  };

  /* Average power spectrum over `count` Hann windows spread across the track. 0 dB = full-scale sine. */
  C.averageSpectrum = function (getFrame, total, N, count) {
    var half = N / 2, acc = new Float64Array(half), re = new Float64Array(N), im = new Float64Array(N), win = new Float64Array(N), i, k;
    for (i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    var used = 0, span = Math.max(0, total - N);
    for (var w = 0; w < count; w++) {
      var pos = count === 1 ? 0 : Math.floor(span * (0.08 + 0.84 * w / (count - 1)));
      var fr = getFrame(pos, N), e = 0;
      for (i = 0; i < N; i++) e += fr[i] * fr[i];
      if (Math.sqrt(e / N) < 0.0005) continue;
      for (i = 0; i < N; i++) { re[i] = fr[i] * win[i]; im[i] = 0; }
      C.fft(re, im);
      for (k = 0; k < half; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
      used++;
    }
    var db = new Float64Array(half), norm = N * N / 16;
    for (k = 0; k < half; k++) {
      var p = used ? acc[k] / used : 0;
      db[k] = p > 0 ? Math.max(-170, 10 * Math.log10(p / norm)) : -170;
    }
    return { db: db, used: used };
  };

  /* Find the highest brick-wall drop: the mark an encoder's low-pass leaves. Returns {freq, drop} or null. */
  C.detectWall = function (db, sr) {
    var half = db.length, nyq = sr / 2, hz = nyq / half, k;
    var pre = new Float64Array(half + 1);
    for (k = 0; k < half; k++) pre[k + 1] = pre[k] + db[k];
    function mean(f1, f2) {
      var a = Math.max(0, Math.round(f1 / hz)), b = Math.min(half, Math.round(f2 / hz));
      if (b <= a) b = Math.min(half, a + 1);
      return (pre[b] - pre[a]) / (b - a);
    }
    var ref = mean(1000, 5000), top = nyq - 1000, hits = [];
    for (var f = 8000; f <= top; f += Math.max(hz, 25)) {
      var below = mean(f - 1000, f - 300), above = mean(f + 300, f + 1000), rest = mean(f + 300, nyq - 150);
      var drop = below - above;
      if (drop >= 18 && below - rest >= 18 && below > ref - 70) hits.push({ freq: f, drop: drop });
    }
    if (!hits.length) return null;
    var best = hits[hits.length - 1], topF = best.freq;
    for (k = 0; k < hits.length; k++) if (hits[k].freq >= topF - 1500 && hits[k].drop > best.drop) best = hits[k];
    return { freq: best.freq, drop: best.drop };
  };

  function khz(f) { return (f / 1000).toFixed(1) + ' kHz'; }

  /* Turn the measurements into a plain verdict. tone: good | warn | bad | info */
  C.verdict = function (info, wall, sr) {
    var f = wall ? wall.freq : null;
    var guess = f === null ? '' : f < 16500 ? 'a low-bitrate encode, around 128 kbps or below' : f < 19400 ? 'a mid-bitrate encode, around 160 to 192 kbps' : 'a high-bitrate MP3 or AAC, around 256 to 320 kbps';
    var lossyWall = f !== null && f < 20900;
    if (info.lossless === false) {
      if (lossyWall) return { tone: f < 19400 ? 'bad' : 'warn', label: 'Lossy format', detail: info.container + ' is a lossy format. Content stops at ' + khz(f) + ', typical of ' + guess + '.' };
      return { tone: 'warn', label: 'Lossy format', detail: info.container + ' is a lossy format. No cutoff below 21 kHz, so it is a high-bitrate encode.' };
    }
    var wrap = info.lossless ? 'a lossless wrapper' : 'this file';
    if (lossyWall) {
      return { tone: 'bad', label: 'Lossy source inside', detail: 'Content stops at ' + khz(f) + ', typical of ' + guess + '. This looks like lossy audio saved in ' + wrap + '. Converting did not bring the missing detail back.' };
    }
    if (f !== null && sr > 50000 && f < 25500) {
      return { tone: 'warn', label: 'Upsampled', detail: 'Content stops near ' + khz(f) + ', so this was made from CD-rate audio and is not true hi-res. That is fine if the source was lossless.' };
    }
    return { tone: 'good', label: 'Full bandwidth', detail: 'No encoder cutoff found. This is consistent with lossless. Some high-bitrate AAC also looks like this, so read it as a pass, not proof.' };
  };

  /* ---------- tempo ---------- */
  /* Spectral-flux onset envelope, autocorrelation with a comb, then refinement at 8x the beat period. */
  C.tempo = function (getFrame, total, sr) {
    var N = sr > 50000 ? 2048 : 1024, hop = N / 2, half = N / 2, rate = sr / hop, i, k, t;
    var frames = Math.floor(Math.min(total, sr * 100) / hop) - 2;
    if (frames < rate * 8) return null;
    var start = Math.max(0, Math.floor((total - (frames + 2) * hop) / 2));
    var win = new Float64Array(N); for (i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    var re = new Float64Array(N), im = new Float64Array(N), prev = new Float64Array(half), flux = new Float64Array(frames);
    var level = 0, rise = 0;
    for (t = 0; t < frames; t++) {
      var fr = getFrame(start + t * hop, N), s = 0;
      for (i = 0; i < N; i++) { re[i] = fr[i] * win[i]; im[i] = 0; }
      C.fft(re, im);
      for (k = 1; k < half; k++) {
        var m = Math.log(1 + 100 * Math.sqrt(re[k] * re[k] + im[k] * im[k]));
        if (m > prev[k]) s += m - prev[k];
        prev[k] = m; level += m;
      }
      flux[t] = t ? s : 0; rise += flux[t];
    }
    if (!(level > 0) || rise / level < 0.004) return null;   // no real onsets: a drone, a tone, silence
    var w = Math.round(rate * 0.5), env = new Float64Array(frames), run = 0, e0 = 0;
    for (t = 0; t < frames; t++) {
      run += flux[t]; if (t >= w) run -= flux[t - w];
      var v = flux[t] - run / Math.min(t + 1, w);
      env[t] = v > 0 ? v : 0; e0 += env[t] * env[t];
    }
    if (e0 <= 0) return null;
    /* Autocorrelation of the mean-removed envelope, so audio with no repeating pulse sits near zero. */
    var zm = 0; for (t = 0; t < frames; t++) zm += env[t]; zm /= frames;
    var z = new Float64Array(frames); e0 = 0;
    for (t = 0; t < frames; t++) { z[t] = env[t] - zm; e0 += z[t] * z[t]; }
    if (e0 <= 0) return null;
    var maxLag = Math.min(Math.floor(frames / 2), Math.ceil(rate * 60 / 65 * 8) + 6), ac = new Float64Array(maxLag + 2);
    for (var lag = 1; lag <= maxLag + 1; lag++) {
      var sum = 0; for (t = lag; t < frames; t++) sum += z[t] * z[t - lag];
      ac[lag] = sum / e0 * frames / (frames - lag);
    }
    function at(l) { var a = Math.floor(l); if (a + 1 > maxLag) return 0; return ac[a] + (ac[a + 1] - ac[a]) * (l - a); }
    /* Score each tempo by how much onset energy lands on its beat grid (best phase), with a DJ-leaning prior. */
    function grid(l) {
      var top = 0, phases = Math.ceil(l);
      for (var ph = 0; ph < phases; ph++) {
        var sum = 0, n = 0;
        for (var p = ph; p < frames - 1; p += l) {
          var q = Math.round(p), v = env[q];
          if (q > 0 && env[q - 1] > v) v = env[q - 1];
          if (env[q + 1] > v) v = env[q + 1];
          sum += v; n++;
        }
        if (n && sum / n > top) top = sum / n;
      }
      return top;
    }
    var best = null, envMean = 0;
    for (t = 0; t < frames; t++) envMean += env[t];
    envMean /= frames;
    /* Search one octave only (88 to 176, the usual DJ window) so half and double time cannot compete; the other reading is reported as alt. */
    for (var bpm = 88; bpm < 176; bpm += 0.5) {
      var l = rate * 60 / bpm;
      var score = grid(l) / (envMean || 1) * (0.5 + 0.5 * Math.max(0, at(l)));
      if (!best || score > best.score) best = { score: score, lag: l };
    }
    if (!best || best.score < 1.5 || at(best.lag) < 0.12) return null;   // noise and beatless audio have no repeat at the beat period
    function peakNear(center) {
      var c = Math.round(center), b = c, j;
      for (j = c - 2; j <= c + 2; j++) if (j >= 2 && j < maxLag && ac[j] > ac[b]) b = j;
      if (b < 2 || b >= maxLag) return center;
      var y0 = ac[b - 1], y1 = ac[b], y2 = ac[b + 1], d = y0 - 2 * y1 + y2;
      return d < 0 ? b + 0.5 * (y0 - y2) / d : b;
    }
    var cur = peakNear(best.lag), mult = 1;
    while (cur * 2 + 3 < maxLag && mult < 8) { cur = peakNear(cur * 2); mult *= 2; }
    var out = 60 * rate / (cur / mult);
    if (!(out > 80 && out < 190)) return null;
    var tidyBpm = function (x) { return Math.abs(x - Math.round(x)) < 0.2 ? Math.round(x) : Math.round(x * 10) / 10; };
    var alt = out >= 140 ? tidyBpm(out / 2) : out < 92 ? tidyBpm(out * 2) : null;
    return { bpm: tidyBpm(out), alt: alt, strength: best.score, onset: rise / level, repeat: at(best.lag) };
  };

  /* ---------- key ---------- */
  var MAJ = [6.6, 2.0, 3.5, 2.3, 4.6, 4.0, 2.5, 5.2, 2.4, 3.7, 2.3, 3.4];
  var MIN = [6.5, 2.7, 3.5, 5.4, 2.6, 3.5, 2.5, 5.2, 4.0, 2.7, 4.3, 3.2];
  var NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  var CAM_MAJ = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1], CAM_MIN = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];
  function corr(ch, prof, rot) {
    var mx = 0, my = 0, i; for (i = 0; i < 12; i++) { mx += ch[i]; my += prof[i]; } mx /= 12; my /= 12;
    var num = 0, dx = 0, dy = 0;
    for (i = 0; i < 12; i++) { var a = ch[(i + rot) % 12] - mx, b = prof[i] - my; num += a * b; dx += a * a; dy += b * b; }
    return dx && dy ? num / Math.sqrt(dx * dy) : 0;
  }
  /* Conventional spellings, and the key signature as +sharps / -flats. */
  var MAJ_NAME = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  var MAJ_SIG = [0, -5, 2, -3, 4, -1, -6, 1, -4, 3, -2, 5];
  var MIN_NAME = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
  var MIN_SIG = [-3, 4, -1, -6, 1, -4, 3, -2, 5, 0, -5, 2];
  C.describeKey = function (pc, minor) {
    var root = minor ? MIN_NAME[pc] : MAJ_NAME[pc], sig = minor ? MIN_SIG[pc] : MAJ_SIG[pc], n = Math.abs(sig);
    return {
      pc: pc, minor: minor,
      name: root + (minor ? ' minor' : ' major'),
      short: root + (minor ? 'm' : ''),
      camelot: minor ? CAM_MIN[pc] + 'A' : CAM_MAJ[pc] + 'B',
      sig: sig,
      sigText: sig === 0 ? 'no sharps or flats' : n + (sig > 0 ? (n === 1 ? ' sharp' : ' sharps') : (n === 1 ? ' flat' : ' flats'))
    };
  };
  C.keyFromChroma = function (ch) {
    var all = [], r;
    for (r = 0; r < 12; r++) { all.push({ pc: r, minor: false, c: corr(ch, MAJ, r) }); all.push({ pc: r, minor: true, c: corr(ch, MIN, r) }); }
    all.sort(function (a, b) { return b.c - a.c; });
    var out = C.describeKey(all[0].pc, all[0].minor);
    out.score = all[0].c; out.margin = all[0].c - all[1].c; out.alt = C.describeKey(all[1].pc, all[1].minor);
    return out;
  };
  /* Chroma from spectral peaks between 60 Hz and 2 kHz, then matched against key profiles. */
  C.key = function (getFrame, total, sr) {
    var N = sr > 50000 ? 32768 : 16384, half = N / 2, count = 40, i, k;
    if (total < N * 3) return null;
    var win = new Float64Array(N); for (i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    var re = new Float64Array(N), im = new Float64Array(N), mag = new Float64Array(half), chroma = new Float64Array(12), used = 0;
    var lo = Math.max(2, Math.floor(60 * N / sr)), hi = Math.min(half - 2, Math.ceil(2000 * N / sr)), span = total - N;
    for (var w = 0; w < count; w++) {
      var fr = getFrame(Math.floor(span * (0.1 + 0.8 * w / (count - 1))), N), e = 0;
      for (i = 0; i < N; i++) { e += fr[i] * fr[i]; re[i] = fr[i] * win[i]; im[i] = 0; }
      if (Math.sqrt(e / N) < 0.001) continue;
      C.fft(re, im);
      for (k = lo - 1; k <= hi + 1; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      var ch = new Float64Array(12), mx = 0;
      for (k = lo; k <= hi; k++) {
        if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1]) {
          var midi = 69 + 12 * Math.log(k * sr / N / 440) / Math.LN2, near = Math.round(midi), dev = Math.abs(midi - near);
          ch[((near % 12) + 12) % 12] += mag[k] * (1 - 1.6 * dev);
        }
      }
      for (i = 0; i < 12; i++) if (ch[i] > mx) mx = ch[i];
      if (!mx) continue;
      for (i = 0; i < 12; i++) chroma[i] += ch[i] / mx;
      used++;
    }
    if (used < 6) return null;
    var mean = 0, sd = 0;
    for (i = 0; i < 12; i++) mean += chroma[i] / 12;
    for (i = 0; i < 12; i++) sd += (chroma[i] - mean) * (chroma[i] - mean) / 12;
    if (!(mean > 0) || Math.sqrt(sd) / mean < 0.12) return null;   // flat chroma: noise or unpitched audio
    var found = C.keyFromChroma(chroma);
    return found.score < 0.55 ? null : found;             // weak match to every key: do not guess
  };

  C.khz = khz;
  root.Core = C;
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
