// Võ sĩ vẽ bằng SVG theo ảnh thiết kế trong bộ zip: đầu là avatar tròn của người dùng (không vẽ lại mặt), áo ngắn tay, quần viền vàng,
// găng + cuốn tay, quấn cổ chân, dải tua rua cạnh đầu. Màu theo từng góc lấy từ CORNER, không lặp markup.
// Chín trạng thái: guard (idle), walk, punch, kick, block, stagger (hit), ko (knockdown), win (victory), defeat.
import { esc } from './core.js';

export const POSES = ['guard', 'walk', 'punch', 'kick', 'block', 'stagger', 'ko', 'win', 'defeat'];
export const CORNER = {
  red: { shirt: '#D93A40', glove: '#E5484D', gloveDark: '#A02A30', name: 'Góc đỏ' },
  blue: { shirt: '#3B6FE0', glove: '#4F83F0', gloveDark: '#2B55B0', name: 'Góc xanh' },
};
const GOLD = '#FFC83D', WRAP = '#F4EFE6', WRAP_D = '#D8CFC0', SKIN = '#E8B58C', SKIN_D = '#D49E74';
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const P = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
const star = (x, y, s = 1) => `<polygon transform="translate(${x} ${y}) scale(${s})" points="0,-5 1.5,-1.5 5,-1.2 2.3,1 3,4.8 0,2.8 -3,4.8 -2.3,1 -5,-1.2 -1.5,-1.5" fill="${GOLD}" stroke="#B7791F" stroke-width=".8" stroke-linejoin="round"/>`;

// một tay: S vai → E khuỷu → H bàn tay; tay áo ngắn (màu áo, viền vàng), cẳng tay có cuốn tay trắng, găng ở cuối
function arm(S, E, H, c, rear) {
  const sleeve = lerp(S, E, 0.62), w0 = lerp(E, H, 0.3), w1 = lerp(E, H, 0.78);
  const r = rear ? 13 : 12;
  return `<path d="M${P(S)}L${P(E)}L${P(H)}" stroke="${rear ? SKIN : SKIN_D}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M${P(w0)}L${P(w1)}" stroke="${WRAP}" stroke-width="12" stroke-linecap="round" fill="none"/><path d="M${P(lerp(w0, w1, 0.5))}L${P(lerp(w0, w1, 0.55))}" stroke="${WRAP_D}" stroke-width="12" fill="none"/>
    <path d="M${P(S)}L${P(sleeve)}" stroke="${c.shirt}" stroke-width="16" stroke-linecap="round" fill="none"/><path d="M${P(lerp(S, sleeve, 0.78))}L${P(sleeve)}" stroke="${GOLD}" stroke-width="3" fill="none"/>
    <circle cx="${H[0]}" cy="${H[1]}" r="${r}" fill="${rear ? c.glove : c.gloveDark}"/><circle cx="${H[0] - 3}" cy="${H[1] - 4}" r="${r * 0.36}" fill="#fff" opacity=".28"/>`;
}
// chân: quấn cổ chân trắng ở đoạn dưới; rot = góc xoay quanh hông
const leg = (x, foot, rot) => `<g${rot ? ` transform="rotate(${rot} ${x + 7} 156)"` : ''}><rect x="${x}" y="156" width="15" height="50" rx="7" fill="${SKIN}"/>
    <rect x="${x - 0.5}" y="186" width="16" height="16" rx="5" fill="${WRAP}"/><path d="M${x} 191h15M${x} 196h15" stroke="${WRAP_D}" stroke-width="1.3"/><ellipse cx="${foot}" cy="208" rx="11" ry="6" fill="${SKIN}"/></g>`;
const flame = (x, y) => `<path transform="translate(${x} ${y})" d="M0 0c3 5 8 7 6 13-1 4-5 5-6 3-1 2-5 1-6-3-2-6 3-8 6-13z" fill="${GOLD}"/>`;
const lotus = (x, y) => `<path transform="translate(${x} ${y})" d="M0 0c-3 4-3 8 0 12 3-4 3-8 0-12zM-7 5c-3 1-5 4-4 8 3-1 5-4 4-8zM7 5c3 1 5 4 4 8-3-1-5-4-4-8z" fill="${GOLD}"/>`;

