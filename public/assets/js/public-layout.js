/**
 * Shared header/footer for every public page. Content here reflects
 * only what is verifiably on the school's real flyer — motto, address,
 * contact numbers, hours.
 */
const NAV_LINKS = [
  { href: '/index.html', label: 'Home' },
  { href: '/about.html', label: 'About' },
  { href: '/classes.html', label: 'Classes' },
  { href: '/admissions.html', label: 'Admissions' },
  { href: '/reviews.html', label: 'Reviews' },
  { href: '/contact.html', label: 'Contact' },
];

const PHONE_DISPLAY = '678 091 643';
const PHONE_TEL = '+237678091643';
const PHONE2_DISPLAY = '650 873 589';
const PHONE2_TEL = '+237650873589';
const EMAIL = window.APP_CONFIG?.SCHOOL_EMAIL || 'info@fugobpans.example';

function headerHtml() {
  const current = location.pathname.split('/').pop() || 'index.html';
  const navItems = () => NAV_LINKS.map((l) => `<a href="${l.href}" ${l.href.endsWith(current) ? 'aria-current="page"' : ''}>${l.label}</a>`).join('');
  return `
    <div class="ticker-bar" role="marquee" aria-label="School announcements">
      <div class="ticker-track">
        ${Array(2).fill(0).map(() => `
          <span class="ticker-item">🎓 Admissions open for the new academic year — Register online in minutes</span>
          <span class="ticker-item">📞 Call us: <a href="tel:${PHONE_TEL}">${PHONE_DISPLAY}</a></span>
          <span class="ticker-item">🌍 A truly bilingual (English &amp; French) education, Pre-Nursery to Class 6</span>
        `).join('')}
      </div>
    </div>
    <header class="site-header">
      <div class="bar">
        <a href="/index.html" class="brand"><span class="mark">FG</span> FUGOBPANS</a>
        <nav class="site-nav" aria-label="Primary">${navItems()}</nav>
        <div class="site-header-actions">
          <a href="/login.html" class="btn btn-outline btn-sm">Staff Login</a>
          <a href="/register.html" class="btn btn-accent btn-sm" data-track="cta_register_header">Register Now</a>
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
        <a href="/register.html" class="btn btn-accent btn-block" data-track="cta_register_drawer">Register Now</a>
      </div>
    </div>
    <a href="tel:${PHONE_TEL}" class="sticky-cta no-print" data-track="sticky_call_click" aria-label="Call the school">📞 Call ${PHONE_DISPLAY}</a>`;
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
        <div><h4 style="color:#fff;">Contact</h4><p style="color:rgba(255,255,255,.65);">
          Mundani, Souza<br/>
          <a href="tel:${PHONE_TEL}" data-track="footer_phone_click">${PHONE_DISPLAY}</a> /
          <a href="tel:${PHONE2_TEL}" data-track="footer_phone_click">${PHONE2_DISPLAY}</a><br/>
          <a href="mailto:${EMAIL}" data-track="footer_email_click">${EMAIL}</a><br/>
          Mon–Fri, 7:30am–2:30pm
        </p></div>
      </div>
      <div class="container" style="border-top:1px solid rgba(255,255,255,.1);margin-top:24px;padding-top:16px;color:rgba(255,255,255,.5);font-size:.8rem;display:flex;gap:16px;flex-wrap:wrap;justify-content:space-between;">
        <span>© ${new Date().getFullYear()} FUGOBPANS. All rights reserved.</span>
        <span><a href="/privacy-policy.html">Privacy Policy</a> · <a href="/terms.html">Terms &amp; Conditions</a> · <a href="/cookie-policy.html">Cookie Policy</a></span>
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

/** Fires a Google Analytics event for every element carrying data-track, without ever including personal data. */
function wireTracking() {
  document.querySelectorAll('[data-track]').forEach((el) => {
    el.addEventListener('click', () => {
      if (typeof window.gtag === 'function') {
        window.gtag('event', el.dataset.track, { event_category: 'engagement' });
      }
    });
  });
}

/**
 * Cookie consent + conditional Analytics loading.
 * The session-login cookie is strictly necessary (only ever set once a
 * staff/teacher/student actually logs in) and is never gated by this —
 * only the OPTIONAL analytics script is. Nothing personally identifying
 * is ever sent to Analytics (see docs/privacy — event names only, no
 * names/emails/IDs in any tracked event).
 */
function loadAnalytics() {
  const gaId = window.APP_CONFIG?.GA_MEASUREMENT_ID;
  if (!gaId || document.getElementById('ga-script')) return;
  const script = document.createElement('script');
  script.id = 'ga-script';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
  document.head.appendChild(script);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', gaId, { anonymize_ip: true });
}

function wireCookieConsent() {
  const KEY = 'fugobpans_cookie_consent';
  const existing = localStorage.getItem(KEY);
  if (existing === 'accepted') { loadAnalytics(); return; }
  if (existing === 'declined') return;

  const banner = document.createElement('div');
  banner.className = 'cookie-consent';
  banner.innerHTML = `
    <p>We use a strictly-necessary cookie to keep staff/student portal logins working, and — only with your consent — optional analytics to understand how visitors use this site. See our <a href="/cookie-policy.html">Cookie Policy</a>.</p>
    <div class="cookie-consent-actions">
      <button class="btn btn-outline btn-sm" id="cookieDecline">Decline</button>
      <button class="btn btn-accent btn-sm" id="cookieAccept">Accept</button>
    </div>`;
  document.body.appendChild(banner);

  document.getElementById('cookieAccept').addEventListener('click', () => {
    localStorage.setItem(KEY, 'accepted');
    loadAnalytics();
    banner.remove();
  });
  document.getElementById('cookieDecline').addEventListener('click', () => {
    localStorage.setItem(KEY, 'declined');
    banner.remove();
  });
}

function mount() {
  const h = document.getElementById('siteHeader');
  const f = document.getElementById('siteFooter');
  if (h) { h.outerHTML = headerHtml(); wireDrawer(); }
  if (f) { f.outerHTML = footerHtml(); }
  wireTracking();
  wireCookieConsent();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
