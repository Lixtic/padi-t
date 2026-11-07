"""
ges_docx_export.py

Builds a Ghana Education Service (GES / NaCCA) lesson package as a native
Word document from the markdown-style text the Copilot generates.

Drop this file into the `academics/` package next to views.py.

What it does
------------
* Landscape A4 so the wide Phase / Activities / Resources tables fit.
* Real Word tables with fixed column widths, visible borders, a dark-green
  repeating header row, shaded label cells and rows that avoid splitting
  across pages.
* Understands the markdown the model produces: `#` headings, **bold**,
  *italic*, bullets, numbered / lettered lines, `<br>` inside table cells,
  blank header rows (`| | | |`) and escaped pipes (`\\|`).
* Starts Lesson 2, Study Notes (or Teacher's Notes) and the exam-practice section (BECE, Class Exercise or WASSCE) on a new page.
* Strips internal tags (<ElicitationsGroup>, [AWARD_XP: n], ...).
* Footer with the title and "Page X of Y".
"""
import re

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

# ── Look and feel ────────────────────────────────────────────────────────────
FONT = 'Arial'
BODY_PT = 9.5
CELL_PT = 8.5

GREEN = RGBColor(0x2F, 0x4F, 0x37)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GREY = RGBColor(0x66, 0x66, 0x66)
HEADER_FILL = '006A4E'
LABEL_FILL = 'E9F3EE'
BORDER_COLOR = '7F7F7F'

PAGE_W, PAGE_H = 29.7, 21.0          # A4 landscape, cm
MARGIN_X, MARGIN_Y = 1.5, 1.3
USABLE_W = PAGE_W - 2 * MARGIN_X

# Private-use characters that stand in for things that would otherwise break
# line / cell splitting.
BR = '\ue000'     # <br> inside a table cell
PIPE = '\ue001'   # escaped pipe  \|

_NEW_PAGE = re.compile(r"^(lesson\s*(2|two)\b|study notes|teacher.?s notes|bece|class exercise|wassce|answer key)", re.I)
_META_HEADING = re.compile(r'metadata|lesson (details|information)', re.I)
_PHASE_HEADER = re.compile(r'phase|duration', re.I)
_LABEL_COLUMN = re.compile(r'phase|duration|criteri|aspect|stage', re.I)
_SEPARATOR_CELL = re.compile(r'^:?-{3,}:?$')
_BULLET = re.compile(r'^[-•▪‣*]\s+(.*)$', re.S)
_NUMBERED = re.compile(r'^((?:\d{1,2}|[A-Ha-h])[.)])\s+(.*)$', re.S)
_INLINE = re.compile(r'\*\*(.+?)\*\*|(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])')
_RULE = re.compile(r'^(?:-{3,}|\*{3,}|_{3,})$')
_HEADING = re.compile(r'^(#{1,6})\s*(.+?)\s*#*$')
_BOLD_LINE = re.compile(r'^\*\*(.+?)\*\*\s*:?$')
_LABEL_ONLY = re.compile(r'^(?:\*\*[^*]+\*\*\s*:?|[^:*\n]{2,40}:)\s*$')
_INLINE_LABEL = re.compile(r'^([A-Za-z][^:\n\ue000]{1,38}):\s+(\S.*)$', re.S)


# ── Text cleanup ─────────────────────────────────────────────────────────────
def clean_content(text):
    text = (text or '').replace('\r\n', '\n').replace('\r', '\n')
    text = re.sub(r'<ElicitationsGroup>.*?(?:</ElicitationsGroup>|$)', '', text, flags=re.S | re.I)
    text = re.sub(r'<suggested_responses>.*?(?:</suggested_responses>|$)', '', text, flags=re.S | re.I)
    text = re.sub(r'\[(?:AWARD_XP|LESSON_STATE|MOOD|VOCAB_LEVEL|POWER_WORDS|SESSION_TITLE)[^\]]*\]',
                  '', text, flags=re.I)
    text = re.sub(r'^\s*\**export title\**\s*:.*$', '', text, flags=re.I | re.M)   # instruction line, not content
    text = re.sub(r'<br\s*/?>', BR, text, flags=re.I)
    text = re.sub(r'</?[A-Za-z][^>]*>', '', text)          # any other stray HTML tag
    return text.replace('\\|', PIPE)


