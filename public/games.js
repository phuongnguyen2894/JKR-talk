// Mục Game: danh sách các game trong app. Thêm game mới = thêm một dòng vào GAMES và một route trong app.js.
import { esc, S, api, icon, coinIcon } from './core.js';

export const GAMES = [
  { id: 'muaythai', name: 'Muay Thai', hash: '#/muaythai', icon: 'glove', color: 'linear-gradient(135deg,#2E2260,#6D28D9)',
    desc: 'Chọn võ sĩ, cược xu tím và xem một hiệp đấu. Cược từ 10 đến 500 xu, đoán đúng được thưởng x1.9.' },
];

export async function renderGames(view) {
  const bal = await api('GET', '/mt/wallet').then((w) => w.balance).catch(() => S.me?.balance || 0);
  view.innerHTML = `<div class="page"><div class="page-inner">
    <h1>Game</h1>
    <p class="small muted">Chơi bằng xu tím. Thắng thua được cộng trừ vào “Xu có thể tiêu” và không làm đổi cấp bậc của bạn.</p>
    <div class="row between" style="margin:4px 0 8px"><span class="small muted">Xu có thể tiêu</span><b class="row" style="gap:6px">${coinIcon(18)}${Number(bal).toLocaleString('vi-VN')}</b></div>
    <div class="list">${GAMES.map((g) => `<a class="card game-card" href="${g.hash}" aria-label="Chơi ${esc(g.name)}">
      <span class="game-ic" style="background:${g.color}" aria-hidden="true">${icon(g.icon, 34)}</span>
      <span class="grow col" style="gap:2px"><b class="game-name">${esc(g.name)}</b><span class="small muted">${esc(g.desc)}</span></span>
      <span class="btn primary sm">Chơi</span></a>`).join('')}
    </div>
    <p class="small muted" style="text-align:center;margin-top:16px">Sẽ có thêm game ở đây.</p>
  </div></div>`;
}
