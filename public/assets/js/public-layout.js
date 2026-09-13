/**
 * Shared header/footer for every public page. Content here reflects
 * only what is verifiably on the school's real flyer — motto, address,
 * contact numbers, hours (see docs/content-sources.md for exactly which
 * fields are confirmed vs. still pending from the Manager).
 */
const NAV_LINKS = [
  { href: '/index.html', label: 'Home' },
  { href: '/about.html', label: 'About' },
  { href: '/classes.html', label: 'Classes' },
  { href: '/admissions.html', label: 'Admissions' },
  { href: '/contact.html', label: 'Contact' },
];

function headerHtml() {
  const current = location.pathname.split('/').pop() || 'index.html';
  const navItems = () => NAV_LINKS.map((l) => `<a href="${l.href}" ${l.href.endsWith(current) ? 'aria-current="page"' : ''}>${l.label}</a>`).join('');
  return `
    <header class="site-header">
      <div class="bar">
        <a href="/index.html" class="brand"><span class="mark">FG</span> FUGOBPANS</a>
        <nav class="site-nav" aria-label="Primary">${navItems()}</nav>
        <div class="site-header-actions">
          <a href="/login.html" class="btn btn-outline btn-sm">Staff Login</a>
          <a href="/register.html" class="btn btn-accent btn-sm">Register Now</a>
          <button class="drawer-toggle" id="siteDrawerToggle" aria-label="Open menu" aria-expanded="false"></button>
        </div>
      </div>
    </header>
    <div class="drawer-backdrop" id="siteDrawerBackdrop"></div>
    <div class="drawer" id="siteDrawer" aria-hidden="true">
      <button class="drawer-close" id="siteDrawerClose" aria-label="Close menu">&times;</button>
      <div class="brand" style="margin-top:14px;"><span class="mark">FG</span> FUGOBPANS</div>
      <nav aria-label="Mobile">${navItems()}</nav>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:22px;">
        <a href="/login.html" class="btn btn-outline btn-block">Staff Login</a>
        <a href="/register.html" class="btn btn-accent btn-block">Register Now</a>
      </div>
    </div>`;
}

function footerHtml() {
  return `
    <footer class="site-footer">
      <div class="container footer-grid">
        <div>
          <div class="brand" style="color:#fff;margin-bottom:10px;"><span class="mark">FG</span> FUGOBPANS</div>
          <p style="color:rgba(255,255,255,.65);max-width:34ch;">Full Gospel Bilingual Nursery and Primary School — Mundani, after carrefour Graceland, opposite Full Gospel Church, Souza.</p>
          <p style="color:rgba(255,255,255,.5);font-style:italic;margin-top:10px;">"Progressive — Excellence through the fear of the Lord"</p>
        </div>
        <div><h4 style="color:#fff;">Explore</h4><ul style="list-style:none;padding:0;">${NAV_LINKS.map((l) => `<li style="margin-bottom:8px;"><a href="${l.href}">${l.label}</a></li>`).join('')}</ul></div>
        <div><h4 style="color:#fff;">Portal</h4><ul style="list-style:none;padding:0;">
          <li style="margin-bottom:8px;"><a href="/register.html">Register a Student</a></li>
          <li style="margin-bottom:8px;"><a href="/login.html">Staff Login</a></li>
        </ul></div>
        <div><h4 style="color:#fff;">Contact</h4><p style="color:rgba(255,255,255,.65);">Mundani, Souza<br/>678 091 643 / 650 873 589<br/>Mon–Fri, 7:30am–2:30pm</p></div>
      </div>
      <div class="container" style="border-top:1px solid rgba(255,255,255,.1);margin-top:24px;padding-top:16px;color:rgba(255,255,255,.5);font-size:.8rem;">
        © ${new Date().getFullYear()} FUGOBPANS. All rights reserved.
      </div>
    </footer>`;
}

function wireDrawer() {
  const drawer = document.getElementById('siteDrawer');
  const backdrop = document.getElementById('siteDrawerBackdrop');
  const toggle = document.getElementById('siteDrawerToggle');
  const closeBtn = document.getElementById('siteDrawerClose');
  const open = () => { drawer.classList.add('is-open'); backdrop.classList.add('is-open'); drawer.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; };
  const close = () => { drawer.classList.remove('is-open'); backdrop.classList.remove('is-open'); drawer.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; };
  toggle.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  drawer.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
}

function mount() {
  const h = document.getElementById('siteHeader');
  const f = document.getElementById('siteFooter');
  if (h) { h.outerHTML = headerHtml(); wireDrawer(); }
  if (f) { f.outerHTML = footerHtml(); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
