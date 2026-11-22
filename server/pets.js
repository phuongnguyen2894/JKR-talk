// Game "Nuôi thú": mỗi người có một khu nhà chung cho các bạn thú (Juad, Abu, Uni, Charsiu, Tofu, Udon).
// Chăm sóc miễn phí; phần thưởng duy nhất là điểm Thân thiết (không kiếm xu). Chỉ mở rộng khu nhà mới tốn xu tím.
// Số thú nuôi được = sức chứa của khu nhà; cấp bậc quyết định bậc khu nhà tối đa được mua. Thú không bao giờ mất.
// Chỉ số tính theo thời gian thật (tụt dần), máy chủ quyết định mọi thay đổi.
import { db, tx, now } from './db.js';
import { bad, notFound, forbidden, getUser, rateLimit, areFriends, isBlockedEither, notify, pushOnly, isOnline, isSystemAdmin, log } from './lib.js';
import { balanceOf } from './levels.js';

const LEVEL_NAMES = ['Chưa có cấp', 'Tím Mầm Non', 'Tím Sương Sương', 'Tím Mộng Mơ', 'Tím Thủy Chung', 'Tím Thủy Tổ'];

// bậc khu nhà: sức chứa, cấp tối thiểu để mua, giá mặc định (Admin chỉnh được)
export const TIERS = [
  { tier: 1, name: 'Góc nhỏ', capacity: 1, minLevel: 0, price: 0 },
  { tier: 2, name: 'Sân vườn', capacity: 2, minLevel: 2, price: 300 },
  { tier: 3, name: 'Nhà có sân', capacity: 3, minLevel: 3, price: 800 },
  { tier: 4, name: 'Biệt thự nhỏ', capacity: 4, minLevel: 4, price: 1800 },
  { tier: 5, name: 'Công viên riêng', capacity: 6, minLevel: 5, price: 3500 },
];
export const FOODS = [
  { id: 'rau', name: 'Rau củ', emoji: '🥕', food: 20 }, { id: 'hat', name: 'Hạt', emoji: '🌰', food: 20 },
  { id: 'banh', name: 'Bánh quy', emoji: '🍪', food: 25 }, { id: 'thit', name: 'Thịt', emoji: '🍖', food: 35 },
  { id: 'xuong', name: 'Xương gặm', emoji: '🦴', food: 25 },
];
export const STAGES = [{ n: 0, name: 'Bé', from: 0 }, { n: 1, name: 'Con nhỏ', from: 100 }, { n: 2, name: 'Thiếu niên', from: 400 }, { n: 3, name: 'Trưởng thành', from: 1000 }];
export const DAILY_GAIN_CAP = 80; // điểm Thân thiết tối đa mỗi thú mỗi ngày
// tốc độ tụt mỗi giờ (cơ bản) rồi nhân hệ số của từng bạn
const BASE_DECAY = { food: 4, fun: 3.5, clean: 2, health: 1.5 };
export const KINDS = [
  { id: 'juad', name: 'Juad', species: 'Rùa', emoji: '🐢', initials: 'JU', color: '#B45309', mult: { food: 0.5, fun: 0.6, clean: 0.6, health: 0.5 }, fav: 'rau', trait: 'Chậm mà chắc: tụt chỉ số chậm nhất' },
  { id: 'abu', name: 'Abu', species: 'Vẹt', emoji: '🦜', initials: 'AB', color: '#B91C1C', mult: { fun: 1.3 }, fav: 'hat', trait: 'Nói nhiều: hay buồn chán nếu không được chơi' },
  { id: 'uni', name: 'Uni', species: 'Chó', emoji: '🐶', initials: 'UN', color: '#0E7490', mult: { clean: 0.8 }, fav: 'xuong', trait: 'Dịu dàng: thích được tắm và vuốt ve' },
  { id: 'charsiu', name: 'Charsiu', species: 'Chó', emoji: '🐕', initials: 'CH', color: '#B91C5C', mult: { food: 1.5 }, fav: 'thit', trait: 'Tham ăn: đói nhanh, thích món thịt' },
  { id: 'tofu', name: 'Tofu', species: 'Chó', emoji: '🐩', initials: 'TO', color: '#4D7C0F', mult: { health: 1.3 }, fav: 'banh', trait: 'Hay ngủ: ngủ hồi sức nhiều hơn', sleepBoost: 1.5 },
  { id: 'udon', name: 'Udon', species: 'Chó', emoji: '🦮', initials: 'UD', color: '#6D28D9', mult: { fun: 1.5 }, fav: 'thit', trait: 'Nghịch ngợm: cần chơi nhiều, chơi đúng thì thân thiết nhanh', playBoost: 1.3 },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k]));
