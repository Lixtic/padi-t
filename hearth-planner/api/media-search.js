'use strict';
// Public educational media discovery. Images come from Wikimedia Commons;
// videos use YouTube Data API when configured and otherwise a safe YouTube search link.
const { sendJson, rateLimit, clientIp } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'method', message: 'Use GET.' });
  }
  const query = String(req.query && req.query.q || '').replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 320);
  const type = req.query && req.query.type === 'video' ? 'video' : 'image';
  if (query.length < 2) return sendJson(res, 400, { error: 'query', message: 'Enter a topic with at least two characters.' });
  const limit = rateLimit('media:' + clientIp(req), 30, 10 * 60 * 1000);
  if (!limit.ok) return sendJson(res, 429, { error: 'rate', message: 'Please wait before searching again.' });
  const searchUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query + ' educational');
  try {
    if (type === 'video') {
      const key = String(process.env.YOUTUBE_API_KEY || '').trim();
      if (!key) return sendJson(res, 200, { type, query, results: [], searchUrl, provider: 'youtube-search' });
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
      return sendJson(res, 200, { type, query, results, searchUrl, provider: 'youtube' });
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
    return sendJson(res, 200, { type, query, results, provider: 'wikimedia-commons' });
  } catch (error) {
    return sendJson(res, 502, { error: 'search_failed', message: error.message || 'Media search failed.' });
  }
};
