/*
 * Clean Crate lookup helper (Cloudflare Worker).
 * GET /?q=Artist%20-%20Title  ->  JSON with what each store has, prices, free downloads, and track details.
 * Reads public store pages and public APIs, one search at a time, with results cached for 6 hours.
 */

const ALLOWED_ORIGINS = ['https://tadeuszvs.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const MB_UA = 'CleanCrate/1.0 ( https://github.com/tadeuszvs/clean-crate )';
const TIMEOUT_MS = 9000;
const CACHE_SECONDS = 6 * 3600;

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
    if (!q) return json({ error: 'Add ?q=Artist - Title' }, 400, cors);

    const cacheKey = new Request('https://clean-crate-cache/v1?q=' + encodeURIComponent(q.toLowerCase()));
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) { const body = await hit.text(); return new Response(body, { headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'hit' } }); }

    const parsed = splitQuery(q);
    const [bandcamp, beatport, qobuz, itunes, musicbrainz] = await Promise.all([
      safe(() => searchBandcamp(parsed)),
      safe(() => searchBeatport(parsed)),
      safe(() => searchQobuz(parsed)),
      safe(() => searchItunes(parsed)),
      safe(() => searchMusicBrainz(parsed))
    ]);
    const e = encodeURIComponent(parsed.text);
    const result = {
      query: q,
      parsed,
      checkedAt: new Date().toISOString(),
      sources: { bandcamp, beatport, qobuz, itunes, musicbrainz },
      links: {
        traxsource: 'https://www.traxsource.com/search/tracks?term=' + e,
        juno: 'https://www.junodownload.com/search/?q%5Ball%5D%5B%5D=' + e,
        soundcloud: 'https://soundcloud.com/search/sounds?q=' + e,
        discogs: 'https://www.discogs.com/search/?q=' + e + '&type=release',
        whosampled: 'https://www.whosampled.com/search/?q=' + e
      }
    };
    result.best = pickBest(result.sources);
    const body = JSON.stringify(result);
    ctx.waitUntil(cache.put(cacheKey, new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + CACHE_SECONDS } })));
    return new Response(body, { headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'miss' } });
  }
};

/* ---------------- helpers ---------------- */

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

async function safe(fn) {
  try { return await fn(); }
  catch (err) { return { status: 'error', note: String(err && err.message || err).slice(0, 160), items: [] }; }
}

async function get(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { redirect: 'follow', ...opts, signal: ctrl.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...(opts && opts.headers) } });
    return r;
  } finally { clearTimeout(t); }
}

function decodeEntities(s) {
  return String(s)
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&');
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}
const SAME_SONG = /^(clean|explicit|dirty|original|original mix|album version|single version)$/;
const VERSION_WORDS = /\b(remix(ed)?|edit|mix|dub|vip|bootleg|rework|refix|flip|instrumental|acapella|a cappella|version|extended|radio|clean|explicit|live|remaster(ed)?|sped up|slowed)\b/;

function splitQuery(q) {
  const m = q.split(/\s+[-–—]\s+|\s+by\s+/i);
  if (m.length >= 2) return { artist: m[0].trim(), title: m.slice(1).join(' - ').trim(), text: q.replace(/\s+[-–—]\s+/, ' ') };
  return { artist: '', title: q, text: q };
}

/* How well an item matches what was asked: 0 (no) to 10 (exact). */
function scoreMatch(parsed, itemTitle, itemArtist) {
  const it = norm(itemTitle), ia = norm(itemArtist);
  if (parsed.artist) {
    const qt = norm(parsed.title), qa = norm(parsed.artist);
    const titleHas = qt.split(' ').every(w => (' ' + it + ' ').includes(' ' + w + ' '));
    const artistHas = qa.split(' ').every(w => (' ' + ia + ' ' + it + ' ').includes(' ' + w + ' '));
    if (!titleHas || !artistHas) return 0;
    const extra = it.replace(qt, '').replace(qa, '').trim();
    if (!extra) return 10;
    if (SAME_SONG.test(extra)) return 9;
    return VERSION_WORDS.test(extra) ? 7 : 5;
  }
  const words = norm(parsed.title).split(' ').filter(Boolean);
  const hay = ' ' + it + ' ' + ia + ' ';
  const hits = words.filter(w => hay.includes(' ' + w + ' ')).length;
  if (hits < words.length) return 0;
  return 6;
}
function matchLabel(score) { return score >= 10 ? 'exact' : score >= 9 ? 'same song' : score >= 7 ? 'version' : 'possible'; }

