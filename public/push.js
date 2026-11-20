// Cài app (PWA) + thông báo đẩy ngoài app (Web Push)
import { api, esc, S, toast, fail, actions } from './core.js';

const ua = navigator.userAgent || '';
export const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; });
window.addEventListener('appinstalled', () => { installEvent = null; });

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  // bấm vào thông báo khi app đang mở: chuyển tới đúng trang
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type !== 'nav') return;
    try { const h = new URL(e.data.url).hash; if (h) location.hash = h; } catch { /* bỏ qua */ }
  });
}

const b64ToU8 = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const thisSub = async () => {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
};

// Đăng nhập lại / mở app: gắn thiết bị đã được cấp quyền vào tài khoản hiện tại (kể cả khi endpoint đổi)
export async function syncPush() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return;
    const sub = await thisSub();
    if (sub) await api('POST', '/push/subscribe', { subscription: sub.toJSON() });
  } catch { /* không quan trọng */ }
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('Trình duyệt này chưa hỗ trợ thông báo đẩy');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Bạn chưa cho phép thông báo. Hãy bật quyền thông báo cho trang này trong cài đặt trình duyệt.');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api('GET', '/push/config');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) }); }
    catch (e) { throw new Error('Không bật được thông báo: ' + (e.message || e.name)); }
  }
  await api('POST', '/push/subscribe', { subscription: sub.toJSON() });
}

