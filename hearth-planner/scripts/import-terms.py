"""Fills Terms 2 and 3 of the JHS schemes (Basic 7-9) from the NaCCA data exported from the SchoolPadi database.

Usage:  python3 scripts/import-terms.py && node scripts/build-schemes.js

Inputs:  data/curriculum-terms.json  (which term the curriculum puts each indicator in)
         data/curriculum-index.json  (strand, sub-strand and content standard of each indicator)
Output:  data/schemes.json. Only terms that are missing are written; a scheme that came from a Schemes of Learning
         document is never replaced. The week layout (revision, exam, number of teaching weeks) copies the class's Term 1.
Indicators are listed by code only. The database text for indicator statements is often run together with the
competency columns, so the planner takes the readable wording from the content standard and the official record.
"""
import json, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SCHEMES = os.path.join(ROOT, 'data', 'schemes.json')
TERMS = json.load(open(os.path.join(ROOT, 'data', 'curriculum-terms.json')))['terms']
INDEX = json.load(open(os.path.join(ROOT, 'data', 'curriculum-index.json')))['indicators']
APP_NAME = {'Science': 'Integrated Science'}
CLASS_OF = {'B7': 'Basic 7', 'B8': 'Basic 8', 'B9': 'Basic 9'}
# Used when the class has no Term 1 to copy: revision, ten teaching weeks, revision.
DEFAULT_LAYOUT = [([1], 'revision', None)] + [([w], 'teach', None) for w in range(2, 12)] + [([12], 'revision', None)]


def key(code):
    return tuple(int(p) if p.isdigit() else 0 for p in code.replace('B', '').split('.'))


def layout_of(term1):
    if not term1 or sum(1 for r in term1 if r['type'] == 'teach') < 8:
        return [(w, t, None) for w, t, _ in DEFAULT_LAYOUT]
    return [(r['weeks'], r['type'], r) for r in term1]


def groups_for(subject, cls, term):
    """Indicator codes of one term, in curriculum order, grouped by content standard."""
    prefix = [k.split('|', 1)[1] for k, t in TERMS.items() if k.startswith(subject + '|') and t == str(term)]
    codes = sorted((c for c in prefix if c.startswith(cls + '.')), key=key)
    out = []
    for c in codes:
        std = INDEX[subject + '|' + c][1]
        if out and out[-1]['std'] == std:
            out[-1]['codes'].append(c)
        else:
            out.append({'std': std, 'codes': [c]})
    return out


def fit(groups, slots):
    """Merge neighbours or split the biggest group until there is one group per teaching week."""
    groups = [dict(g, codes=list(g['codes'])) for g in groups]
    while len(groups) > slots:
        i = min(range(len(groups) - 1), key=lambda j: len(groups[j]['codes']) + len(groups[j + 1]['codes']))
        groups[i]['codes'] += groups[i + 1]['codes']
        groups[i]['std'] = [groups[i]['std'], groups[i + 1]['std']] if isinstance(groups[i]['std'], str) else groups[i]['std'] + [groups[i + 1]['std']]
        del groups[i + 1]
    while len(groups) < slots:
        i = max(range(len(groups)), key=lambda j: len(groups[j]['codes']))
        if len(groups[i]['codes']) < 2:
            break
        half = len(groups[i]['codes']) // 2
        groups.insert(i + 1, {'std': groups[i]['std'], 'codes': groups[i]['codes'][half:]})
        groups[i]['codes'] = groups[i]['codes'][:half]
    return groups


def row_for(subject, weeks, group):
    stds = group['std'] if isinstance(group['std'], list) else [group['std']]
    first = INDEX[subject + '|' + group['codes'][0]]
    names = lambda pos: ' / '.join(dict.fromkeys(INDEX[subject + '|' + c][pos] for c in group['codes'] if INDEX[subject + '|' + c][pos]))
    standards = []
    for s in dict.fromkeys(stds):
        c = next(c for c in group['codes'] if INDEX[subject + '|' + c][1] == s)
        standards.append(s + '. ' + INDEX[subject + '|' + c][2])
    return {'weeks': weeks, 'type': 'teach', 'strand': names(4), 'substrand': names(3), 'standard': ' | '.join(standards), 'indicators': list(group['codes'])}


def main():
    data = json.load(open(SCHEMES))
    written = []
    for dbname in sorted({k.split('|')[0] for k in TERMS}):
        subject = APP_NAME.get(dbname, dbname)
        subj = data['subjects'].setdefault(subject, {'classes': {}, 'source': 'NaCCA curriculum (SchoolPadi database)'})
        for cls, cname in CLASS_OF.items():
            classes = subj['classes'].setdefault(cname, {})
            layout = layout_of(classes.get('1'))
            slots = sum(1 for _, t, _ in layout if t == 'teach')
            for term in (1, 2, 3):
                if str(term) in classes and any(r['type'] == 'teach' for r in classes[str(term)]):
                    continue
                groups = fit(groups_for(dbname, cls, term), slots) if groups_for(dbname, cls, term) else []
                if not groups:
                    continue
                rows, gi = [], 0
                for weeks, typ, src in layout:
                    if typ == 'teach':
                        if gi < len(groups):
                            rows.append(row_for(dbname, weeks, groups[gi])); gi += 1
                        else:
                            rows.append({'weeks': weeks, 'type': 'revision', 'strand': '', 'substrand': '', 'standard': '', 'indicators': [], 'focus': 'Consolidation and revision'})
                    elif src:
                        rows.append({k: v for k, v in src.items()})
                    else:
                        rows.append({'weeks': weeks, 'type': typ, 'strand': 'Revision' if typ == 'revision' else 'Examination', 'substrand': '', 'standard': '', 'indicators': []})
                classes[str(term)] = rows
                written.append((subject, cname, term, len(groups)))
    json.dump(data, open(SCHEMES, 'w'), indent=1, ensure_ascii=False)
    for w in written:
        print(*w)
    print(len(written), 'term schemes written')


main()
