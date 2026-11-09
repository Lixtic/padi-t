// GuidEd notice emails: a clean branded HTML version with a plain-text twin for mail apps that do not show HTML.
// Email clients ignore most modern CSS, so this uses tables and inline styles on purpose.
const SITE = () => String(process.env.SITE_URL || 'https://www.guidedgh.site').replace(/\/+$/, '');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const GREEN = '#006A4E';

// parts: { preheader, title, intro, facts: [[label, value]], paragraphs: [text], button: { label, url }, closing }
function layout(parts) {
  const site = SITE(), p = parts || {};
  const facts = (p.facts || []).map((f) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e6e6e1;font-size:14px;color:#6b6b66;width:38%;vertical-align:top">${esc(f[0])}</td><td style="padding:10px 0;border-bottom:1px solid #e6e6e1;font-size:15px;color:#1d1d1b;font-weight:600;vertical-align:top">${esc(f[1])}</td></tr>`).join('');
  const paras = (p.paragraphs || []).map((t) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#1d1d1b">${esc(t)}</p>`).join('');
  const button = p.button ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr><td style="border-radius:12px;background:${GREEN}"><a href="${esc(p.button.url)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px">${esc(p.button.label)}</a></td></tr></table>` : '';
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(p.title || 'GuidEd')}</title></head>
<body style="margin:0;padding:0;background:#f3f2ee;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3f2ee">${esc(p.preheader || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f2ee"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <tr><td style="padding:0 4px 18px"><a href="${site}" style="text-decoration:none"><img src="${site}/icons/icon-192.png" width="40" height="40" alt="GuidEd" style="vertical-align:middle;border-radius:10px;border:0"><span style="vertical-align:middle;margin-left:10px;font-size:20px;font-weight:700;color:#1d1d1b;letter-spacing:-.2px">GuidEd</span></a></td></tr>
    <tr><td style="background:#ffffff;border-radius:18px;padding:34px 30px 26px;border:1px solid #e6e6e1">
      <h1 style="margin:0 0 14px;font-size:26px;line-height:1.25;color:#1d1d1b;font-weight:700;letter-spacing:-.3px">${esc(p.title || '')}</h1>
      ${p.intro ? `<p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#1d1d1b">${esc(p.intro)}</p>` : ''}
      ${facts ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border-top:1px solid #e6e6e1">${facts}</table>` : ''}
      ${paras}${button}
      ${p.closing ? `<p style="margin:0;font-size:15px;line-height:1.55;color:#6b6b66">${esc(p.closing)}</p>` : ''}
    </td></tr>
    <tr><td style="padding:20px 8px 0;font-size:12.5px;line-height:1.6;color:#8a8a84;text-align:center">
      GuidEd · Lesson plans for Ghanaian teachers<br>
      <a href="${site}/about" style="color:#8a8a84">About</a> &nbsp;·&nbsp; <a href="${site}/privacy" style="color:#8a8a84">Privacy</a> &nbsp;·&nbsp; <a href="${site}/refunds" style="color:#8a8a84">Refunds</a> &nbsp;·&nbsp; <a href="mailto:hello@guidedgh.site" style="color:#8a8a84">hello@guidedgh.site</a><br>
      You are receiving this because you have a GuidEd account.
    </td></tr>
  </table>
</td></tr></table></body></html>`;
  const text = [p.title, '', p.intro, p.intro ? '' : null, ...(p.facts || []).map((f) => f[0] + ': ' + f[1]), (p.facts || []).length ? '' : null, ...(p.paragraphs || []).flatMap((t) => [t, '']), p.button ? p.button.label + ': ' + p.button.url : null, p.button ? '' : null, p.closing, '', '—', 'GuidEd · ' + site, 'Questions? hello@guidedgh.site'].filter((x) => x !== null && x !== undefined).join('\n');
  return { html, text };
}

const fmtDate = (ms) => new Date(Number(ms)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function proEnding(left, expiresAt) {
  const url = SITE() + '/?upgrade=1';
  return {
    subject: 'Your GuidEd Pro ends in ' + left + (left === 1 ? ' day' : ' days'),
    ...layout({
      preheader: 'Pro ends on ' + fmtDate(expiresAt) + '. Add more time in a few taps.',
      title: 'Your Pro ends in ' + left + (left === 1 ? ' day' : ' days'),
      intro: 'Hello, your GuidEd Pro plan is almost over. Here is what happens next.',
      facts: [['Pro ends', fmtDate(expiresAt)], ['After that', 'The free plan: 3 full plans a week, one class, and a footer on Word files']],
      paragraphs: ['To keep every class, unlimited plans and clean Word files, add more time before it ends. New time is added on top of what you have left, and nothing renews by itself.'],
      button: { label: 'Extend Pro', url },
      closing: 'Thank you for planning with GuidEd.',
    }),
  };
}

module.exports = { layout, proEnding, fmtDate, SITE };