export async function disablePush() {
  const sub = await thisSub();
  if (sub) {
    await api('POST', '/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}
// Khi đăng xuất: thiết bị này không nhận thông báo của tài khoản cũ nữa
export const unsubscribeThisDevice = () => disablePush();

const PREF_LABELS = {
  mention: 'Khi có người nhắc đến tôi (@tên)',
  reply: 'Khi có người trả lời tin của tôi',
  heart: 'Khi tin của tôi nhận được tim (ở mốc 1, 5, 10, 25, 50, 100)',
  dm: 'Tin nhắn riêng',
  social: 'Lời mời kết bạn, mời vào nhóm',
  system: 'Thông báo từ quản trị (xử lý báo cáo, vi phạm)',
};

// Khối giao diện trong trang Cài đặt
export async function pushSectionHtml() {
  const wrap = (inner) => `<section class="card col" id="pushsec"><div class="h2" style="margin:0">Cài app & thông báo đẩy</div>${inner}</section>`;
  const ios = isIOS && !isStandalone();
  let install = '';
  if (isStandalone()) install = '<p class="small muted">✅ Bạn đang dùng JKR talks như một app trên màn hình chính.</p>';
  else if (isIOS) install = '<p class="small">Trên iPhone/iPad: bấm nút <b>Chia sẻ</b> (hình vuông có mũi tên lên) trong Safari, chọn <b>Thêm vào Màn hình chính</b>, rồi mở JKR talks từ biểu tượng mới để bật thông báo.</p>';
  else if (installEvent) install = '<button class="btn" data-act="install-app">Cài app lên màn hình chính</button>';
  else install = '<p class="small muted">Để cài app: mở menu của trình duyệt và chọn "Cài đặt ứng dụng" hoặc "Thêm vào màn hình chính".</p>';

  if (ios) return wrap(`${install}<p class="small muted">iPhone chỉ nhận được thông báo đẩy sau khi bạn thêm app vào Màn hình chính (iOS 16.4 trở lên).</p>`);
  if (!pushSupported()) return wrap(`${install}<p class="small muted">Trình duyệt này chưa hỗ trợ thông báo đẩy.</p>`);
  if (Notification.permission === 'denied') return wrap(`${install}<p class="small">Thông báo đang bị chặn cho trang này. Hãy bật lại quyền thông báo trong cài đặt của trình duyệt (hoặc của app), rồi tải lại trang.</p>`);

  const sub = await thisSub();
  let cfg;
  try { cfg = await api('GET', '/push/config'); } catch { cfg = null; }
  if (!sub || !cfg) {
    return wrap(`${install}<p class="small muted">Nhận thông báo ngay cả khi bạn không mở app: khi có người nhắc đến, trả lời bạn hoặc nhắn tin riêng.</p>
      <button class="btn primary" data-act="push-on">Bật thông báo trên thiết bị này</button>`);
  }
  return wrap(`${install}<p class="small">✅ Thiết bị này đang nhận thông báo đẩy. Bản tin mới được bật/tắt ở mục "Quyền riêng tư & thông báo" bên dưới.</p>
    <div class="col" id="pushprefs">${Object.entries(PREF_LABELS).map(([k, l]) => `<label class="check"><input type="checkbox" data-pref="${k}" ${cfg.prefs[k] ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>
    <button class="btn" data-act="push-off">Tắt thông báo trên thiết bị này</button>`);
}

// ---- Xin bật thông báo đúng lúc, nhớ lựa chọn của người dùng ------------------
// Hỏi tối đa 3 lần: lần 1 ngay, lần 2 sau 3 ngày, lần 3 sau 7 ngày. "Đừng hỏi nữa"/bị chặn/đã bật → thôi.
const ASK_KEY = 'jkr_push_ask';
const ASK_GAPS = [0, 3, 7].map((d) => d * 864e5);
const askState = () => { try { return JSON.parse(localStorage.getItem(ASK_KEY)) || { n: 0, last: 0, never: false }; } catch { return { n: 0, last: 0, never: false }; } };
const saveAsk = (s) => { try { localStorage.setItem(ASK_KEY, JSON.stringify(s)); } catch { /* bỏ qua */ } };

export async function maybeAskPush() {
  try {
    if (document.getElementById('pushask') || !pushSupported() || (isIOS && !isStandalone())) return;
    if (Notification.permission !== 'default') return;
    const s = askState();
    if (s.never || s.n >= ASK_GAPS.length || Date.now() - s.last < ASK_GAPS[s.n]) return;
    if (await thisSub()) return;
    const el = document.createElement('div');
    el.id = 'pushask';
    el.className = 'pushask';
    el.innerHTML = `<div class="grow"><b>Bật thông báo?</b><div class="small">Biết ngay khi có người trả lời, nhắc đến hoặc nhắn tin riêng cho bạn.</div></div>
      <div class="pushask-btns"><button class="btn primary" data-act="push-ask-yes">Bật</button><button class="btn" data-act="push-ask-later">Để sau</button><button class="linkbtn" data-act="push-ask-never">Đừng hỏi nữa</button></div>`;
    document.body.appendChild(el);
    saveAsk({ ...s, n: s.n + 1, last: Date.now() }); // tính là đã hỏi ngay khi hiện
  } catch { /* không quan trọng */ }
}
const closeAsk = () => document.getElementById('pushask')?.remove();
actions['push-ask-yes'] = async () => {
  closeAsk();
  try { await enablePush(); toast('Đã bật thông báo'); }
  catch (e) { if (typeof Notification !== 'undefined' && Notification.permission === 'denied') saveAsk({ ...askState(), never: true }); fail(e); }
};
actions['push-ask-later'] = () => closeAsk();
actions['push-ask-never'] = () => { saveAsk({ ...askState(), never: true }); closeAsk(); };

async function refreshSection() {
  const el = document.getElementById('pushsec');
  if (!el) return;
  el.outerHTML = await pushSectionHtml();
}
actions['push-on'] = async () => { try { await enablePush(); toast('Đã bật thông báo'); } catch (e) { fail(e); } await refreshSection(); };
actions['push-off'] = async () => { try { await disablePush(); toast('Đã tắt thông báo trên thiết bị này'); } catch (e) { fail(e); } await refreshSection(); };
actions['install-app'] = async () => {
  if (!installEvent) return;
  installEvent.prompt();
  await installEvent.userChoice.catch(() => {});
  installEvent = null;
  await refreshSection();
};
document.addEventListener('change', async (e) => {
  const k = e.target?.dataset?.pref;
  if (!k) return;
  try { await api('PATCH', '/push/prefs', { [k]: e.target.checked }); toast('Đã lưu'); } catch (er) { e.target.checked = !e.target.checked; fail(er); }
});
