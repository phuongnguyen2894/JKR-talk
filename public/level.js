// Trang "Cấp bậc của tôi", hộp chúc mừng lên cấp
import { nameCls } from './frames.js';
import { $, S, api, esc, icon, avatar, actions, fail, openModal, closeModal, lvBadge, coinIcon, levelName, itemName, titleName, condLabel } from './core.js';
import { t as tr, fmtNum } from './i18n.js';

const fmt = fmtNum;
// [khoá nội dung, số xu, khoá ghi chú] — chữ hiển thị lấy theo ngôn ngữ lúc vẽ
const EARN = [
  ['lvl.e1', '+1', 'lvl.e1n'], ['lvl.e2', 'lvl.e2x', ''], ['lvl.e3', '+2', ''], ['lvl.e4', '+3', ''], ['lvl.e5', '+20', 'lvl.e5n'],
  ['lvl.e6', '+30', ''], ['lvl.e7', '+50', ''], ['lvl.e8', '+1', 'lvl.e8n'], ['lc.links', '+1', 'lvl.e9n'], ['lvl.e10', '+3', 'lvl.e10n'],
];
const PRIVS = [[2, 'lvl.p2'], [3, 'lc.links'], [4, 'lvl.p4'], [5, 'lvl.p5']];
const condText = (c) => (c.key === 'title' ? tr('lc.title', { t: titleName(c.titleKey, c.label) }) : condLabel(c));

const condRow = (c) => `<div class="lvl-row">${c.key === 'coins' ? `<span class="lvl-coin">${coinIcon(22)}</span>` : `<span class="${c.ok ? 'lvl-ok' : 'lvl-no'}">${c.ok ? '✓' : '·'}</span>`}${esc(condText(c))}<span class="chip">${c.title ? (c.ok ? tr('lvl.reached') : tr('lvl.notReached')) : `${fmt(c.have)} / ${fmt(c.need)}`}</span></div>`;

