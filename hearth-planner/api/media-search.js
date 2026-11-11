'use strict';
// Public educational media discovery. Images come from Wikimedia Commons;
// videos use YouTube Data API when configured and otherwise a safe YouTube search link.
const { sendJson, clientIp } = require('./_lib');
const Quota = require('./_quota');
const A = require('./_auth');

// Search engines match on a few words, not a paragraph: keep the first meaningful words only.
const STOP = new Set('the and for with from that this into are was were has have had can will their them they its his her our your you who what when where which how why not but all any each some such than then also about over under between using use used make makes made given able learners learner pupils pupil students student should would could examine examines examined demonstrate demonstrates demonstrated identify identifies identified describe describes described explain explains explained explore explores explored create creates created design designs designed compare compares compared discuss discusses discussed analyse analyzes analyze apply applies applied evaluate evaluates evaluated construct constructs constructed develop develops developed investigate investigates investigated understand understands understanding learn learns learning lesson lessons basic jhs shs'.split(' '));
function keywords(q, max) {
  const seen = new Set(), out = [];
  for (const w of q.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f\s-]/g, ' ').split(/\s+/)) {
    if (w.length < 3 || STOP.has(w) || seen.has(w)) continue;
    seen.add(w); out.push(w); if (out.length >= max) break;
  }
  return out.join(' ');
}

// Same search within a day is answered from memory (per server instance), so repeats cost no API quota.
const CACHE = new Map(), TTL = 24 * 60 * 60 * 1000;
const cached = (k) => { const h = CACHE.get(k); if (h && Date.now() - h.at < TTL) return h.data; CACHE.delete(k); return null; };
function remember(k, data) {
  if (CACHE.size >= 300) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(k, { at: Date.now(), data });
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
  const type = req.query && req.query.type === 'video' ? 'video' : 'image';
  if (query.length < 2) return sendJson(res, 400, { error: 'query', message: 'Enter a topic with at least two characters.' });
  try {
    const limit = await Quota.rateLimitShared('media:' + Quota.subjectFor(me, clientIp(req)), 20, 10 * 60 * 1000);
    if (!limit.ok) return sendJson(res, 429, { error: 'rate', message: 'Please wait a few minutes before searching again.' }, { 'Retry-After': String(limit.retryAfter) });
  } catch (e) { return sendJson(res, 503, { error: 'protection_unavailable', message: 'Search is temporarily unavailable. Please try again shortly.' }); }
  const hit = cached(type + ':' + query);
  if (hit) return sendJson(res, 200, hit);
  const searchUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query + ' educational');
  try {
    if (type === 'video') {
      const key = String(process.env.YOUTUBE_API_KEY || '').trim();
      if (!key) return sendJson(res, 200, { type, query, results: [], searchUrl, provider: 'youtube-search' });
      // Each YouTube search costs 100 of the 10,000 daily quota units: stop at a site-wide daily cap and hand over the plain search link instead.
      let cap = { ok: true };
      try { cap = await Quota.rateLimitShared('media:yt:site', Math.max(1, parseInt(process.env.YOUTUBE_SEARCHES_DAILY, 10) || 80), 24 * 60 * 60 * 1000); } catch (e) { cap = { ok: false }; }
      if (!cap.ok) return sendJson(res, 200, { type, query, results: [], searchUrl, provider: 'youtube-search' });
      const url = new URL('https://www.googleapis.com/youtube/v3/search');
      url.search = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '8', safeSearch: 'strict', q: query + ' educational', key }).toString();
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Video search is temporarily unavailable.');
      const data = await response.json();
      const results = (data.items || []).map((item) => ({
        title: item.snippet && item.snippet.title || 'Educational video',
        description: item.snippet && item.snippet.description || '',
        channel: item.snippet && item.snippet.channelTitle || '',
        thumbnail: item.snippet && item.snippet.thumbnails && (item.snippet.thumbnails.medium || item.snippet.thumbnails.default) && (item.snippet.thumbnails.medium || item.snippet.thumbnails.default).url || '',
        url: 'https://www.youtube.com/watch?v=' + encodeURIComponent(item.id.videoId),
      }));
      const out = { type, query, results, searchUrl, provider: 'youtube' };
      if (results.length) remember(type + ':' + query, out);
      return sendJson(res, 200, out);
    }
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.search = new URLSearchParams({
      action: 'query', generator: 'search', gsrsearch: 'filetype:bitmap ' + query,
      gsrnamespace: '6', gsrlimit: '12', prop: 'imageinfo', iiprop: 'url|extmetadata',
      iiurlwidth: '640', format: 'json', origin: '*',
    }).toString();
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'GuidEd/1.0 (educational media search)' } });
    if (!response.ok) throw new Error('Image search is temporarily unavailable.');
    const data = await response.json();
    const pages = Object.values(data.query && data.query.pages || {});
    const results = pages.map((page) => {
      const info = page.imageinfo && page.imageinfo[0] || {};
      const meta = info.extmetadata || {};
      return {
        title: String(page.title || '').replace(/^File:/, ''),
        thumbnail: info.thumburl || info.url || '',
        url: info.descriptionurl || info.url || '',
        license: meta.LicenseShortName && meta.LicenseShortName.value || 'See source page',
        author: meta.Artist && String(meta.Artist.value).replace(/<[^>]*>/g, '') || '',
      };
    }).filter((item) => item.thumbnail && item.url);
    const out = { type, query, results, provider: 'wikimedia-commons' };
    if (results.length) remember(type + ':' + query, out);
    return sendJson(res, 200, out);
  } catch (error) {
    return sendJson(res, 502, { error: 'search_failed', message: error.message || 'Media search failed.' });
  }
};