const ACTIONS = { feed: { cd: 20_000 }, play: { cd: 20_000 }, wash: { cd: 60_000 }, sleep: { cd: 600_000 } };

db.exec(`
CREATE TABLE IF NOT EXISTS pet_kinds (id TEXT PRIMARY KEY, image_url TEXT);
CREATE TABLE IF NOT EXISTS pet_home (user_id INTEGER PRIMARY KEY, tier INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, push_at INTEGER NOT NULL DEFAULT 0, push_day TEXT, push_n INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS pets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, intimacy INTEGER NOT NULL DEFAULT 0,
  food REAL NOT NULL, fun REAL NOT NULL, clean REAL NOT NULL, health REAL NOT NULL, stat_at INTEGER NOT NULL,
  cd TEXT, day TEXT, day_gain INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, UNIQUE (user_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_pets_user ON pets(user_id);
CREATE TABLE IF NOT EXISTS pet_visits (visitor_id INTEGER NOT NULL, owner_id INTEGER NOT NULL, day TEXT NOT NULL, PRIMARY KEY (visitor_id, owner_id, day));
`);
for (const k of KINDS) db.prepare('INSERT OR IGNORE INTO pet_kinds (id) VALUES (?)').run(k.id);

// ---- cài đặt ------------------------------------------------------------------------------------------------------
const kv = (k) => db.prepare('SELECT value FROM app_kv WHERE key = ?').get(k)?.value;
const setKv = (k, v) => db.prepare('INSERT OR REPLACE INTO app_kv (key, value) VALUES (?, ?)').run(k, v);
export const petsMode = () => (kv('pets_mode') === 'all' ? 'all' : 'admin'); // mặc định: chỉ Admin thử
const prices = () => { try { const a = JSON.parse(kv('pets_prices')); return Array.isArray(a) && a.length === 4 ? a.map((x) => Math.max(0, Math.floor(Number(x)) || 0)) : null; } catch { return null; } };
export const tiers = () => { const p = prices(); return TIERS.map((t, i) => ({ ...t, price: i === 0 ? 0 : p ? p[i - 1] : t.price })); };
export const canUsePets = (uid) => petsMode() === 'all' || isSystemAdmin(uid);

// ---- tính chỉ số theo thời gian thật --------------------------------------------------------------------------------
const clamp = (v) => Math.max(0, Math.min(100, v));
const dayKey = (t = now()) => new Date(t + 7 * 3600_000).toISOString().slice(0, 10); // giờ Việt Nam
const crowdOf = (n) => 1 / (1 + 0.12 * Math.max(0, n - 1)); // nuôi nhiều bạn thì mỗi bạn tụt chậm hơn
function current(p, t, crowd) {
  const k = KIND[p.kind], hours = Math.max(0, t - p.stat_at) / 3600_000, out = {};
  for (const s of ['food', 'fun', 'clean', 'health']) out[s] = clamp(p[s] - BASE_DECAY[s] * (k.mult[s] || 1) * crowd * hours);
  return out;
}
const stageOf = (i) => [...STAGES].reverse().find((s) => i >= s.from);
function moodOf(st) {
  const low = Object.entries(st).sort((a, b) => a[1] - b[1])[0];
  if (low[1] < 25) return { key: { food: 'hungry', fun: 'bored', clean: 'dirty', health: 'sleepy' }[low[0]], label: { food: 'Đang đói bụng', fun: 'Đang buồn chán', clean: 'Cần được tắm', health: 'Đang buồn ngủ' }[low[0]] };
  return (st.food + st.fun + st.clean + st.health) / 4 >= 70 ? { key: 'happy', label: 'Đang rất vui' } : { key: 'ok', label: 'Ổn' };
}
export function petView(p, t, crowd, kinds = imgMap()) {
  const k = KIND[p.kind], st = current(p, t, crowd), cd = (() => { try { return JSON.parse(p.cd || '{}'); } catch { return {}; } })();
  const stage = stageOf(p.intimacy), next = STAGES.find((s) => s.from > p.intimacy);
  return {
    id: p.id, kind: p.kind, kindName: k.name, species: k.species, emoji: k.emoji, initials: k.initials, color: k.color, imageUrl: kinds[p.kind] || null, name: p.name, trait: k.trait,
    favFood: k.fav, intimacy: p.intimacy, stage: stage.n, stageName: stage.name, nextAt: next ? next.from : null,
    stats: Object.fromEntries(Object.entries(st).map(([a, v]) => [a, Math.round(v)])), mood: moodOf(st),
    cooldowns: Object.fromEntries(Object.entries(ACTIONS).map(([a, c]) => [a, Math.max(0, (cd[a] || 0) + c.cd - t)])),
    gainLeft: Math.max(0, DAILY_GAIN_CAP - (p.day === dayKey(t) ? p.day_gain : 0)),
  };
}
const imgMap = () => Object.fromEntries(db.prepare('SELECT id, image_url FROM pet_kinds').all().map((r) => [r.id, r.image_url]));
const myPets = (uid) => db.prepare('SELECT * FROM pets WHERE user_id = ? ORDER BY id').all(uid);
function homeOf(uid) {
  let h = db.prepare('SELECT * FROM pet_home WHERE user_id = ?').get(uid);
  if (!h) { db.prepare('INSERT INTO pet_home (user_id, tier, created_at) VALUES (?,1,?)').run(uid, now()); h = db.prepare('SELECT * FROM pet_home WHERE user_id = ?').get(uid); }
  return h;
}
const capacityOf = (h) => tiers().find((t) => t.tier === h.tier).capacity;

