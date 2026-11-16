const C = require('./core.js');
let fails = 0;
const ok = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

// deterministic noise
let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
function noise(n) { const a = new Float64Array(n); for (let i = 0; i < n; i++) a[i] = rnd(); return a; }
// brick-wall / shaped filter via big FFT
function shape(sig, sr, gainAt) {
  let n = 1; while (n < sig.length) n <<= 1;
  const re = new Float64Array(n), im = new Float64Array(n); re.set(sig);
  C.fft(re, im);
  for (let k = 0; k <= n / 2; k++) { const g = gainAt(k * sr / n); re[k] *= g; im[k] *= g; if (k && k < n / 2) { re[n - k] *= g; im[n - k] *= g; } }
  // inverse via conjugate trick
  for (let i = 0; i < n; i++) im[i] = -im[i];
  C.fft(re, im);
  const out = new Float32Array(sig.length); for (let i = 0; i < sig.length; i++) out[i] = re[i] / n; return out;
}
const lp = (fc, width) => f => f < fc ? 1 : f > fc + width ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (f - fc) / width);
function run(sig, sr) {
  const N = sr > 50000 ? 16384 : 8192;
  const spec = C.averageSpectrum((s, n) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = sig[s + i] || 0; return o; }, sig.length, N, 48);
  return { spec, wall: C.detectWall(spec.db, sr) };
}
const dither = sig => { for (let i = 0; i < sig.length; i++) sig[i] += rnd() * 2 / 32768; return sig; };

const SR = 44100, LEN = 1 << 19;
const pinkish = f => 1 / Math.sqrt(1 + Math.pow(f / 2000, 2));          // gentle natural tilt
let full = shape(noise(LEN), SR, pinkish);
let r = run(full, SR); ok('full-band music-like noise: no wall', r.wall === null, JSON.stringify(r.wall));

for (const fc of [16000, 19000, 20000]) {
  const s = dither(shape(noise(LEN), SR, f => pinkish(f) * lp(fc, 400)(f)));
  r = run(s, SR);
  ok('low-pass ' + fc + ' + 16-bit dither: wall within 500 Hz', r.wall && Math.abs(r.wall.freq - fc) < 500, JSON.stringify(r.wall));
}
// shelf at 16k (-22 dB) then wall at 20k, like some 320 kbps MP3s
let s320 = dither(shape(noise(LEN), SR, f => pinkish(f) * (f > 16000 ? 0.08 : 1) * lp(20000, 400)(f)));
r = run(s320, SR); ok('shelf at 16k + wall at 20k: reports ~20k', r.wall && Math.abs(r.wall.freq - 20000) < 600, JSON.stringify(r.wall));
// steep but natural synth-style roll-off: 24 dB/oct from 6 kHz
let dark = dither(shape(noise(LEN), SR, f => 1 / (1 + Math.pow(f / 6000, 4))));
r = run(dark, SR); ok('24 dB/oct roll-off from 6k: no wall', r.wall === null, JSON.stringify(r.wall));
// CD master with anti-alias filter at 21.5k
let cd = dither(shape(noise(LEN), SR, f => pinkish(f) * lp(21500, 400)(f)));
r = run(cd, SR); ok('CD-style filter at 21.5k: not flagged lossy', r.wall === null || r.wall.freq >= 20900, JSON.stringify(r.wall));
// 96k upsample of CD-rate audio
let up = shape(noise(LEN), 96000, f => pinkish(f) * lp(21800, 300)(f));
r = run(up, 96000);
let v = C.verdict({ container: 'WAV', lossless: true }, r.wall, 96000);
ok('96k file with content to 22k: Upsampled', v.label === 'Upsampled', JSON.stringify(r.wall) + ' ' + v.label);
// true hi-res
r = run(shape(noise(LEN), 96000, pinkish), 96000); ok('true 96k: no wall', r.wall === null, JSON.stringify(r.wall));

// verdict wording
v = C.verdict({ container: 'WAV', lossless: true }, { freq: 16000, drop: 60 }, 44100); ok('WAV with 16k wall => bad', v.tone === 'bad' && /128/.test(v.detail));
v = C.verdict({ container: 'WAV', lossless: true }, null, 44100); ok('WAV no wall => good', v.tone === 'good');
v = C.verdict({ container: 'MP3', lossless: false }, { freq: 20000, drop: 60 }, 44100); ok('MP3 20k => warn', v.tone === 'warn');