def _plain(text):
    return re.sub(r'\*+', '', text.replace(BR, ' ')).strip()


# ── Low-level XML helpers (kept in schema order so Word never complains) ─────
_TBLPR_ORDER = [
    'tblStyle', 'tblpPr', 'tblOverlap', 'bidiVisual', 'tblStyleRowBandSize',
    'tblStyleColBandSize', 'tblW', 'jc', 'tblCellSpacing', 'tblInd',
    'tblBorders', 'shd', 'tblLayout', 'tblCellMar', 'tblLook',
    'tblCaption', 'tblDescription',
]


def _set_tblpr(tbl_pr, element):
    local = element.tag.split('}')[1]
    for old in tbl_pr.findall(qn('w:' + local)):
        tbl_pr.remove(old)
    later = {qn('w:' + n) for n in _TBLPR_ORDER[_TBLPR_ORDER.index(local) + 1:]}
    for child in tbl_pr:
        if child.tag in later:
            child.addprevious(element)
            return
    tbl_pr.append(element)


def _table_width(table, total_cm):
    el = OxmlElement('w:tblW')
    el.set(qn('w:w'), str(int(total_cm * 567)))
    el.set(qn('w:type'), 'dxa')
    _set_tblpr(table._tbl.tblPr, el)


def _table_borders(table):
    borders = OxmlElement('w:tblBorders')
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        el = OxmlElement('w:' + edge)
        el.set(qn('w:val'), 'single')
        el.set(qn('w:sz'), '6')
        el.set(qn('w:space'), '0')
        el.set(qn('w:color'), BORDER_COLOR)
        borders.append(el)
    _set_tblpr(table._tbl.tblPr, borders)


def _table_cell_margins(table, top=50, left=90, bottom=50, right=90):
    mar = OxmlElement('w:tblCellMar')
    for name, value in (('top', top), ('left', left), ('bottom', bottom), ('right', right)):
        el = OxmlElement('w:' + name)
        el.set(qn('w:w'), str(value))
        el.set(qn('w:type'), 'dxa')
        mar.append(el)
    _set_tblpr(table._tbl.tblPr, mar)


def _shade(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    for old in tc_pr.findall(qn('w:shd')):
        tc_pr.remove(old)
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill)
    tc_pr.append(shd)          # call before setting vertical_alignment


def _row_props(row, keep_together, repeat_header):
    tr_pr = row._tr.get_or_add_trPr()
    if keep_together:
        tr_pr.append(OxmlElement('w:cantSplit'))
    if repeat_header:
        tr_pr.append(OxmlElement('w:tblHeader'))


def _add_field(paragraph, instruction, size):
    run = paragraph.add_run()
    run.font.name = FONT
    run.font.size = Pt(size)
    run.font.color.rgb = GREY
    parts = []
    begin = OxmlElement('w:fldChar'); begin.set(qn('w:fldCharType'), 'begin'); parts.append(begin)
    instr = OxmlElement('w:instrText'); instr.set(qn('xml:space'), 'preserve'); instr.text = f' {instruction} '; parts.append(instr)
    sep = OxmlElement('w:fldChar'); sep.set(qn('w:fldCharType'), 'separate'); parts.append(sep)
    txt = OxmlElement('w:t'); txt.text = '1'; parts.append(txt)
    end = OxmlElement('w:fldChar'); end.set(qn('w:fldCharType'), 'end'); parts.append(end)
    for part in parts:
        run._r.append(part)


# ── Text rendering ───────────────────────────────────────────────────────────
def _style_run(run, size, bold=False, italic=False, color=None):
    run.font.name = FONT
    run.font.size = Pt(size)
    if bold:
        run.bold = True
    if italic:
        run.italic = True
    if color is not None:
        run.font.color.rgb = color