function money(value, currency) {
  if (value == null || isNaN(value)) return null;
  const sym = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$', JPY: '¥' }[currency] || '';
  return { value: +value, currency: currency || null, display: sym ? sym + (+value).toFixed(2) : (+value).toFixed(2) + ' ' + (currency || '') };
}

/* ---------------- Bandcamp ---------------- */

async function searchBandcamp(parsed) {
  const r = await get('https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ search_text: parsed.text, search_filter: 't', full_page: false, fan_id: null })
  });
  if (!r.ok) return { status: r.status === 403 || r.status === 429 ? 'blocked' : 'error', note: 'HTTP ' + r.status, items: [] };
  const j = await r.json();
  const hits = ((j.auto && j.auto.results) || [])
    .filter(x => x.type === 't')
    .map(x => ({ x, score: scoreMatch(parsed, x.name, x.band_name) }))
    .filter(h => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (!hits.length) return { status: 'none', items: [] };
  const items = await Promise.all(hits.map(async ({ x, score }) => {
    const base = { title: x.name, artist: x.band_name, album: x.album_name || null, url: x.item_url_path, match: matchLabel(score), score };
    try { return { ...base, ...(await bandcampTrack(x.item_url_path)) }; }
    catch (e) { return { ...base, price: null, free: false, note: 'Open the page for price' }; }
  }));
  return { status: 'ok', items };
}

async function bandcampTrack(url) {
  const r = await get(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const html = await r.text();
  const m = html.match(/data-tralbum="([^"]*)"/);
  const t = m ? JSON.parse(decodeEntities(m[1])) : {};
  const cur = t.current || {};
  const info = (t.trackinfo && t.trackinfo[0]) || {};
  const buyStart = html.indexOf('class="buyItem');
  const buy = buyStart >= 0 ? html.slice(buyStart, buyStart + 6000) : '';
  const priceM = buy.match(/<span class="base-text-color">\s*([^<]+?)\s*<\/span>\s*<span class="buyItemExtra[^"]*">\s*([A-Z]{3})/);
  const freeButton = /Free Download/i.test(buy) || !!t.freeDownloadPage || info.has_free_download === true;
  const nyp = /name your price/i.test(buy) || cur.minimum_price === 0;
  const qual = (html.match(/Download available in ([0-9]{2}-bit\/[0-9.]+kHz)/) || [])[1] || null;
  let price = null;
  if (priceM) price = money(parseFloat(priceM[1].replace(/[^0-9.]/g, '')), priceM[2]);
  else if (!freeButton && cur.minimum_price) price = money(cur.minimum_price, null);
  const sellsDigital = info.is_downloadable !== false && (freeButton || nyp || price || /Buy Digital/i.test(buy));
  return {
    price,
    free: freeButton || (nyp && !price),
    nameYourPrice: nyp && !freeButton,
    formats: sellsDigital ? 'WAV, AIFF, FLAC, MP3' : null,
    quality: qual ? qual.replace('-bit/', '-bit / ').replace('kHz', ' kHz') : null,
    available: !!sellsDigital
  };
}

/* ---------------- Beatport ---------------- */

