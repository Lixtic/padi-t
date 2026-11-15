"""Adds Kindergarten (KG 1 and KG 2) to data/schemes.json from the text of the official NaCCA Kindergarten Curriculum (2019).

Usage:  pdftotext KINDERGARTEN.pdf kg.txt        (or any text export of the PDF)
        python3 scripts/import-kindergarten.py kg.txt
        node scripts/build-schemes.js
The kindergarten curriculum is thematic: four learning areas (Language and Literacy, Numeracy, Our World and Our People,
Creative Arts) are taught together under seven themes (strands). So KG has one subject, "Integrated Learning", and each
teaching week is one sub-strand (a weekly topic) with its content standard and indicators. Themes 1-2 are Term 1,
3-5 are Term 2 and 6-7 are Term 3, as in the curriculum's scope and sequence. Each term has 14 weeks: week 1 revision,
weeks 2 to 12 teaching, week 13 revision, week 14 examination. When a term has fewer sub-strands than teaching weeks the
longest sub-strands are spread over two weeks (part [1, 2], [2, 2]); the indicators are divided between the parts.
"""
import json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'data', 'schemes.json')
SUBJECT = 'Integrated Learning'
L = open(sys.argv[1], encoding='utf-8').read().split('\n')

STRANDS = {1: 'All About Me', 2: 'My Family', 3: 'Values and Beliefs', 4: 'My Local Community', 5: 'My Nation Ghana', 6: 'All Around Us', 7: 'My Global Community'}
TERM_OF = {1: 1, 2: 1, 3: 2, 4: 2, 5: 2, 6: 3, 7: 3}
SUB = {  # (strand, sub-strand) -> name, from the scope and sequence table; K2 differences are listed under 'K2'
    (1, 1): 'I am a wonderful and unique creation', (1, 2): 'The parts of the human body and their functions',
    (1, 3): 'Caring for the parts of my body', (1, 4): 'Keeping my body healthy: good food and vaccination',
    (1, 5): 'My environment and my health', (1, 6): 'Protecting ourselves from accidents',
    (2, 1): 'Types and members of my family', (2, 2): 'Origin and history of my family', (2, 3): 'Family celebrations and festivals',
    (2, 4): 'My school family: rules and regulations', (3, 1): 'Our family values', (3, 2): 'Our cultural and family values',
    (3, 3): 'Our religious values', (3, 4): 'Our beliefs', (4, 1): 'Special places in our local community',
    (4, 2): 'Important people and occupations in our community', (4, 3): 'Special leaders in our community and country',
    (5, 1): "History and celebration of Ghana's independence", (6, 1): 'Living and non-living things',
    (6, 2): 'Living things: domestic and wild animals', (6, 3): 'Water', (6, 4): 'Air', (6, 5): 'Plants 1', (6, 6): 'Plants 2',
    (6, 7): 'Gardening', (6, 8): 'Light: day and night', (6, 9): 'Changing weather conditions',
    (7, 1): 'Connecting and communicating with the global community',
}
SUB_K2 = {(1, 2): 'Parts of the body we can see and cannot see, and their functions', (1, 3): 'Personal hygiene and caring for the parts of the body',
          (1, 6): 'Protecting ourselves from road accidents and harmful strangers', (2, 4): 'My school family: rules for learners and teachers',
          (3, 1): 'Our personal values', (3, 2): 'Our cultural values', (3, 3): 'Our national and civic values',
          (4, 1): 'Special places in every community', (5, 1): 'History and celebrations of Ghana', (6, 7): 'Types of soil and gardening',
          (6, 8): 'Natural and man-made sources of light', (7, 1): 'Connecting and communicating with the global community; buying and selling'}

IND = re.compile(r'^K([12])\.(\d+)\.(\d+)\.(\d+)\.(\d+)\b\.?\s*(.*)')
STD = re.compile(r'^K([12])\.(\d+)\.(\d+)\.(\d+)(?![.\d])\.?\s*(.*)')
NOISE = re.compile(r'^(\d+|[ivxlc]+|©.*|Exemplars?:?.*)$', re.I)


