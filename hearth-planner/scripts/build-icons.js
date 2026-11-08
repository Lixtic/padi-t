// Draws the GuidEd icons and splash screens from one mark: a white "G" ring with a gold guiding star in the middle.
//   node scripts/build-icons.js
// Writes public/favicon.svg, public/icons/*.png and public/splash/*.png. Needs the playwright package (already in the sandbox).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'public');
const GREEN = '#006A4E', GOLD = '#F4B400', CREAM = '#FBF6EA';

function star(cx, cy, R, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, d = i % 2 ? r : R;
    pts.push((cx + d * Math.cos(a)).toFixed(1) + ',' + (cy + d * Math.sin(a)).toFixed(1));
  }
  return pts.join(' ');
}
// The mark in a 512 box, centred on (256,256). `ink` is the colour of the ring.
const mark = (ink) =>
  '<path d="M364.1 180.3A132 132 0 1 0 388 256" fill="none" stroke="' + ink + '" stroke-width="46"/>' +
  '<rect x="318" y="233" width="92" height="46" fill="' + ink + '"/>' +
  '<polygon points="' + star(256, 256, 74, 31) + '" fill="' + GOLD + '"/>';

const svg = (inner, size, extra) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="' + (size || 512) + '" height="' + (size || 512) + '">' + (extra || '') + inner + '</svg>';
const tile = (rx) => '<rect width="512" height="512" rx="' + rx + '" fill="' + GREEN + '"/>' + mark('#fff');
// A smaller mark for the maskable icon: the whole image is cropped to a circle or squircle, so keep the art well inside.
const maskable = '<rect width="512" height="512" fill="' + GREEN + '"/><g transform="translate(256 256) scale(.86) translate(-256 -256)">' + mark('#fff') + '</g>';

fs.mkdirSync(path.join(root, 'icons'), { recursive: true });
fs.mkdirSync(path.join(root, 'splash'), { recursive: true });
fs.writeFileSync(path.join(root, 'favicon.svg'), svg(tile(112)));

const splashHtml = (w, h) => {
  const s = Math.round(Math.min(w, h) * 0.34), word = Math.round(s * 0.2), tag = Math.round(s * 0.085);
  return '<body style="margin:0;width:' + w + 'px;height:' + h + 'px;background:' + GREEN + ';display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#fff">' +
    svg(mark('#fff'), s) +
    '<div style="margin-top:' + Math.round(s * 0.12) + 'px;font-size:' + word + 'px;font-weight:700;letter-spacing:.01em">Guid<span style="color:' + GOLD + '">Ed</span></div>' +
    '<div style="margin-top:' + Math.round(s * 0.05) + 'px;font-size:' + tag + 'px;opacity:.85">Lesson plans, ready for Word</div></body>';
};
// iPhone and iPad portrait sizes: [CSS width, CSS height, pixel ratio]
const IOS = [[430, 932, 3], [393, 852, 3], [390, 844, 3], [375, 812, 3], [414, 896, 2], [375, 667, 2], [810, 1080, 2], [834, 1194, 2]];

(async () => {
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  const shot = async (html, w, h, file, scale, transparent) => {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale || 1 });
    await p.setContent(html);
    await p.screenshot({ path: file, omitBackground: !!transparent });
    await p.close();
  };
  const box = (inner) => '<body style="margin:0;background:transparent">' + inner + '</body>';
  await shot(box(svg(tile(112))), 512, 512, path.join(root, 'icons/icon-512.png'), 1, true);
  await shot(box(svg(tile(112), 192)), 192, 192, path.join(root, 'icons/icon-192.png'), 1, true);
  await shot(box(svg(maskable)), 512, 512, path.join(root, 'icons/maskable-512.png'), 1);
  await shot(box(svg('<rect width="512" height="512" fill="' + GREEN + '"/>' + mark('#fff'), 180)), 180, 180, path.join(root, 'icons/apple-touch-icon.png'), 1);
  for (const [w, h, r] of IOS) await shot(splashHtml(w, h), w, h, path.join(root, 'splash/ios-' + w + 'x' + h + '.png'), r);
  await b.close();
  console.log('icons and', IOS.length, 'splash screens written');
})();
