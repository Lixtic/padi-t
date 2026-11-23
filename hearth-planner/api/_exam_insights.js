'use strict';
// Examiner insights for the BECE practice section. Data: data/exam-insights.json (summarised from the WAEC Chief Examiners' reports).
const DATA = require('../data/exam-insights.json');

/* Lines added to the first message when BECE practice is on for a JHS class. Empty for other levels or subjects. */
function lines(subject, cls) {
  if (!/^Basic\s*[789]$/i.test(String(cls || '').trim())) return [];
  const s = DATA.subjects[subject];
  if (!s) return [];
  const list = (a) => a.join('; ');
  return [
    'Examiner insights (BECE ' + DATA.year + ' Chief Examiners\' reports, use to shape the BECE Practice questions, never quote them or copy WAEC questions): ',
    '- Paper format: ' + s.format,
    '- Candidates found these hard, so include at least one question or part on a listed area when it fits this week\'s topic: ' + list(s.weak),
    '- Candidates did well on: ' + list(s.strong) + ' (do not over-weight these).',
    '- Marking guide: ' + s.tip
  ];
}
module.exports = { lines, DATA };
