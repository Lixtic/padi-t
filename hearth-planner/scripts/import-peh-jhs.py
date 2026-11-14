"""Adds Physical Education and Health (Basic 7-9) to data/schemes.json from the official NaCCA CCP curriculum PDF.

Usage:  pdftotext curriculum.pdf raw.txt && python3 scripts/import-peh-jhs.py raw.txt && node scripts/build-schemes.js

The NaCCA document lists indicators by year, not by term, so the three terms are an even split of the indicators in
curriculum order (whole content standards stay together where possible). Each term has 11 teaching weeks; an indicator
that needs several weeks is repeated with a pacing part [n, total]. Revision and exam weeks copy the other JHS subjects.
Replace the split with the school's own scheme of learning when one is available (scripts/import-schemes.py).
"""
import json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'data', 'schemes.json')
SUBJECT = 'Physical Education and Health'
L = open(sys.argv[1]).read().split('\n')

def para(i):
    out = []
    while i < len(L) and L[i].strip():
        out.append(L[i].strip()); i += 1
    return ' '.join(out)

ind, std, where = {}, {}, {}
strand = sub = None
for i, raw in enumerate(L):
    s = raw.strip()
    m = re.match(r'^STRAND \d: (.+)$', s)
    if m: strand = m.group(1).title()
    m = re.match(r'^SUB-STRAND \d:\s*(.+)$', s)
    if m: sub = re.sub(r'[.\s\d]+$', '', m.group(1)).strip().title()
    m = re.match(r'^(B[789]\.\d\.\d\.\d\.\d+)\s*[:\-–]\s*(.*)$', s)   # the PDF uses "-" after a few codes
    if m:
        full = re.split(r'\s+EXEMPLARS\b', (m.group(2) + ' ' + para(i + 1)).strip())[0].strip()
        code = m.group(1)
        if code not in ind or len(full) > len(ind[code]): ind[code] = full
        where.setdefault('.'.join(code.split('.')[:4]), (strand, sub))
    m = re.match(r'^(B[789]\.\d\.\d\.\d)$', s)
    if m:
        t = re.sub(r"\s*CONT.D\s*$", '', para(i + 1))
        if len(t) > 15 and (m.group(1) not in std or len(t) > len(std[m.group(1)])): std[m.group(1)] = t

def key(c): return tuple(int(p) for p in c.replace('B', '').split('.'))

def term_split(codes):
    """Three consecutive chunks of near-equal size, cutting only between content standards when it costs <=1 indicator."""
    n = len(codes); cuts = []
    for k in (1, 2):
        target = round(n * k / 3)
        best = min(range(max(1, target - 1), min(n, target + 2)),
                   key=lambda j: (codes[j - 1].rsplit('.', 1)[0] == codes[j].rsplit('.', 1)[0], abs(j - target)))
        cuts.append(best)
    return [codes[:cuts[0]], codes[cuts[0]:cuts[1]], codes[cuts[1]:]]

def term_rows(codes):
    weeks = list(range(2, 13)); rows = []
    share = [len(weeks) // len(codes) + (1 if k < len(weeks) % len(codes) else 0) for k in range(len(codes))]
    w = 0
    for code, n in zip(codes, share):
        s, ss = where['.'.join(code.split('.')[:4])]
        sc = '.'.join(code.split('.')[:4])
        for p in range(n):
            r = {'weeks': [weeks[w]], 'type': 'teach', 'strand': s or '', 'substrand': ss or '',
                 'standard': (sc + '. ' + std[sc]) if sc in std else sc, 'indicators': [code + ' ' + ind[code]]}
            if n > 1: r['part'] = [p + 1, n]
            rows.append(r); w += 1
    return ([{'weeks': [1], 'type': 'revision', 'strand': 'Revision', 'substrand': '', 'standard': '', 'indicators': []}] + rows +
            [{'weeks': [13], 'type': 'revision', 'strand': 'Revision', 'substrand': '', 'standard': '', 'indicators': []},
             {'weeks': [14, 15], 'type': 'exam', 'strand': 'Examination', 'substrand': '', 'standard': '', 'indicators': []}])

data = json.load(open(OUT))
classes = {}
for yr, cls in (('B7', 'Basic 7'), ('B8', 'Basic 8'), ('B9', 'Basic 9')):
    codes = sorted((c for c in ind if c.startswith(yr + '.')), key=key)
    parts = term_split(codes)
    classes[cls] = {str(t + 1): term_rows(p) for t, p in enumerate(parts)}
    print(cls, len(codes), 'indicators; per term:', [len(p) for p in parts])
data['subjects'][SUBJECT] = {'classes': classes}
json.dump(data, open(OUT, 'w'), ensure_ascii=False, indent=1)
