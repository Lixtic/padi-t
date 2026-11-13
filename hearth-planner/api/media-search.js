'use strict';
// Educational image discovery with relevance ranking and provider fallbacks.
const { sendJson, clientIp } = require('./_lib');
const Quota = require('./_quota');
const A = require('./_auth');
const Judge = require('./_image_judge');

const STOP = new Set((
  'the and for with from that this into are was were has have had can will their them they its his her our your you who what when where which how why not but all any each some such than then also about over under between using use used make makes made given able learners learner pupils pupil students student should would could examine examines examined demonstrate demonstrates demonstrated identify identifies identified describe describes described explain explains explained explore explores explored create creates created design designs designed compare compares compared discuss discusses discussed analyse analyzes analyze apply applies applied evaluate evaluates evaluated construct constructs constructed develop develops developed investigate investigates investigated understand understands understanding learn learns learning lesson lessons basic jhs shs educational diagram picture image images photo photos illustration illustrations example examples'
).split(' '));

function terms(value) {
  return String(value || '').toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:b[1-9]|shs[1-3])(?:\.\d+){2,5}\b/gi, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map(stem);
}
/* Light stemming so "devices" matches "device" and "computing" matches "computer"-family titles. */
function stem(w) {
  if (/[^a-z]/.test(w) || w.length < 5) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (/(?:sses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (/[^sui]s$/.test(w)) w = w.slice(0, -1);
  if (/ing$/.test(w) && w.length - 3 >= 4) w = w.slice(0, -3);
  return w;
}
function keywords(q, max = 8) {
  return [...new Set(terms(q))].slice(0, max).join(' ');
}
function relevance(query, title, description, context) {
  const q = [...new Set(terms(query))];
  if (!q.length) return { score: 0, matched: 0, ratio: 0 };
  const t = new Set(terms(title));
  const d = new Set(terms(description));
  const matched = q.filter((w) => t.has(w) || d.has(w));
  const titleMatches = q.filter((w) => t.has(w)).length;
  const phrase = String(title || '').toLowerCase().includes(String(query || '').toLowerCase());
  const ratio = matched.length / q.length;
  // The subject and class only help rank: an image of "photosynthesis" should not be dropped for not saying "biology".
  const ctx = [...new Set(terms(context))].filter((w) => t.has(w) || d.has(w)).length;
  const score = titleMatches * 3 + (matched.length - titleMatches) + (phrase ? 5 : 0) + ctx * 2;
  return { score, matched: matched.length, ratio, phrase, ctx };
}
function relevant(item, query, context) {
  const r = relevance(query, item.title, item.description, context);
  const count = [...new Set(terms(query))].length;
  // Never accept a result merely because it has an image URL. Require meaningful concept overlap.
  const conceptMatch = count <= 2 ? r.matched >= 1 : (r.matched >= 2 && r.ratio >= 0.34) || (r.phrase && r.matched >= 1);
  if (!conceptMatch) return false;

  // Short, ambiguous concepts (e.g. "cell", "port", "network") need at least
  // one lesson-context signal when the caller supplied useful context.
  const contextTerms = [...new Set(terms(context))];
  if (count <= 2 && contextTerms.length) {
    const titleTerms = new Set(terms(item.title));
    const descriptionTerms = new Set(terms(item.description));
    const contextMatches = contextTerms.filter((word) => titleTerms.has(word) || descriptionTerms.has(word)).length;
    if (!contextMatches) return false;
  }
  return true;
}
function cleanText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
/* The same picture often comes back from two providers; keep the first. */
function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item.thumbnail || '').replace(/[?#].*$/, '').toLowerCase() || String(item.title || '').toLowerCase();
    const title = 'title:' + String(item.title || '').toLowerCase().replace(/\.(jpe?g|png|gif|webp|svg)$/i, '') + '|' + String(item.author || '').toLowerCase();
    if (seen.has(key) || (item.title && seen.has(title))) return false;
    seen.add(key); if (item.title) seen.add(title);
    return true;
  });
}
function rankAndFilter(results, query, context) {
  return dedupe(results).map((item) => {
    const match = relevance(query, item.title, item.description, context);
    return Object.assign({}, item, { _score: match.score, _matched: match.matched, _ratio: match.ratio });
  }).filter((item) => item.thumbnail && /^https:\/\//i.test(item.thumbnail) && item.url && /^https:\/\//i.test(item.url) && relevant(item, query, context))
    .sort((a, b) => b._score - a._score)
    .slice(0, 12)
    .map(({ _score, _matched, _ratio, ...item }) => item);
}

const CACHE = new Map(), TTL = 24 * 60 * 60 * 1000;
const cached = (k) => { const h = CACHE.get(k); if (h && Date.now() - h.at < TTL) return h.data; CACHE.delete(k); return null; };
function remember(k, data) {
  if (CACHE.size >= 300) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(k, { at: Date.now(), data });
}
function withTimeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Provider timeout')), ms); })]).finally(() => clearTimeout(timer));
}
async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers: Object.assign({ Accept: 'application/json' }, headers), signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error('Provider returned HTTP ' + response.status);
  return response.json();
}
async function wikimedia(query) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: 'filetype:bitmap ' + query,
    gsrnamespace: '6', gsrlimit: '20', prop: 'imageinfo', iiprop: 'url|extmetadata',
    iiurlwidth: '800', format: 'json', origin: '*',
  }).toString();
  const data = await getJson(url, { 'User-Agent': 'GuidEd/1.1 (educational media search)' });
  return Object.values(data.query && data.query.pages || {}).map((page) => {
    const info = page.imageinfo && page.imageinfo[0] || {};
    const meta = info.extmetadata || {};
    const description = cleanText(meta.ImageDescription && meta.ImageDescription.value);
    return {
      title: String(page.title || '').replace(/^File:/, ''),
      description,
      thumbnail: info.thumburl || info.url || '',
      url: info.descriptionurl || info.url || '',
      license: cleanText(meta.LicenseShortName && meta.LicenseShortName.value) || 'See source page',
      author: cleanText(meta.Artist && meta.Artist.value),
      provider: 'Wikimedia Commons',
    };
  });
}
async function openverse(query) {
  const token = String(process.env.OPENVERSE_ACCESS_TOKEN || '').trim();
  const url = new URL('https://api.openverse.org/v1/images/');
  url.search = new URLSearchParams({ q: query, page_size: '20', mature: 'false', license_type: 'commercial' }).toString();
  const data = await getJson(url, token ? { Authorization: 'Bearer ' + token } : {});
  return (data.results || []).map((x) => ({
    title: cleanText(x.title), description: cleanText(x.description),
    thumbnail: x.thumbnail || '', url: x.foreign_landing_url || x.detail_url || x.url,
    license: x.license ? String(x.license).toUpperCase() : 'See source page',
    author: cleanText(x.creator), provider: 'Openverse',
  }));
}
async function pixabay(query) {
  const key = String(process.env.PIXABAY_API_KEY || '').trim();
  if (!key) return [];
  const url = new URL('https://pixabay.com/api/');
  url.search = new URLSearchParams({ key, q: query, image_type: 'all', safesearch: 'true', per_page: '20' }).toString();
  const data = await getJson(url);
  return (data.hits || []).map((x) => ({
    title: cleanText(x.tags), description: cleanText(x.tags),
    thumbnail: x.webformatURL || x.largeImageURL, url: x.pageURL,
    license: 'Pixabay Content License', author: cleanText(x.user), provider: 'Pixabay',
  }));
}
async function pexels(query) {
  const key = String(process.env.PEXELS_API_KEY || '').trim();
  if (!key) return [];
  const url = new URL('https://api.pexels.com/v1/search');
  url.search = new URLSearchParams({ query, per_page: '20', orientation: 'landscape' }).toString();
  const data = await getJson(url, { Authorization: key });
  return (data.photos || []).map((x) => ({
    title: cleanText(x.alt || query), description: cleanText(x.alt || ''),
    thumbnail: x.src && (x.src.large || x.src.medium) || '',
    url: x.url, license: 'Pexels License', author: cleanText(x.photographer), provider: 'Pexels',
  }));
}
// Flickr's licence ids. Only licences that allow commercial use are searched: study notes are part of a paid product.
const FLICKR_LICENSES = { 4: 'CC BY 2.0', 5: 'CC BY-SA 2.0', 6: 'CC BY-ND 2.0', 7: 'No known copyright restrictions', 8: 'US Government Work', 9: 'CC0', 10: 'Public Domain Mark' };
async function flickr(query) {
  const key = String(process.env.FLICKR_API_KEY || '').trim();
  if (!key) return [];
  const url = new URL('https://www.flickr.com/services/rest/');
  url.search = new URLSearchParams({ method: 'flickr.photos.search', api_key: key, text: query, safe_search: '1', content_type: '1', license: Object.keys(FLICKR_LICENSES).join(','), media: 'photos', per_page: '20', extras: 'description,license,url_m,url_z,owner_name', format: 'json', nojsoncallback: '1' }).toString();
  const data = await getJson(url);
  return (data.photos && data.photos.photo || []).map((x) => ({
    title: cleanText(x.title), description: cleanText(x.description && x.description._content),
    thumbnail: x.url_z || x.url_m || '',
    url: 'https://www.flickr.com/photos/' + x.owner + '/' + x.id,
    license: FLICKR_LICENSES[x.license] || 'See source page', author: cleanText(x.ownername), provider: 'Flickr',
  }));
}

