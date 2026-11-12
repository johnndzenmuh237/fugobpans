/**
 * Adds the app-install lines (manifest, theme colour, icon, install button script) to every page in /public.
 * Safe to run more than once: pages that already have them are skipped. Nothing else on a page is changed.
 * Run:  node scripts/add-pwa-tags.js
 */
const fs = require('fs');
const path = require('path');

const TAGS = `<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#12203d" />
<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="FUGOBPANS" />
<script src="/assets/js/pwa.js" defer></script>
`;

const root = path.join(__dirname, '..', 'public');
let changed = 0, skipped = 0;
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { if (name !== 'node_modules') walk(full); continue; }
    if (!name.endsWith('.html') || name === 'offline.html') continue;
    const html = fs.readFileSync(full, 'utf8');
    if (html.includes('manifest.webmanifest') || !html.includes('</head>')) { skipped += 1; continue; }
    fs.writeFileSync(full, html.replace('</head>', `${TAGS}</head>`));
    changed += 1;
  }
})(root);
console.log(`Pages updated: ${changed}. Already done or skipped: ${skipped}.`);