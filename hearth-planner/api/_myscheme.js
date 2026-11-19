'use strict';
// A teacher can plan from their own scheme of work. The browser sends the row for the chosen week; nothing in it is trusted:
// every field is re-built here with fixed types and length limits, and the plan is marked as teacher-supplied.
const MAX_TEXT = 300, MAX_IND = 12, MAX_TOPICS = 40;

const str = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT) : '');
const list = (v, max) => (Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, max) : []);

// raw: the object the browser sent as params.customScheme. Returns a scheme shaped like Schemes.lookup's result, or null.
function fromRequest(raw, term, week) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const weeks = (Array.isArray(raw.weeks) ? raw.weeks : []).map(Number).filter((w) => Number.isInteger(w) && w >= 1 && w <= 20).slice(0, 20);
  if (!weeks.includes(Number(week))) return null;                       // it must be the row for the week being planned
  const type = ['teach', 'revision', 'exam'].includes(raw.type) ? raw.type : 'teach';
  const out = {
    term: 'Term ' + term, termNo: Number(term), source: 'Teacher-supplied scheme of work', custom: true, weeks, type,
    strand: str(raw.strand), substrand: str(raw.substrand), standard: str(raw.standard), focus: str(raw.focus),
    indicators: list(raw.indicators, MAX_IND), topics: list(raw.topics, MAX_TOPICS),
  };
  if (raw.recall) out.recall = str(raw.recall);
  if (type === 'teach' && !out.strand && !out.focus && !out.indicators.length) return null;
  return out;
}

module.exports = { fromRequest };
