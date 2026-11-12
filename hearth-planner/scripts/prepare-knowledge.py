#!/usr/bin/env python3
"""Extract a PDF or DOCX into JSON segments for the GuidEd /api/knowledge admin endpoint.

PDF: requires the pdftotext command (Poppler).
DOCX: requires python-docx. DOCX page numbers are not preserved by python-docx.
"""
import argparse
import json
import os
import re
import subprocess
import sys

def pdf_segments(path):
    try:
        raw = subprocess.check_output(
            ["pdftotext", "-layout", "-enc", "UTF-8", path, "-"],
            stderr=subprocess.PIPE
        ).decode("utf-8", "replace")
    except FileNotFoundError:
        raise SystemExit("pdftotext is required. Install Poppler, then retry.")
    pages = []
    for number, text in enumerate(raw.split("\f"), 1):
        text = re.sub(r"[ \t]+\n", "\n", text).strip()
        if text:
            pages.append({"page": number, "heading": "", "text": text})
    return pages

def docx_segments(path):
    try:
        from docx import Document
    except ImportError:
        raise SystemExit("Install python-docx first: python -m pip install python-docx")
    doc = Document(path)
    segments, current_heading, current = [], "", []
    def flush():
        text = "\n".join(current).strip()
        if text:
            segments.append({"page": None, "heading": current_heading, "text": text})
    for paragraph in doc.paragraphs:
        text = paragraph.text.strip()
        if not text:
            continue
        if paragraph.style and paragraph.style.name.startswith("Heading"):
            flush()
            current.clear()
            current_heading = text[:240]
        else:
            current.append(text)
    for table in doc.tables:
        for row in table.rows:
            cells = [re.sub(r"\s+", " ", cell.text).strip() for cell in row.cells]
            line = " | ".join(x for x in cells if x)
            if line:
                current.append(line)
    flush()
    return segments

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--title", required=True)
    ap.add_argument("--publisher", required=True)
    ap.add_argument("--url", required=True, dest="sourceUrl")
    ap.add_argument("--subject", required=True)
    ap.add_argument("--class", dest="classes", action="append", default=[])
    ap.add_argument("--code", dest="curriculumCodes", action="append", default=[])
    ap.add_argument("--type", dest="documentType", default="curriculum")
    ap.add_argument("--license", default="")
    ap.add_argument("--edition", default="")
    ap.add_argument("--published-at", default="")
    ap.add_argument("--output", default="-")
    args = ap.parse_args()
    ext = os.path.splitext(args.file)[1].lower()
    if ext == ".pdf":
        segments = pdf_segments(args.file)
    elif ext == ".docx":
        segments = docx_segments(args.file)
    else:
        raise SystemExit("Only PDF and DOCX files are supported.")
    if not segments:
        raise SystemExit("No extractable text found.")
    data = {
        "title": args.title, "publisher": args.publisher, "sourceUrl": args.sourceUrl,
        "subject": args.subject, "classes": args.classes, "curriculumCodes": args.curriculumCodes,
        "documentType": args.documentType, "license": args.license, "edition": args.edition,
        "publishedAt": args.published_at, "segments": segments,
    }
    output = json.dumps(data, ensure_ascii=False)
    if args.output == "-":
        print(output)
    else:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output)
        print("Wrote", args.output, "with", len(segments), "segments", file=sys.stderr)

if __name__ == "__main__":
    main()