def grab(i, first):
    """The statement that starts on line i: its first line plus wrapped lines, up to Exemplars, a blank line or the next code."""
    out = [first.strip()] if first.strip() else []
    j = i + 1
    while j < len(L):
        s = L[j].strip()
        if not s or re.match(r'^Exemplar', s, re.I) or IND.match(s) or STD.match(s) or NOISE.match(s) or re.match(r'^(SUB-)?STRAND', s, re.I): break
        out.append(s); j += 1
    return re.sub(r'\s+', ' ', ' '.join(out)).strip()


inds, stds = {}, {}
for i, line in enumerate(L):
    if i < 1060: continue                       # the syllabus tables start after the scope and sequence
    s = line.strip()
    m = IND.match(s)
    if m:
        code = 'K%s.%s.%s.%s.%s' % m.groups()[:5]
        t = grab(i, m.group(6))
        if code not in inds or len(t) > len(inds[code]): inds[code] = t
        continue
    m = STD.match(s)
    if m:
        code = 'K%s.%s.%s.%s' % m.groups()[:4]
        t = grab(i, m.group(5))
        if code not in stds or len(t) > len(stds[code]): stds[code] = t

def key(c):
    return [int(x) for x in c[1:].split('.')]

classes = {}
for k, cls in (('1', 'KG 1'), ('2', 'KG 2')):
    by_sub = {}
    for code in sorted((c for c in inds if c[1] == k), key=key):
        _, strand, sub = key(code)[:3]
        by_sub.setdefault((strand, sub), []).append(code)
    terms = {}
    for term in (1, 2, 3):
        subs = [(s, c) for s, c in sorted(by_sub.items()) if TERM_OF[s[0]] == term]
        # one week per sub-strand, then give the spare teaching weeks (11 in all) to the sub-strands with most indicators
        weeks_for = {s: 1 for s, _ in subs}
        spare = 11 - len(subs)
        for s, c in sorted(subs, key=lambda x: -len(x[1]))[:max(0, spare)]:
            if len(c) >= 4: weeks_for[s] = 2
        rows = [{'weeks': [1], 'type': 'revision', 'strand': '', 'substrand': '', 'standard': '', 'indicators': [], 'focus': 'Key ideas from last term that this class needs'}]
        wk = 2
        for s, c in subs:
            n = weeks_for[s]
            chunks = [c] if n == 1 else [c[:(len(c) + 1) // 2], c[(len(c) + 1) // 2:]]
            name = (SUB_K2 if k == '2' else {}).get(s) or SUB[s]
            for idx, ch in enumerate(chunks):
                if wk > 12: break
                cs = '.'.join(ch[0].split('.')[:4])
                row = {'weeks': [wk], 'type': 'teach', 'strand': STRANDS[s[0]], 'substrand': '%d.%d %s' % (s[0], s[1], name),
                       'standard': (cs + ' ' + stds.get(cs, '')).strip(), 'indicators': [x + ' ' + inds[x] for x in ch]}
                if n > 1: row['part'] = [idx + 1, n]
                rows.append(row); wk += 1
        # any teaching weeks left over (a term with very few sub-strands) repeat the last topic as consolidation
        while wk <= 12:
            last = dict(rows[-1]); last['weeks'] = [wk]; last['part'] = [(rows[-1].get('part') or [1, 1])[1] + 1, (rows[-1].get('part') or [1, 1])[1] + 1]
            rows.append(last); wk += 1
        rows.append({'weeks': [13], 'type': 'revision', 'strand': '', 'substrand': '', 'standard': '', 'indicators': [], 'focus': ''})
        rows.append({'weeks': [14], 'type': 'exam', 'strand': '', 'substrand': '', 'standard': '', 'indicators': [], 'focus': ''})
        terms[str(term)] = rows
    classes[cls] = terms

d = json.load(open(OUT, encoding='utf-8'))
d['subjects'][SUBJECT] = {'source': 'NaCCA Kindergarten Curriculum (KG 1 and KG 2), September 2019', 'classes': classes}
json.dump(d, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('Wrote', SUBJECT, 'for', ', '.join(classes), '-', len(inds), 'indicators')
for cls, t in classes.items():
    for term, rows in t.items(): print(cls, 'term', term, [len(r['indicators']) for r in rows if r['type'] == 'teach'])
