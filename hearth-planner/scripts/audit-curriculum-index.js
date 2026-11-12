'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'curriculum-index.json');
const FLAGS = [
  ['embedded_exemplar_label', /exemplar\s*\(s?\)\s*:/i],
  ['embedded_section_heading', /content\s+indicators?|core\s+competencies|curriculum\s+indicators/i],
  ['competency_code_in_content', /\b(?:CC|CI|CP)\d+\.\d+\b/i],
  ['document_control_text', /critical\s+thinking|communication\s+and\s+collaboration/i],
  ['repeated_whitespace_or_punctuation', /(?:\s{3,}|(?:\b\w+\b)(?:\s+\1){2,})/i]
];

function audit(data) {
  const records = Object.entries((data && data.indicators) || {});
  const bySubject = {};
  const issues = [];
  const seen = new Set();

  for (const [key, value] of records) {
    const parts = key.split('|');
    const subject = parts[0] || 'Unknown';
    const code = parts[1] || '';
    const row = bySubject[subject] || (bySubject[subject] = {
      records: 0, missingIndicator: 0, missingStandardCode: 0,
      missingStandard: 0, missingStrand: 0, missingSubstrand: 0,
      missingExemplars: 0, suspiciousRecords: 0
    });
    row.records++;

    const fields = Array.isArray(value) ? value : [];
    const [indicator, standardCode, standard, substrand, strand, exemplars] = fields;
    const recordIssues = [];
    if (!String(indicator || '').trim()) { row.missingIndicator++; recordIssues.push('missing_indicator'); }
    if (!String(standardCode || '').trim()) { row.missingStandardCode++; recordIssues.push('missing_standard_code'); }
    if (!String(standard || '').trim()) { row.missingStandard++; recordIssues.push('missing_standard'); }
    if (!String(strand || '').trim()) { row.missingStrand++; recordIssues.push('missing_strand'); }
    if (!String(substrand || '').trim()) { row.missingSubstrand++; recordIssues.push('missing_substrand'); }
    if (!Array.isArray(exemplars) || !exemplars.some(x => String(x || '').trim())) {
      row.missingExemplars++;
      recordIssues.push('missing_exemplars');
    }

    const normalizedCode = code.toUpperCase();
    if (normalizedCode && seen.has(subject + '|' + normalizedCode)) recordIssues.push('duplicate_key');
    if (normalizedCode) seen.add(subject + '|' + normalizedCode);

    const searchable = [indicator, standard, substrand, strand, ...(Array.isArray(exemplars) ? exemplars : [])].join(' ');
    for (const [flag, pattern] of FLAGS) {
      if (pattern.test(searchable)) recordIssues.push(flag);
    }
    if (recordIssues.length) {
      row.suspiciousRecords++;
      issues.push({
        key,
        subject,
        indicator: String(indicator || '').slice(0, 240),
        issues: [...new Set(recordIssues)]
      });
    }
  }

  return {
    source: data && data.source || null,
    exportedAt: data && data.exportedAt || null,
    declaredCount: Number(data && data.count) || 0,
    actualCount: records.length,
    countMatches: Number(data && data.count) === records.length,
    subjects: bySubject,
    totals: Object.values(bySubject).reduce((sum, row) => {
      for (const key of Object.keys(row)) sum[key] = (sum[key] || 0) + row[key];
      return sum;
    }, {}),
    issues
  };
}

function markdown(report) {
  const lines = [
    '# CCP curriculum index audit',
    '',
    '- Export date: ' + (report.exportedAt || 'not recorded'),
    '- Source: ' + (report.source || 'not recorded'),
    '- Declared records: ' + report.declaredCount,
    '- Actual records: ' + report.actualCount,
    '- Count matches: ' + (report.countMatches ? 'yes' : 'NO'),
    '',
    '## Subject coverage',
    '',
    '| Subject | Records | Missing indicator | Missing standard | Missing strand | Missing sub-strand | Missing exemplars | Flagged records |',
    '|---|---:|---:|---:|---:|---:|---:|---:|'
  ];
  for (const [subject, row] of Object.entries(report.subjects).sort((a,b) => a[0].localeCompare(b[0]))) {
    lines.push('| ' + subject + ' | ' + row.records + ' | ' + row.missingIndicator + ' | ' +
      row.missingStandard + ' | ' + row.missingStrand + ' | ' + row.missingSubstrand + ' | ' +
      row.missingExemplars + ' | ' + row.suspiciousRecords + ' |');
  }
  lines.push('', '## Flagged records', '');
  for (const issue of report.issues.slice(0, 100)) {
    lines.push('- **' + issue.key + '** — ' + issue.issues.join(', ') +
      (issue.indicator ? ': ' + issue.indicator.replace(/\s+/g, ' ') : ''));
  }
  if (report.issues.length > 100) lines.push('', 'Showing first 100 of ' + report.issues.length + ' flagged records.');
  lines.push('', '> Flags are heuristic review signals, not automatic proof that a curriculum record is incorrect. Do not auto-delete or rewrite official source text.');
  return lines.join('\n') + '\n';
}

if (require.main === module) {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const report = audit(data);
  process.stdout.write(markdown(report));
  if (!report.countMatches) process.exitCode = 1;
}

module.exports = { audit, markdown };