let uid = 0;
export function fighterSvg(f, { pose = 'guard', crown = false, w = 120 } = {}) {
  const c = CORNER[f.corner], blue = f.corner === 'blue', id = `fh${++uid}`;
  let legs = leg(42, 49) + leg(63, 71);
  if (pose === 'kick') legs = leg(42, 49) + leg(63, 71, -82);
  else if (pose === 'walk') legs = leg(42, 49, 12) + leg(63, 71, -16);
  else if (pose === 'defeat') legs = `<rect x="42" y="156" width="15" height="26" rx="7" fill="${SKIN}"/><rect x="63" y="156" width="15" height="26" rx="7" fill="${SKIN}"/>
    <rect x="40" y="174" width="52" height="15" rx="7" fill="${SKIN}"/><rect x="62" y="174" width="18" height="15" rx="4" fill="${WRAP}"/><ellipse cx="92" cy="182" rx="6" ry="8" fill="${SKIN}"/>`; // quỳ gối
  const shorts = `<path d="M36 120h48v30l-2 14H62l-2-12-2 12H38l-2-14z" fill="${c.shirt}"/><rect x="36" y="118" width="48" height="9" rx="4" fill="${GOLD}"/>
    <path d="M38 160h20M62 160h20" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/><path d="M36 134v22M84 134v22" stroke="${GOLD}" stroke-width="2.5" stroke-linecap="round"/>${blue ? lotus(60, 134) : flame(60, 134)}`;
  const shirt = `<path d="M40 66q20-6 40 0l2 52H38z" fill="${c.shirt}"/><path d="M52 64l8 12 8-12" stroke="${GOLD}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <rect x="38" y="112" width="44" height="5" fill="${GOLD}" opacity=".9"/>${blue ? lotus(60, 86) : flame(60, 86)}`;
  const G = { rear: [[44, 80], [28, 106], [48, 88]], front: [[76, 80], [92, 106], [74, 90]] };
  let rear = arm(...G.rear, c, true), front = arm(...G.front, c, false);
  if (pose === 'win') { rear = arm([44, 80], [30, 56], [34, 30], c, true); front = arm([76, 80], [90, 56], [86, 30], c, false); }
  else if (pose === 'defeat') { rear = arm([44, 80], [34, 104], [42, 128], c, true); front = arm([76, 80], [86, 104], [78, 128], c, false); }
  else if (pose === 'punch') front = arm([76, 80], [94, 82], [112, 84], c, false);
  else if (pose === 'block') { rear = arm([44, 80], [34, 100], [54, 56], c, true); front = arm([76, 80], [86, 100], [70, 58], c, false); }
  else if (pose === 'walk') { rear = arm([44, 80], [32, 100], [34, 120], c, true); front = arm([76, 80], [92, 100], [80, 82], c, false); }
  const tassel = `<path d="M38 30Q20 36 18 60" stroke="${c.shirt}" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M38 34Q24 44 26 66" stroke="${GOLD}" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M38 38Q30 50 34 68" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/>
    <circle cx="18" cy="62" r="2.6" fill="${c.shirt}"/><circle cx="26" cy="68" r="2.6" fill="${GOLD}"/><circle cx="34" cy="70" r="2.6" fill="#fff"/>`;
  // đầu = avatar tròn (ảnh lỗi/không có: chữ viết tắt trên nền màu). Lật ngược lại ở góc xanh để ảnh và chữ không bị phản chiếu
  const head = `<g${blue ? ' transform="translate(120 0) scale(-1 1)"' : ''}><clipPath id="${id}"><circle cx="60" cy="36" r="27"/></clipPath>
    <circle cx="60" cy="36" r="27" fill="${esc(f.color || '#6D28D9')}"/>
    <text x="60" y="43" text-anchor="middle" font-family="Be Vietnam Pro,system-ui,sans-serif" font-size="19" font-weight="700" fill="#fff">${esc(f.initials)}</text>
    ${f.headUrl ? `<image href="${esc(f.headUrl)}" x="33" y="9" width="54" height="54" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>` : ''}
    <circle cx="60" cy="36" r="27" fill="none" stroke="#fff" stroke-width="3"/></g>`;
  const crownSvg = crown ? '<polygon points="44,10 47,-6 54,3 60,-10 66,3 73,-6 76,10" fill="#FFC83D" stroke="#B7791F" stroke-width="2" stroke-linejoin="round"/>' : '';
  const dizzy = pose === 'stagger' || pose === 'ko' ? star(36, 0, 1.1) + star(60, -12, 1.3) + star(84, 0, 1.1) : '';
  // block/defeat: găng che mặt hoặc cúi đầu; thứ tự lớp: chân → thân → tay trước → cổ → đầu → tay sau
  const order = pose === 'block' ? `${legs}${shirt}${shorts}${tassel}${neck()}${head}${front}${rear}` : `${legs}${shirt}${shorts}${front}${neck()}${tassel}${head}${crownSvg}${rear}`;
  const body = blue ? `<g transform="translate(120 0) scale(-1 1)">${order}</g>` : order;
  let t = body;
  if (pose === 'stagger') t = `<g transform="rotate(${blue ? -12 : 12} 60 210)">${body}</g>`;
  else if (pose === 'defeat') t = `<g transform="translate(0 30) rotate(${blue ? -8 : 8} 60 200)">${body}</g>`;
  return `<svg width="${w}" height="${Math.round((w * 236) / 120)}" viewBox="0 -16 120 236" role="img" aria-label="${esc(f.name)}, ${c.name}" style="display:block;overflow:visible">${t}${dizzy}</svg>`;
}
function neck() { return `<rect x="54" y="58" width="12" height="12" fill="${SKIN}"/>`; }
