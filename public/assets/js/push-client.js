/** Browser side of web push: permission, subscription, server registration and the notification-settings dialog. */
import { api } from './api.js';
import { modal } from './ui.js';
import { toast, escapeHtml } from './utils.js';

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const keyToBytes = (b64u) => { const p = '='.repeat((4 - (b64u.length % 4)) % 4); const raw = atob((b64u + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration('/');
  return existing || navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => navigator.serviceWorker.ready);
}
const currentSub = async () => (pushSupported() ? (await (await registration()).pushManager.getSubscription()) : null);

export async function serverStatus() { return api.get('/push/status', { quiet: true }); }

/** Creates (or reuses) this device's subscription and registers it for the signed-in person. Needs permission already granted. */
export async function syncSubscription(status) {
  const st = status || await serverStatus();
  if (!st.configured || !pushSupported() || Notification.permission !== 'granted') return false;
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(st.publicKey) });
  await api.post('/push/subscribe', { subscription: sub.toJSON() });
  return true;
}

export async function enablePush() {
  if (!pushSupported()) throw new Error(isIOS && !standalone() ? 'On iPhone, first add this app to your Home Screen, open it from there, then turn notifications on.' : 'This browser does not support background notifications.');
  const st = await serverStatus();
  if (!st.configured) throw new Error('Phone notifications have not been set up on the server yet. Please tell the school owner.');
  const perm = await Notification.requestPermission(); // only ever called from a button tap
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked for this site. Allow them in your browser/site settings, then try again.' : 'Permission was not given.');
  await syncSubscription(st);
  return true;
}

export async function disablePush() {
  const sub = await currentSub();
  if (sub) { try { await api.post('/push/unsubscribe', { endpoint: sub.endpoint }); } catch { /* ignore */ } await sub.unsubscribe(); }
}

/** Called on logout: the next person on a shared phone must not receive this person's notifications. */
export async function detachDevice() {
  try { const sub = await currentSub(); if (sub) await api.post('/push/unsubscribe', { endpoint: sub.endpoint }); } catch { /* ignore */ }
}

/** Re-registers silently on every page load for people who already allowed notifications (handles rotated keys, shared phones). */
export async function autoSync() {
  try { if (pushSupported() && Notification.permission === 'granted') await syncSubscription(); } catch { /* quiet */ }
  navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.type === 'push-resubscribe') syncSubscription().catch(() => {}); });
}

/** One gentle, dismissible invitation (never an automatic permission pop-up). */
export async function maybeInvite(mount) {
  try {
    if (!pushSupported() || Notification.permission !== 'default' || localStorage.getItem('push-invite-dismissed')) return;
    const st = await serverStatus(); if (!st.configured) return;
    const bar = document.createElement('div');
    bar.className = 'card card-pad'; bar.style.cssText = 'margin-bottom:16px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;';
    bar.innerHTML = '<div><strong>Get notified on your phone</strong><div class="text-muted" style="font-size:.85rem;">Receive replies and school notices even when the app is closed.</div></div><div style="display:flex;gap:8px;"><button class="btn btn-primary btn-sm" data-on>Turn on</button><button class="btn btn-ghost btn-sm" data-no>Not now</button></div>';
    mount.prepend(bar);
    bar.querySelector('[data-no]').onclick = () => { try { localStorage.setItem('push-invite-dismissed', '1'); } catch {} bar.remove(); };
    bar.querySelector('[data-on]').onclick = async () => { try { await enablePush(); toast('Phone notifications are on.', 'success'); bar.remove(); } catch (e) { toast(e.message, 'error'); } };
  } catch { /* quiet */ }
}

export async function openNotificationSettings() {
  const m = modal('Notification settings', '<div class="spinner"></div>');
  const body = m.el.querySelector('.modal-body');
  const render = async () => {
    let st; try { st = await serverStatus(); } catch { body.innerHTML = '<p>Could not load settings.</p>'; return; }
    const sub = pushSupported() ? await currentSub() : null;
    const perm = pushSupported() ? Notification.permission : 'unsupported';
    let state;
    if (!st.configured) state = 'Phone notifications are not switched on by the school yet. You still get notifications inside the app (the bell).';
    else if (!pushSupported()) state = isIOS && !standalone() ? 'On iPhone/iPad, phone notifications work only after you add this app to your Home Screen (Share → Add to Home Screen) and open it from there. iOS 16.4 or newer is required.' : 'This browser cannot show background notifications. Try Chrome, Edge, Firefox or Samsung Internet.';
    else if (perm === 'denied') state = 'Notifications are blocked for this site. Allow them in your browser settings (site settings → Notifications), then come back here.';
    else if (sub && perm === 'granted') state = 'On for this device. You will be notified even when the app is closed.';
    else state = 'Off for this device.';
    const canToggle = st.configured && pushSupported() && perm !== 'denied';
    const p = st.preferences;
    body.innerHTML = `<p><strong>This device:</strong> ${escapeHtml(state)}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 16px;">
        ${canToggle && !(sub && perm === 'granted') ? '<button class="btn btn-primary" data-act="on">Turn on for this device</button>' : ''}
        ${sub && perm === 'granted' ? '<button class="btn btn-outline" data-act="off">Turn off for this device</button><button class="btn btn-outline" data-act="test">Send a test</button>' : ''}
      </div>
      <h4 style="margin:0 0 6px;">What should reach your phone?</h4>
      <label style="display:flex;gap:8px;align-items:center;margin:6px 0;"><input type="checkbox" data-pref="push_enabled" ${p.push_enabled ? 'checked' : ''}> Phone notifications (master switch)</label>
      <label style="display:flex;gap:8px;align-items:center;margin:6px 0;"><input type="checkbox" data-pref="push_messages" ${p.push_messages ? 'checked' : ''}> Messages and replies</label>
      <label style="display:flex;gap:8px;align-items:center;margin:6px 0;"><input type="checkbox" data-pref="push_updates" ${p.push_updates ? 'checked' : ''}> Announcements and other updates</label>
      <p class="text-muted" style="font-size:.8rem;margin-top:12px;">Everything is always kept in your notification bell, whatever you choose here.</p>`;
    body.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
      try {
        if (b.dataset.act === 'on') { await enablePush(); toast('Phone notifications are on.', 'success'); }
        if (b.dataset.act === 'off') { await disablePush(); toast('Turned off for this device.', 'success'); }
        if (b.dataset.act === 'test') { const r = await api.post('/push/test', {}); toast(r.sent ? 'Test sent — it should appear in a moment.' : 'Nothing was sent. Check the switches below.', r.sent ? 'success' : 'error'); }
      } catch (e) { toast(e.message, 'error'); }
      render();
    }));
    body.querySelectorAll('[data-pref]').forEach((c) => c.addEventListener('change', async () => {
      const next = { ...p }; body.querySelectorAll('[data-pref]').forEach((x) => { next[x.dataset.pref] = x.checked; });
      try { await api.put('/push/preferences', next); toast('Saved.', 'success'); } catch { /* toast shown */ }
    }));
  };
  render();
}
