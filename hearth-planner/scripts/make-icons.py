"""Renders the GuidEd app icons (PNG) from the logo shapes. Run: python3 scripts/make-icons.py"""
import os
from playwright.sync_api import sync_playwright
root = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
MARK = '''<circle cx="16" cy="11.2" r="4.3" fill="#F4B400"/>
<path d="M6.5 15.2c3.6-.5 7.2.1 9.5 2 2.3-1.9 5.9-2.5 9.5-2v10.1c-3.6-.5-7.2.1-9.5 2-2.3-1.9-5.9-2.5-9.5-2z" fill="#fff"/>
<path d="M16 17.2v10.1" stroke="#006A4E" stroke-width="1.4"/>'''
def svg(size, radius, scale):
    # scale < 1 keeps the mark inside the maskable safe zone
    t = (32 - 32 * scale) / 2
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 32 32"><rect width="32" height="32" rx="{radius}" fill="#006A4E"/><g transform="translate({t} {t}) scale({scale})">{MARK}</g></svg>'
jobs = [('icon-192.png', 192, 7, 1), ('icon-512.png', 512, 7, 1), ('maskable-512.png', 512, 0, .68), ('apple-touch-icon.png', 180, 0, .86)]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    for name, size, r, sc in jobs:
        pg.set_viewport_size({'width': size, 'height': size})
        pg.set_content(f'<body style="margin:0;background:transparent">{svg(size, r, sc)}</body>')
        pg.screenshot(path=os.path.join(root, name), omit_background=True, clip={'x': 0, 'y': 0, 'width': size, 'height': size})
        print('wrote', name)
    b.close()