// cộng điểm Thân thiết (có trần mỗi ngày)
function gain(p, amount, t) {
  const day = dayKey(t), used = p.day === day ? p.day_gain : 0, add = Math.max(0, Math.min(amount, DAILY_GAIN_CAP - used));
  db.prepare('UPDATE pets SET intimacy = intimacy + ?, day = ?, day_gain = ? WHERE id = ?').run(add, day, used + add, p.id);
  return add;
}

// ---- thao tác chăm sóc ------------------------------------------------------------------------------------------------
function care(uid, petId, action, body) {
  return tx(() => {
    const p = db.prepare('SELECT * FROM pets WHERE id = ? AND user_id = ?').get(petId, uid);
    if (!p) throw notFound('Không tìm thấy bạn thú này');
    const t = now(), all = myPets(uid), crowd = crowdOf(all.length), k = KIND[p.kind], st = current(p, t, crowd);
    const cd = (() => { try { return JSON.parse(p.cd || '{}'); } catch { return {}; } })();
    const wait = (cd[action] || 0) + ACTIONS[action].cd - t;
    if (wait > 0) throw bad(`Đợi ${Math.ceil(wait / 1000)} giây nữa nhé`);
    let stat, delta = {}, base = 0, fav = false;
    if (action === 'feed') {
      const f = FOODS.find((x) => x.id === body?.food); if (!f) throw bad('Món ăn không hợp lệ');
      if (st.food >= 95) throw bad(`${p.name} no rồi`);
      stat = 'food'; delta.food = f.food; fav = f.id === k.fav; if (fav) delta.fun = 10;
    } else if (action === 'play') {
      if (st.fun >= 95) throw bad(`${p.name} đang rất vui rồi`);
      stat = 'fun'; delta = { fun: Math.round(25 * (k.playBoost || 1)), food: -5, clean: -5 };
    } else if (action === 'wash') {
      if (st.clean >= 90) throw bad(`${p.name} đang sạch sẽ rồi`);
      stat = 'clean'; delta = { clean: 40 };
    } else {
      if (st.health >= 90) throw bad(`${p.name} đang khỏe rồi`);
      stat = 'health'; delta = { health: Math.round(30 * (k.sleepBoost || 1)) };
    }
    // chỉ cộng Thân thiết khi chỉ số đó thật sự cần chăm; chăm lúc còn đầy thì cộng ít
    base = st[stat] < 60 ? 3 : 1; if (fav) base += 2; if (k.playBoost && action === 'play') base += 1;
    const next = { ...st };
    for (const [s, d] of Object.entries(delta)) next[s] = clamp(next[s] + d);
    cd[action] = t;
    db.prepare('UPDATE pets SET food = ?, fun = ?, clean = ?, health = ?, stat_at = ?, cd = ? WHERE id = ?').run(next.food, next.fun, next.clean, next.health, t, JSON.stringify(cd), p.id);
    const added = gain(db.prepare('SELECT * FROM pets WHERE id = ?').get(p.id), base, t);
    const fresh = db.prepare('SELECT * FROM pets WHERE id = ?').get(p.id);
    return { pet: petView(fresh, t, crowd), gained: added, liked: fav, levelUp: stageOf(fresh.intimacy).n > stageOf(p.intimacy).n ? stageOf(fresh.intimacy).name : null };
  });
}