def _add_runs(paragraph, text, size, bold=False, italic=False, color=None):
    """Add text to a paragraph, turning **bold** / *italic* into real formatting."""
    def emit(chunk, is_bold, is_italic):
        for n, part in enumerate(chunk.split(BR)):
            if n:
                paragraph.add_run().add_break()
            if part:
                _style_run(paragraph.add_run(part), size, is_bold, is_italic, color)

    pos = 0
    for m in _INLINE.finditer(text):
        emit(text[pos:m.start()], bold, italic)
        if m.group(1) is not None:
            emit(m.group(1), True, italic)
        else:
            emit(m.group(2), bold, True)
        pos = m.end()
    emit(text[pos:], bold, italic)


def _render(container, text, size, bold=False, color=None, align=None,
            reuse_first=False, after=2):
    """Write text (one paragraph per line) into a document or table cell.

    Bullets and numbered / lettered lines get a proper hanging indent.
    """
    lines = [ln.strip() for ln in text.split(BR)]
    lines = [ln for ln in lines if ln]
    for k, line in enumerate(lines):
        paragraph = container.paragraphs[0] if (reuse_first and k == 0) else container.add_paragraph()
        fmt = paragraph.paragraph_format
        fmt.space_before = Pt(0)
        fmt.space_after = Pt(after)
        if align is not None:
            paragraph.alignment = align

        label = None
        m = _BULLET.match(line)
        if m:
            label, line = '•', m.group(1)
        else:
            m = _NUMBERED.match(line)
            if m:
                label, line = m.group(1), m.group(2)
        if label:
            is_option = bool(re.fullmatch(r'[A-Ha-h][.)]', label))
            indent = Cm(0.45)
            left = Cm(1.35) if is_option else indent        # options A to D sit under their question
            fmt.left_indent = left
            fmt.first_line_indent = -indent
            fmt.tab_stops.add_tab_stop(left)
            if is_option and not label.upper().startswith('D'):
                fmt.keep_with_next = True                  # keep A, B, C with the next option
            elif not is_option and line.rstrip().endswith('?'):
                fmt.keep_with_next = True                  # keep a question with its options
            _style_run(paragraph.add_run(label + '\t'), size, bold, False, color)
        _add_runs(paragraph, line, size, bold=bold, color=color)


def _heading(document, text, level, page_break=False):
    paragraph = document.add_paragraph(style='Heading %d' % min(level, 3))
    fmt = paragraph.paragraph_format
    fmt.space_before = Pt({1: 12, 2: 10, 3: 8}[min(level, 3)])
    fmt.space_after = Pt(3)
    fmt.keep_with_next = True
    fmt.page_break_before = page_break
    size = {1: 13, 2: 11.5, 3: 10.5}[min(level, 3)]
    _add_runs(paragraph, text.replace(BR, ' '), size, bold=True, color=GREEN)


def _spacer(document, height_pt=6):
    paragraph = document.add_paragraph()
    fmt = paragraph.paragraph_format
    fmt.space_before = Pt(0)
    fmt.space_after = Pt(0)
    fmt.line_spacing = Pt(height_pt)


# ── Table parsing ────────────────────────────────────────────────────────────
def _is_table_line(line):
    return line.startswith('|') and line.count('|') >= 2


def _split_row(line):
    s = line.strip()
    if s.startswith('|'):
        s = s[1:]
    if s.endswith('|'):
        s = s[:-1]
    return [c.strip() for c in s.split('|')]


def _parse_table(block):
    """Return (rows, has_header) or None."""
    rows = []
    for line in block:
        cells = _split_row(line)
        if all(_SEPARATOR_CELL.match(c) for c in cells):
            continue                          # |---|---| divider
        rows.append(cells)
    if not rows:
        return None
    has_header = True
    if all(not c for c in rows[0]):           # blank header row: | | | |
        rows = rows[1:]
        has_header = False
    if not rows:
        return None
    return rows, has_header