async function searchBeatport(parsed) {
  const r = await get('https://www.beatport.com/search/tracks?q=' + encodeURIComponent(parsed.text));
  if (!r.ok) return { status: r.status === 403 || r.status === 429 ? 'blocked' : 'error', note: 'HTTP ' + r.status, items: [] };
  const html = await r.text();
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return { status: 'blocked', note: 'Page not readable', items: [] };
  const d = JSON.parse(m[1]);
  const queries = (d.props && d.props.pageProps && d.props.pageProps.dehydratedState && d.props.pageProps.dehydratedState.queries) || [];
  let tracks = [];
  for (const qu of queries) { const data = qu.state && qu.state.data && qu.state.data.data; if (Array.isArray(data)) { tracks = data; break; } }
  const items = tracks
    .map(t => {
      const artist = (t.artists || []).map(a => a.artist_name).join(', ');
      const full = t.track_name + (t.mix_name && t.mix_name !== 'Original Mix' ? ' (' + t.mix_name + ')' : '');
      return { t, artist, full, score: scoreMatch(parsed, full, artist) };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ t, artist, full, score }) => ({
      title: full,
      artist,
      album: t.release && t.release.release_name || null,
      label: t.label && t.label.label_name || null,
      url: 'https://www.beatport.com/track/' + (norm(t.track_name).replace(/ /g, '-') || 'track') + '/' + t.track_id,
      price: t.price ? money(t.price.value, t.price.code) : null,
      free: false,
      formats: 'WAV, AIFF, FLAC, MP3',
      bpm: t.bpm || null,
      key: t.key_name || null,
      year: (t.publish_date || '').slice(0, 4) || null,
      available: t.sale_type !== 'stream',
      match: matchLabel(score),
      score
    }));
  return { status: items.length ? 'ok' : 'none', items };
}

/* ---------------- Qobuz ---------------- */

