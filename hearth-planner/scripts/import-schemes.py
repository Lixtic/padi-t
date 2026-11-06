"""Imports a Schemes of Learning .docx into data/schemes.json.

Usage:  python3 scripts/import-schemes.py path/to/schemes.docx [subject]
Reads one table per class. Each table has the columns Week | Strand | Sub-Strand | Content Standard |
Indicator (or "Indicator & Focus"), and is preceded by a heading that starts with the class, for example
"Basic 7 (JHS 1) - Computing" or just "Basic 7 (JHS 1)". When the heading has no subject, the subject comes from the
[subject] argument or from a "Subject: ..." line in the document.
Rows with no strand are kept as they are: the planner then asks the model to match the NaCCA strand to the indicator code.
Subjects already in data/schemes.json are replaced one class at a time. Then run:  node scripts/build-schemes.js
Personal details in the document (teacher, school) are never stored.
"""
import json, os, re, sys
from docx import Document

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'data', 'schemes.json')

# Names used in schemes -> the name in the GuidEd subject list.
ALIASES = {
    'computing': 'Computing',
    'creative design / arts': 'Creative Arts and Design',
    'creative art and design': 'Creative Arts and Design',
    'creative arts': 'Creative Arts and Design',
    'creative arts and design': 'Creative Arts and Design',
    'english language': 'English Language',
    'english': 'English Language',
    'mathematics': 'Mathematics',
    'integrated science': 'Integrated Science',
    'social studies': 'Social Studies',
    'religious and moral education': 'Religious and Moral Education',
    'career technology': 'Career Technology',
    'ghanaian language': 'Ghanaian Language',
    'french': 'French',
    'physical education and health': 'Physical Education and Health',
}

def clean(s):
    s = re.sub(r'[ \t]+', ' ', (s or '').replace('\r', '')).strip()
    return '' if s in ('-', '–', '—') else s

def weeks_of(cell):
    nums = [int(n) for n in re.findall(r'\d+', cell)]
    if len(nums) == 2 and re.search(r'&|and|,', cell): return nums
    if len(nums) == 2 and '-' in cell: return list(range(nums[0], nums[1] + 1))
    return nums[:1]

def kind_of(strand, text):
    s = (strand or text).lower()
    if s.startswith('exam'): return 'exam'
    if s.startswith('revision') or s.startswith('end of term'): return 'revision'
    return 'teach'

def ordinal(n): return '%d%s' % (n, {1: 'st', 2: 'nd', 3: 'rd'}.get(n, 'th'))

def read_meta(doc):
    text = '\n'.join(p.text for p in doc.paragraphs)
    term = ''
    m = re.search(r'(\d+)(?:st|nd|rd|th) Term \((\d{4}/\d{2})\)', text)
    if m: term = '%s Term %s' % (ordinal(int(m.group(1))), m.group(2))
    else:
        m = re.search(r'^\s*Term:\s*(\d+)', text, re.M)
        if m: term = ordinal(int(m.group(1))) + ' Term'
    sm = re.search(r'^\s*Subject:\s*(.+)$', text, re.M)
    return term, (sm.group(1).strip() if sm else '')

def main(path, subject_arg=''):
    doc = Document(path)
    term, doc_subject = read_meta(doc)
    heads = [p.text.strip() for p in doc.paragraphs if re.match(r'Basic\s*\d', p.text.strip()) and p.style.name.startswith('Heading')]
    if len(heads) != len(doc.tables):
        sys.exit('Found %d class headings but %d tables. Check the document.' % (len(heads), len(doc.tables)))
    data = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {'subjects': {}}
    base = re.sub(r'^[0-9a-f]{8}-', '', os.path.splitext(os.path.basename(path))[0]).replace('_', ' ')
    touched = {}
    for head, table in zip(heads, doc.tables):
        m = re.match(r'Basic\s*(\d)\b(.*)$', head)
        if not m: sys.exit('Cannot read heading: ' + head)
        cls = 'Basic ' + m.group(1)
        rest = m.group(2)
        name = (rest.split('-', 1)[1] if '-' in rest else (subject_arg or doc_subject)).strip()
        subject = ALIASES.get(name.lower())
        if not subject: sys.exit('Unknown or missing subject (%r). Pass it as the second argument.' % name)
        rows = [[c.text for c in r.cells] for r in table.rows]
        h = [x.strip().lower() for x in rows[0][:5]]
        assert h[:4] == ['week', 'strand', 'sub-strand', 'content standard'] and h[4].startswith('indicator'), rows[0]
        entries = []
        for r in rows[1:]:
            strand, sub, std = clean(r[1]), clean(r[2]), clean(r[3])
            inds = [x for x in (clean(x) for x in r[4].split('\n')) if x]
            kind = kind_of(strand, inds[0] if inds else '')
            e = {'weeks': weeks_of(r[0]), 'type': kind, 'strand': strand, 'substrand': sub, 'standard': std, 'indicators': inds}
            if kind in ('revision', 'exam') and not strand and inds:     # "Revision of Basic 7 Concepts" is a focus, not an indicator
                e['focus'] = inds[0]; e['indicators'] = []
            entries.append(e)
        s = data['subjects'].setdefault(subject, {'classes': {}})
        s['classes'][cls] = entries
        s['term'] = term or s.get('term', ''); s['source'] = base
        touched.setdefault(subject, []).append(cls)
        print('%-26s %-8s %d rows' % (subject, cls, len(entries)))
    json.dump(data, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('Wrote', os.path.relpath(OUT), '|', term)

if __name__ == '__main__':
    if len(sys.argv) < 2: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else '')
