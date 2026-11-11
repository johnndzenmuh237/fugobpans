#!/usr/bin/env node
/**
 * apply-icons.js — replace every emoji in the website and dashboards with real vector icons.
 *
 *   Run from your project folder (the one containing package.json and public/):
 *       node apply-icons.js
 *
 * What it does
 *   1. Downloads the open-source Lucide icon set (ISC licence) into a temporary folder.
 *   2. Writes public/assets/js/icons.js  (only the icons the site uses, inline, works offline).
 *   3. Adds a few lines of CSS to public/assets/css/style.css.
 *   4. Adds <script type="module" src="/assets/js/icons.js"> to every HTML page.
 *   5. Replaces emoji in HTML and JS files with <i data-icon="name"></i> placeholders,
 *      which icons.js turns into SVG icons on every page (including menus built by scripts).
 *
 * Safe to run more than once. Commit first (git add . && git commit) so you can undo with
 *   git restore .
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const PUB = path.join(ROOT, 'public');
if (!fs.existsSync(PUB)) { console.error('Run this from your project folder (it must contain a "public" folder).'); process.exit(1); }

// ---------------------------------------------------------------- 1. get Lucide
const TMP = path.join(os.tmpdir(), 'lucide-icons-tmp');
const ICON_DIR = path.join(TMP, 'node_modules', 'lucide-static', 'icons');
if (!fs.existsSync(ICON_DIR)) {
  console.log('Downloading the Lucide icon set (one time)...');
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(path.join(TMP, 'package.json'), '{"name":"tmp","private":true}');
  try { execSync('npm install lucide-static@1.70.0 --no-audit --no-fund --loglevel=error', { cwd: TMP, stdio: 'inherit' }); }
  catch { console.error('Could not download the icons. Check your internet connection and try again.'); process.exit(1); }
}

// ---------------------------------------------------------------- 2. icons.js
const NAMES = `bell bell-ring star circle-check circle-x triangle-alert layout-dashboard pin mail mail-open wallet banknote clipboard-list clock calendar calendar-days file-pen
school user users graduation-cap chart-column package phone circle-dot party-popper book-open receipt download smartphone share plus menu log-out lock key-round folder-open check
badge-check hourglass image-up upload shield-check landmark scroll-text clipboard-check trending-up search info circle-alert external-link copy printer file-text eye x arrow-left
arrow-right square-pen settings user-round id-card hand-coins layers list-checks messages-square map-pin megaphone globe house building-2 leaf credit-card square-plus briefcase`.split(/\s+/);
const icons = {};
for (const n of NAMES) {
  const f = path.join(ICON_DIR, `${n}.svg`);
  if (!fs.existsSync(f)) { console.warn(`  (icon "${n}" not found, skipped)`); continue; }
  icons[n] = fs.readFileSync(f, 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s+/g, ' ').trim();
}
const iconsJs = `// Icons: Lucide (https://lucide.dev), ISC licence. Only the icons this site uses are included, inline, so they work offline and never fail to load.
// Usage in markup (HTML or JS strings):  <i data-icon="bell"></i>      or in code:  icon('bell')
const ICONS = ${JSON.stringify(icons, null, 1)};
ICONS['star-filled'] = ICONS.star;

export function icon(name, { cls = '', size = null } = {}) {
  const inner = ICONS[name];
  if (!inner) return '';
  const filled = name === 'star-filled';
  const dim = size ? \` width="\${size}" height="\${size}"\` : '';
  return \`<svg class="icon \${cls}" xmlns="http://www.w3.org/2000/svg"\${dim} viewBox="0 0 24 24" fill="\${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">\${inner}</svg>\`;
}

export function hydrateIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach((el) => {
    const svg = icon(el.getAttribute('data-icon'), { cls: el.className || '', size: el.getAttribute('data-size') });
    if (svg) el.outerHTML = svg; else el.remove();
  });
}

// Replace placeholders now and whenever pages add new HTML later (menus, tables, notification panel...).
function start() {
  hydrateIcons();
  new MutationObserver((muts) => { for (const m of muts) m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.matches && n.matches('i[data-icon]')) hydrateIcons(n.parentNode || document); else if (n.querySelector && n.querySelector('i[data-icon]')) hydrateIcons(n); } }); })
    .observe(document.documentElement, { childList: true, subtree: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
`;
fs.mkdirSync(path.join(PUB, 'assets', 'js'), { recursive: true });
fs.writeFileSync(path.join(PUB, 'assets', 'js', 'icons.js'), iconsJs);
console.log(`Wrote public/assets/js/icons.js (${Object.keys(icons).length} icons)`);

// ---------------------------------------------------------------- 3. CSS
const cssPath = path.join(PUB, 'assets', 'css', 'style.css');
const CSS_MARK = '/* ---- Icons (inline SVG, Lucide) ---- */';
if (fs.existsSync(cssPath) && !fs.readFileSync(cssPath, 'utf8').includes(CSS_MARK)) {
  fs.appendFileSync(cssPath, `\n${CSS_MARK}
.icon { width: 1.15em; height: 1.15em; vertical-align: -0.2em; flex: none; }
.icon-star { color: #f59e0b; }
.app-sidebar .ico { display: inline-flex; width: 22px; justify-content: center; }
.app-sidebar .ico .icon { width: 18px; height: 18px; }
i[data-icon] { display: inline-block; width: 1.15em; height: 1.15em; }
`);
  console.log('Added icon styles to style.css');
}