def _column_widths(rows, has_header, meta):
    cols = len(rows[0])
    first = rows[0][0] if has_header else ''
    if meta:
        weights = [1] * cols if cols != 2 else [28, 72]
    elif has_header and cols == 3 and _PHASE_HEADER.search(first):
        weights = [15, 68, 17]                # Phase/Duration | Activities | Resources
    elif has_header and cols == 4 and _PHASE_HEADER.search(first):
        weights = [13, 36, 36, 15]            # Phase | Teacher | Learners | Resources
    else:
        weights = []
        for c in range(cols):
            avg = sum(len(_plain(r[c])) for r in rows) / len(rows)
            weights.append(min(max(avg, 6), 70))
    total = float(sum(weights))
    return [USABLE_W * w / total for w in weights]


def _meta_cell(value):
    """Metadata grids: bold the label in 'Label: value' and flag label-only cells."""
    plain = value.strip()
    if plain and _LABEL_ONLY.match(plain):
        return plain, True
    if plain and '**' not in plain:
        m = _INLINE_LABEL.match(plain)
        if m:
            return '**%s:** %s' % (m.group(1).strip(), m.group(2)), False
    return value, False


_LESSON_HEAD = re.compile(r'^\**\s*lesson\s*(?:\d|one|two)\b', re.I)
_LESSON_TWO = re.compile(r'^\**\s*lesson\s*(?:2|two)\b', re.I)
_PHASE_ROW = re.compile(r'^\**\s*phase\s*/\s*duration', re.I)
_PLAN_LESSON = re.compile(r'^#{1,3}\s*\**\s*lesson\s*(?:\d|one|two)\b', re.I)


def join_plan_tables(text):
    """Join the Lesson Metadata, Lesson 1 and Lesson 2 tables into one continuous table
    (lesson title, objectives and prerequisite lines become full-width rows). Same rules as plan-join.js."""
    lines = text.split('\n')
    s = 0
    while s < len(lines) and not _is_table_line(lines[s].strip()):
        s += 1
    if s >= len(lines):
        return text
    e = s
    while e < len(lines) and _is_table_line(lines[e].strip()):
        e += 1
    meta = [c for c in (_split_row(l) for l in lines[s:e]) if not all(_SEPARATOR_CELL.match(x) for x in c)]
    if len(meta) < 2 or any(meta[0]):
        return text
    cols = len(meta[0])
    rows = meta[1:]
    pos, lessons, moved = e, 0, []
    while True:
        p = pos
        while p < len(lines) and not lines[p].strip():
            p += 1
        if p >= len(lines) or not _PLAN_LESSON.match(lines[p].strip()):
            break
        title = re.sub(r'^#{1,3}\s*', '', lines[p].strip()).strip('*').strip()
        extra, q, bad = [], p + 1, False
        while q < len(lines) and not _is_table_line(lines[q].strip()):
            t = lines[q].strip()
            if re.match(r'^#{1,6}\s', t):
                bad = True
                break
            if t:
                extra.append(t)
            q += 1
        if bad or q >= len(lines):
            break
        qe = q
        while qe < len(lines) and _is_table_line(lines[qe].strip()):
            qe += 1
        tbl = [c for c in (_split_row(l) for l in lines[q:qe]) if not all(_SEPARATOR_CELL.match(x) for x in c)]
        if len(tbl) < 2 or len(tbl[0]) != cols or not re.match(r'^\**\s*phase', tbl[0][0], re.I):
            break
        rows.append(['**' + title + '**'] + [''] * (cols - 1))
        if extra:
            moved.append('**Objectives for ' + title + '**')
            moved.extend(extra)
        rows.extend(tbl)
        pos = qe
        lessons += 1
    if not lessons:
        return text
    out = lines[:s] + ['| ' + ' | '.join([''] * cols) + ' |', '|' + '|'.join(['---'] * cols) + '|']
    out += ['| ' + ' | '.join(r) + ' |' for r in rows]
    rest = lines[pos:]
    if moved:
        block = ['']
        for x in moved:
            block += [x, '']
        h = next((k for k, l in enumerate(rest) if re.match(r'^#{1,3}\s*\**\s*(?:study notes|teacher.?s notes)\b', l.strip(), re.I)), -1)
        if h >= 0:
            rest = rest[:h + 1] + block + rest[h + 1:]
        else:
            rest = ['', '## Learning Objectives and Prerequisite Knowledge'] + block + rest
    return '\n'.join(out + rest)


