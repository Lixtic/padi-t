"""Imports a Schemes of Learning .docx into data/schemes.json.

Usage:  python3 scripts/import-schemes.py path/to/schemes.docx [subject]
Reads one table per class, for any class from Basic 1 to Basic 9 and SHS 1 to SHS 3. Columns are found by their names:
Week, Strand, Sub-Strand, Content Standard (or Learning Outcome) and Indicator (or "Learning Indicator", "Indicator & Focus").
Only Week and Indicator are required. Each table is preceded by a heading that starts with the class, for example
"Basic 7 (JHS 1) - Computing", "Basic 2 - Our World Our People", "B4" or "SHS 1 - General Science", or just the class.
When the heading has no subject, the subject comes from the [subject] argument or from a "Subject: ..." line in the document.
The subject must be one GuidEd offers at that level (see api/_levels.js), otherwise the import stops and says which.
Rows with no strand are kept as they are: the planner then asks the model to match the NaCCA strand to the indicator code.
Subjects already in data/schemes.json are replaced one class at a time. Then run:  node scripts/build-schemes.js
Personal details in the document (teacher, school) are never stored.
"""
import json, os, re, sys
from docx import Document

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'data', 'schemes.json')

# Names used in schemes -> the name in the GuidEd subject list. LEVEL_ALIASES win over ALIASES for classes at that level.
LEVEL_ALIASES = {
    'lower': {'creative arts': 'Creative Arts', 'creative arts and design': 'Creative Arts', 'creative art': 'Creative Arts', 'physical education': 'Physical Education',
              'physical education and health': 'Physical Education', 'our world our people': 'Our World Our People', 'our world and our people': 'Our World Our People',
              'owop': 'Our World Our People', 'literacy': 'English Language', 'numeracy': 'Mathematics', 'ict': 'Computing'},
    'upper': {'creative arts': 'Creative Arts', 'creative arts and design': 'Creative Arts', 'creative art': 'Creative Arts', 'physical education': 'Physical Education',
              'physical education and health': 'Physical Education', 'our world our people': 'Our World Our People', 'our world and our people': 'Our World Our People',
              'owop': 'Our World Our People', 'science': 'Science', 'history': 'History', 'history of ghana': 'History', 'ict': 'Computing'},
    'jhs': {'science': 'Integrated Science', 'ict': 'Computing'},
    'shs': {'general science': 'General Science', 'core science': 'General Science', 'science': 'General Science', 'integrated science': 'General Science',
            'core mathematics': 'Mathematics', 'mathematics (core)': 'Mathematics', 'english': 'English Language', 'social studies': 'Social Studies'},
}
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

def level_of(cls):
    n = int(cls.split()[-1])
    if cls.startswith('SHS'): return 'shs'
    return 'lower' if n <= 3 else 'upper' if n <= 6 else 'jhs'

def norm_class(text):
    """'Basic 7 (JHS 1)' -> 'Basic 7', 'B4' -> 'Basic 4', 'SHS 2' -> 'SHS 2'. None when it is not a class heading."""
    m = re.match(r'\s*(?:(SHS|Senior High(?: School)?)\s*-?\s*(\d)\b|(?:Basic|B|P|Primary)\s*-?\s*(\d)\b)', text, re.I)
    if not m: return None
    if m.group(2): return 'SHS ' + m.group(2) if m.group(2) in '123' else None
    n = int(m.group(3))
    return 'Basic %d' % n if 1 <= n <= 9 else None

def resolve_subject(name, cls):
    n = re.sub(r'\s+', ' ', name.strip().lower())
    return LEVEL_ALIASES[level_of(cls)].get(n) or ALIASES.get(n)

def offered(cls):
    """The subjects GuidEd offers at this class's level, read from api/_levels.js so the two never disagree."""
    import subprocess
    out = subprocess.check_output(['node', '-e', "const L=require('./api/_levels.js');console.log(JSON.stringify(L.levelOfClass(process.argv[1])))", cls], cwd=ROOT)
    return set(json.loads(out)['subjects'])

COLS = {'week': ('week',), 'strand': ('strand',), 'substrand': ('sub-strand', 'substrand', 'sub strand'),
        'standard': ('content standard', 'learning outcome', 'standard'), 'indicator': ('indicator',)}

def find_cols(header):
    """Maps each field to a column index by its heading text. Week and indicator are required."""
    cols = {}
    for i, h in enumerate(x.strip().lower() for x in header):
        for key, names in COLS.items():
            if key not in cols and any(n in h for n in names) and not (key == 'strand' and 'sub' in h):
                cols[key] = i
    if 'week' not in cols or 'indicator' not in cols:
        sys.exit('Cannot find the Week and Indicator columns in: ' + ' | '.join(header))
    return cols

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
    heads = [p.text.strip() for p in doc.paragraphs if norm_class(p.text) and (p.style.name.startswith('Heading') or p.style.name == 'Title' or len(p.text.strip()) < 70)]
    if len(heads) != len(doc.tables):
        sys.exit('Found %d class headings but %d tables. Check the document.' % (len(heads), len(doc.tables)))
    data = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {'subjects': {}}
    base = re.sub(r'^[0-9a-f]{8}-', '', os.path.splitext(os.path.basename(path))[0]).replace('_', ' ')
    touched = {}
    for head, table in zip(heads, doc.tables):
        cls = norm_class(head)
        rest = re.sub(r'^\s*(?:(?:SHS|Senior High(?: School)?)\s*-?\s*\d|(?:Basic|B|P|Primary)\s*-?\s*\d)\b', '', head, flags=re.I)
        name = (re.split(r'\s[-–—:]\s|^[-–—:]\s*', rest, maxsplit=1)[-1] if re.search(r'[-–—:]', rest) else (subject_arg or doc_subject)).strip()
        name = re.sub(r'\(.*?\)', '', name).strip()
        subject = resolve_subject(name, cls)
        if not subject: sys.exit('Unknown or missing subject (%r) for %s. Pass it as the second argument.' % (name, cls))
        if subject not in offered(cls): sys.exit('%s is not one of the subjects GuidEd offers for %s. Check the name, or add it in api/_levels.js first.' % (subject, cls))
        rows = [[c.text for c in r.cells] for r in table.rows]
        col = find_cols(rows[0])
        cell = lambda r, k: r[col[k]] if k in col and col[k] < len(r) else ''
        entries = []
        for r in rows[1:]:
            if not any(x.strip() for x in r): continue
            strand, sub, std = clean(cell(r, 'strand')), clean(cell(r, 'substrand')), clean(cell(r, 'standard'))
            inds = [x for x in (clean(x) for x in cell(r, 'indicator').split('\n')) if x]
            kind = kind_of(strand, inds[0] if inds else '')
            e = {'weeks': weeks_of(cell(r, 'week')), 'type': kind, 'strand': strand, 'substrand': sub, 'standard': std, 'indicators': inds}
            if kind in ('revision', 'exam') and not strand and inds:     # "Revision of Basic 7 Concepts" is a focus, not an indicator
                e['focus'] = inds[0]; e['indicators'] = []
            if not e['weeks']: sys.exit('A row in the %s %s table has no week number: %r' % (cls, subject, r[:2]))
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
