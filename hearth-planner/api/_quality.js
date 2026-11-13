'use strict';

// Deterministic checks for generated teaching content. This is a structural
// gate, not a factuality detector or a substitute for source verification.
const CODE_RE = /\b(?:B[1-9]|SHS[1-3])(?:\.\d+){2,5}\b/gi;
const QUESTION_RE = /(?:\?|\b(?:explain|describe|identify|state|list|calculate|compare|give|name|define|demonstrate)\b)/i;

function add(items, severity, code, message) {
  items.push({ severity, code, message });
}
function hasHeading(text, pattern) {
  return pattern.test(text);
}
function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}
function normalizeResource(value) {
  return String(value || 'Study notes').toLowerCase().replace(/[-_]/g, ' ').trim();
}

function inspect(output, params, options) {
  const text = String(output || '').trim();
  const p = params || {};
  const opts = options || {};
  const issues = [];
  const checks = [];
  const check = (code, ok, message, severity) => {
    checks.push({ code, passed: !!ok });
    if (!ok) add(issues, severity || 'warning', code, message);
  };

  check('non_empty', text.length >= 120, 'The generated response is empty or unusually short.', 'blocking');
  check('not_truncated', !/<<SCHOOLPADI_ERROR>>|(?:\.\.\.|continued in the next response)/i.test(text),
    'The response appears to contain a generation error or truncation marker.', 'blocking');

  if (!text) return result(issues, checks);

  const mode = String(p.mode || 'full').toLowerCase();
  const resource = normalizeResource(p.resourceType);
  const planOnly = mode === 'plan';
  const resourceOnly = mode === 'resources';

  if (planOnly || (!resourceOnly && mode === 'full')) {
    check('lesson_metadata', hasHeading(text, /^#{1,3}\s+Lesson Metadata\b/im),
      'Lesson Metadata section is missing.', 'blocking');
    check('lesson_one', hasHeading(text, /^#{1,3}\s+Lesson 1\b/im),
      'Lesson 1 section is missing.', 'blocking');
    check('lesson_two', hasHeading(text, /^#{1,3}\s+Lesson 2\b/im),
      'Lesson 2 section is missing.', 'blocking');
    check('learning_objectives', countMatches(text, /Learning Objectives?/gi) >= (planOnly ? 2 : 2),
      'Learning objectives are missing from one or both lessons.', 'blocking');
    check('assessment', /assessment|exit ticket|check for understanding/i.test(text),
      'No clear assessment activity or evidence of learning was found.', 'warning');
    if (planOnly) check('assessment_rubric', /Assessment Rubric/i.test(text),
      'The lesson plan assessment rubric is missing.', 'warning');
  }

  if (resourceOnly || mode === 'full') {
    if (resource === 'study notes') {
      check('study_notes_heading', /^#{1,3}\s+Study Notes\b/im.test(text),
        'Study Notes heading is missing.', 'blocking');
      check('summary', /^#{1,4}\s+(?:Summary|Conclusion|What we have learnt)\b/im.test(text),
        'A learner-facing summary section was not found.', 'warning');
      check('review_questions', /review questions|revision questions|questions to answer|practice questions/i.test(text),
        'Review or practice questions were not found.', 'warning');
    } else if (resource.includes('worksheet') || resource.includes('homework') || resource.includes('practice')) {
      check('learner_instructions', /instructions|answer all|attempt all|write your answers/i.test(text),
        'Learner instructions are missing.', 'blocking');
      check('answer_key', /answer key|answers|marking guide|mark scheme|suggested answers/i.test(text),
        'An answer key or marking guide is missing.', 'blocking');
    } else if (resource.includes('slide')) {
      const slides = countMatches(text, /^##\s+Slide\s+\d+\s*:/gim);
      check('slide_count', slides >= 8 && slides <= 12,
        'Teaching slides should contain 8 to 12 numbered slides.', 'blocking');
    }
  }

  const objectives = countMatches(text, /\b(?:learning objectives?|by the end of the lesson)\b/gi);
  const questions = countMatches(text, /^\s*(?:\d+[.)]\s+|[-*]\s+).*(?:\?|(?:explain|describe|identify|state|list|calculate|compare|give|name|define)\b)/gim);
  check('objective_assessment_presence', objectives > 0 && (questions > 0 || QUESTION_RE.test(text)),
    'The response needs explicit objectives and learner questions/tasks that can assess them.', 'warning');

  const expected = new Set((p.scheme && Array.isArray(p.scheme.indicators) ? p.scheme.indicators : [])
    .map((entry) => String(entry).match(CODE_RE)?.[0]?.toUpperCase()).filter(Boolean));
  const foundCodes = [...new Set((text.match(CODE_RE) || []).map((code) => code.toUpperCase()))];
  const unexpected = foundCodes.filter((code) => expected.size && !expected.has(code));
  check('curriculum_code_scope', !unexpected.length,
    unexpected.length ? 'Curriculum codes appear that were not among the server-resolved indicators: ' + unexpected.join(', ') + '.' :
      'Curriculum codes are within the supplied indicator scope (or no codes were supplied).',
    'warning');

  const claimsOfficial = /\bofficial NaCCA (?:exemplar|indicator|reference|textbook)|verified NaCCA\b/i.test(text);
  const hasVerifiedEvidence = opts.curriculumVerified === true || Number(opts.verifiedCurriculumRecords) > 0;
  check('official_claims', !claimsOfficial || hasVerifiedEvidence,
    'The response makes an official/verified NaCCA claim, but this request has no verified curriculum provenance.',
    'blocking');

  const hasSourceSection = /^#{1,4}\s+(?:Sources|References)\b/im.test(text);
  const hasRetrievedSources = Number(opts.retrievedSourceCount) > 0;
  check('retrieved_source_citations', !hasRetrievedSources || hasSourceSection,
    'Retrieved source passages were supplied, but a Sources or References section is missing.',
    'warning');

  return result(issues, checks);
}

function result(issues, checks) {
  const blocking = issues.filter((x) => x.severity === 'blocking').length;
  const warnings = issues.filter((x) => x.severity === 'warning').length;
  return {
    status: blocking ? 'needs_revision' : warnings ? 'needs_review' : 'structural_checks_passed',
    blockingCount: blocking,
    warningCount: warnings,
    checks,
    issues,
    scope: 'Structural and consistency checks only. This result does not certify factual accuracy, pedagogical quality, or official curriculum alignment.'
  };
}

module.exports = { inspect, normalizeResource };