// ---------------------------------------------------------------- 4 + 5. sweep files
const MAP = {
  0x1F514: 'bell', 0x1F4CB: 'clipboard-list', 0x1F4B3: 'credit-card', 0x1F464: 'user', 0x1F4C5: 'calendar', 0x1F4B0: 'wallet', 0x1F4B5: 'banknote', 0x1F4B8: 'banknote',
  0x26A0: 'triangle-alert', 0x1F9FE: 'receipt', 0x1F4DD: 'file-pen', 0x1F465: 'users', 0x1F3EB: 'school', 0x1F4CC: 'pin', 0x2705: 'circle-check', 0x274C: 'circle-x',
  0x1F4DA: 'book-open', 0x1F30D: 'globe', 0x1F469: 'graduation-cap', 0x1F4E2: 'megaphone', 0x25A0: 'layout-dashboard', 0x2709: 'mail', 0x1F551: 'clock', 0x1F4D1: 'clipboard-list',
  0x1F393: 'graduation-cap', 0x1F33F: 'leaf', 0x1F334: 'leaf', 0x1F4CA: 'chart-column', 0x1F4C8: 'trending-up', 0x1F4E6: 'package', 0x1F46A: 'users', 0x1F511: 'key-round',
  0x1F510: 'lock', 0x1F4C1: 'folder-open', 0x1F4C4: 'file-text', 0x1F4CD: 'map-pin', 0x1F3E0: 'house', 0x1F3D8: 'building-2', 0x1F3E2: 'building-2', 0x1F389: 'party-popper',
  0x1F534: 'circle-dot', 0x1F7E1: 'circle-dot', 0x1F7E0: 'circle-dot', 0x1F6A8: 'triangle-alert', 0x2139: 'info', 0x2605: 'star-filled', 0x2606: 'star', 0x2B50: 'star',
  0x1F4BC: 'briefcase', 0x2699: 'settings', 0x1F4DE: 'phone', 0x23F3: 'hourglass', 0x231B: 'hourglass', 0x2713: 'check', 0x2714: 'check',
};
const EMO = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF\u2B50\u2705\u274C\u25A0\u2139\u2605\u2606\u23F3\u231B](?:\uFE0F|\u200D[\u{1F300}-\u{1FAFF}])*/gu;
const ENT = /&#(\d+);/g;
const ORPHAN = ['assets/js/pages/', 'assets/js/pages-public/', 'listings.html', 'property.html', 'tenant-portal.html', 'assets/js/tenant-portal.js']; // leftover property-management pages: just remove emoji
const tag = (n) => `<i data-icon="${n}"></i>`;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); } else if (/\.(html|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

// Lines where an HTML tag would show up as plain text (messages, titles, attributes): drop the emoji instead.
const PLAIN_LINE = /(toast\(|alert\(|confirm\(|prompt\(|\.textContent\s*=|document\.title|<title>|<option|emptyMessage)/; // attributes (aria-label, title...) are handled separately below

let changedFiles = 0, converted = 0, removed = 0, scripts = 0;
for (const file of walk(PUB)) {
  const rel = path.relative(PUB, file).replace(/\\/g, '/');
  if (rel.endsWith('assets/js/icons.js')) continue;
  const isHtml = file.endsWith('.html');
  const strip = ORPHAN.some((o) => rel.startsWith(o) || rel === o);
  let s = fs.readFileSync(file, 'utf8'); const before = s;

  s = s.replace(/(<option[^>]*>)([^<]*)(<\/option>)/g, (m, a, t, c) =>
    a + t.replace(/★★★★★/g, '5 stars —').replace(/★★★★☆/g, '4 stars —').replace(/★★★☆☆/g, '3 stars —').replace(/★★☆☆☆/g, '2 stars —').replace(/★☆☆☆☆/g, '1 star —').replace(EMO, '') + c);
  s = s.replace(/'★'\.repeat\(n\) \+ '☆'\.repeat\(5 - n\)/g, `'<i data-icon="star-filled" class="icon-star"></i>'.repeat(n) + '<i data-icon="star" class="icon-star"></i>'.repeat(5 - n)`);

  s = s.split('\n').map((line) => {
    const plain = strip || PLAIN_LINE.test(line);
    const rep = (cp) => { const name = MAP[cp]; if (plain || !name) { removed++; return ''; } converted++; return tag(name); };
    line = line.replace(ENT, (m, n) => { const cp = Number(n); if (MAP[cp] || cp >= 0x2000) return rep(cp); return m; });
    line = line.replace(EMO, (m) => rep(m.codePointAt(0)));
    return line;
  }).join('\n').replace(/\uFE0F/g, '');

  // an icon tag must never end up inside an HTML attribute value
  let guard = 0; const attrRe = /(\b(?:title|alt|placeholder|aria-label|value|content)=["'][^"'<]*)<i data-icon="[a-z0-9-]+"( class="[^"]*")?><\/i>/g;
  while (attrRe.test(s) && guard++ < 20) s = s.replace(attrRe, '$1');

  if (isHtml && !rel.endsWith('offline.html') && !s.includes('/assets/js/icons.js') && s.includes('</body>')) {
    s = s.replace('</body>', '<script type="module" src="/assets/js/icons.js"></script>\n</body>'); scripts++;
  }
  if (s !== before) { fs.writeFileSync(file, s, 'utf8'); changedFiles++; }
}

console.log(`\nDone.\n  files updated:        ${changedFiles}\n  emoji -> icons:       ${converted}\n  emoji removed:        ${removed} (in messages, titles and unused pages)\n  pages given the icon loader: ${scripts}`);
console.log('\nNext:  npm start   (or commit and push: git add . && git commit -m "Real icons" && git push)');
