const C = require('./core.js');
let fails = 0; const ok = (n, c, x) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

// key names from Beatport -> Camelot
const k = s => (C.keyFromName(s) || {}).camelot;
ok('Bb Minor = 3A', k('Bb Minor') === '3A', k('Bb Minor'));
ok('G Minor = 6A', k('G Minor') === '6A', k('G Minor'));
ok('F# Major = 2B', k('F# Major') === '2B', k('F# Major'));
ok('A minor = 8A, C major = 8B', k('A minor') === '8A' && k('C major') === '8B');
ok('Am = 8A', k('Am') === '8A', k('Am'));
ok('junk = null', C.keyFromName('Unknown') === null);

// mixing rules
ok('8A mixes 8A, 7A, 9A, 8B', ['8A', '7A', '9A', '8B'].every(x => C.keysMix('8A', x)));
ok('8A not 10A or 9B', !C.keysMix('8A', '10A') && !C.keysMix('8A', '9B'));
ok('12A mixes 1A (wheel wraps)', C.keysMix('12A', '1A'));
ok('BPM 124 mixes 128, 62, 248', C.bpmsMix(124, 128) && C.bpmsMix(124, 62) && C.bpmsMix(124, 248));
ok('BPM 124 not 140', !C.bpmsMix(124, 140));

// tracklists
const list = C.parseTracklist(`Tracklist
1. Daye Jack - Easy
02) Kaytranada - Glowed Up [3:45]
[00:12:30] Floating Points - Vocoder
- Burial - Archangel
• Burial - Archangel
ID - ID

  `);
ok('tracklist parsed and cleaned', JSON.stringify(list) === JSON.stringify(['Daye Jack - Easy', 'Kaytranada - Glowed Up', 'Floating Points - Vocoder', 'Burial - Archangel']), JSON.stringify(list));

// crate merge: newest edit wins, deletions carry
const m = C.mergeCrates([{ id: 'a', q: 'x', updatedAt: 1 }, { id: 'b', q: 'y', updatedAt: 5 }], [{ id: 'a', q: 'x2', updatedAt: 3 }, { id: 'b', deleted: true, updatedAt: 4 }, { id: 'c', q: 'z', updatedAt: 2 }]);
const by = Object.fromEntries(m.map(i => [i.id, i]));
ok('merge keeps newest', by.a.q === 'x2' && by.b.q === 'y' && !by.b.deleted && by.c.q === 'z' && m.length === 3);

// grades
let g = C.grade({ container: 'WAV', lossless: true, bits: 24 }, null, 44100, null); ok('full WAV = club ready', g.grade === 'good', g.why);
g = C.grade({ container: 'WAV', lossless: true }, { freq: 16000 }, 44100, null); ok('WAV with 16k wall = low', g.grade === 'low', g.why);
g = C.grade({ container: 'MP3', lossless: false }, { freq: 20000 }, 44100, { kbps: 320 }); ok('320 MP3 = good enough', g.grade === 'fine', g.why);
g = C.grade({ container: 'MP3', lossless: false }, { freq: 19600 }, 44100, { kbps: 192 }); ok('192 MP3 = low', g.grade === 'low', g.why);
g = C.grade({ container: 'WAV', lossless: true }, null, 22050, null); ok('22 kHz = low', g.grade === 'low');

// MP3 header + Xing
function mp3(kbpsIdx, xingFrames, size) {
  const b = new Uint8Array(2000); b.set([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 20], 0);  // 30-byte ID3 tag
  const i = 30; b.set([0xFF, 0xFB, (kbpsIdx << 4) | 0, 0x44], i);  // MPEG1 L3, 44.1k, joint stereo
  if (xingFrames) { const x = i + 36; b.set([88, 105, 110, 103, 0, 0, 0, 1], x); new DataView(b.buffer).setUint32(x + 8, xingFrames); }
  return C.mp3Info(b.buffer, size);
}
let mi = mp3(14, 0); ok('CBR 320 header', mi && mi.kbps === 320 && mi.sampleRate === 44100, JSON.stringify(mi));
mi = mp3(9, 0); ok('CBR 128 header', mi && mi.kbps === 128);
mi = mp3(9, 10000, 10000 * 1152 / 44100 * 245000 / 8); ok('VBR avg from Xing ~245', mi && Math.abs(mi.kbps - 245) <= 1 && mi.vbr, JSON.stringify(mi));

// ID3 tags
(function () {
  const enc = s => [...Buffer.from(s, 'utf8')];
  const fr = (id, s) => { const body = [3, ...enc(s)]; return [...Buffer.from(id), 0, 0, 0, body.length, 0, 0, ...body]; };
  const frames = [...fr('TIT2', 'Easy'), ...fr('TPE1', 'Daye Jack')];
  const b = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, frames.length, ...frames]);
  const t = C.id3Tags(b.buffer); ok('ID3 title/artist', t && t.title === 'Easy' && t.artist === 'Daye Jack', JSON.stringify(t));
  ok('query from tags', C.queryFromFile('x.mp3', t) === 'Daye Jack - Easy');
})();
ok('query from filename', C.queryFromFile('03 - Daye_Jack - Easy (Extended Mix).wav') === 'Daye Jack - Easy (Extended Mix)', C.queryFromFile('03 - Daye_Jack - Easy (Extended Mix).wav'));
// every place to get it
const item = { q: 'Frank Ocean - Nights', artist: 'Frank Ocean', title: 'Nights', album: 'Blonde',
  sources: [{ store: 'Beatport', title: 'Nights', url: 'b', price: '$1.49', lossless: true, match: 'exact', detail: 'WAV, AIFF' }, { store: 'Apple (iTunes)', title: 'Nights', url: 'a', price: '$1.29', lossless: false }],
  physical: { lowest: 21.99, forSale: 96, url: 'https://www.discogs.com/master/1046042', master: '1046042', title: 'Blonde' } };
const groups = C.allOptions(item);
const names = groups.map(g => g.title + ': ' + g.items.map(i => i.name + (i.price ? ' ' + i.price : '')).join(', '));
ok('options grouped, found stores first, no duplicate Beatport search', names[0].startsWith('Lossless downloads: Beatport $1.49, Bandcamp') && (names[0].match(/Beatport/g) || []).length === 1, names[0]);
ok('physical has Discogs price and CD links by album', names[1] === 'CD and vinyl: Discogs from $21.99, Discogs CDs, eBay, Amazon' && groups[1].items[1].url.includes('master_id=1046042') && groups[1].items[2].url.includes('Frank%20Ocean%20Blonde%20CD'), names[1]);
ok('lossy reference uses found Apple price', names[3] === 'Lossy, for reference: Apple (iTunes) $1.29', names[3]);
const rg = C.pickReleaseGroup({ 'release-groups': [
  { id: 'comp', title: 'Blonde', score: 100, 'secondary-types': ['Compilation'], 'artist-credit': [{ name: 'Frank Ocean' }] },
  { id: 'other', title: 'Blonde', score: 90, 'artist-credit': [{ name: 'Someone Else' }] },
  { id: 'real', title: 'Blonde', score: 95, 'first-release-date': '2016-08-20', 'artist-credit': [{ name: 'Frank Ocean' }] }] }, 'Blonde', 'Frank Ocean');
ok('release group: original album, right artist, not compilation', rg && rg.id === 'real');
ok('discogs master from MB links', JSON.stringify(C.discogsFromRels({ relations: [{ url: { resource: 'https://www.last.fm/x' } }, { url: { resource: 'https://www.discogs.com/master/1046042' } }] })) === '{"kind":"master","id":"1046042"}');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
