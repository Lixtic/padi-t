'use strict';
// Examiner insights for the BECE practice section. Data: data/exam-insights.json (summarised from the WAEC Chief Examiners' reports).
const DATA = require('../data/exam-insights.json');

/* Lines added to the first message when BECE practice is on for a JHS class. Empty for other levels or subjects. */
function lines(subject, cls) {
  if (!/^Basic\s*[789]$/i.test(String(cls || '').trim())) return [];
  const s = DATA.subjects[subject];
  if (!s) return [];
  const list = (a) => a.join('; ');
  const out = [
    'Examiner insights (BECE ' + DATA.years.join(' and ') + ' Chief Examiners\' reports, use to shape the BECE Practice questions, never quote them or copy WAEC questions): ',
    '- Paper format: ' + s.format
  ];
  if (s.repeated && s.repeated.length) out.push('- Flagged as weak in both years, so give these the most weight when they fit this week\'s topic: ' + list(s.repeated));
  out.push(
    '- Candidates found these hard in 2025, so include at least one question or part on a listed area when it fits this week\'s topic: ' + list(s.weak),
    '- Also weak in 2024: ' + list(s.weak2024 || []),
    '- Candidates did well on: ' + list(s.strong) + ' (do not over-weight these).',
    '- Marking guide: ' + s.tip
  );
  return out;
}
module.exports = { lines, DATA };
