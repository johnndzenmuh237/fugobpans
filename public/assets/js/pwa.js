/* Registers the service worker and shows a "Download app" button only where installing is really possible.
 *  - Android/desktop Chrome & Edge: real one-tap install via the browser prompt.
 *  - iPhone/iPad Safari: no install prompt exists, so we show the Share -> "Add to Home Screen" steps.
 *  - Already installed, or a browser that can't install: the button is not shown (we never promise what can't happen). */
(function () {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
  }
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const slots = () => [...document.querySelectorAll('[data-install-app]')];
  const setSlots = (on) => slots().forEach((b) => {
    if (on && !b.dataset.ready) { b.dataset.ready = '1'; if (!b.textContent.trim()) b.innerHTML = '<span>Install app</span>'; b.addEventListener('click', onClick); }
    b.style.display = on ? '' : 'none';
  });
  if (standalone) { document.addEventListener('DOMContentLoaded', () => setSlots(false)); return; }
  document.addEventListener('DOMContentLoaded', () => setSlots(!!deferred || iosSafari));

  let deferred = null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const iosSafari = ios && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);

  function button() {
    setSlots(true);
    if (document.getElementById('pwaInstallBtn') || document.querySelector('[data-install-app]')) return;
    const b = document.createElement('button');
    b.id = 'pwaInstallBtn'; b.type = 'button'; b.textContent = 'Download app';
    b.setAttribute('aria-label', 'Download the school app');
    b.style.cssText = 'position:fixed;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:9999;padding:11px 18px;border:0;border-radius:999px;background:#e0a93a;color:#12203d;font:700 .92rem system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.28);cursor:pointer;';
    b.addEventListener('click', onClick);
    document.body.appendChild(b);
  }
  function hide() { document.getElementById('pwaInstallBtn')?.remove(); setSlots(false); }
  async function onClick() {
    if (deferred) {
      deferred.prompt();
      const choice = await deferred.userChoice.catch(() => null);
      deferred = null;
      if (choice && choice.outcome === 'accepted') hide();
      return;
    }
    if (iosSafari) {
      const o = document.createElement('div');
      o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:flex-end;justify-content:center;';
      o.innerHTML = '<div style="background:#fff;color:#12203d;width:100%;max-width:460px;border-radius:16px 16px 0 0;padding:20px 20px calc(20px + env(safe-area-inset-bottom,0px));font-family:system-ui,sans-serif;"><strong style="font-size:1.05rem;">Add the app to your iPhone</strong><ol style="line-height:1.7;padding-left:20px;margin:10px 0;"><li>Tap the <strong>Share</strong> button at the bottom of Safari.</li><li>Choose <strong>Add to Home Screen</strong>.</li><li>Tap <strong>Add</strong>.</li></ol><button type="button" style="width:100%;padding:12px;border:0;border-radius:8px;background:#12203d;color:#fff;font-weight:700;">Got it</button></div>';
      o.addEventListener('click', (e) => { if (e.target === o || e.target.tagName === 'BUTTON') o.remove(); });
      document.body.appendChild(o);
    }
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; button(); });
  window.addEventListener('appinstalled', () => { deferred = null; hide(); });
  if (iosSafari) window.addEventListener('DOMContentLoaded', button);
})();