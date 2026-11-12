"""Replaces Terms 1 and 2 of the SHS 2 Social Studies scheme with the 2025 NaCCA Teacher Manual (data/shs2-social-studies.json).

Usage:  python3 scripts/import-shs2-social.py && node scripts/build-schemes.js
Manual weeks 1-12 (Semester 1) become Term 1 and weeks 13-24 (Semester 2) become Term 2. Each term then has a revision week and an
examination week, as the other schemes do. Term 3 is left as it was: the manual has no third semester. The manual gives no
indicator codes, so indicators are stored as the manual words them.
"""
import json, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SCHEMES = os.path.join(ROOT, 'data', 'schemes.json')
manual = json.load(open(os.path.join(ROOT, 'data', 'shs2-social-studies.json')))['weeks']
data = json.load(open(SCHEMES))
cls = data['subjects']['Social Studies']['classes']['SHS 2']
for term, first in (('1', 1), ('2', 13)):
    rows = []
    for w in range(1, 13):
        m = manual[str(first + w - 1)]
        rows.append({'weeks': [w], 'type': 'teach', 'strand': m['strand'], 'substrand': m['substrand'], 'standard': m['standard'],
                     'indicators': m['indicators'], 'focus': m['focus']})
    rows.append({'weeks': [13], 'type': 'revision', 'strand': '', 'substrand': '', 'standard': '', 'indicators': [], 'focus': 'Revision of the semester'})
    rows.append({'weeks': [14], 'type': 'exam', 'strand': 'Examination', 'substrand': '', 'standard': '', 'indicators': []})
    cls[term] = rows
json.dump(data, open(SCHEMES, 'w'), indent=1, ensure_ascii=False)
print('SHS 2 Social Studies Terms 1 and 2 written')