// ---- nhắc chăm thú (push, gộp một tin, tối đa 2 lần mỗi ngày) ------------------------------------------------------------
export function petsSweep() {
  const t = now(), day = dayKey(t);
  for (const h of db.prepare('SELECT * FROM pet_home').all()) {
    try {
      if (!canUsePets(h.user_id) || isOnline(h.user_id)) continue;
      const pushedToday = h.push_day === day ? h.push_n : 0;
      if (pushedToday >= 2 || t - h.push_at < 8 * 3600_000) continue;
      const list = myPets(h.user_id), crowd = crowdOf(list.length);
      const needy = list.filter((p) => Math.min(...Object.values(current(p, t, crowd))) < 25);
      if (!needy.length) continue;
      const one = needy.length === 1 ? moodOf(current(needy[0], t, crowd)).label.toLowerCase() : '';
      pushOnly(h.user_id, 'social', { body: needy.length === 1 ? `${needy[0].name} ${one}. Vào chăm bạn ấy nhé!` : `${needy.length} bạn thú đang cần được chăm: ${needy.map((p) => p.name).join(', ')}`, url: '/#/pets', tag: 'pets-need' });
      db.prepare('UPDATE pet_home SET push_at = ?, push_day = ?, push_n = ? WHERE user_id = ?').run(t, day, pushedToday + 1, h.user_id);
    } catch (e) { console.error('[pets]', e.message); }
  }
}

