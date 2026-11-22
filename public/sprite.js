// Võ sĩ dạng sprite (bộ ảnh cắt từ bản thiết kế, /mt/<góc>/<hành động>/NN.png + /mt/sprites.json).
// Đầu là avatar thật của người dùng (hoặc chữ viết tắt) vẽ chồng lên đúng vị trí đầu trong từng khung hình, không dùng đầu "UD/UN" có sẵn trong ảnh.
// Tọa độ đầu từng khung (cx, cy, r) được tính sẵn khi xử lý ảnh. Góc xanh được lật ngang để quay mặt sang trái.
import { esc } from './core.js';

export const CORNER = {
  red: { name: 'Góc đỏ' },
  blue: { name: 'Góc xanh' },
};
// tên tư thế trong game → hành động trong bộ sprite
export const ACTION = { guard: 'idle', walk: 'walk', punch: 'punch', kick: 'kick', block: 'block', stagger: 'hit', ko: 'knockdown', win: 'victory', defeat: 'defeat' };
const CELL_W = 80, CELL_H = 88;
let META = null, loading = null;

export function loadSprites() {
  if (loading) return loading;
  loading = fetch('/mt/sprites.json').then((r) => r.json()).then((m) => {
    META = m;
    const imgs = [];
    for (const t of Object.values(m.teams)) for (const a of Object.values(t)) for (const f of a.frames) imgs.push(new Promise((ok) => { const i = new Image(); i.onload = i.onerror = ok; i.src = `/mt/${f.src}`; }));
    return Promise.race([Promise.all(imgs), new Promise((ok) => setTimeout(ok, 4000))]); // không chờ quá 4 giây
  }).catch(() => { loading = null; });
  return loading;
}

// HTML khung rỗng (đã có kích thước); gọi mountSprites(gốc) sau khi gán innerHTML để đổ ảnh và chạy hoạt hình
export function fighterHtml(f, { pose = 'guard', w = 120, crown = false } = {}) {
  const h = Math.round((w * CELL_H) / CELL_W);
  return `<span class="sp-mount" role="img" aria-label="${esc(f.name)}, ${CORNER[f.corner].name}" data-corner="${f.corner}" data-pose="${pose}" data-w="${w}" data-crown="${crown ? 1 : 0}"
    data-color="${esc(f.color || '#6D28D9')}" data-initials="${esc(f.initials || '?')}" data-head="${esc(f.headUrl || '')}" style="width:${w}px;height:${h}px"></span>`;
}

export function mountSprites(root) {
  for (const el of root.querySelectorAll('.sp-mount')) mount(el);
}

function mount(el) {
  el._stop?.();
  if (!META) return;
  const corner = el.dataset.corner, pose = el.dataset.pose, w = Number(el.dataset.w), k = w / CELL_W;
  const act = META.teams[corner]?.[ACTION[pose] || 'idle'];
  if (!act) return;
  const blue = corner === 'blue';
  el.innerHTML = `<img class="sp-img${blue ? ' flip' : ''}" alt="" draggable="false" width="${w}" height="${Math.round(k * CELL_H)}">
    <span class="sp-head"><b></b></span>${el.dataset.crown === '1' ? '<svg class="sp-crown" viewBox="0 0 32 20" aria-hidden="true"><polygon points="2,18 5,3 11,11 16,1 21,11 27,3 30,18" fill="#FFC83D" stroke="#B7791F" stroke-width="1.6" stroke-linejoin="round"/></svg>' : ''}`;
  const img = el.firstElementChild, head = el.querySelector('.sp-head'), crown = el.querySelector('.sp-crown');
  // gán qua DOM (không nối chuỗi HTML) để tên, màu, địa chỉ ảnh không thể chèn mã
  head.style.background = el.dataset.color;
  head.firstChild.textContent = el.dataset.initials;
  if (el.dataset.head) { const a = document.createElement('img'); a.alt = ''; a.src = el.dataset.head; head.appendChild(a); }
  const show = (i) => {
    const fr = act.frames[i];
    img.src = `/mt/${fr.src}`;
    const hd = fr.head;
    if (!hd) { head.style.display = 'none'; return; }
    const cx = blue ? CELL_W - hd.cx : hd.cx, d = 2 * hd.r * k;
    head.style.cssText += `;display:flex;width:${d}px;height:${d}px;left:${(cx - hd.r) * k}px;top:${(hd.cy - hd.r) * k}px`;
    head.style.fontSize = `${Math.max(9, d * 0.34)}px`;
    if (crown) crown.style.cssText = `left:${(cx - 10) * k}px;top:${(hd.cy - hd.r - 11) * k}px;width:${20 * k}px`;
  };
  const rm = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
  let i = 0, timer = 0;
  show(0);
  if (rm && act.loop) return; // giảm chuyển động: giữ một khung hình
  const fps = act.loop ? act.fps : Math.max(act.fps, pose === 'ko' ? 10 : 14); // đòn đánh chạy nhanh để khớp nhịp trận
  timer = setInterval(() => {
    if (!el.isConnected) { clearInterval(timer); return; }
    i++;
    if (i >= act.frames.length) { if (act.loop) i = 0; else { clearInterval(timer); return; } }
    show(i);
  }, 1000 / fps);
  el._stop = () => clearInterval(timer);
}
