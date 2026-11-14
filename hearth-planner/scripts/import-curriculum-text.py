"""Adds a JHS (Basic 7-9) subject to data/schemes.json from the text of an official NaCCA CCP curriculum PDF.

Usage:  pdftotext curriculum.pdf raw.txt          (or any text export of the PDF)
        python3 scripts/import-curriculum-text.py "Physical Education and Health" raw.txt
        node scripts/build-schemes.js
Subject names are the ones in api/_levels.js. Tested with Physical Education and Health and French.

The NaCCA documents list indicators by year, not by term, so the three terms are an even split of the indicators in
curriculum order, cut between content standards where possible. Each term has 11 teaching weeks: when a term has more
indicators than weeks, neighbouring indicators share a week; when it has fewer, an indicator is repeated with a pacing
part [n, total]. Revision and exam weeks copy the other JHS subjects. Replace the split with the school's own scheme of
learning when one is available (scripts/import-schemes.py).
"""
import json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'data', 'schemes.json')
SUBJECT, SRC = sys.argv[1], sys.argv[2]
L = open(SRC, encoding='utf-8').read().split('\n')
FRENCH = SUBJECT == 'French'
COMPETENCY = re.compile(r'^(Communication and Collaboration|Personal Development|Critical Thinking|Creativity and Innovation|Cultural Identity and Global|Digital Literacy|Exemplars?\b|(?:CP|CC|CG|CI|PL|DL)\s*\d)')
CODE = re.compile(r'^B[789]\.\d+\.\d+\.\d+')
LEADER = re.compile(r'\.{4,}')   # table-of-contents lines have dot leaders


def para(i, stop_at_competency=False):
    out = []
    while i < len(L) and L[i].strip():
        s = L[i].strip()
        if stop_at_competency and (COMPETENCY.match(s) or CODE.match(s)): break
        out.append(s); i += 1
    return ' '.join(out)


def nice(text):
    text = re.sub(r'[.\s\d]+$', '', text).strip()
    text = re.sub(r'(?i)\bet(les|la|le|l[’\'])', r'et \1', text)          # the PDF text runs some words together
    text = re.sub(r'(?i)\b(sante|passe)\b', lambda m: {'sante': 'santé', 'passe': 'passé'}[m.group(1).lower()], text)
    return text.capitalize() if FRENCH else text.title()


ind, std, where = {}, {}, {}
strand = sub = None
for i, raw in enumerate(L):
    s = raw.strip()
    if LEADER.search(s): continue
    m = re.match(r'^STRAND\s*\d+\s*:\s*(.+)$', s)
    if m: strand = nice(m.group(1))
    m = re.match(r'^SUB-STRAND\s*\d+\s*:\s*(.+)$', s)
    if m: sub = nice(m.group(1))
    m = re.match(r'^(B[789]\.\d+\.\d+\.\d+\.\d+)(?:\s*[:\-–]\s*|\s+)(\S.*)$', s)   # "B7.1.1.1.1:", "B8.2.3.1.2-" or just a space
    if m:
        full = re.split(r'\s+(?:EXEMPLARS|Exemplars)\b', (m.group(2) + ' ' + para(i + 1, True)).strip())[0].strip()
        code = m.group(1)
        if code not in ind or len(full) > len(ind[code]): ind[code] = full
        where.setdefault('.'.join(code.split('.')[:4]), (strand, sub))
        continue
    m = re.match(r'^(B[789]\.\d+\.\d+\.\d+)\b\s*(?:\(CONTINUED\))?\s*(.*)$', s)
    if m and not re.match(r'^B[789](\.\d+){4}', s):
        t = re.sub(r"\s*CONT.D\s*$", '', (m.group(2) + ' ' + para(i + 1, True)).strip())
        if len(t) > 15 and (m.group(1) not in std or len(t) > len(std[m.group(1)])): std[m.group(1)] = t


def key(c): return tuple(int(p) for p in c.replace('B', '').split('.'))
def group(c): return c.rsplit('.', 1)[0]


def term_split(codes):
    n = len(codes); cuts = []
    for k in (1, 2):
        target = round(n * k / 3)
        window = range(max(1, target - 2), min(n, target + 3))
        cuts.append(min(window, key=lambda j: (group(codes[j - 1]) == group(codes[j]), abs(j - target))))
    return [codes[:cuts[0]], codes[cuts[0]:cuts[1]], codes[cuts[1]:]]


def chunks(codes, slots):
    """Consecutive groups, one per week: fewest cuts inside a content standard."""
    n = len(codes); out = []; i = 0
    for k in range(slots):
        size = n // slots + (1 if k < n % slots else 0)
        out.append(codes[i:i + size]); i += size
    return out


def row(week, codes, part=None):
    first = '.'.join(codes[0].split('.')[:4]); seen = []
    for c in codes:
        g = '.'.join(c.split('.')[:4])
        if g not in seen: seen.append(g)
    s, ss = where.get(first, ('', ''))
    r = {'weeks': [week], 'type': 'teach', 'strand': s or '', 'substrand': ss or '',
         'standard': ' / '.join((g + '. ' + std[g]) if g in std else g for g in seen),
         'indicators': [c + ' ' + ind[c] for c in codes]}
    if part: r['part'] = part
    return r


def term_rows(codes):
    weeks = list(range(2, 13)); rows = []
    if len(codes) >= len(weeks):
        for w, grp in zip(weeks, chunks(codes, len(weeks))): rows.append(row(w, grp))
    else:
        share = [len(weeks) // len(codes) + (1 if k < len(weeks) % len(codes) else 0) for k in range(len(codes))]
        w = 0
        for code, n in zip(codes, share):
            for p in range(n):
                rows.append(row(weeks[w], [code], [p + 1, n] if n > 1 else None)); w += 1
    blank = lambda wk, t, name: {'weeks': wk, 'type': t, 'strand': name, 'substrand': '', 'standard': '', 'indicators': []}
    return [blank([1], 'revision', 'Revision')] + rows + [blank([13], 'revision', 'Revision'), blank([14, 15], 'exam', 'Examination')]


data = json.load(open(OUT, encoding='utf-8'))
classes = {}
for yr, cls in (('B7', 'Basic 7'), ('B8', 'Basic 8'), ('B9', 'Basic 9')):
    codes = sorted((c for c in ind if c.startswith(yr + '.')), key=key)
    parts = term_split(codes)
    classes[cls] = {str(t + 1): term_rows(p) for t, p in enumerate(parts)}
    print(cls, len(codes), 'indicators; per term:', [len(p) for p in parts])
data['subjects'][SUBJECT] = {'classes': classes}
json.dump(data, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
