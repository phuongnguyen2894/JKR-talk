// Khung avatar (cửa hàng + phần thưởng danh hiệu Bot trend) và màu tên.
// Khung là một SVG vẽ quanh ảnh đại diện (viewBox 120, ảnh đại diện chiếm bán kính 34 ở giữa); gradient dùng chung khai báo trong index.html.

export const FRAME_NAMES = {
  'shop:1': 'Viền tím', 'shop:2': 'Vòng hoa', 'shop:3': 'Hạt ngọc', 'shop:4': 'Ánh sao', 'shop:5': 'Pha lê',
  'title:1': 'Khung Bot trend', 'title:2': 'Khung Bot trend cao thủ', 'title:3': 'Khung Bot trend huyền thoại',
};
export const COLOR_NAMES = {
  'shop:1': 'Hồng đào', 'shop:2': 'Bạc hà', 'shop:3': 'Vàng nắng', 'shop:4': 'Tím mộng', 'shop:5': 'Hoàng hôn',
  'title:1': 'Xanh ngọc Bot trend', 'title:2': 'Xanh dương cao thủ', 'title:3': 'Lửa huyền thoại',
};

const C = 60;
const f1 = (n) => n.toFixed(1);
const ring = (r, stroke, w, extra = '') => `<circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${w}" ${extra}/>`;
const sparkle = (x, y, s, fill) => `<path d="M${x} ${y - s}l${f1(s * 0.3)} ${f1(s * 0.7)} ${f1(s * 0.7)} ${f1(s * 0.3)}-${f1(s * 0.7)} ${f1(s * 0.3)}-${f1(s * 0.3)} ${f1(s * 0.7)}-${f1(s * 0.3)}-${f1(s * 0.7)}-${f1(s * 0.7)}-${f1(s * 0.3)} ${f1(s * 0.7)}-${f1(s * 0.3)}z" fill="${fill}"/>`;
const at = (ang, r, inner) => `<g transform="translate(${C} ${C}) rotate(${ang}) translate(0 -${r})">${inner}</g>`;
const badge = (fill, icon) => `<circle cx="96" cy="96" r="13" fill="${fill}" stroke="#fff" stroke-width="3"/>${icon}`;

const BUILD = {
  'title:1': () => {
    let ticks = '';
    for (let k = 0; k < 24; k++) {
      const a = (k * 15 * Math.PI) / 180, r1 = 46, r2 = k % 2 === 0 ? 50 : 48;
      ticks += `<line x1="${f1(C + r1 * Math.cos(a))}" y1="${f1(C + r1 * Math.sin(a))}" x2="${f1(C + r2 * Math.cos(a))}" y2="${f1(C + r2 * Math.sin(a))}" stroke="#0F9D8A" stroke-width="2" stroke-linecap="round"/>`;
    }
    return { glow: 'drop-shadow(0 0 4px rgba(15,157,138,.45))', body: ring(40, 'url(#frT1)', 5) + ticks + badge('#0F9D8A', '<path d="M90 100l4-4 3 3 5-5M99 94h4v4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>') };
  },
  'title:2': () => {
    const bolt = '<path d="M3 -8L-4 2h4l-1 7 7-10h-4z" fill="#2447B8" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>';
    return { glow: 'drop-shadow(0 0 6px rgba(76,123,255,.6))', body: ring(40, 'url(#frT2)', 6) + ring(47, '#9DB8FF', 1.5, 'stroke-dasharray="3 4"') + ring(44, '#DDE6FF', 1) + [0, 90, 180, 270].map((a) => at(a, 53, bolt)).join('') + badge('#2447B8', '<path d="M98 88l-6 9h4l-1 6 6-9h-4z" fill="#fff"/>') };
  },
  'title:3': () => {
    let flames = '';
    for (let k = 0; k < 16; k++) {
      const h = k % 2 === 0 ? 11 : 7;
      flames += at(k * 22.5, 44, `<path d="M0 -${h}C3 -${h - 5} 5 -3 0 3C-5 -3 -3 -${h - 5} 0 -${h}z" fill="url(#frT3)"/>`);
    }
    const sp = [[14, 20, 6], [106, 18, 5], [110, 70, 4], [10, 78, 4]].map(([x, y, s]) => sparkle(x, y, s, '#FFC53D')).join('');
    return { glow: 'drop-shadow(0 0 8px rgba(255,138,61,.75))', body: `<circle cx="${C}" cy="${C}" r="52" fill="url(#frT3g)"/>` + flames + ring(40, 'url(#frT3)', 6) + ring(36.5, '#fff', 1, 'stroke-opacity=".7"') + sp + badge('url(#frT3)', '<path d="M96 87c1 3 4 4 4 8a4 4 0 0 1-8 0c0-1.6.8-2.4 1.6-3.2 0 1.6.8 2.4 1.6 2.4 0-2.4-.8-4 .8-7.2z" fill="#fff"/>') };
  },
  'shop:1': () => ({ glow: 'none', body: ring(40, 'url(#frS1)', 5) + ring(47, '#D9CFFF', 1.5) }),
  'shop:2': () => {
    let p = '';
    for (let n = 0; n < 12; n++) p += at(n * 30, 47, `<ellipse rx="3.6" ry="6" fill="${n % 2 === 0 ? '#F2A7C8' : '#B79CFF'}"/>`);
    return { glow: 'none', body: ring(40, '#C9B8FF', 3) + p };
  },
  'shop:3': () => {
    let p = '';
    for (let n = 0; n < 20; n++) { const a = (n * 18 * Math.PI) / 180; p += `<circle cx="${f1(C + 46 * Math.cos(a))}" cy="${f1(C + 46 * Math.sin(a))}" r="3" fill="#fff" stroke="#B79CFF" stroke-width="1.2"/>`; }
    return { glow: 'drop-shadow(0 0 3px rgba(183,156,255,.6))', body: ring(40, '#E9E1FF', 4) + p };
  },
  'shop:4': () => ({ glow: 'drop-shadow(0 0 4px rgba(242,182,0,.5))', body: ring(40, 'url(#frS4)', 5) + [[60, 8, 8], [108, 36, 6], [100, 92, 7], [22, 100, 6], [12, 34, 7], [60, 114, 5]].map(([x, y, s]) => sparkle(x, y, s, '#F2B600')).join('') }),
  'shop:5': () => {
    const d = '<path d="M0 -6L4.5 0 0 6 -4.5 0z" fill="#fff" stroke="#8B63F2" stroke-width="1.3" stroke-linejoin="round"/>';
    return { glow: 'drop-shadow(0 0 5px rgba(139,99,242,.55))', body: ring(40, 'url(#frS5)', 5) + ring(45, '#C9B8FF', 1) + Array.from({ length: 8 }, (_, n) => at(n * 45, 51, d)).join('') };
  },
};

const cache = {};
// SVG khung (chỉ phần viền, vẽ chồng lên ảnh đại diện); id không hợp lệ thì trả về chuỗi rỗng
export function frameSvg(id) {
  if (!BUILD[id]) return '';
  if (!cache[id]) {
    const { glow, body } = BUILD[id]();
    cache[id] = `<svg class="frame" viewBox="0 0 120 120" aria-hidden="true" focusable="false" style="filter:${glow}">${body}</svg>`;
  }
  return cache[id];
}
export const isFrame = (id) => !!BUILD[id];
// lớp CSS màu tên (màu cụ thể khai báo trong styles.css, có bản cho nền tối)
export const nameCls = (u) => (u && u.nameColor && !u.staff && COLOR_NAMES[u.nameColor] ? ` nc nc-${u.nameColor.replace(':', '-')}` : '');
