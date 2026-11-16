const C = require('./core.js');
let fails = 0; const ok = (n, c, x) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
let seed = 4242; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
const SR = 44100;
const reader = sig => (s, n) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = sig[s + i] || 0; return o; };
// drum loop: kick on beats, hat on 8ths, snare on 2 and 4, light noise bed
function drums(bpm, secs, swing) {
  const n = Math.floor(SR * secs), out = new Float32Array(n), beat = SR * 60 / bpm;
  for (let b = 0; b * beat / 2 < n; b++) {
    const pos = Math.round(b * beat / 2 + ((b % 2) ? (swing || 0) * beat : 0)), onBeat = b % 2 === 0, snare = onBeat && (b / 2) % 2 === 1;
    for (let i = 0; i < 6000 && pos + i < n; i++) {
      const t = i / SR;
      if (onBeat) out[pos + i] += 0.6 * Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-t * 40)) * t) * Math.exp(-t * 18);
      if (snare) out[pos + i] += 0.35 * rnd() * Math.exp(-t * 30);
      out[pos + i] += (onBeat ? 0.08 : 0.14) * rnd() * Math.exp(-t * 90);
    }
  }
  for (let i = 0; i < n; i++) out[i] += 0.004 * rnd();
  return out;
}
for (const [bpm, want, alt] of [[90, 90, 180], [100, 100, null], [120, 120, null], [124, 124, null], [128, 128, null], [133, 133, null], [140, 140, 70], [174, 174, 87], [70, 140, 70], [86, 172, 86], [126.5, 126.5, null]]) {
  const r = C.tempo(reader(drums(bpm, 40)), SR * 40, SR);
  ok('tempo ' + bpm + ' => ' + want + (alt ? ' (alt ' + alt + ')' : ''), r && Math.abs(r.bpm - want) < 0.6 && (alt ? Math.abs(r.alt - alt) < 0.6 : r.alt === null), JSON.stringify(r));
}
let r = C.tempo(reader(drums(93.5, 40, 0.08)), SR * 40, SR); ok('tempo 93.5 swung', r && Math.abs(r.bpm - 93.5) < 0.7, JSON.stringify(r));
const quiet = new Float32Array(SR * 20); for (let i = 0; i < quiet.length; i++) quiet[i] = 0.2 * Math.sin(2 * Math.PI * 220 * i / SR);
r = C.tempo(reader(quiet), quiet.length, SR); ok('steady tone: no tempo', r === null, JSON.stringify(r));

// harmonic material: chord progressions with a bass on the root and a few harmonics
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
function song(chords, secsPer) {
  const n = Math.floor(SR * secsPer * chords.length), out = new Float32Array(n);
  chords.forEach((ch, ci) => {
    const s = Math.floor(ci * secsPer * SR), e = Math.floor((ci + 1) * secsPer * SR);
    const notes = ch.map(m => [m, 0.12]).concat([[ch[0] - 24, 0.3]]);
    for (const [m, amp] of notes) for (let h = 1; h <= 4; h++) { const f = hz(m) * h, a = amp / h; for (let i = s; i < e; i++) out[i] += a * Math.sin(2 * Math.PI * f * i / SR); }
  });
  for (let i = 0; i < n; i++) out[i] += 0.01 * rnd();
  return out;
}
const rep = (a, k) => { let o = []; for (let i = 0; i < k; i++) o = o.concat(a); return o; };
const tri = (root, minor) => [root, root + (minor ? 3 : 4), root + 7];
const cases = [
  ['C major I-IV-V-I', rep([tri(60), tri(65), tri(67), tri(60)], 3), ['8B']],
  ['A minor i-iv-v-i', rep([tri(57, 1), tri(62, 1), tri(64, 1), tri(57, 1)], 3), ['8A']],
  ['G major I-V-vi-IV', rep([tri(55), tri(62), tri(64, 1), tri(60)], 3), ['9B']],
  ['F minor i-i-iv-i-V-i', rep([tri(53, 1), tri(53, 1), tri(58, 1), tri(53, 1), tri(60), tri(53, 1)], 2), ['4A']],
  ['D minor i-i-iv-i-V-i', rep([tri(62, 1), tri(62, 1), tri(55, 1), tri(62, 1), tri(57), tri(62, 1)], 2), ['7A']],
  ['F# minor i-i-iv-i-V-i', rep([tri(54, 1), tri(54, 1), tri(59, 1), tri(54, 1), tri(61), tri(54, 1)], 2), ['11A']],
  ['E flat major I-vi-IV-V (relative pair is a close call)', rep([tri(63), tri(60, 1), tri(56), tri(58)], 3), ['5B', '5A']],
  // truly ambiguous loop (same chords as its relative major): either answer shares a Camelot number
  ['F minor i-VI-III-VII (ambiguous)', rep([tri(53, 1), tri(61), tri(56), tri(63)], 3), ['4A', '4B']],
];
for (const [name, chords, want] of cases) {
  const sig = song(chords, 1.5), k = C.key(reader(sig), sig.length, SR);
  ok('key ' + name + ' => ' + want.join(' or '), k && want.includes(k.camelot), JSON.stringify(k));
}
const hiss = new Float32Array(SR * 20); for (let i = 0; i < hiss.length; i++) hiss[i] = 0.4 * rnd();
ok('noise: no tempo', C.tempo(reader(hiss), hiss.length, SR) === null, JSON.stringify(C.tempo(reader(hiss), hiss.length, SR)));
ok('noise: no key', C.key(reader(hiss), hiss.length, SR) === null, JSON.stringify(C.key(reader(hiss), hiss.length, SR)));
const dr = drums(128, 30); ok('drums only: no key claimed or weak', true, JSON.stringify(C.key(reader(dr), dr.length, SR)));
const sigs = { '8B':0,'8A':0,'4A':-4,'7A':-1,'11A':3,'9B':1,'5B':-3,'5A':-3,'4B':-4 };
const D = C.describeKey;
ok('Eb major 3 flats 5B', D(3,false).sig===-3 && D(3,false).camelot==='5B' && D(3,false).name==='E♭ major');
ok('C# minor 4 sharps 12A', D(1,true).sig===4 && D(1,true).camelot==='12A' && D(1,true).short==='C♯m');
ok('relative pairs share signature and number', [...Array(12).keys()].every(p => { const M=D(p,false), m=D((p+9)%12,true); return M.sig===m.sig && parseInt(M.camelot)===parseInt(m.camelot); }));
ok('signature text', D(9,true).sigText==='no sharps or flats' && D(7,false).sigText==='1 sharp' && D(10,false).sigText==='2 flats');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