def _add_joined_table(document, rows):
    cols = max(len(r) for r in rows)
    rows = [r + [''] * (cols - len(r)) for r in rows]
    a, c = USABLE_W * 0.19, USABLE_W * 0.23
    widths = [a, USABLE_W - a - c, c]
    table = document.add_table(rows=len(rows), cols=cols)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    _table_width(table, USABLE_W)
    _table_borders(table)
    _table_cell_margins(table)
    for i, w in enumerate(widths):
        table.columns[i].width = Cm(w)
    in_lesson = False
    for r, row in enumerate(rows):
        tr = table.rows[r]
        only = bool(row[0]) and all(not x for x in row[1:])
        if only:
            is_title = bool(_LESSON_HEAD.match(row[0]))
            in_lesson = in_lesson or is_title
            _row_props(tr, keep_together=True, repeat_header=False)
            cell = tr.cells[0].merge(tr.cells[cols - 1])
            _shade(cell, HEADER_FILL if is_title else LABEL_FILL)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            _render(cell, row[0].replace(PIPE, '|'), CELL_PT + (1 if is_title else 0), bold=is_title,
                    color=WHITE if is_title else None, reuse_first=True)
            for p in cell.paragraphs:
                p.paragraph_format.keep_with_next = True
                if is_title and _LESSON_TWO.match(row[0]):
                    p.paragraph_format.page_break_before = True
            continue
        is_phase_head = bool(_PHASE_ROW.match(row[0]))
        _row_props(tr, keep_together=sum(len(x) for x in row) < 700, repeat_header=False)
        for ci, value in enumerate(row):
            cell = tr.cells[ci]
            cell.width = Cm(widths[ci])
            value = value.replace(PIPE, '|')
            if is_phase_head:
                _shade(cell, '1B365D')
                cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
                _render(cell, value, CELL_PT, bold=True, color=WHITE, align=WD_ALIGN_PARAGRAPH.CENTER, reuse_first=True)
                for p in cell.paragraphs:
                    p.paragraph_format.keep_with_next = True
                continue
            is_label = False
            if in_lesson:
                is_label = ci == 0
            else:
                value, is_label = _meta_cell(value)
            if is_label:
                _shade(cell, LABEL_FILL)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
            _render(cell, value, CELL_PT, bold=is_label, reuse_first=True)


def _add_table(document, rows, has_header, meta):
    if meta and not has_header and any(_PHASE_ROW.match(r[0]) for r in rows):
        return _add_joined_table(document, rows)
    cols = max(len(r) for r in rows)
    rows = [r + [''] * (cols - len(r)) for r in rows]
    widths = _column_widths(rows, has_header, meta)
    label_first_col = has_header and not meta and bool(_LABEL_COLUMN.search(rows[0][0]))

    table = document.add_table(rows=len(rows), cols=cols)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False                      # fixed layout
    _table_width(table, sum(widths))
    _table_borders(table)
    _table_cell_margins(table)
    for c, w in enumerate(widths):
        table.columns[c].width = Cm(w)

    for r, row in enumerate(rows):
        tr = table.rows[r]
        is_head = has_header and r == 0
        # Very tall rows (e.g. Main Instruction) may break across pages;
        # short ones are kept together.
        _row_props(tr, keep_together=sum(len(c) for c in row) < 700, repeat_header=is_head)
        for c, value in enumerate(row):
            cell = tr.cells[c]
            cell.width = Cm(widths[c])
            value = value.replace(PIPE, '|')
            if is_head:
                _shade(cell, HEADER_FILL)
                cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
                _render(cell, value, CELL_PT, bold=True, color=WHITE,
                        align=WD_ALIGN_PARAGRAPH.CENTER, reuse_first=True)
                for p in cell.paragraphs:
                    p.paragraph_format.keep_with_next = True
                continue
            is_label = False
            if meta:
                value, is_label = _meta_cell(value)
            elif label_first_col and c == 0:
                is_label = True
            if is_label:
                _shade(cell, LABEL_FILL)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
            _render(cell, value, CELL_PT, bold=is_label, reuse_first=True)


