// Tab "Game" trong Quản trị: đổi ảnh đầu cho 8 nhân vật Muay Thai và ảnh mặc định cho người dùng chưa có avatar.
import { $, $$, esc, api, toast, fail, actions, confirmBox } from './core.js';

let body = null;
async function load() {
  const d = await api('GET', '/admin/mt/settings');
  const head = (c) => (c.headUrl ? `<img src="${esc(c.headUrl)}" alt="" style="width:100%;height:100%;object-fit:cover">` : `<b>${esc(c.initials || '?')}</b>`);
  body.innerHTML = `<p class="small muted">Ảnh được cắt vuông, thu nhỏ rồi vẽ tròn lên đầu võ sĩ trong game Muay Thai. Đổi xong có hiệu lực ngay, người chơi chỉ cần mở lại màn game.</p>
    <section class="card col" style="gap:10px"><h2 style="margin:0">Nhân vật</h2>
      <div class="mtad-grid">${d.characters.map((c) => `<div class="mtad-item">
        <span class="mtad-head" style="background:${esc(c.color)}">${head(c)}</span><b>${esc(c.name)}</b>
        <div class="row" style="gap:6px"><button class="btn sm" data-act="mtad-pick" data-kind="char" data-id="${esc(c.id)}">${c.headUrl ? 'Đổi ảnh' : 'Chọn ảnh'}</button>${c.headUrl ? `<button class="btn sm" data-act="mtad-clear" data-kind="char" data-id="${esc(c.id)}" aria-label="Bỏ ảnh của ${esc(c.name)}">Bỏ</button>` : ''}</div></div>`).join('')}</div></section>
    <section class="card col" style="gap:10px"><h2 style="margin:0">Ảnh mặc định cho người dùng chưa có avatar</h2>
      <div class="row" style="gap:12px"><span class="mtad-head" style="background:#6D28D9">${d.defaultUserHeadUrl ? `<img src="${esc(d.defaultUserHeadUrl)}" alt="" style="width:100%;height:100%;object-fit:cover">` : '<b>?</b>'}</span>
        <div class="grow small muted">${d.defaultUserHeadUrl ? 'Đang dùng ảnh này.' : 'Chưa đặt: người dùng chưa có avatar hiện chữ viết tắt trên nền màu.'}</div></div>
      <div class="row" style="gap:6px"><button class="btn sm" data-act="mtad-pick" data-kind="user">${d.defaultUserHeadUrl ? 'Đổi ảnh' : 'Chọn ảnh'}</button>${d.defaultUserHeadUrl ? '<button class="btn sm" data-act="mtad-clear" data-kind="user">Bỏ ảnh</button>' : ''}</div></section>
    <input type="file" id="mtad-file" accept="image/png,image/jpeg,image/gif,image/webp" hidden>`;
}
export async function adminGame(el) { body = el; await load(); }

// ảnh tĩnh: cắt vuông giữa, thu về 256 x 256, lưu JPEG (nền trắng cho ảnh trong suốt)
async function squareDataUrl(file) {
  if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) throw new Error('Chỉ nhận ảnh PNG, JPG, GIF hoặc WebP');
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256);
  x.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  return c.toDataURL('image/jpeg', 0.88);
}
async function save(kind, id, url) {
  if (kind === 'char') await api('PATCH', `/admin/mt/characters/${encodeURIComponent(id)}`, { headImageUrl: url });
  else await api('PATCH', '/admin/mt/settings', { defaultUserHeadUrl: url });
}
actions['mtad-pick'] = (t) => {
  const input = $('#mtad-file');
  input.value = '';
  input.onchange = async () => {
    const f = input.files[0];
    if (!f) return;
    try {
      const dataUrl = await squareDataUrl(f);
      const { url } = await api('POST', '/upload', { dataUrl });
      await save(t.dataset.kind, t.dataset.id, url);
      toast('Đã đổi ảnh'); await load();
    } catch (e) { fail(e); }
  };
  input.click();
};
actions['mtad-clear'] = async (t) => {
  if (!(await confirmBox('Bỏ ảnh?', 'Nhân vật/người dùng sẽ hiện chữ viết tắt thay cho ảnh.', 'Bỏ ảnh', true))) return;
  try { await save(t.dataset.kind, t.dataset.id, null); toast('Đã bỏ ảnh'); await load(); } catch (e) { fail(e); }
};
