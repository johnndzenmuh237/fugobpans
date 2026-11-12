/* Install-as-app support: service worker + an "Install app" pop-up and buttons on every page. */
const HAS_ICONS = true;
const ic = (n) => (HAS_ICONS ? `<i data-icon="${n}"></i>` : '');
if (HAS_ICONS) import('./icons.js').catch(() => {});

// Register at once (not after "load"): the browser only offers installation once an active worker exists.
let swReady = Promise.resolve(null);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  swReady = navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
    .then(() => navigator.serviceWorker.ready).catch((e) => { console.warn('[pwa] service worker failed:', e.message); return null; });
}

/** Works out WHY installation is not available on this device, so the person is told something true and useful. */
async function diagnose() {
  const ua = navigator.userAgent;
  if (standalone()) return { ok: true, text: 'The app is already installed and you are using it.' };
  if (!window.isSecureContext) return { text: 'This page is not on a secure (https) address, so the browser will not install it.' };
  if (/FBAN|FBAV|Instagram|Line\/|MicroMessenger|Telegram|; wv\)|WhatsApp/i.test(ua)) return { text: 'You opened this link inside another app (WhatsApp, Facebook, Telegram…). Tap its ⋮ menu and choose "Open in Chrome", then try again.' };
  if (!('serviceWorker' in navigator)) return { text: 'This browser cannot install web apps. Open the site in Chrome, Edge, Samsung Internet or Safari.' };
  const reg = await swReady;
  if (!reg) return { text: 'The app engine (service worker) did not start. Check that you are online, reload the page once, and try again.' };
  if (isIOS) return { ok: true, ios: true };
  try {
    if (navigator.getInstalledRelatedApps) { const apps = await navigator.getInstalledRelatedApps(); if (apps.length) return { text: 'The app is already installed on this phone. Look for the FUGOBPANS icon on your home screen or app list.' }; }
  } catch { /* not supported */ }
  return { ok: true, manual: true };
}

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const KEY = 'pwa-banner-hidden-until';
let deferred = null;

function hideBannerFor(days) { try { localStorage.setItem(KEY, String(Date.now() + days * 864e5)); } catch { /* private mode */ } document.querySelector('.install-banner')?.remove(); }
const bannerAllowed = () => { try { return Date.now() > Number(localStorage.getItem(KEY) || 0); } catch { return true; } };

function help(d = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  const note = d.text ? `<p style="background:var(--slate-100,#f1f5f9);padding:10px 12px;border-radius:8px;"><b>${d.text}</b></p>` : '';
  const steps = d.text ? '' : isIOS
    ? `<ol><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button ${ic('share')} at the bottom.</li><li>Scroll and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>`
    : `<ol><li>Open this page in <b>Chrome</b> (or Edge).</li><li>Tap the <b>⋮ menu</b> at the top right.</li><li>Tap <b>Install app</b> (or <b>Add to Home screen</b>).</li></ol><p class="text-muted" style="font-size:.85rem;">If "Install app" is missing from the menu, your phone may not support installing web apps (for example, no Google Play services). "Add to Home screen" still creates a shortcut that opens the site.</p>`;
  wrap.innerHTML = `<div class="modal" style="max-width:420px;width:94%;"><div class="modal-head"><h3>${ic('smartphone')} Install the app</h3><button class="btn btn-ghost btn-sm" data-x aria-label="Close">&times;</button></div>
    <div class="modal-body"><p>Put FUGOBPANS on your phone like a normal app. It opens full screen and needs no app store.</p>${note}${steps}<button class="btn btn-primary btn-block" data-x>Got it</button></div></div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-x]')) wrap.remove(); });
}

async function install() {
  if (!deferred) {
    const d = await diagnose();
    if (!d.ok || d.ios || d.manual) return help(d);
  }
  if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch { /* ignore */ } deferred = null; document.querySelector('.install-banner')?.remove(); return; }
  help();
}

function showBanner() {
  if (standalone() || !bannerAllowed() || document.querySelector('.install-banner')) return;
  const b = document.createElement('div');
  b.className = 'install-banner'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'Install the app');
  b.innerHTML = `<img src="/assets/icons/icon-192.png" width="44" height="44" alt="" /><div class="ib-text"><strong>Install FUGOBPANS</strong><span>${isIOS ? 'Add it to your home screen.' : 'Get the app on your phone.'}</span></div>
    <button type="button" class="btn btn-accent btn-sm" data-go>${isIOS ? 'Show me how' : 'Install'}</button><button type="button" class="btn btn-ghost btn-sm" data-no aria-label="Not now">&times;</button>`;
  document.body.appendChild(b);
  b.querySelector('[data-go]').addEventListener('click', install);
  b.querySelector('[data-no]').addEventListener('click', () => hideBannerFor(7));
}

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; setTimeout(showBanner, 1500); });
// Pages can ask for the same help dialog (used by the notification settings).
window.APP_INSTALL = { install, isStandalone: standalone, isIOS };
window.addEventListener('appinstalled', () => { deferred = null; document.querySelectorAll('[data-install-app], .install-banner').forEach((n) => n.remove()); });

function mount() {
  if (standalone()) return;
  let buttons = [...document.querySelectorAll('[data-install-app]')];
  if (!buttons.length) {
    const f = document.createElement('button');
    f.type = 'button'; f.setAttribute('data-install-app', ''); f.className = 'install-fab';
    document.body.appendChild(f); buttons = [f];
  }
  buttons.forEach((b) => {
    if (b.dataset.ready) return; b.dataset.ready = '1';
    if (!b.innerHTML.trim()) b.innerHTML = `${ic('download')} <span>Install app</span>`;
    b.addEventListener('click', install);
  });
  if (isIOS && !standalone()) setTimeout(showBanner, 2500); // iPhone has no install event, so show the steps once
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
window.addEventListener('load', () => setTimeout(mount, 300));