async function searchQobuz(parsed) {
  const r = await get('https://www.qobuz.com/us-en/search/tracks/' + encodeURIComponent(parsed.text));
  if (!r.ok) return { status: r.status === 403 || r.status === 429 ? 'blocked' : 'error', note: 'HTTP ' + r.status, items: [] };
  const html = await r.text();
  const re = /<a href="(\/[a-z]{2}-[a-z]{2}\/album\/[^"]+)" class="ListItem__title" title="([^"]*)"[\s\S]*?<p class="ListItem__artists">\s*([\s\S]*?)\s*<\/p>/g;
  const found = [];
  let m;
  while ((m = re.exec(html)) && found.length < 25) {
    const title = decodeEntities(m[2]).trim();
    const parts = decodeEntities(m[3].replace(/<[^>]+>/g, '')).split('•').map(s => s.trim());
    const score = scoreMatch(parsed, title, parts[0] || '');
    if (score > 0) found.push({ path: m[1], title, artist: parts[0] || '', album: parts[1] || null, score });
  }
  found.sort((a, b) => b.score - a.score);
  const top = found.slice(0, 2);
  if (!top.length) return { status: 'none', items: [] };
  const items = await Promise.all(top.map(async f => {
    const url = 'https://www.qobuz.com' + f.path;
    const base = { title: f.title, artist: f.artist, album: f.album, url, free: false, formats: 'FLAC (lossless)', match: matchLabel(f.score), score: f.score };
    try {
      const page = await (await get(url)).text();
      let price = null, albumPrice = null, quality = null;
      const tracks = [...page.matchAll(/data-track-v2="([^"]+)"/g)].map(x => { try { return JSON.parse(decodeEntities(x[1])); } catch (e) { return null; } }).filter(Boolean);
      const t = tracks.find(x => norm(x.item_name) === norm(f.title)) || tracks.find(x => norm(x.item_name).includes(norm(f.title)));
      if (t && t.price != null) price = money(t.price, 'USD');
      const ap = page.match(/"priceCurrency":"([A-Z]{3})","price":([0-9.]+)/);
      if (ap) albumPrice = money(parseFloat(ap[2]), ap[1]);
      const qm = page.match(/(\d{2})-Bit\s*\/?\s*([\d.]+)\s*kHz/i);
      quality = qm ? qm[1] + '-bit / ' + qm[2] + ' kHz' : 'CD quality or better';
      return { ...base, price, albumPrice, quality, available: true };
    } catch (e) { return { ...base, price: null, note: 'Open the page for price' }; }
  }));
  return { status: 'ok', items };
}

/* ---------------- Apple (reference price, lossy) ---------------- */

async function searchItunes(parsed) {
  const r = await get('https://itunes.apple.com/search?entity=song&limit=10&country=US&term=' + encodeURIComponent(parsed.text));
  if (!r.ok) return { status: 'error', note: 'HTTP ' + r.status, items: [] };
  const j = await r.json();
  const items = (j.results || [])
    .map(t => ({ t, score: scoreMatch(parsed, t.trackName, t.artistName) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ t, score }) => ({
      title: t.trackName, artist: t.artistName, album: t.collectionName || null,
      url: t.trackViewUrl, price: t.trackPrice > 0 ? money(t.trackPrice, t.currency) : null,
      free: false, formats: 'AAC 256 kbps (lossy)', lossy: true,
      year: (t.releaseDate || '').slice(0, 4) || null, lengthSec: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : null,
      match: matchLabel(score), score
    }));
  return { status: items.length ? 'ok' : 'none', items };
}

/* ---------------- MusicBrainz (track facts) ---------------- */

async function searchMusicBrainz(parsed) {
  const esc = s => s.replace(/(["\\])/g, '\\$1');
  const query = parsed.artist
    ? 'recording:"' + esc(parsed.title) + '" AND artist:"' + esc(parsed.artist) + '"'
    : esc(parsed.title);
  const r = await get('https://musicbrainz.org/ws/2/recording?fmt=json&limit=8&query=' + encodeURIComponent(query), { headers: { 'User-Agent': MB_UA, 'Accept': 'application/json' } });
  if (!r.ok) return { status: 'error', note: 'HTTP ' + r.status, items: [] };
  const j = await r.json();
  const items = (j.recordings || [])
    .map(rec => {
      const artist = (rec['artist-credit'] || []).map(c => c.name + (c.joinphrase || '')).join('');
      return { rec, artist, score: scoreMatch(parsed, rec.title + (rec.disambiguation ? ' ' + rec.disambiguation : ''), artist) };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ rec, artist, score }) => {
      const rel = (rec.releases || [])[0] || {};
      return {
        title: rec.title + (rec.disambiguation ? ' (' + rec.disambiguation + ')' : ''),
        artist,
        album: rel.title || null,
        year: (rec['first-release-date'] || rel.date || '').slice(0, 4) || null,
        lengthSec: rec.length ? Math.round(rec.length / 1000) : null,
        isrc: (rec.isrcs || [])[0] || null,
        url: 'https://musicbrainz.org/recording/' + rec.id,
        match: matchLabel(score), score
      };
    });
  return { status: items.length ? 'ok' : 'none', items };
}

/* ---------------- best option ---------------- */

function pickBest(sources) {
  const cands = [];
  for (const store of ['bandcamp', 'beatport', 'qobuz']) {
    const s = sources[store];
    if (!s || !s.items) continue;
    for (const it of s.items) {
      if (it.match === 'possible' || it.available === false) continue;
      if (it.free) cands.push({ store, item: it, cost: 0 });
      else if (it.price && (!it.price.currency || it.price.currency === 'USD')) cands.push({ store, item: it, cost: it.price.value });
    }
  }
  if (!cands.length) return null;
  const tier = c => (c.item.score >= 9 ? 0 : 1);
  cands.sort((a, b) => tier(a) - tier(b) || a.cost - b.cost);
  const b = cands[0];
  return { store: b.store, title: b.item.title, artist: b.item.artist, url: b.item.url, free: b.cost === 0, price: b.item.price, quality: b.item.quality || null, match: b.item.match };
}