const PROVIDERS = [
  ['Wikimedia Commons', wikimedia],
  ['Openverse', openverse],
  ['Pixabay', pixabay],
  ['Pexels', pexels],
  ['Flickr', flickr],
];
async function searchProviders(providerQuery, query, context) {
  const settled = await Promise.all(PROVIDERS.map(async ([name, search]) => {
    try {
      const candidates = await Promise.race([
        search(providerQuery),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Provider timeout')), 5500)),
      ]);
      return { name, results: rankAndFilter(candidates, query, context) };
    } catch (error) {
      return { name, results: [], error: name + ': ' + (error.message || 'unavailable') };
    }
  }));
  const combined = settled.flatMap((entry) => entry.results.map((item) => Object.assign({}, item, { _provider: entry.name })));
  return { settled, ranked: rankAndFilter(combined, query, context) };
}
// The AI step has its own daily site cap so a busy day cannot run up a bill.
async function judgeWithinCap(candidates, ctx) {
  try {
    const cap = await Quota.rateLimitShared('media:ai:site', Math.max(1, parseInt(process.env.IMAGE_AI_DAILY, 10) || 400), 24 * 60 * 60 * 1000);
    if (!cap.ok) return null;
  } catch (e) { return null; }
  return Judge.rerank(candidates, ctx);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'method', message: 'Use GET.' });
  }
  const me = req.headers.authorization ? await A.authed(req).catch(() => null) : null;
  if (!me) return sendJson(res, 401, { error: 'account', message: 'Create a free account or sign in to search for images and videos.' });
  const raw = String(req.query && req.query.q || '').replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 320);
  const query = keywords(raw, 8);
  const rawContext = String(req.query && req.query.context || '').replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const topic = String(req.query && req.query.topic || '').replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  const context = keywords(rawContext, 3);
  const lessonContext = keywords([rawContext, topic].filter(Boolean).join(' '), 8);\n  const providerQuery = keywords([raw, rawContext, topic].filter(Boolean).join(' '), 8);
  const type = req.query && req.query.type === 'video' ? 'video' : 'image';
  if (query.length < 2) return sendJson(res, 400, { error: 'query', message: 'Enter a topic with at least two characters.' });
  try {
    const limit = await Quota.rateLimitShared('media:' + Quota.subjectFor(me, clientIp(req)), 20, 10 * 60 * 1000);
    if (!limit.ok) return sendJson(res, 429, { error: 'rate', message: 'Please wait a few minutes before searching again.' }, { 'Retry-After': String(limit.retryAfter) });
  } catch (e) { return sendJson(res, 503, { error: 'protection_unavailable', message: 'Search is temporarily unavailable. Please try again shortly.' }); }
  const key = (type === 'image' ? 'image-relevance-v4:' : 'video:') + query + (context ? '|context:' + context : '') + (topic ? '|topic:' + keywords(topic, 6) : '');
  const hit = cached(key);
  if (hit) return sendJson(res, 200, hit);
  const searchUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query + ' educational');
  try {
    if (type === 'video') {
      const apiKey = String(process.env.YOUTUBE_API_KEY || '').trim();
      if (!apiKey) return sendJson(res, 200, { type, query, results: [], searchUrl, provider: 'youtube-search' });
      let cap = { ok: true };
      try { cap = await Quota.rateLimitShared('media:yt:site', Math.max(1, parseInt(process.env.YOUTUBE_SEARCHES_DAILY, 10) || 80), 24 * 60 * 60 * 1000); } catch (e) { cap = { ok: false }; }
      if (!cap.ok) return sendJson(res, 200, { type, query, results: [], searchUrl, provider: 'youtube-search' });
      const url = new URL('https://www.googleapis.com/youtube/v3/search');
      url.search = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '8', safeSearch: 'strict', q: query + ' educational', key: apiKey }).toString();
      const data = await getJson(url);
      const results = (data.items || []).map((item) => ({
        title: item.snippet && item.snippet.title || 'Educational video',
        description: item.snippet && item.snippet.description || '',
        channel: item.snippet && item.snippet.channelTitle || '',
        thumbnail: item.snippet && item.snippet.thumbnails && (item.snippet.thumbnails.medium || item.snippet.thumbnails.default) && (item.snippet.thumbnails.medium || item.snippet.thumbnails.default).url || '',
        url: 'https://www.youtube.com/watch?v=' + encodeURIComponent(item.id.videoId),
      }));
      const out = { type, query, results, searchUrl, provider: 'youtube' };
      if (results.length) remember(key, out);
      return sendJson(res, 200, out);
    }

    // Providers run concurrently: a slow primary source must not consume the browser's entire request budget before fallback
    // sources get a chance. One poor result set never stops the others from being consulted.
    let { settled, ranked } = await searchProviders(providerQuery, query, lessonContext);
    // The AI re-ranker reads the lesson context and keeps only candidates that really fit. When it is off or unavailable the
    // keyword ranking stands, so a failure here never costs the teacher their images.
    let ranking = 'keyword';
    if (Judge.enabled() && ranked.length) {
      const ctx = { subject: rawContext, cls: '', topic, query: raw };
      let judged = await judgeWithinCap(ranked, ctx);
      if (judged && !judged.results.length && judged.betterQuery) {
        const retry = await searchProviders(keywords([judged.betterQuery, rawContext, topic].filter(Boolean).join(' '), 8), keywords(judged.betterQuery, 8) || query, lessonContext);
        settled = settled.concat(retry.settled);
        if (retry.ranked.length) judged = await judgeWithinCap(retry.ranked, Object.assign({}, ctx, { query: judged.betterQuery }));
        else judged = { results: [] };
      }
      if (judged) { ranked = judged.results; ranking = 'ai'; }
    }
    const results = ranked.map((item) => {
      const out = Object.assign({}, item);
      delete out._provider; delete out.aiScore;
      return out;
    });
    const providersWithResults = [...new Set(ranked.map((item) => item._provider))];
    const errors = settled.filter((entry) => entry.error).map((entry) => entry.error);
    const out = {
      type, query, context, results, ranking,
      provider: providersWithResults[0] || 'none',
      providersTried: [...new Set(settled.map((entry) => entry.name))],
      message: results.length ? undefined : 'No sufficiently relevant images were found. Try a more specific concept.',
    };
    if (providersWithResults.length > 1) out.additionalProviders = providersWithResults.slice(1);
    if (errors.length) out.providerWarnings = errors;
    if (errors.length === settled.length) out.unreachable = true;
    if (results.length || !errors.length) remember(key, out);   // a failed search must not be remembered for a day
    return sendJson(res, 200, out);
  } catch (error) {
    return sendJson(res, 502, { error: 'search_failed', message: error.message || 'Media search failed.' });
  }
};

module.exports._test = { terms, stem, keywords, relevance, relevant, rankAndFilter, dedupe, FLICKR_LICENSES };
