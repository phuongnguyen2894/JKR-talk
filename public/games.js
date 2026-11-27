// Mục Game: danh sách các game trong app. Thêm game mới = thêm một dòng vào GAMES và một route trong app.js.
import { esc, S, api, icon, coinIcon } from './core.js';
import { t, fmtNum } from './i18n.js';

export const GAMES = [
  { id: 'muaythai', name: 'Muay Thai', hash: '#/muaythai', icon: 'glove', color: 'linear-gradient(135deg,#2E2260,#6D28D9)',
    desc: 'gm.mtDesc' },
];
// Nuôi thú: chỉ hiện khi được mở cho người dùng (lúc thử nghiệm chỉ Admin thấy)
const PETS = { id: 'pets', name: 'gm.pets', hash: '#/pets', icon: 'star', color: 'linear-gradient(135deg,#0E7490,#22C55E)',
  desc: 'gm.petsDesc' };
const tx = (s) => (s.startsWith('gm.') ? t(s) : s);

export async function renderGames(view) {
  const bal = await api('GET', '/mt/wallet').then((w) => w.balance).catch(() => S.me?.balance || 0);
  const inc = await api('GET', '/mt/pvp?box=in').then((r) => r.incoming).catch(() => 0); // lời thách đấu đang chờ bạn trả lời
  const access = await api('GET', '/pets/access').catch(() => ({ open: false }));
  const list = access.open ? [...GAMES, { ...PETS, beta: access.beta }] : GAMES;
  view.innerHTML = `<div class="page"><div class="page-inner">
    <h1>${t('nav.games')}</h1>
    <p class="small muted">${t('gm.intro')}</p>
    <div class="row between" style="margin:4px 0 8px"><span class="small muted">${t('lvl.spendable')}</span><b class="row" style="gap:6px">${coinIcon(18)}${fmtNum(bal)}</b></div>
    <div class="list">${list.map((g) => `<a class="card game-card" href="${g.hash}" aria-label="${t('gm.playN', { n: esc(tx(g.name)) })}">
      <span class="game-ic" style="background:${g.color}" aria-hidden="true">${icon(g.icon, 34)}</span>
      <span class="grow col" style="gap:2px"><b class="game-name">${esc(tx(g.name))}${g.beta ? ` <span class="game-badge" style="background:#FEF3C7;color:#92400E">${t('gm.beta')}</span>` : ''}${g.id === 'muaythai' && inc ? ` <span class="game-badge" aria-label="${t('gm.challenges', { n: inc })}">${inc}</span>` : ''}</b><span class="small muted">${esc(tx(g.desc))}</span></span>
      <span class="btn primary sm">${t('gm.play')}</span></a>`).join('')}
    </div>
    <p class="small muted" style="text-align:center;margin-top:16px">${t('gm.more')}</p>
  </div></div>`;
}
