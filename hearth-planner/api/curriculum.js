'use strict';

const Schemes = require('./_schemes');
const Curriculum = require('./_curriculum');
const { sendJson, clientIp, rateLimit } = require('./_lib');

// GET /api/curriculum?subject=Computing&cls=Basic%207&term=1&week=2
// Returns the server-owned curriculum/scheme context for the Teaching Studio.
module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'method', message: 'Use GET.' });
  }
  const limit = rateLimit('curriculum:' + clientIp(req), 90, 10 * 60 * 1000);
  if (!limit.ok) return sendJson(res, 429, { error: 'rate', message: 'Please wait before requesting curriculum details again.' });
  const q = req.query || {};
  const subject = String(q.subject || '').trim();
  const cls = String(q.cls || '').trim();
  const term = Number(q.term);
  const week = Number(q.week);
  if (!subject || !cls || ![1, 2, 3].includes(term) || !Number.isInteger(week) || week < 1 || week > 20) {
    return sendJson(res, 400, { error: 'params', message: 'Provide subject, class, term (1–3), and week (1–20).' });
  }
  const scheme = Schemes.lookup(subject, cls, term, week);
  if (!scheme) return sendJson(res, 404, { error: 'not_found', message: 'No scheme is loaded for this subject, class, term and week.' });
  return sendJson(res, 200, {
    class: cls, subject, week, term: scheme.term, type: scheme.type,
    strand: scheme.strand || '', substrand: scheme.substrand || '',
    contentStandard: scheme.standard || '',
    indicators: Curriculum.indicatorsFor(scheme).map((item) => { const rec = Curriculum.officialFor(subject, item.code); return rec ? Object.assign(item, { official: rec }) : item; }),
    pacing: scheme.part || null,
    sourceLabel: scheme.source || 'Unlabelled scheme record',
    sourceStatus: Curriculum.indicatorsFor(scheme).some((item) => Curriculum.officialFor(subject, item.code)) ? 'scheme_with_official_exemplars' : 'scheme_metadata_only',
    note: 'This response contains the loaded scheme metadata and indicator text. It does not claim that the complete official curriculum document, exemplars or reference textbooks have been retrieved.',
  });
};