export async function renderLevel(view) {
  const [{ level: st }, shop] = await Promise.all([api('GET', '/me/level'), api('GET', '/shop')]);
  S.me = { ...S.me, level: st.level, coins: st.coins };
  const u = S.me;
  const next = st.next;
  let progress = '';
  if (st.tasks) {
    const done = st.tasks.filter((t) => t.have >= t.need).length;
    progress = `<section class="card col">
      <div class="row between"><div class="h2" style="margin:0">${tr('lvl.start')}</div><span class="small muted">${tr('lvl.tasksDone', { d: done, n: st.tasks.length })}</span></div>
      <div class="lvl-bar" role="img" aria-label="${tr('lvl.tasksDone', { d: done, n: st.tasks.length })}"><i style="width:${Math.round((done / st.tasks.length) * 100)}%"></i></div>
      ${st.tasks.map((t) => `<div class="lvl-row"><span class="${t.have >= t.need ? 'lvl-ok' : 'lvl-no'}">${t.have >= t.need ? '✓' : '·'}</span>${esc(condLabel(t))}${t.need > 1 ? `<span class="chip">${t.have} / ${t.need}</span>` : ''}</div>`).join('')}
      ${st.tasks.some((t) => t.key === 'push' && t.have < 1) ? `<button class="btn" data-act="lvl-push">${tr('lc.push')}</button>` : ''}
      <p class="small muted">${tr('lvl.startNote', { n: st.tasks.length, l: `<b>${esc(levelName(1))}</b>` })}</p>
    </section>`;
  } else if (next) {
    const coins = next.conditions.find((c) => c.key === 'coins');
    const pct = Math.min(100, Math.round((coins.have / coins.need) * 100));
    progress = `<section class="card col">
      <div class="row between"><div class="h2" style="margin:0">${tr('lvl.condTo', { l: esc(levelName(next.level)) })}</div><span class="small muted">${tr('lvl.levelN', { n: next.level })}</span></div>
      <div class="lvl-bar" role="img" aria-label="${tr('lvl.pct', { n: pct })}"><i style="width:${pct}%"></i></div>
      ${next.conditions.map(condRow).join('')}
      <p class="small muted">${tr('lvl.needAll', { n: next.level })}</p>
    </section>`;
  } else {
    progress = `<section class="card col"><div class="h2" style="margin:0">${tr('lvl.top')}</div><p class="small muted">${tr('lvl.topNote', { l: `<b>${esc(levelName(5))}</b>` })}</p></section>`;
  }
  const levels = st.levels || [];
  view.innerHTML = `<div class="page"><div class="page-inner">
    <h1>${tr('lvl.title')}</h1>
    <section class="card col lvl-hero" style="padding-top:20px">
      ${avatar({ ...u, level: u.level }, 'lg')}
      <div class="row" style="justify-content:center;margin-top:6px"><b class="${nameCls(u).trim()}" style="font-size:20px">${esc(u.displayName)}</b>${lvBadge(u.level, 26)}</div>
      ${u.level ? `<div class="small" style="font-weight:600;color:var(--accent)">${esc(levelName(u.level))} · ${tr('lvl.levelN', { n: u.level })}</div>` : ''}
      <div class="coin-stats" style="align-self:stretch">
        <div class="coin-stat">${coinIcon(26)}<b>${fmt(st.coins)}</b><span class="small">${tr('lvl.earned')}</span><span class="tiny muted">${tr('lvl.earnedNote')}</span></div>
        <div class="coin-stat spend">${coinIcon(26)}<b>${fmt(st.balance)}</b><span class="small">${tr('lvl.spendable')}</span><span class="tiny muted">${tr('lvl.spendableNote')}</span></div>
      </div>
      ${st.streak ? `<div class="small muted">${tr('lvl.streak', { n: st.streak })}</div>` : ''}
      <div class="row wrap" style="justify-content:center;gap:8px;margin-top:4px"><a class="btn primary" href="#/shop">${tr('nav.shop')}</a><a class="btn" href="#/titles">${tr('lvl.titlesRewards')}</a></div>
    </section>
    ${progress}
    <section class="card col" id="appearance"><div class="h2" style="margin:0">${tr('lvl.appearance')}</div>
      <p class="small muted" style="margin:0">${tr('lvl.appearanceNote')}</p>
      <div class="tiny muted" style="font-weight:700;letter-spacing:.04em">${tr('lvl.framesCap')}</div>
      <div class="shop-grid">
        <div class="shop-mine">${avatar({ ...u, frame: null }, '')}<span class="tiny">${tr('lvl.default')}</span>${!shop.equipped.frame ? `<span class="st done">${tr('lvl.inUse')}</span>` : `<button class="btn sm" data-act="equip" data-kind="frame" data-id="">${tr('lvl.use')}</button>`}</div>
        ${shop.mine.frames.map((f) => `<div class="shop-mine"><div class="fr-prev">${avatar({ ...u, frame: f.id }, '')}</div><span class="tiny">${esc(itemName('frame', f.id, f.name))}</span>${f.source === 'title' ? `<span class="tiny muted">${tr('lvl.titleTag')}</span>` : ''}${shop.equipped.frame === f.id ? `<span class="st done">${tr('lvl.inUse')}</span>` : `<button class="btn sm" data-act="equip" data-kind="frame" data-id="${f.id}">${tr('lvl.use')}</button>`}</div>`).join('')}
      </div>
      <div class="tiny muted" style="font-weight:700;letter-spacing:.04em">${tr('lvl.colorsCap')}</div>
      <div class="list">
        <div class="row between"><b>${esc(u.displayName)}</b><span class="tiny muted grow" style="margin-left:8px">${tr('lvl.default')}</span>${!shop.equipped.color ? `<span class="st done">${tr('lvl.inUse')}</span>` : `<button class="btn sm" data-act="equip" data-kind="color" data-id="">${tr('lvl.use')}</button>`}</div>
        ${shop.mine.colors.map((c) => `<div class="row between"><b class="${nameCls({ nameColor: c.id }).trim()}">${esc(u.displayName)}</b><span class="tiny muted grow" style="margin-left:8px">${esc(itemName('color', c.id, c.name))}${c.source === 'title' ? ` · ${tr('lvl.titleTag')}` : ''}</span>${shop.equipped.color === c.id ? `<span class="st done">${tr('lvl.inUse')}</span>` : `<button class="btn sm" data-act="equip" data-kind="color" data-id="${c.id}">${tr('lvl.use')}</button>`}</div>`).join('')}
      </div>
      ${!shop.mine.frames.length && !shop.mine.colors.length ? `<p class="small muted" style="margin:0">${tr('lvl.noItems')}</p>` : ''}
    </section>
    <section class="card col"><div class="h2" style="margin:0">${tr('lvl.stats')}</div>
      <div class="row" style="gap:8px">${[[st.stats.messages, tr('lvl.sMsgs')], [st.stats.hearts, tr('lvl.sHearts')], [st.stats.topics, tr('lvl.sTopics')]].map(([n, l]) => `<div class="card" style="flex:1;text-align:center;padding:10px 4px"><b style="font-size:20px">${fmt(n)}</b><div class="tiny muted">${l}</div></div>`).join('')}</div>
    </section>
    <section class="card col"><div class="h2" style="margin:0">${tr('lvl.privs')}</div>
      ${PRIVS.map(([lv, t]) => `<div class="lvl-row"><span class="lvl-pv${u.level >= lv ? '' : ' locked'}">${lvBadge(lv, 22)}</span><span ${u.level >= lv ? '' : 'class="muted"'}>${esc(tr(t))}</span></div>`).join('')}
      <p class="tiny muted">${tr('lvl.privsNote')}</p>
    </section>
    <section class="card col"><div class="h2" style="margin:0">${tr('lvl.levels')}</div>
      ${levels.map((l) => `<div class="lvl-row">${lvBadge(l.level, 22)}<b>${esc(levelName(l.level))}</b><span class="chip">${l.min ? tr('lvl.from', { n: fmt(l.min) }) : tr('lvl.after3')}</span></div>`).join('')}
    </section>
    ${st.titles.length ? `<section class="card col"><div class="h2" style="margin:0">${tr('nav.titles')}</div><div class="row wrap">${st.titles.map((t) => `<span class="pill">${esc(titleName(t))}</span>`).join('')}</div></section>` : ''}
    <section class="card col"><div class="h2" style="margin:0">${tr('lvl.howEarn')}</div>
      ${EARN.map(([t, x, note]) => `<div class="lvl-row"><span class="earn-t">${esc(tr(t))}${note ? `<br><span class="tiny muted">${esc(tr(note))}</span>` : ''}</span><span class="chip" style="display:inline-flex;align-items:center;gap:4px">${coinIcon(14)}${esc(x.startsWith('+') ? x : tr(x))}</span></div>`).join('')}
      <p class="tiny muted">${tr('lvl.earnNote')}</p>
    </section>
  </div></div>`;
}

