'use strict';

// Curriculum Intelligence Engine v1.
// It turns the server-side scheme record into a strict, inspectable teaching contract.
// The scheme is a planning record, not proof that the complete official curriculum text
// or its exemplars have been retrieved.
const OFFICIAL = require('./_curriculum_index');
const SUBJECT_ALIAS = { 'Integrated Science': 'Science', 'General Science': 'Science' };

/* Official NaCCA record for one indicator code (statement, content standard, exemplars), or null when it is not loaded. */
function officialFor(subject, code) {
  const hit = code && OFFICIAL.indicators[(SUBJECT_ALIAS[subject] || subject) + '|' + code];
  return hit ? { statement: hit[0], standardCode: hit[1], standard: hit[2], substrand: hit[3], strand: hit[4], exemplars: hit[5] } : null;
}

function codeFrom(text) {
  const match = String(text || '').match(/\b((?:B[1-9]|SHS[1-3])(?:\.\d+){2,5})\b/i);
  return match ? match[1].toUpperCase() : '';
}

function classifyCode(code) {
  const clean = String(code || '').trim().toUpperCase();
  if (!/^(?:B[1-9]|SHS[1-3])(?:\.\d+){2,5}$/.test(clean)) return 'unknown';
  // A content-standard code ends at the standard level; an indicator adds one segment.
  return clean.split('.').length >= 5 ? 'indicator' : 'content_standard';
}

function indicatorsFor(scheme) {
  return (scheme && Array.isArray(scheme.indicators) ? scheme.indicators : []).map((text) => ({
    text: String(text),
    code: codeFrom(text),
    codeType: classifyCode(codeFrom(text)),
  }));
}

function buildInstruction(scheme, request) {
  if (scheme && scheme.type === 'revision') {
    const topics = Array.isArray(scheme.topics) ? scheme.topics : [];
    return [
      '## Curriculum Intelligence Engine — revision scope',
      'This is a revision week. Do not introduce new curriculum content or invent a new indicator.',
      'Use only the previously taught topics supplied by the scheme record:',
      ...(topics.length ? topics.map((topic) => '- ' + topic) : ['- No previous topics are listed in the loaded scheme record.']),
      'Build retrieval practice, explanation checks and application tasks from these topics. Clearly label this as revision, not new teaching.',
      'Do not fabricate official exemplars, textbook references, page numbers or claims that external resources were retrieved.'
    ].join('\\n');
  }
  if (!scheme || scheme.type !== 'teach') {
    return [
      '## Curriculum integrity',
      'No teaching indicator was resolved from the server-side scheme for this request.',
      'Do not invent a curriculum indicator, content standard, strand, sub-strand, or exemplar.',
      'If the teacher supplied a topic, explain it as a teacher-supplied topic and clearly distinguish it from verified curriculum alignment.',
    ].join('\n');
  }

  const r = request || {};
  const indicators = indicatorsFor(scheme);
  const lines = [
    '## Curriculum Intelligence Engine — resolved planning context',
    'Use this server-resolved scheme record as the scope boundary for the requested teaching material.',
    'Class: ' + (r.cls || 'Not supplied'),
    'Subject: ' + (r.subject || 'Not supplied'),
    'Term: ' + (scheme.term || 'Not supplied') + '; week: ' + (r.week || 'Not supplied'),
    'Strand: ' + (scheme.strand || 'Not supplied'),
    'Sub-strand: ' + (scheme.substrand || 'Not supplied'),
    'Content standard: ' + (scheme.standard || 'Not supplied'),
    'Indicator(s):',
  ];
  const official = [];
  if (indicators.length) {
    indicators.forEach((item) => {
      lines.push('- ' + item.text + (item.code ? ' [' + item.codeType + ': ' + item.code + ']' : ' [code not parsed]'));
      const rec = officialFor(r.subject, item.code);
      if (rec && rec.exemplars.length) official.push({ code: item.code, rec });
    });
  } else {
    lines.push('- No indicator is present in the loaded scheme record.');
  }
  official.forEach(({ code, rec }) => {
    lines.push('Official NaCCA exemplars for ' + code + ' (' + rec.standardCode + ' ' + rec.standard + '):');
    rec.exemplars.slice(0, 8).forEach((text) => lines.push('  - ' + text));
  });
  if (official.length) lines.push('The exemplars above are the official curriculum exemplars loaded for this indicator. Use them to shape the activities and questions; you may cite them as NaCCA exemplars, but do not add exemplars that are not listed.');
  if (scheme.part && Array.isArray(scheme.part)) {
    lines.push('Pacing boundary: this is part ' + scheme.part[0] + ' of ' + scheme.part[1] + '. Teach only the appropriate progression for this week; do not repeat or prematurely cover the whole sequence.');
  }
  lines.push(
    'Important distinction: a content standard describes the broader expected learning; an indicator is the specific teachable expectation. Do not present a content-standard code as though it were an indicator.',
    'First derive 3–5 measurable learning objectives directly from the selected indicator verbs and concepts. Then create a concise content outline that maps each section to one or more objectives. Every explanation, example, activity and assessment item must support those objectives.',
    'Teach the indicator, not merely the broad topic. Do not add unrelated subtopics to make the notes longer.',
    'Use age-appropriate language for the stated class and examples familiar to Ghanaian learners. Explain technical words before using them repeatedly.',
    'Do not fabricate official curriculum exemplars, core competencies, textbook quotations, page numbers, citations, or claims that external resources were retrieved. The loaded record contains scheme metadata and indicator text only; it is not the complete official curriculum document.',
    'If the requested topic conflicts with the resolved indicator, prioritize the indicator and clearly flag the mismatch rather than silently blending them.',
    'Before finalizing, check that each objective is taught, each assessment question measures a taught objective, and no unsupported curriculum code or source claim appears.'
  );
  if (r.mode === 'resources' && r.resourceType === 'Study notes') {
    lines.push('Study-note structure: title and curriculum context; learning objectives; key vocabulary; clear topic sections with explanations; worked/local examples; a labelled diagram only where it improves understanding; short learner activity; summary; progressive review questions; answer guide.');
  }
  return lines.join('\n');
}

module.exports = { codeFrom, classifyCode, indicatorsFor, officialFor, buildInstruction };