// WAV writer + parser round trip (16-bit stereo, 24-bit mono)
function wav(sig, sr, bits, ch) {
  const bytes = bits / 8, n = sig.length, buf = new ArrayBuffer(44 + n * bytes * ch), dv = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * bytes * ch, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, ch, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * bytes * ch, true); dv.setUint16(32, bytes * ch, true); dv.setUint16(34, bits, true);
  w(36, 'data'); dv.setUint32(40, n * bytes * ch, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const x = Math.max(-1, Math.min(1, sig[i]));
    if (bits === 16) { dv.setInt16(o, Math.round(x * 32767), true); o += 2; }
    else { let q = Math.round(x * 8388607); if (q < 0) q += 0x1000000; dv.setUint8(o, q & 255); dv.setUint8(o + 1, (q >> 8) & 255); dv.setUint8(o + 2, (q >> 16) & 255); o += 3; }
  }
  return buf;
}
const lossy16 = shape(noise(LEN), SR, f => pinkish(f) * lp(16000, 400)(f));
for (const [bits, ch] of [[16, 2], [24, 1]]) {
  const buf = wav(lossy16, SR, bits, ch), p = C.parseWav(buf);
  const good = p && p.sampleRate === SR && p.bits === bits && p.channels === ch && p.frames === LEN;
  const rd = C.pcmReader(buf, p), fr = rd(1000, 16);
  let err = 0; for (let i = 0; i < 16; i++) err = Math.max(err, Math.abs(fr[i] - lossy16[1000 + i]));
  const spec = C.averageSpectrum(rd, p.frames, 8192, 48), wl = C.detectWall(spec.db, SR);
  ok(`WAV ${bits}-bit ${ch}ch parse + read + wall`, good && err < 1e-3 && wl && Math.abs(wl.freq - 16000) < 500, 'err=' + err.toExponential(2) + ' ' + JSON.stringify(wl));
}
// AIFF 16-bit big-endian
(function () {
  const n = 4096, sig = lossy16.subarray(0, n), buf = new ArrayBuffer(54 + n * 2), dv = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'FORM'); dv.setUint32(4, 46 + n * 2); w(8, 'AIFF'); w(12, 'COMM'); dv.setUint32(16, 18); dv.setInt16(20, 1); dv.setUint32(22, n); dv.setInt16(26, 16);
  // 44100 as 80-bit extended: exponent 16398, mantissa 0xAC44 << 48
  dv.setUint16(28, 0x400E); dv.setUint32(30, 0xAC440000); dv.setUint32(34, 0);
  w(38, 'SSND'); dv.setUint32(42, 8 + n * 2); dv.setUint32(46, 0); dv.setUint32(50, 0);
  for (let i = 0; i < n; i++) dv.setInt16(54 + i * 2, Math.round(sig[i] * 32767));
  const p = C.parseAiff(buf), fr = p && C.pcmReader(buf, p)(10, 8);
  let err = 1; if (fr) { err = 0; for (let i = 0; i < 8; i++) err = Math.max(err, Math.abs(fr[i] - sig[10 + i])); }
  ok('AIFF parse + read', p && p.sampleRate === 44100 && p.frames === n && err < 1e-3, JSON.stringify(p && { sr: p.sampleRate, fr: p.frames }) + ' err=' + err);
})();

// link parsing
const P = C.parseInput;
let a = P('https://music.apple.com/us/album/midnight-city-single/123456789?i=987654321');
ok('Apple album link', a.ok && a.query === 'midnight city' && a.source === 'Apple Music', a.query);
a = P('https://music.apple.com/us/song/some-track-name/1440818588'); ok('Apple song link', a.ok && a.query === 'some track name', a.query);
a = P('https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb'); ok('Apple playlist refused with note', !a.ok && /playlist/.test(a.note));
a = P('https://soundcloud.com/some-artist/cool-track-free-download?si=abc'); ok('SoundCloud link', a.ok && a.query === 'some artist cool track', a.query);
a = P('soundcloud.com/some-artist/sets/my-ep'); ok('SoundCloud set refused', !a.ok);
a = P('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'); ok('Spotify needs text', !a.ok && /Spotify/.test(a.note));
a = P('Floating Points - Vocoder'); ok('typed text kept', a.ok && a.query === 'Floating Points - Vocoder' && a.source === 'Typed');
a = P('https://artistname.bandcamp.com/track/a-song'); ok('Bandcamp link', a.ok && a.query === 'artistname a song', a.query);
const st = C.stores('a b&c', a); ok('store urls encoded', st[0].items[0].url.includes('a%20b%26c'));
// sniff
ok('sniff mp3', C.sniff(new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0]).buffer, 'x.mp3').container === 'MP3');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