actions['lvl-push'] = async () => {
  const { enablePush } = await import('./push.js');
  if (typeof enablePush === 'function') { await enablePush(); renderLevel($('#view')); }
};

// Hộp chúc mừng khi vừa lên cấp (server trả levelUp trong GET /me)
export function showLevelUp(lu) {
  if (!lu) return;
  const m = openModal(`<div class="col lvl-modal"><div class="small" style="font-weight:700;letter-spacing:.06em;color:var(--accent)">${lu.level === 1 ? tr('lvl.welcomeCap') : tr('lvl.congratsCap')}</div>
    <div class="lvl-big">${lvBadge(lu.level, 56)}</div>
    <h2 style="margin:0">${esc(levelName(lu.level))}</h2>
    <p class="muted" style="margin:0">${lu.level === 1 ? tr('lvl.firstDone') : tr('lvl.reachedCoins', { n: fmt(lu.coins) })}</p>
    ${lu.perk && lu.level > 1 ? `<div class="card col" style="text-align:left"><div class="tiny" style="font-weight:700;color:var(--accent)">${tr('lvl.newPerk')}</div><div class="small">${esc(tr(`lvl.perk${lu.level}`))}</div></div>` : ''}
    <div class="btns"><a class="btn" href="#/level" data-close>${tr('lvl.viewLevel')}</a><button class="btn primary" data-close>${tr('lvl.great')}</button></div></div>`);
  m.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
  api('POST', '/me/level-seen').catch(() => {});
}