export function mountPets(api, wrap, adminOnly, checkUploadUrl) {
  const me = (req) => req.user.id;
  const friendIds = (uid) => db.prepare('SELECT CASE WHEN a = ? THEN b ELSE a END id FROM friends WHERE a = ? OR b = ?').all(uid, uid, uid).map((r) => r.id);

  // ai cũng hỏi được (để ẩn/hiện thẻ game); các đường còn lại chỉ mở khi được phép
  api.get('/pets/access', wrap((req, res) => res.json({ open: canUsePets(me(req)), beta: petsMode() === 'admin' })));
  api.use('/pets', (req, _res, next) => { if (!canUsePets(me(req))) throw forbidden('Game Nuôi thú chưa mở cho bạn'); next(); });

  const state = (uid) => {
    const h = homeOf(uid), t = now(), list = myPets(uid), crowd = crowdOf(list.length), T = tiers(), cur = T.find((x) => x.tier === h.tier), nxt = T.find((x) => x.tier === h.tier + 1) || null, u = getUser(uid), kinds = imgMap();
    const mine = new Set(list.map((p) => p.kind));
    return {
      serverNow: t, balance: balanceOf(u), level: u.lvl || 0,
      home: { tier: cur.tier, name: cur.name, capacity: cur.capacity, used: list.length, tiers: T,
        next: nxt && { tier: nxt.tier, name: nxt.name, capacity: nxt.capacity, price: nxt.price, minLevel: nxt.minLevel, minLevelName: LEVEL_NAMES[nxt.minLevel], levelOk: (u.lvl || 0) >= nxt.minLevel } },
      pets: list.map((p) => petView(p, t, crowd, kinds)),
      kinds: KINDS.map((k) => ({ id: k.id, name: k.name, species: k.species, emoji: k.emoji, initials: k.initials, color: k.color, trait: k.trait, fav: k.fav, imageUrl: kinds[k.id] || null, adopted: mine.has(k.id) })),
      foods: FOODS, stages: STAGES, dailyCap: DAILY_GAIN_CAP, beta: petsMode() === 'admin',
    };
  };
  api.get('/pets', wrap((req, res) => res.json(state(me(req)))));

  api.post('/pets/adopt', wrap((req, res) => {
    rateLimit(`padopt:${me(req)}`, 20, 60_000);
    const uid = me(req), k = KIND[String(req.body?.kind || '')];
    if (!k) throw bad('Bạn thú không hợp lệ');
    tx(() => {
      const h = homeOf(uid);
      if (myPets(uid).length >= capacityOf(h)) throw bad('Khu nhà đã đầy, hãy mở rộng để nuôi thêm');
      if (db.prepare('SELECT 1 FROM pets WHERE user_id = ? AND kind = ?').get(uid, k.id)) throw bad(`Bạn đã nuôi ${k.name} rồi`);
      db.prepare('INSERT INTO pets (user_id, kind, name, food, fun, clean, health, stat_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(uid, k.id, k.name, 70, 70, 70, 70, now(), now());
    });
    res.status(201).json(state(uid));
  }));

  for (const action of Object.keys(ACTIONS)) {
    api.post(`/pets/:id/${action}`, wrap((req, res) => {
      rateLimit(`pcare:${me(req)}`, 120, 60_000);
      const r = care(me(req), Number(req.params.id), action, req.body);
      res.json({ ...r, balance: balanceOf(getUser(me(req))) });
    }));
  }
  api.patch('/pets/:id', wrap((req, res) => {
    const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ');
    if (!name || name.length > 20) throw bad('Tên từ 1 đến 20 ký tự');
    const r = db.prepare('UPDATE pets SET name = ? WHERE id = ? AND user_id = ?').run(name, Number(req.params.id), me(req));
    if (!r.changes) throw notFound('Không tìm thấy bạn thú này');
    res.json({ ok: true, name });
  }));

  // mở rộng khu nhà: cần đủ cấp và đủ xu tím
  api.post('/pets/home/expand', wrap((req, res) => {
    rateLimit(`pexp:${me(req)}`, 10, 60_000);
    const uid = me(req);
    tx(() => {
      const h = homeOf(uid), T = tiers(), nxt = T.find((x) => x.tier === h.tier + 1);
      if (!nxt) throw bad('Khu nhà đã ở bậc cao nhất');
      const u = getUser(uid);
      if ((u.lvl || 0) < nxt.minLevel) throw bad(`Cần đạt cấp ${LEVEL_NAMES[nxt.minLevel]} để mở rộng lên ${nxt.name}`);
      if (balanceOf(u) < nxt.price) throw bad('Bạn chưa đủ xu tím để mở rộng khu nhà');
      if (nxt.price) db.prepare('UPDATE users SET coins_spent = coins_spent + ? WHERE id = ?').run(nxt.price, uid);
      db.prepare('UPDATE pet_home SET tier = ? WHERE user_id = ?').run(nxt.tier, uid);
    });
    res.json(state(uid));
  }));

  // thăm nhà bạn bè
  api.get('/pets/friends', wrap((req, res) => {
    const out = friendIds(me(req)).filter((id) => canUsePets(id) && !isBlockedEither(me(req), id)).map((id) => {
      const c = db.prepare('SELECT COUNT(*) c FROM pets WHERE user_id = ?').get(id).c, u = getUser(id);
      return c ? { id, displayName: u.display_name, count: c } : null;
    }).filter(Boolean);
    res.json({ friends: out });
  }));
  const visitView = (viewer, ownerId) => {
    const o = getUser(ownerId);
    if (!o || o.status !== 'active' || !canUsePets(ownerId)) throw notFound('Không tìm thấy khu nhà');
    if (ownerId !== viewer && (!areFriends(viewer, ownerId) || isBlockedEither(viewer, ownerId))) throw forbidden('Chỉ thăm được nhà của bạn bè');
    const h = homeOf(ownerId), list = myPets(ownerId), t = now(), crowd = crowdOf(list.length), cur = tiers().find((x) => x.tier === h.tier);
    return { owner: { id: o.id, displayName: o.display_name }, home: { tier: cur.tier, name: cur.name, capacity: cur.capacity },
      pets: list.map((p) => { const v = petView(p, t, crowd); return { id: v.id, kind: v.kind, emoji: v.emoji, initials: v.initials, color: v.color, imageUrl: v.imageUrl, name: v.name, stageName: v.stageName, stage: v.stage, mood: v.mood }; }),
      patted: !!db.prepare('SELECT 1 FROM pet_visits WHERE visitor_id = ? AND owner_id = ? AND day = ?').get(viewer, ownerId, dayKey()) };
  };
  api.get('/pets/visit/:userId', wrap((req, res) => res.json(visitView(me(req), Number(req.params.userId)))));
  api.post('/pets/visit/:userId/pat', wrap((req, res) => {
    rateLimit(`ppat:${me(req)}`, 30, 3600_000);
    const owner = Number(req.params.userId); visitView(me(req), owner);
    if (owner === me(req)) throw bad('Hãy chăm thú của bạn ở khu nhà của bạn nhé');
    const p = db.prepare('SELECT * FROM pets WHERE id = ? AND user_id = ?').get(Number(req.body?.petId), owner);
    if (!p) throw notFound('Không tìm thấy bạn thú này');
    const done = tx(() => {
      if (db.prepare('SELECT 1 FROM pet_visits WHERE visitor_id = ? AND owner_id = ? AND day = ?').get(me(req), owner, dayKey())) return false;
      db.prepare('INSERT INTO pet_visits (visitor_id, owner_id, day) VALUES (?,?,?)').run(me(req), owner, dayKey());
      gain(p, 3, now());
      return true;
    });
    if (!done) throw bad('Hôm nay bạn đã vuốt ve thú ở nhà này rồi, mai quay lại nhé');
    notify(owner, 'pet_visit', `${req.user.display_name} đã ghé thăm và vuốt ve ${p.name}`, { url: '/#/pets', tag: `petvisit-${me(req)}` });
    res.json({ ok: true, petName: p.name });
  }));

  // ---- Admin: công tắc mở game, giá, ảnh, công cụ thử --------------------------------------------------------------
  api.get('/admin/pets/settings', adminOnly, wrap((_req, res) => res.json({ mode: petsMode(), tiers: tiers(), kinds: KINDS.map((k) => ({ id: k.id, name: k.name, emoji: k.emoji, initials: k.initials, color: k.color, imageUrl: imgMap()[k.id] || null })) })));
  api.put('/admin/pets/settings', adminOnly, wrap((req, res) => {
    const b = req.body || {};
    if (b.mode !== undefined) { if (!['admin', 'all'].includes(b.mode)) throw bad('Giá trị không hợp lệ'); setKv('pets_mode', b.mode); }
    if (b.prices !== undefined) {
      if (!Array.isArray(b.prices) || b.prices.length !== 4 || b.prices.some((x) => !Number.isInteger(x) || x < 0 || x > 1_000_000)) throw bad('Giá mở rộng không hợp lệ');
      setKv('pets_prices', JSON.stringify(b.prices));
    }
    log(me(req), 'pets_settings', { reason: JSON.stringify({ mode: b.mode, prices: b.prices }) });
    res.json({ mode: petsMode(), tiers: tiers() });
  }));
  api.patch('/admin/pets/kinds/:id', adminOnly, wrap((req, res) => {
    if (!KIND[req.params.id]) throw notFound('Không tìm thấy bạn thú này');
    const url = req.body?.imageUrl ? checkUploadUrl(req.body.imageUrl) : null;
    db.prepare('UPDATE pet_kinds SET image_url = ? WHERE id = ?').run(url, req.params.id);
    res.json({ ok: true, imageUrl: url });
  }));
  // công cụ thử, chỉ tác động tới chính Admin
  api.post('/admin/pets/reset', adminOnly, wrap((req, res) => {
    db.prepare('DELETE FROM pets WHERE user_id = ?').run(me(req));
    db.prepare('DELETE FROM pet_home WHERE user_id = ?').run(me(req));
    db.prepare('DELETE FROM pet_visits WHERE visitor_id = ? OR owner_id = ?').run(me(req), me(req));
    res.json({ ok: true });
  }));
  api.post('/admin/pets/skip', adminOnly, wrap((req, res) => {
    const h = Number(req.body?.hours);
    if (!Number.isFinite(h) || h <= 0 || h > 72) throw bad('Số giờ từ 1 đến 72');
    db.prepare('UPDATE pets SET stat_at = stat_at - ?, cd = NULL WHERE user_id = ?').run(Math.round(h * 3600_000), me(req));
    res.json({ ok: true });
  }));
  api.post('/admin/pets/coins', adminOnly, wrap((req, res) => {
    const n = Number(req.body?.amount);
    if (!Number.isInteger(n) || n < 1 || n > 10_000) throw bad('Số xu từ 1 đến 10.000');
    db.prepare('UPDATE users SET game_net = game_net + ? WHERE id = ?').run(n, me(req)); // cộng vào số dư, không ảnh hưởng cấp
    res.json({ ok: true, balance: balanceOf(getUser(me(req))) });
  }));

  setInterval(petsSweep, 10 * 60_000).unref();
}