# ── Public entry point ───────────────────────────────────────────────────────
def build_ges_lesson_docx(title, content, portrait=False, teacher='', school=''):
    """Return the .docx file as bytes. portrait=True gives an A4 portrait page (worksheets, homework)."""
    import io
    global USABLE_W
    USABLE_W = (PAGE_H if portrait else PAGE_W) - 2 * MARGIN_X

    title = (title or 'GES Lesson Plan').strip()[:150] or 'GES Lesson Plan'
    content = join_plan_tables(clean_content(content))

    document = Document()
    document.core_properties.title = title

    section = document.sections[0]
    section.orientation = WD_ORIENT.PORTRAIT if portrait else WD_ORIENT.LANDSCAPE
    section.page_width = Cm(PAGE_H if portrait else PAGE_W)
    section.page_height = Cm(PAGE_W if portrait else PAGE_H)
    section.left_margin = section.right_margin = Cm(MARGIN_X)
    section.top_margin = section.bottom_margin = Cm(MARGIN_Y)
    section.footer_distance = Cm(0.6)

    normal = document.styles['Normal']
    normal.font.name = FONT
    normal.font.size = Pt(BODY_PT)
    normal.paragraph_format.space_after = Pt(3)

    # Title
    head = document.add_paragraph()
    head.alignment = WD_ALIGN_PARAGRAPH.CENTER
    head.paragraph_format.space_after = Pt(6)
    _add_runs(head, title, 14, bold=True, color=GREEN)
    who = '   |   '.join(x for x in (('School: ' + school.strip()) if school and school.strip() else '',
                                    ('Teacher: ' + teacher.strip()) if teacher and teacher.strip() else '') if x)
    if who:
        sub = document.add_paragraph()
        sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
        sub.paragraph_format.space_after = Pt(6)
        _add_runs(sub, who, 10, color=GREY)

    # Footer: title + Page X of Y
    footer_style = document.styles['Footer']
    footer_style.font.name = FONT
    footer_style.font.size = Pt(8)
    footer_style.font.color.rgb = GREY
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_runs(footer, title[:80] + '   |   Page ', 8, color=GREY)
    _add_field(footer, 'PAGE', 8)
    _add_runs(footer, ' of ', 8, color=GREY)
    _add_field(footer, 'NUMPAGES', 8)

    lines = content.split('\n')
    i = 0
    last_heading = ''
    wrote_content = False

    while i < len(lines):
        raw = lines[i].strip()
        if not raw or _RULE.match(raw) or raw.startswith('```'):
            i += 1
            continue

        # Tables
        if _is_table_line(raw):
            block = []
            while i < len(lines) and _is_table_line(lines[i].strip()):
                block.append(lines[i].strip())
                i += 1
            parsed = _parse_table(block)
            if parsed:
                rows, has_header = parsed
                meta = (not has_header) or bool(_META_HEADING.search(last_heading))
                _add_table(document, rows, has_header and not meta, meta)
                _spacer(document)
                wrote_content = True
            continue

        i += 1
        text = raw.replace(PIPE, '|')
        if text.startswith('>'):
            text = text.lstrip('> ').strip()

        # Headings: "# Title", "**Bold line**", "SHORT UPPERCASE LINE"
        level, heading_text = None, None
        m = _HEADING.match(text)
        if m:
            level, heading_text = min(len(m.group(1)), 3), m.group(2)
        else:
            m = _BOLD_LINE.match(text)
            if m and len(text) < 120:
                level, heading_text = 3, m.group(1)
            elif len(text) < 100 and text.isupper() and not _BULLET.match(text):
                level, heading_text = 2, text
        if heading_text is not None:
            heading_text = heading_text.strip('*_ ').strip()
            page_break = wrote_content and bool(_NEW_PAGE.match(heading_text))
            _heading(document, heading_text, level, page_break)
            last_heading = heading_text
            wrote_content = True
            continue

        _render(document, text, BODY_PT, after=3)
        wrote_content = True

    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()
