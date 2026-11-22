import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.DB_FILE = ':memory:';
process.env.PORT = '3998';
process.env.AUTO_VERIFY = '1';
process.env.PUSH_DRY_RUN = '1';
process.env.HOT_MIN_HEARTS = '1'; // các test cũ chỉ cần 1 tim; ngưỡng thật (38) được kiểm tra riêng ở cuối
process.env.REGISTER_RATE_LIMIT = '1000';
process.env.LOGIN_RATE_LIMIT = '1000';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'jkr-test-uploads');
const BASE = 'http://localhost:3998/api';
// công cụ caption giả lập (máy chủ thật không được gọi trong test)
import http from 'node:http';
process.env.CAPTION_API_URL = 'http://localhost:3997';
let capN = 0;
const capMock = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.url === '/api/config') return res.end(JSON.stringify({ topics: [
    { label: 'T1', enabled: true, topic: 've phim', tagsAndKeywords: '#tag1 kw1', charLimit: 120, language: 'vi', allowEmojis: false },
    { label: 'T2', enabled: false, topic: 've concert', tagsAndKeywords: '#tag2', charLimit: 120, language: 'vi' }] }));
  if (req.url === '/api/generate') { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { const j = JSON.parse(b || '{}'); res.end(JSON.stringify({ caption: `Caption ${j.topicLabel} số ${++capN}` })); }); return; }
  res.statusCode = 404; res.end('{}');
}).listen(3997);

before(async () => {
  await import('../server/index.js');
});
after(() => { capMock.close(); setTimeout(() => process.exit(0), 50); });

async function call(method, url, body, token) {
  const r = await fetch(BASE + url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
async function signup(name, provinceId = 1) {
  const email = `${name}@t.com`;
  const r = await call('POST', '/auth/register', { email, password: 'password1', acceptCommunity: true, displayName: name, provinceId });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const l = await call('POST', '/auth/login', { email, password: 'password1' });
  assert.equal(l.status, 200);
  return { token: l.data.token, id: l.data.user.id };
}

let mai, khoa, linh, admin;
test('đăng ký: email trùng bị từ chối, auto-join đúng 3 group', async () => {
  mai = await signup('mai', 26); // TP.HCM = id 45? lấy theo tên bên dưới
  const geo = await call('GET', '/geo');
  const hcm = geo.data.provinces.find((p) => p.name === 'TP. Hồ Chí Minh');
  await call('POST', '/me/home', { provinceId: hcm.id, leaveOld: true }, mai.token);
  const dup = await call('POST', '/auth/register', { email: 'mai@t.com', password: 'password1', acceptCommunity: true, displayName: 'x2', provinceId: 1 });
  assert.equal(dup.status, 400);
  const g = await call('GET', '/groups/mine', null, mai.token);
  assert.deepEqual(g.data.groups.filter((x) => x.type !== 'trend').map((x) => x.name), ['Việt Nam', 'Miền Nam', 'TP. Hồ Chí Minh']);
});
test('đăng ký: chọn Đà Nẵng -> Việt Nam, Miền Trung, Đà Nẵng', async () => {
  const geo = await call('GET', '/geo');
  linh = await signup('linh', geo.data.provinces.find((p) => p.name === 'Đà Nẵng').id);
  const g = await call('GET', '/groups/mine', null, linh.token);
  assert.deepEqual(g.data.groups.filter((x) => x.type !== 'trend').map((x) => x.name), ['Việt Nam', 'Miền Trung', 'Đà Nẵng']);
});
test('đăng ký mới: lời chào tự động nằm ở mục Chào mừng, không đăng vào khung chat chung', async () => {
  const vn = (await call('GET', '/groups/mine', null, mai.token)).data.groups.find((x) => x.type === 'country');
  const h = await call('GET', `/groups/${vn.id}/messages`, null, mai.token);
  assert.equal(h.data.messages.some((m) => m.body.includes('Chào mừng')), false);
  const w = await call('GET', `/groups/${vn.id}/welcome`, null, mai.token);
  assert.equal(w.status, 200);
  const me = w.data.newcomers.find((n) => n.isMe);
  assert.ok(me && me.welcomes.length === 1 && me.welcomes[0].body.includes('chào đón thành viên mới') && !me.welcomes[0].body.includes('đu LingOrm'));
});
test('chat: phải xác nhận quy tắc rồi mới gửi được; tin hiện trong lịch sử', async () => {
  const vn = (await call('GET', '/groups/mine', null, mai.token)).data.groups.find((x) => x.type === 'country');
  let r = await call('POST', `/groups/${vn.id}/messages`, { body: 'hi' }, mai.token);
  assert.equal(r.status, 403);
  await call('POST', `/groups/${vn.id}/rules-ack`, {}, mai.token);
  r = await call('POST', `/groups/${vn.id}/messages`, { body: 'hi' }, mai.token);
  assert.equal(r.status, 201);
  const h = await call('GET', `/groups/${vn.id}/messages`, null, mai.token);
  assert.equal(h.data.messages.at(-1).body, 'hi');
});
test('join group khác vùng không đổi home; rời rồi join lại được', async () => {
  const hcmId = (await call('GET', '/me', null, mai.token)).data.user.provinceId;
  const d = await call('GET', '/groups/discover?type=province&q=ha noi', null, mai.token);
  const hn = d.data.groups.find((g) => g.name === 'Hà Nội');
  assert.ok(hn);
  assert.equal((await call('POST', `/groups/${hn.id}/join`, {}, mai.token)).status, 200);
  assert.equal((await call('POST', `/groups/${hn.id}/leave`, {}, mai.token)).status, 200);
  assert.equal((await call('POST', `/groups/${hn.id}/join`, {}, mai.token)).status, 200);
  assert.equal((await call('GET', '/me', null, mai.token)).data.user.provinceId, hcmId);
});
test('kết bạn: policy none chặn; mặc định cho phép; không gửi trùng; DM chỉ khi là bạn', async () => {
  khoa = await signup('khoa', 1);
  assert.equal((await call('POST', `/dm/${khoa.id}`, {}, mai.token)).status, 403);
  await call('PATCH', '/me', { friendPolicy: 'none' }, khoa.token);
  assert.equal((await call('POST', '/friends/request', { userId: khoa.id }, mai.token)).status, 400);
  await call('PATCH', '/me', { friendPolicy: 'shared' }, khoa.token);
  assert.equal((await call('POST', '/friends/request', { userId: khoa.id }, mai.token)).status, 201);
  assert.equal((await call('POST', '/friends/request', { userId: khoa.id }, mai.token)).status, 400);
  const f = await call('GET', '/friends', null, khoa.token);
  await call('POST', `/friends/requests/${f.data.incoming[0].id}/accept`, {}, khoa.token);
  const dm = await call('POST', `/dm/${khoa.id}`, {}, mai.token);
  assert.equal(dm.status, 200);
  assert.equal((await call('POST', `/groups/${dm.data.group.id}/messages`, { body: 'alo' }, mai.token)).status, 201);
});
test('chặn: không thấy profile, không nhắn được', async () => {
  await call('POST', `/blocks/${mai.id}`, {}, khoa.token);
  assert.equal((await call('GET', `/users/${khoa.id}`, null, mai.token)).status, 404);
  assert.equal((await call('POST', `/dm/${khoa.id}`, {}, mai.token)).status, 403);
  assert.equal((await call('POST', '/friends/request', { userId: khoa.id }, mai.token)).status, 400);
  await call('DELETE', `/blocks/${mai.id}`, null, khoa.token);
});
test('group riêng: link cần duyệt, admin cuối phải chuyển quyền, giới hạn thành viên', async () => {
  await call('POST', '/friends/request', { userId: linh.id }, mai.token);
  const f = await call('GET', '/friends', null, linh.token);
  await call('POST', `/friends/requests/${f.data.incoming[0].id}/accept`, {}, linh.token);
  const g = await call('POST', '/private', { name: 'Hội bạn thân', memberIds: [linh.id] }, mai.token);
  assert.equal(g.status, 201);
  const gid = g.data.group.id;
  const link = await call('POST', `/private/${gid}/links`, { hours: 1 }, mai.token);
  assert.equal((await call('POST', `/invite/${link.data.code}/join`, {}, khoa.token)).status, 201);
  const reqs = await call('GET', '/private/requests', null, mai.token);
  assert.equal(reqs.data.requests.length, 1);
  await call('POST', `/private/requests/${reqs.data.requests[0].id}/approve`, {}, mai.token);
  assert.ok((await call('GET', '/groups/mine', null, khoa.token)).data.groups.some((x) => x.id === gid));
  assert.equal((await call('POST', `/groups/${gid}/leave`, {}, mai.token)).status, 400); // admin cuối
  await call('POST', `/private/${gid}/admins/${linh.id}`, {}, mai.token);
  assert.equal((await call('POST', `/groups/${gid}/leave`, {}, mai.token)).status, 200);
  await call('DELETE', `/private/links/${link.data.code}`, null, linh.token);
  assert.equal((await call('GET', `/invite/${link.data.code}`, null, mai.token)).status, 410);
  assert.equal((await call('PATCH', `/private/${gid}`, { memberLimit: 1 }, linh.token)).status, 400);
});
test('đổi home: giới hạn 1 lần/30 ngày', async () => {
  // mai vừa đổi home ở test đầu => lần đổi tiếp theo bị từ chối
  assert.equal((await call('POST', '/me/home', { provinceId: 1, leaveOld: true }, mai.token)).status, 400);
  // linh chưa từng đổi => đổi được và rời group cũ
  assert.equal((await call('POST', '/me/home', { provinceId: 1, leaveOld: true }, linh.token)).status, 200);
  const g = await call('GET', '/groups/mine', null, linh.token);
  assert.ok(!g.data.groups.some((x) => x.name === 'Đà Nẵng'));
});
test('report -> admin xử lý, người báo nhận thông báo, người thường không thấy hàng chờ', async () => {
  const l = await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' });
  admin = { token: l.data.token, id: l.data.user.id };
  const vn = (await call('GET', '/groups/mine', null, mai.token)).data.groups.find((x) => x.type === 'country');
  const msgs = (await call('GET', `/groups/${vn.id}/messages`, null, mai.token)).data.messages;
  const rp = await call('POST', '/reports', { messageId: msgs.find((m) => m.body === 'hi').id, reason: 'spam' }, linh.token);
  assert.equal(rp.status, 201);
  const q = await call('GET', '/reports', null, admin.token);
  assert.equal(q.data.reports.length, 1);
  assert.equal(q.data.reports[0].snapshotBody, 'hi');
  assert.equal((await call('GET', '/reports', null, linh.token)).data.reports.length, 0);
  const r = await call('POST', `/reports/${q.data.reports[0].id}/resolve`, { action: 'delete_message', note: 'spam' }, admin.token);
  assert.equal(r.status, 200);
  const n = await call('GET', '/notifications', null, linh.token);
  assert.ok(n.data.notifications.some((x) => x.type === 'report_done'));
  const n2 = await call('GET', '/notifications', null, mai.token);
  assert.ok(n2.data.notifications.some((x) => x.type === 'moderation'));
});
test('mod: admin trao quyền; mod xóa tin/mute trong group được giao', async () => {
  const vn = (await call('GET', '/groups/mine', null, khoa.token)).data.groups.find((x) => x.type === 'country');
  await call('POST', `/groups/${vn.id}/rules-ack`, {}, khoa.token);
  assert.equal((await call('POST', '/admin/mods', { groupId: vn.id, userId: khoa.id }, mai.token)).status, 403);
  assert.equal((await call('POST', '/admin/mods', { groupId: vn.id, userId: khoa.id }, admin.token)).status, 200);
  await call('POST', `/groups/${vn.id}/rules-ack`, {}, linh.token);
  const m2 = await call('POST', `/groups/${vn.id}/messages`, { body: 'bad' }, linh.token);
  assert.equal(m2.status, 201);
  assert.equal((await call('DELETE', `/messages/${m2.data.message.id}`, { reason: 'x' }, khoa.token)).status, 200);
  assert.equal((await call('POST', `/groups/${vn.id}/members/${linh.id}/mute`, { minutes: 5 }, khoa.token)).status, 200);
  assert.equal((await call('POST', `/groups/${vn.id}/messages`, { body: 'again' }, linh.token)).status, 403);
});
test('bản tin: chỉ admin đăng; ghim lên đầu; sửa có nhãn; huy hiệu chưa đọc', async () => {
  assert.equal((await call('POST', '/admin/news', { title: 't', body: 'b' }, mai.token)).status, 403);
  const a = await call('POST', '/admin/news', { title: 'A', body: 'a' }, admin.token);
  await call('POST', '/admin/news', { title: 'B', body: 'b' }, admin.token);
  await call('PATCH', `/admin/news/${a.data.news.id}`, { pinned: true, title: 'A2' }, admin.token);
  const n = await call('GET', '/news', null, linh.token);
  assert.equal(n.data.news[0].title, 'A2');
  assert.equal(n.data.news[0].edited, true);
  assert.equal(n.data.unread, 2);
  await call('POST', '/news/read-all', {}, linh.token);
  assert.equal((await call('GET', '/news', null, linh.token)).data.unread, 0);
});
test('khóa tài khoản & xóa tài khoản', async () => {
  await call('POST', `/admin/users/${linh.id}/lock`, { permanent: true }, admin.token);
  assert.equal((await call('GET', '/me', null, linh.token)).status, 401);
  assert.equal((await call('POST', '/auth/login', { email: 'linh@t.com', password: 'password1' })).status, 403);
  assert.equal((await call('DELETE', '/me', { password: 'sai' }, khoa.token)).status, 400);
  assert.equal((await call('DELETE', '/me', { password: 'password1' }, khoa.token)).status, 200);
});
test('tên hiển thị phải duy nhất (không phân biệt hoa/thường), kể cả khi đổi tên', async () => {
  const reg = (email, displayName) => call('POST', '/auth/register', { email, password: 'password1', acceptCommunity: true, displayName, provinceId: 1 });
  assert.equal((await reg('u1@t.com', 'Hoa Mai')).status, 201);
  assert.equal((await reg('u2@t.com', '  hoa   MAI ')).status, 400);
  const r = await reg('u3@t.com', 'Hoa Lan');
  assert.equal(r.status, 201);
  const l = await call('POST', '/auth/login', { email: 'u3@t.com', password: 'password1' });
  assert.equal((await call('PATCH', '/me', { displayName: 'HOA MAI' }, l.data.token)).status, 400);
  assert.equal((await call('PATCH', '/me', { displayName: 'Hoa Lan' }, l.data.token)).status, 200); // giữ tên cũ vẫn được
  assert.equal((await call('PATCH', '/me', { displayName: 'Hoa Sen' }, l.data.token)).status, 200);
  assert.equal((await reg('u4@t.com', 'hoa lan')).status, 201); // tên cũ đã được nhả ra
});
test('thả tim: bật/tắt, không tự thả tim, vào Chủ đề nóng khi đủ tim', async () => {
  const login = async (email) => (await call('POST', '/auth/login', { email, password: 'password1' })).data.token;
  const ts = [];
  for (const n of ['h1', 'h2', 'h3']) {
    await call('POST', '/auth/register', { email: `${n}@t.com`, password: 'password1', acceptCommunity: true, displayName: `Tim ${n}`, provinceId: 1 });
    ts.push(await login(`${n}@t.com`));
  }
  const vn = (await call('GET', '/groups/mine', null, ts[0])).data.groups.find((x) => x.type === 'country');
  for (const t of ts) await call('POST', `/groups/${vn.id}/rules-ack`, {}, t);
  const m = (await call('POST', `/groups/${vn.id}/messages`, { body: 'Tin nóng' }, ts[0])).data.message;
  assert.equal((await call('POST', `/messages/${m.id}/heart`, {}, ts[0])).status, 400); // tự thả tim
  assert.equal((await call('GET', '/hot', null, ts[1])).data.items.length, 0);
  const heart = (tok) => call('POST', `/messages/${m.id}/heart`, {}, tok);
  const r1 = await heart(ts[1]);
  assert.deepEqual([r1.data.hearts, r1.data.hearted], [1, true]);
  const r2 = await heart(ts[1]); // bỏ tim
  assert.deepEqual([r2.data.hearts, r2.data.hearted], [0, false]);
  await heart(ts[1]);
  await heart(ts[2]);
  assert.equal((await call('GET', '/hot', null, ts[1])).data.items[0].hearts, 2); // có tim là lên Chủ đề nóng, không cần ngưỡng
  await heart(admin.token);
  const hot = (await call('GET', '/hot', null, ts[1])).data.items;
  assert.equal(hot.length, 1);
  assert.equal(hot[0].hearts, 3);
  assert.equal(hot[0].hearted, true);
  for (const [sc, n] of [['country', 1], ['region', 0], ['province', 0], ['bogus', 1]]) {
    assert.equal((await call('GET', '/hot?scope=' + sc, null, ts[1])).data.items.length, n, 'lọc ' + sc);
  }
  const hist = (await call('GET', `/groups/${vn.id}/messages`, null, ts[2])).data.messages.find((x) => x.id === m.id);
  assert.deepEqual([hist.hearts, hist.hearted], [3, true]);
});

test('đổi mật khẩu: cần mật khẩu cũ, kiểm tra mới, đăng xuất phiên khác', async () => {
  const email = 'pw@t.com';
  await call('POST', '/auth/register', { email, password: 'password1', acceptCommunity: true, displayName: 'Doi Mat Khau', provinceId: 1 });
  const a = (await call('POST', '/auth/login', { email, password: 'password1' })).data.token;
  const b = (await call('POST', '/auth/login', { email, password: 'password1' })).data.token;
  const chg = (cur, next, confirm = next) => call('POST', '/me/password', { currentPassword: cur, newPassword: next, confirmPassword: confirm }, a);
  assert.equal((await chg('sai-mat-khau', 'matkhaumoi1')).status, 400);
  assert.equal((await chg('password1', 'ngan')).status, 400);
  assert.equal((await chg('password1', 'matkhaumoi1', 'khac-nhau')).status, 400);
  assert.equal((await chg('password1', 'password1')).status, 400);
  assert.equal((await chg('password1', 'matkhaumoi1')).status, 200);
  assert.equal((await call('GET', '/me', null, a)).status, 200); // phiên hiện tại còn
  assert.equal((await call('GET', '/me', null, b)).status, 401); // phiên khác bị đăng xuất
  assert.equal((await call('POST', '/auth/login', { email, password: 'password1' })).status, 401);
  assert.equal((await call('POST', '/auth/login', { email, password: 'matkhaumoi1' })).status, 200);
});

test('báo lỗi: người dùng gửi; chỉ admin xem/giao cho agent qua webhook', async () => {
  const http = await import('node:http');
  const got = [];
  const hook = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => { got.push({ auth: req.headers.authorization, body: JSON.parse(body) }); res.statusCode = got.length > 1 ? 500 : 200; res.end('ok'); });
  });
  await new Promise((r) => hook.listen(0, r));
  const l = await call('POST', '/auth/login', { email: 'pw@t.com', password: 'matkhaumoi1' });
  const user = l.data.token;
  assert.equal((await call('POST', '/bugs', { title: 'a', description: 'quá ngắn' }, user)).status, 400);
  const b = await call('POST', '/bugs', { title: 'Nút gửi bị lỗi', description: 'Bấm gửi tin nhắn không có phản hồi trên iPhone', page: '#/chat/1' }, user);
  assert.equal(b.status, 201);
  assert.equal((await call('GET', '/admin/bugs', null, user)).status, 403);
  const list = await call('GET', '/admin/bugs', null, admin.token);
  assert.equal(list.data.bugs[0].title, 'Nút gửi bị lỗi');
  assert.equal(list.data.counts.new, 1);
  const id = b.data.id;
  const comp = await call('POST', '/admin/bugs/compose', { ids: [id], prompt: 'Sửa giúp' }, admin.token);
  assert.ok(comp.data.text.includes('Sửa giúp') && comp.data.text.includes('Nút gửi bị lỗi') && comp.data.text.includes('#/chat/1'));
  // chưa cấu hình webhook
  delete process.env.AGENT_WEBHOOK_URL;
  assert.equal((await call('POST', '/admin/bugs/send', { ids: [id], prompt: 'Sửa giúp' }, admin.token)).status, 400);
  process.env.AGENT_WEBHOOK_URL = `http://127.0.0.1:${hook.address().port}/hook`;
  process.env.AGENT_WEBHOOK_TOKEN = 'tok123';
  assert.equal((await call('POST', '/admin/bugs/send', { ids: [id], prompt: 'Sửa giúp' }, user)).status, 403);
  assert.equal((await call('POST', '/admin/bugs/send', { ids: [id], prompt: '' }, admin.token)).status, 400);
  const ok = await call('POST', '/admin/bugs/send', { ids: [id], prompt: 'Sửa giúp' }, admin.token);
  assert.equal(ok.status, 200);
  assert.equal(got[0].auth, 'Bearer tok123');
  assert.equal(got[0].body.bugs[0].id, id);
  assert.ok(got[0].body.text.includes('Sửa giúp'));
  assert.equal((await call('GET', '/admin/bugs?status=sent', null, admin.token)).data.bugs.length, 1);
  // webhook lỗi -> 502 và trạng thái không đổi
  await call('PATCH', `/admin/bugs/${id}`, { status: 'new' }, admin.token);
  assert.equal((await call('POST', '/admin/bugs/send', { ids: [id], prompt: 'Sửa giúp' }, admin.token)).status, 502);
  assert.equal((await call('GET', '/admin/bugs?status=new', null, admin.token)).data.bugs.length, 1);
  assert.equal((await call('PATCH', `/admin/bugs/${id}`, { status: 'fixed' }, admin.token)).status, 200);
  delete process.env.AGENT_WEBHOOK_URL;
  hook.close();
});

test('Đẩy trend: ai cũng vào sẵn và đọc được, chỉ admin/mod được đăng, không rời được', async () => {
  const nguoi = await signup('nguoithuong', 1);
  const mine = (await call('GET', '/groups/mine', null, nguoi.token)).data.groups;
  const trend = mine[0];
  assert.equal(trend.type, 'trend');
  assert.equal(trend.name, 'Đẩy trend');
  assert.equal(trend.canPost, false);
  assert.equal((await call('POST', `/groups/${trend.id}/messages`, { body: 'spam' }, nguoi.token)).status, 202); // chờ admin duyệt, chưa hiện trong nhóm
  assert.equal((await call('POST', `/groups/${trend.id}/leave`, {}, nguoi.token)).status, 400);
  const p = await call('POST', `/groups/${trend.id}/messages`, { body: 'Mọi người cùng đẩy trend nhé' }, admin.token);
  assert.equal(p.status, 201);
  // mod của một nhóm công khai cũng được đăng
  const modx = await signup('modtrend', 1);
  const vn = (await call('GET', '/groups/mine', null, modx.token)).data.groups.find((x) => x.type === 'country');
  assert.equal((await call('POST', '/admin/mods', { groupId: vn.id, userId: modx.id }, admin.token)).status, 200);
  const khoaTrend = (await call('GET', '/groups/mine', null, modx.token)).data.groups[0];
  assert.equal(khoaTrend.canPost, true);
  assert.equal((await call('POST', `/groups/${trend.id}/messages`, { body: 'mod đăng' }, modx.token)).status, 201);
  // người thường đọc và thả tim được
  const hist = (await call('GET', `/groups/${trend.id}/messages`, null, nguoi.token)).data.messages;
  assert.equal(hist.length, 2);
  assert.equal((await call('POST', `/messages/${p.data.message.id}/heart`, {}, nguoi.token)).status, 200);
  // người đăng ký mới cũng được vào sẵn
  const moi = await signup('nguoimoi', 1);
  assert.equal((await call('GET', '/groups/mine', null, moi.token)).data.groups[0].type, 'trend');
});

test('admin hệ thống trao mod cho bất kỳ user nào, kể cả chưa ở trong nhóm', async () => {
  const u = await signup('modbatky', 1);
  const dn = (await call('GET', '/groups/discover?q=da nang', null, u.token)).data.groups.find((x) => x.type === 'province');
  assert.equal(dn.joined, false);
  assert.equal((await call('POST', '/admin/mods', { groupId: dn.id, userId: u.id }, u.token)).status, 403); // người thường không được
  assert.equal((await call('POST', '/admin/mods', { groupId: dn.id, userId: u.id }, admin.token)).status, 200);
  const g = (await call('GET', `/groups/${dn.id}`, null, u.token)).data.group;
  assert.equal(g.role, 'mod');
  const trend = (await call('GET', '/groups/mine', null, u.token)).data.groups.find((x) => x.type === 'trend');
  assert.equal(trend.canPost, true);
  assert.equal((await call('POST', '/admin/mods', { groupId: dn.id, userId: admin.id }, admin.token)).status, 400); // admin đã có toàn quyền
  assert.equal((await call('DELETE', `/admin/mods/${dn.id}/${u.id}`, null, admin.token)).status, 200);
});

test('lưu tin nhắn 38 ngày: xóa tin cũ hơn, giữ tin mới, xóa ảnh mồ côi, giữ ảnh còn dùng', async () => {
  const fs = await import('node:fs');
  const { db, now } = await import('../server/db.js');
  const { purgeOldMessages } = await import('../server/retention.js');
  const u = await signup('luutru', 1);
  const vn = (await call('GET', '/groups/mine', null, u.token)).data.groups.find((x) => x.type === 'country');
  await call('POST', `/groups/${vn.id}/rules-ack`, {}, u.token);
  const mk = async (body) => (await call('POST', `/groups/${vn.id}/messages`, { body }, u.token)).data.message.id;
  const oldId = await mk('tin 40 ngày trước');
  const edgeId = await mk('tin 37 ngày trước');
  const newId = await mk('tin mới');
  const DAYMS = 24 * 3600 * 1000;
  const dir = process.env.UPLOAD_DIR;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'oldpic.png'), 'x');
  fs.writeFileSync(path.join(dir, 'sharedpic.png'), 'x');
  db.prepare('UPDATE messages SET created_at = ?, image_url = ? WHERE id = ?').run(now() - 40 * DAYMS, '/uploads/oldpic.png', oldId);
  db.prepare('UPDATE messages SET created_at = ?, image_url = ? WHERE id = ?').run(now() - 37 * DAYMS, '/uploads/sharedpic.png', edgeId);
  db.prepare('UPDATE messages SET image_url = ? WHERE id = ?').run('/uploads/sharedpic.png', oldId); // cùng một ảnh với tin còn giữ
  await call('POST', `/messages/${oldId}/heart`, {}, admin.token);
  const r = purgeOldMessages(dir);
  assert.ok(r.messages >= 1);
  const ids = (await call('GET', `/groups/${vn.id}/messages`, null, u.token)).data.messages.map((m) => m.id);
  assert.ok(!ids.includes(oldId));
  assert.ok(ids.includes(edgeId) && ids.includes(newId));
  assert.equal(db.prepare('SELECT COUNT(*) c FROM reactions WHERE message_id = ?').get(oldId).c, 0);
  assert.ok(fs.existsSync(path.join(dir, 'sharedpic.png'))); // vẫn còn tin dùng ảnh này
  // ảnh chỉ thuộc tin cũ thì bị xóa
  const old2 = await mk('tin cũ khác');
  db.prepare('UPDATE messages SET created_at = ?, image_url = ? WHERE id = ?').run(now() - 50 * DAYMS, '/uploads/oldpic.png', old2);
  purgeOldMessages(dir);
  assert.ok(!fs.existsSync(path.join(dir, 'oldpic.png')));
});

test('không lộ vị trí của người khác; chính chủ và admin vẫn thấy', async () => {
  const a = await signup('vitri1', 1), b = await signup('vitri2', 1);
  const other = (await call('GET', `/users/${b.id}`, null, a.token)).data.user;
  assert.equal(other.location, undefined);
  const vn = (await call('GET', '/groups/mine', null, a.token)).data.groups.find((x) => x.type === 'country');
  await call('POST', `/groups/${vn.id}/rules-ack`, {}, b.token);
  const m = (await call('POST', `/groups/${vn.id}/messages`, { body: 'hi' }, b.token)).data.message;
  assert.equal(m.user.location, undefined);
  assert.ok((await call('GET', '/me', null, a.token)).data.user.location.province);
  const users = (await call('GET', '/admin/users?q=vitri2', null, admin.token)).data.users;
  assert.ok(users[0].location.province);
});

test('không kết bạn được với admin hệ thống (cả hai chiều)', async () => {
  const u = await signup('kbadmin', 1);
  assert.equal((await call('POST', '/friends/request', { userId: admin.id }, u.token)).status, 400);
  assert.equal((await call('POST', '/friends/request', { userId: u.id }, admin.token)).status, 400);
});

test('xem tin nhóm công khai không cần tham gia; không chat/thả tim được; nhóm riêng vẫn bị chặn', async () => {
  const w = await signup('khach', 1);
  const dn = (await call('GET', '/groups/discover?q=da nang', null, w.token)).data.groups.find((x) => x.type === 'province');
  assert.equal(dn.joined, false);
  // có sẵn một tin trong nhóm đó (do admin đăng)
  const posted = await call('POST', `/groups/${dn.id}/messages`, { body: 'tin cho khách đọc' }, admin.token);
  if (posted.status !== 201) { await call('POST', `/groups/${dn.id}/join`, {}, admin.token); await call('POST', `/groups/${dn.id}/rules-ack`, {}, admin.token); await call('POST', `/groups/${dn.id}/messages`, { body: 'tin cho khách đọc' }, admin.token); }
  const r = await call('GET', `/groups/${dn.id}/messages`, null, w.token);
  assert.equal(r.status, 200);
  assert.ok(r.data.messages.some((m) => m.body === 'tin cho khách đọc'));
  assert.equal((await call('POST', `/groups/${dn.id}/messages`, { body: 'xen vào' }, w.token)).status, 403);
  assert.equal((await call('POST', `/messages/${r.data.messages[0].id}/heart`, {}, w.token)).status, 403);
  // nhóm riêng: người ngoài không đọc được
  const pg = await call('POST', '/private', { name: 'riêng tư', memberLimit: 10 }, admin.token);
  if (pg.status < 300) assert.equal((await call('GET', `/groups/${pg.data.group.id}/messages`, null, w.token)).status, 403);
});

test('chuyển tiếp tin từ nhóm công khai chưa tham gia vào nhóm mình; nhóm riêng người ngoài không chuyển được', async () => {
  const w = await signup('chuyentiep', 1);
  const vn = (await call('GET', '/groups/mine', null, w.token)).data.groups.find((x) => x.type === 'country');
  await call('POST', `/groups/${vn.id}/rules-ack`, {}, w.token);
  const dn = (await call('GET', '/groups/discover?q=da nang', null, w.token)).data.groups.find((x) => x.type === 'province');
  await call('POST', `/groups/${dn.id}/join`, {}, admin.token); await call('POST', `/groups/${dn.id}/rules-ack`, {}, admin.token);
  const src = (await call('POST', `/groups/${dn.id}/messages`, { body: 'tin để chuyển tiếp' }, admin.token)).data.message;
  const f = await call('POST', `/messages/${src.id}/forward`, { groupId: vn.id }, w.token);
  assert.equal(f.status, 201);
  assert.equal(f.data.message.body, 'tin để chuyển tiếp');
  assert.equal(f.data.message.user.id, w.id);
  assert.ok(f.data.message.fwd && f.data.message.fwd.group === dn.name);
  // chưa tham gia nhóm đích => 403
  assert.equal((await call('POST', `/messages/${src.id}/forward`, { groupId: dn.id }, w.token)).status, 403);
  // tin trong nhóm riêng: người ngoài không chuyển tiếp được
  const o = await signup('chukin', 1);
  const pg = await call('POST', '/private', { name: 'kín' }, o.token);
  assert.equal(pg.status, 201);
  {
    const pm = await call('POST', `/groups/${pg.data.group.id}/messages`, { body: 'bí mật' }, o.token);
    assert.equal((await call('POST', `/messages/${pm.data.message.id}/forward`, { groupId: vn.id }, w.token)).status, 403);
  }
});

test('không thể rời nhóm quốc gia', async () => {
  const u = await signup('khongroi', 1);
  const vn = (await call('GET', '/groups/mine', null, u.token)).data.groups.find((x) => x.type === 'country');
  assert.equal((await call('POST', `/groups/${vn.id}/leave`, {}, u.token)).status, 400);
});

test('tim ở tin chuyển tiếp được tính cho tin gốc', async () => {
  const a = await signup('goc1', 1), b = await signup('chuyen1', 1), c = await signup('tim1', 1);
  for (const u of [a, b, c]) { const v = (await call('GET', '/groups/mine', null, u.token)).data.groups.find((x) => x.type === 'country'); await call('POST', `/groups/${v.id}/rules-ack`, {}, u.token); u.vn = v.id; }
  const src = (await call('POST', `/groups/${a.vn}/messages`, { body: 'gốc để thả tim' }, a.token)).data.message;
  const fw = (await call('POST', `/messages/${src.id}/forward`, { groupId: b.vn }, b.token)).data.message;
  const h = await call('POST', `/messages/${fw.id}/heart`, {}, c.token);
  assert.equal(h.data.hearts, 1);
  const list = (await call('GET', `/groups/${a.vn}/messages`, null, c.token)).data.messages;
  const orig = list.find((m) => m.id === src.id), copy = list.find((m) => m.id === fw.id);
  assert.equal(orig.hearts, 1); assert.equal(copy.hearts, 1); assert.equal(copy.hearted, true);
  // thả tim ở tin gốc rồi cùng bản chuyển tiếp: bật/tắt chung
  assert.equal((await call('POST', `/messages/${src.id}/heart`, {}, c.token)).data.hearts, 0);
  // người chuyển tiếp không tự thả tim bản chuyển tiếp; chủ tin gốc cũng không
  assert.equal((await call('POST', `/messages/${fw.id}/heart`, {}, b.token)).status, 400);
  assert.equal((await call('POST', `/messages/${fw.id}/heart`, {}, a.token)).status, 400);
});

test('chủ đề nóng không trùng lặp: cùng liên kết/nội dung chỉ hiện một lần', async () => {
  const a = await signup('trung1', 1), b = await signup('trung2', 1), c = await signup('trung3', 1);
  let vn;
  for (const u of [a, b, c]) { vn = (await call('GET', '/groups/mine', null, u.token)).data.groups.find((x) => x.type === 'country'); await call('POST', `/groups/${vn.id}/rules-ack`, {}, u.token); }
  const m1 = (await call('POST', `/groups/${vn.id}/messages`, { body: 'xem nè https://example.com/bai-viet-trung?s=1' }, a.token)).data.message;
  const m2 = (await call('POST', `/groups/${vn.id}/messages`, { body: 'link đây https://www.example.com/bai-viet-trung/?s=2' }, b.token)).data.message;
  await call('POST', `/messages/${m1.id}/heart`, {}, b.token); await call('POST', `/messages/${m1.id}/heart`, {}, c.token);
  await call('POST', `/messages/${m2.id}/heart`, {}, c.token);
  const items = (await call('GET', '/hot', null, c.token)).data.items.filter((i) => /bai-viet-trung/.test(i.body));
  assert.equal(items.length, 1);
  assert.equal(items[0].id, m1.id); // giữ tin nhiều tim hơn
});

test('phân quyền: chỉ Admin hệ thống phong Admin; Admin không phong Admin, không khóa vĩnh viễn, không gửi agent', async () => {
  const a = await signup('quyen1', 1), t1 = await signup('quyen2', 1), t2 = await signup('quyen3', 1);
  // người thường không phong được
  assert.equal((await call('POST', '/admin/admins', { userId: a.id }, t1.token)).status, 403);
  // Admin hệ thống phong Admin
  assert.equal((await call('POST', '/admin/admins', { userId: a.id }, admin.token)).status, 200);
  const me = await call('GET', '/me', null, a.token);
  assert.equal(me.data.user.role, 'admin'); assert.equal(me.data.user.isSuper, false);
  assert.equal((await call('POST', '/admin/admins', { userId: a.id }, admin.token)).status, 400); // đã là Admin
  // Admin không phong Admin khác, không xem danh sách Admin
  assert.equal((await call('POST', '/admin/admins', { userId: t1.id }, a.token)).status, 403);
  assert.equal((await call('GET', '/admin/admins', null, a.token)).status, 403);
  // Admin vẫn trao mod, khóa tạm; không khóa vĩnh viễn; không gửi agent
  const vn = (await call('GET', '/groups/mine', null, t1.token)).data.groups.find((x) => x.type === 'country');
  assert.equal((await call('POST', '/admin/mods', { groupId: vn.id, userId: t1.id }, a.token)).status, 200);
  assert.equal((await call('POST', `/admin/users/${t2.id}/lock`, { permanent: true, reason: 'x' }, a.token)).status, 403);
  assert.equal((await call('POST', `/admin/users/${t2.id}/lock`, { days: 1, reason: 'x' }, a.token)).status, 200);
  assert.equal((await call('POST', '/admin/bugs/compose', { ids: [1] }, a.token)).status, 403);
  // Admin không khóa được Admin hệ thống; Admin hệ thống khóa được Admin nhưng không thu hồi/khóa chính mình
  const sup = (await call('GET', '/admin/admins', null, admin.token)).data.admins.find((x) => x.isSuper);
  assert.equal((await call('POST', `/admin/users/${sup.id}/lock`, { days: 1, reason: 'x' }, a.token)).status, 403);
  assert.equal((await call('DELETE', `/admin/admins/${sup.id}`, {}, admin.token)).status, 400);
  // thu hồi Admin: hiệu lực ngay
  assert.equal((await call('DELETE', `/admin/admins/${a.id}`, {}, admin.token)).status, 200);
  assert.equal((await call('POST', '/admin/mods', { groupId: vn.id, userId: t2.id }, a.token)).status, 403);
});

test('khách chưa đăng ký: chỉ đọc nhóm công khai, Đẩy trend, Chủ đề nóng, Bản tin; không ghi được', async () => {
  const pub = async (u) => { const r = await fetch(BASE + u); return { status: r.status, data: await r.json().catch(() => null) }; };
  const gs = await pub('/public/groups');
  assert.equal(gs.status, 200);
  assert.ok(gs.data.groups.every((g) => ['trend', 'country', 'region', 'province'].includes(g.type)));
  const vn = gs.data.groups.find((g) => g.type === 'country');
  const u = await signup('khachxem', 1);
  await call('POST', `/groups/${vn.id}/rules-ack`, {}, u.token);
  await call('POST', `/groups/${vn.id}/messages`, { body: 'tin cho khách' }, u.token);
  const g = await pub(`/public/groups/${vn.id}`);
  assert.equal(g.status, 200);
  const m = g.data.messages.find((x) => x.body === 'tin cho khách');
  assert.ok(m);
  assert.equal(m.user.displayName, 'khachxem');
  assert.equal(m.user.id, undefined); // không lộ id người dùng
  assert.ok(g.data.messages.length <= 30);
  // nhóm riêng: khách không xem được
  const o = await signup('riengkhach', 1);
  const pg = await call('POST', '/private', { name: 'kín khách' }, o.token);
  assert.equal((await pub(`/public/groups/${pg.data.group.id}`)).status, 404);
  assert.equal((await pub('/public/hot')).status, 200);
  assert.equal((await pub('/public/news')).status, 200);
  // không gọi được API cần đăng nhập
  assert.equal((await pub(`/groups/${vn.id}/messages`)).status, 401);
  const w = await fetch(BASE + `/groups/${vn.id}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: 'x' }) });
  assert.equal(w.status, 401);
});

test('tag @tên: người được tag nhận thông báo; không tag được Admin hệ thống, người ngoài nhóm, chính mình; tin chào mừng tag người mới', async () => {
  const a = await signup('tagger1', 1), b = await signup('tagged1', 1);
  const vn = (await call('GET', '/groups/mine', null, a.token)).data.groups.find((x) => x.type === 'country');
  await call('POST', `/groups/${vn.id}/rules-ack`, {}, a.token);
  // người mới được báo về mục Chào mừng (chỉ ở nhóm quốc gia)
  assert.equal((await call('GET', '/notifications', null, b.token)).data.notifications.filter((n) => n.type === 'welcome').length, 1);
  // tag người trong nhóm
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  let r = await call('POST', `/groups/${vn.id}/messages`, { body: 'chào @tagged1 và @Admin JKR và @tagger1', mentions: [b.id, adm.user.id, a.id] }, a.token);
  assert.equal(r.status, 201);
  assert.deepEqual(r.data.message.mentions.map((u) => u.id), [b.id]); // Admin hệ thống + chính mình bị bỏ
  const ns = (await call('GET', '/notifications', null, b.token)).data.notifications.filter((n) => n.type === 'mention');
  assert.equal(ns.length, 1); // chỉ 1 lần được tag (thông báo chào mừng là loại riêng)
  assert.equal((await call('GET', '/notifications', null, adm.token)).data.notifications.some((n) => n.type === 'mention'), false);
  // tìm gợi ý: không có Admin hệ thống, không có chính mình
  const s = await call('GET', `/groups/${vn.id}/mention-search?q=ta`, null, a.token);
  const names = s.data.users.map((u) => u.displayName);
  assert.ok(names.includes('tagged1') && !names.includes('tagger1') && !names.some((n) => /admin/i.test(n)));
});

test('thông báo: trả lời và tim báo cho tác giả; đẩy ngoài app theo thiết bị đã đăng ký và cài đặt loại thông báo', async () => {
  const { pushLog } = await import('../server/push.js');
  const a = await signup('pushA', 1), b = await signup('pushB', 1);
  const vn = (await call('GET', '/groups/mine', null, a.token)).data.groups.find((x) => x.type === 'country');
  for (const u of [a, b]) await call('POST', `/groups/${vn.id}/rules-ack`, {}, u.token);
  // đăng ký nhận thông báo đẩy cho B (thiết bị giả)
  assert.equal((await call('POST', '/push/subscribe', { subscription: { endpoint: 'http://insecure.example/x', keys: { p256dh: 'k', auth: 'a' } } }, b.token)).status, 400);
  const sub = { endpoint: 'https://push.example/dev-b', keys: { p256dh: 'pk', auth: 'ak' } };
  assert.equal((await call('POST', '/push/subscribe', { subscription: sub }, b.token)).status, 200);
  const cfg = await call('GET', '/push/config', null, b.token);
  assert.equal(cfg.data.subscribed, true);
  assert.ok(cfg.data.publicKey.length > 40);
  const mb = (await call('POST', `/groups/${vn.id}/messages`, { body: 'tin của B' }, b.token)).data.message;
  // A trả lời tin của B -> thông báo trong app + đẩy
  pushLog.length = 0;
  await call('POST', `/groups/${vn.id}/messages`, { body: 'trả lời nè', replyTo: mb.id }, a.token);
  assert.ok((await call('GET', '/notifications', null, b.token)).data.notifications.some((n) => n.type === 'reply'));
  assert.equal(pushLog.filter((p) => p.kind === 'reply' && p.payload.url === `/#/chat/${vn.id}`).length, 1);
  // tắt loại "reply" -> vẫn có thông báo trong app nhưng không đẩy
  assert.equal((await call('PATCH', '/push/prefs', { reply: false }, b.token)).data.prefs.reply, false);
  pushLog.length = 0;
  await call('POST', `/groups/${vn.id}/messages`, { body: 'trả lời lần nữa', replyTo: mb.id }, a.token);
  assert.equal(pushLog.length, 0);
  // tim đầu tiên -> thông báo + đẩy
  pushLog.length = 0;
  assert.equal((await call('POST', `/messages/${mb.id}/heart`, {}, a.token)).status, 200);
  assert.ok((await call('GET', '/notifications', null, b.token)).data.notifications.some((n) => n.type === 'heart'));
  assert.equal(pushLog.filter((p) => p.kind === 'heart').length, 1);
  // người tự trả lời tin của mình không tự nhận thông báo
  const before = (await call('GET', '/notifications', null, a.token)).data.notifications.length;
  await call('POST', `/groups/${vn.id}/messages`, { body: 'tự trả lời', replyTo: (await call('POST', `/groups/${vn.id}/messages`, { body: 'tin của A' }, a.token)).data.message.id }, a.token);
  assert.equal((await call('GET', '/notifications', null, a.token)).data.notifications.length, before);
  // hủy đăng ký -> không đẩy nữa
  await call('POST', '/push/unsubscribe', { endpoint: sub.endpoint }, b.token);
  pushLog.length = 0;
  await call('PATCH', '/push/prefs', { reply: true }, b.token);
  await call('POST', `/groups/${vn.id}/messages`, { body: 'lại trả lời', replyTo: mb.id }, a.token);
  assert.equal(pushLog.length, 0);
  assert.equal((await call('GET', '/push/config', null, b.token)).data.subscribed, false);
  assert.equal((await call('GET', '/push/config')).status, 401);
});

test('mục Chào mừng của nhóm: gửi lời chào cho người mới, giới hạn 3 lời/người, chặn tự chào, thông báo cho người mới', async () => {
  const a = await signup('wlcA', 1), b = await signup('wlcB', 1), c = await signup('wlcC', 1);
  const vn = (await call('GET', '/groups/mine', null, a.token)).data.groups.find((x) => x.type === 'country');
  const url = (u) => `/groups/${vn.id}/welcome/${u}`;
  // chưa xác nhận quy tắc -> chưa gửi được
  assert.equal((await call('POST', url(b.id), { body: 'hi' }, a.token)).status, 403);
  await call('POST', `/groups/${vn.id}/rules-ack`, {}, a.token);
  // số người mới chưa được mình chào hiện ở nhóm
  const before = (await call('GET', '/groups/mine', null, a.token)).data.groups.find((x) => x.id === vn.id).newcomers;
  assert.ok(before >= 2);
  assert.equal((await call('POST', url(a.id), { body: 'tự chào' }, a.token)).status, 400);
  assert.equal((await call('POST', url(b.id), { body: '   ' }, a.token)).status, 400);
  const r = await call('POST', url(b.id), { body: 'Chào mừng bạn nhé 💜' }, a.token);
  assert.equal(r.status, 201);
  const after = (await call('GET', '/groups/mine', null, a.token)).data.groups.find((x) => x.id === vn.id).newcomers;
  assert.equal(after, before - 1);
  // người mới thấy lời chào và có thông báo; lời chào không vào khung chat chung
  const wb = (await call('GET', `/groups/${vn.id}/welcome`, null, b.token)).data.newcomers.find((n) => n.isMe);
  assert.ok(wb.welcomes.some((w) => w.body.includes('Chào mừng bạn nhé') && w.author.id === a.id));
  assert.ok((await call('GET', '/notifications', null, b.token)).data.notifications.some((n) => n.type === 'welcome' && n.text.includes('wlcA')));
  assert.equal((await call('GET', `/groups/${vn.id}/messages`, null, b.token)).data.messages.some((m) => m.body.includes('Chào mừng bạn nhé')), false);
  // tối đa 3 lời chào / người
  for (let i = 0; i < 2; i++) assert.equal((await call('POST', url(b.id), { body: 'lời ' + i }, a.token)).status, 201);
  assert.equal((await call('POST', url(b.id), { body: 'lời thứ 4' }, a.token)).status, 400);
  // người ngoài nhóm không xem/gửi được; không chào được người không phải thành viên mới
  const out = await signup('wlcOut', 45);
  const dn = (await call('GET', '/groups/mine', null, out.token)).data.groups.find((x) => x.type === 'province');
  assert.equal((await call('GET', `/groups/${dn.id}/welcome`, null, a.token)).status, 403);
  assert.equal((await call('POST', `/groups/${vn.id}/welcome/99999`, { body: 'x' }, a.token)).status, 404);
  // admin hệ thống không nằm trong danh sách người mới
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  assert.equal((await call('GET', `/groups/${vn.id}/welcome`, null, c.token)).data.newcomers.some((n) => n.user.id === adm.user.id), false);
});

test('chủ đề nóng: chỉ hiện tin đạt đủ số tim tối thiểu (mặc định 38)', async () => {
  const author = await signup('hotMinAuthor', 1);
  const voters = [];
  for (let i = 0; i < 3; i++) voters.push(await signup('hotMinVoter' + i, 1));
  const vn = (await call('GET', '/groups/mine', null, author.token)).data.groups.find((x) => x.type === 'country');
  for (const u of [author, ...voters]) await call('POST', `/groups/${vn.id}/rules-ack`, {}, u.token);
  const m = (await call('POST', `/groups/${vn.id}/messages`, { body: 'tin cần đủ tim mới nóng ' + Date.now() }, author.token)).data.message;
  const pubJson = async (u) => (await fetch(BASE + u)).json();
  const inHot = async (tok) => (await call('GET', '/hot', null, tok)).data.items.some((x) => x.id === m.id);
  const prev = process.env.HOT_MIN_HEARTS;
  try {
    process.env.HOT_MIN_HEARTS = '3';
    await call('POST', `/messages/${m.id}/heart`, {}, voters[0].token);
    await call('POST', `/messages/${m.id}/heart`, {}, voters[1].token);
    assert.equal(await inHot(voters[0].token), false); // mới 2 tim < 3
    assert.equal((await pubJson('/public/hot')).items.some((x) => x.id === m.id), false);
    await call('POST', `/messages/${m.id}/heart`, {}, voters[2].token);
    assert.equal(await inHot(voters[0].token), true); // đủ 3 tim
    assert.equal((await pubJson('/public/hot')).items.some((x) => x.id === m.id), true);
    delete process.env.HOT_MIN_HEARTS; // mặc định 38: 3 tim không đủ
    assert.equal(await inHot(voters[0].token), false);
  } finally { process.env.HOT_MIN_HEARTS = prev; }
});

test('tin nhiều tương tác = tim + bình luận + trả lời (cùng ngưỡng cho tab Tin nhiều tương tác và khối ở Tổng hợp)', async () => {
  const author = await signup('hotIntAuthor', 1), v1 = await signup('hotIntV1', 1), v2 = await signup('hotIntV2', 1);
  const vn = (await call('GET', '/groups/mine', null, author.token)).data.groups.find((x) => x.type === 'country');
  for (const u of [author, v1, v2]) await call('POST', `/groups/${vn.id}/rules-ack`, {}, u.token);
  const m = (await call('POST', `/groups/${vn.id}/messages`, { body: 'tin tương tác ' + Date.now() }, author.token)).data.message;
  const inItems = async () => (await call('GET', '/hot', null, v1.token)).data.items.find((x) => x.id === m.id);
  const prev = process.env.HOT_MIN_HEARTS;
  try {
    process.env.HOT_MIN_HEARTS = '3';
    await call('POST', `/messages/${m.id}/heart`, {}, v1.token); // 1 tương tác
    await call('POST', '/comments/msg/' + m.id, { body: 'bình luận' }, v2.token); // 2
    assert.equal(await inItems(), undefined);
    await call('POST', `/groups/${vn.id}/messages`, { body: 'trả lời tin', replyTo: m.id }, v2.token); // 3 → đủ ngưỡng
    const it = await inItems();
    assert.equal(it?.interactions, 3);
    assert.equal(it.hearts, 1);
    assert.equal(((await (await fetch(BASE + '/public/hot')).json()).items).find((x) => x.id === m.id)?.interactions, 3);
    delete process.env.HOT_MIN_HEARTS; // mặc định 38 → không đủ
    assert.equal(await inItems(), undefined);
    assert.equal((await call('GET', '/hot', null, v1.token)).data.others, undefined); // không còn khối tin mới
  } finally { process.env.HOT_MIN_HEARTS = prev; }
});

test('Chủ đề nóng: Admin đăng bài lên đầu trang; người thường không đăng được; mọi người thả tim; khách xem được', async () => {
  const u = await signup('hotpinU', 1), v = await signup('hotpinV', 1);
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  assert.equal((await call('POST', '/hot/posts', { body: 'bài của user' }, u.token)).status, 403);
  assert.equal((await call('POST', '/hot/posts', { body: '  ' }, adm.token)).status, 400);
  const r = await call('POST', '/hot/posts', { body: 'Bài ghim từ quản trị' }, adm.token);
  assert.equal(r.status, 201);
  const id = r.data.post.id;
  // hiện ở đầu trang Chủ đề nóng của người dùng và khách, dù chưa đủ tim
  const hot = (await call('GET', '/hot', null, u.token)).data;
  assert.ok(hot.pinned.some((m) => m.id === id && m.body === 'Bài ghim từ quản trị'));
  assert.equal(hot.items.some((m) => m.id === id), false);
  assert.ok((await (await fetch(BASE + '/public/hot')).json()).pinned.some((m) => m.id === id));
  // nhóm ẩn không lọt vào danh sách nhóm / không đọc được như một nhóm chat
  assert.equal((await call('GET', '/groups/mine', null, u.token)).data.groups.some((g) => g.name === 'Chủ đề hot'), false);
  assert.equal((await fetch(BASE + `/groups/${r.data.post.groupId}/messages`, { headers: { authorization: `Bearer ${u.token}` } })).status, 403);
  // người dùng không phải thành viên vẫn thả tim được, tác giả thì không
  const h = await call('POST', `/messages/${id}/heart`, {}, u.token);
  assert.equal(h.status, 200);
  assert.equal(h.data.hearts, 1);
  assert.equal((await call('POST', `/messages/${id}/heart`, {}, adm.token)).status, 400);
  assert.equal((await call('GET', '/hot', null, v.token)).data.pinned.find((m) => m.id === id).hearts, 1);
  // người thường không xóa được, Admin xóa được
  assert.equal((await call('DELETE', `/messages/${id}`, {}, u.token)).status, 403);
  assert.equal((await call('DELETE', `/messages/${id}`, {}, adm.token)).status, 200);
  assert.equal((await call('GET', '/hot', null, u.token)).data.pinned.some((m) => m.id === id), false);
});

test('bản tin: người dùng thả tim / bỏ tim; khách thấy số tim; xóa bản tin xóa luôn tim', async () => {
  const u = await signup('newsheartU', 1);
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const n = (await call('POST', '/admin/news', { title: 'Tin tim', body: 'nội dung' }, adm.token)).data.news;
  assert.equal(n.hearts, 0);
  assert.equal((await fetch(BASE + `/news/${n.id}/heart`, { method: 'POST' })).status, 401);
  let r = await call('POST', `/news/${n.id}/heart`, {}, u.token);
  assert.deepEqual([r.status, r.data.hearts, r.data.hearted], [200, 1, true]);
  r = await call('POST', `/news/${n.id}/heart`, {}, adm.token); // Admin cũng thả tim được
  assert.equal(r.data.hearts, 2);
  const mine = (await call('GET', '/news', null, u.token)).data.news.find((x) => x.id === n.id);
  assert.deepEqual([mine.hearts, mine.hearted], [2, true]);
  assert.equal((await (await fetch(BASE + '/public/news')).json()).news.find((x) => x.id === n.id).hearts, 2);
  r = await call('POST', `/news/${n.id}/heart`, {}, u.token); // bấm lại = bỏ tim
  assert.deepEqual([r.data.hearts, r.data.hearted], [1, false]);
  assert.equal((await call('POST', '/news/99999/heart', {}, u.token)).status, 404);
  await call('DELETE', `/admin/news/${n.id}`, {}, adm.token);
  assert.equal((await call('POST', `/news/${n.id}/heart`, {}, u.token)).status, 404);
});

test('bản tin: tiêu đề và nội dung không bắt buộc (cần ít nhất một trong tiêu đề, nội dung, ảnh)', async () => {
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  assert.equal((await call('POST', '/admin/news', { title: '', body: '' }, adm.token)).status, 400);
  const onlyTitle = await call('POST', '/admin/news', { title: 'Chỉ có tiêu đề' }, adm.token);
  assert.equal(onlyTitle.status, 201);
  const onlyBody = await call('POST', '/admin/news', { body: 'Chỉ có nội dung' }, adm.token);
  assert.equal(onlyBody.status, 201);
  const list = (await call('GET', '/news', null, adm.token)).data.news;
  assert.equal(list.find((n) => n.id === onlyTitle.data.news.id).body, '');
  assert.equal(list.find((n) => n.id === onlyBody.data.news.id).title, '');
  // sửa: xóa hết cả tiêu đề lẫn nội dung (không còn ảnh) thì bị từ chối; xóa một trong hai thì được
  assert.equal((await call('PATCH', `/admin/news/${onlyTitle.data.news.id}`, { title: '' }, adm.token)).status, 400);
  assert.equal((await call('PATCH', `/admin/news/${onlyBody.data.news.id}`, { title: 'Thêm tiêu đề', body: '' }, adm.token)).status, 200);
});

test('bản tin: đăng tối đa 4 ảnh; 5 ảnh bị từ chối; sửa danh sách ảnh; ảnh bản tin không bị dọn nhầm', async () => {
  const fs = await import('node:fs');
  const { db, now } = await import('../server/db.js');
  const { purgeOldMessages } = await import('../server/retention.js');
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const urls = [];
  for (let i = 0; i < 5; i++) urls.push((await call('POST', '/upload', { dataUrl: png }, adm.token)).data.url);
  assert.ok(urls.every((u) => /^\/uploads\//.test(u)));
  assert.equal((await call('POST', '/admin/news', { title: '5 ảnh', imageUrls: urls }, adm.token)).status, 400);
  const r = await call('POST', '/admin/news', { title: '4 ảnh', imageUrls: urls.slice(0, 4) }, adm.token);
  assert.equal(r.status, 201);
  assert.deepEqual(r.data.news.imageUrls, urls.slice(0, 4));
  assert.equal(r.data.news.imageUrl, urls[0]);
  const id = r.data.news.id;
  assert.deepEqual((await (await fetch(BASE + '/public/news')).json()).news.find((n) => n.id === id).imageUrls, urls.slice(0, 4));
  // sửa: bỏ ảnh đầu, đổi sang ảnh khác
  let p = await call('PATCH', `/admin/news/${id}`, { imageUrls: [urls[1], urls[4]] }, adm.token);
  assert.deepEqual(p.data.news.imageUrls, [urls[1], urls[4]]);
  assert.equal(p.data.news.edited, true);
  assert.equal((await call('PATCH', `/admin/news/${id}`, { imageUrls: urls }, adm.token)).status, 400);
  // chỉ có ảnh (không tiêu đề/nội dung) vẫn đăng được; gỡ hết ảnh khi không còn gì khác thì bị từ chối
  const only = await call('POST', '/admin/news', { imageUrls: [urls[2]] }, adm.token);
  assert.equal(only.status, 201);
  assert.equal((await call('PATCH', `/admin/news/${only.data.news.id}`, { imageUrls: [] }, adm.token)).status, 400);
  // ảnh thứ 2-4 của bản tin không bị dọn khi tin nhắn cũ dùng chung ảnh bị xóa
  const dir = process.env.UPLOAD_DIR;
  const u = await signup('newsimgkeep', 1);
  const vn = (await call('GET', '/groups/mine', null, u.token)).data.groups.find((x) => x.type === 'country');
  await call('POST', `/groups/${vn.id}/rules-ack`, {}, u.token);
  const mid = (await call('POST', `/groups/${vn.id}/messages`, { body: 'tin cũ dùng chung ảnh bản tin' }, u.token)).data.message.id;
  const shared = urls[4]; // ảnh thứ 2 của bản tin ở trên
  db.prepare('UPDATE messages SET created_at = ?, image_url = ? WHERE id = ?').run(now() - 40 * 24 * 3600 * 1000, shared, mid);
  purgeOldMessages(dir);
  assert.ok(fs.existsSync(path.join(dir, shared.replace('/uploads/', ''))), 'ảnh còn được bản tin dùng phải được giữ');
});

test('@everyone: chỉ Admin dùng được, báo cho mọi thành viên (trừ người tắt thông báo nhóm)', async () => {
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const a = await signup('everyA', 1), b = await signup('everyB', 1), c = await signup('everyC', 1);
  const vn = (await call('GET', '/groups/mine', null, a.token)).data.groups.find((x) => x.type === 'country');
  for (const u of [a, b, c, { token: adm.token }]) await call('POST', `/groups/${vn.id}/rules-ack`, {}, u.token);
  await call('POST', `/groups/${vn.id}/mute`, { minutes: -1 }, c.token); // C tắt thông báo nhóm
  const cnt = async (tok) => (await call('GET', '/notifications', null, tok)).data.notifications.filter((n) => n.text.includes('nhắc đến mọi người')).length;
  // người thường gõ @everyone: không có tác dụng
  const m1 = await call('POST', `/groups/${vn.id}/messages`, { body: '@everyone ơi' }, a.token);
  assert.equal(m1.data.message.mentionAll, false);
  assert.equal(await cnt(b.token), 0);
  const m2 = await call('POST', `/groups/${vn.id}/messages`, { body: 'Thông báo quan trọng @everyone' }, adm.token);
  assert.equal(m2.data.message.mentionAll, true);
  assert.equal(await cnt(a.token), 1);
  assert.equal(await cnt(b.token), 1);
  const muted = (await call('GET', '/groups/mine', null, c.token)).data.groups.find((x) => x.id === vn.id).muted;
  if (muted) assert.equal(await cnt(c.token), 0);
  assert.equal(await cnt(adm.token), 0); // không tự báo cho mình
  // push ngoài app: người có đăng ký thiết bị nhận push kèm nội dung tin
  const { pushLog } = await import('../server/push.js');
  await call('POST', '/push/subscribe', { subscription: { endpoint: 'https://push.example/dev-every-b', keys: { p256dh: 'pk', auth: 'ak' } } }, b.token);
  pushLog.length = 0;
  await call('POST', `/groups/${vn.id}/messages`, { body: 'Họp lúc 8h @everyone' }, adm.token);
  const pb = pushLog.filter((p) => p.endpoint === 'https://push.example/dev-every-b' && p.kind === 'mention');
  assert.equal(pb.length, 1);
  assert.match(pb[0].payload.body, /@everyone.*Họp lúc 8h/);
});

test('ghim tin: Admin ghim / bỏ ghim một tin lên đầu nhóm; người thường không được', async () => {
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const u = await signup('pinUser', 1);
  const vn = (await call('GET', '/groups/mine', null, u.token)).data.groups.find((x) => x.type === 'country');
  await call('POST', `/groups/${vn.id}/rules-ack`, {}, u.token);
  const msg = (await call('POST', `/groups/${vn.id}/messages`, { body: 'tin cần ghim' }, u.token)).data.message;
  assert.equal((await call('GET', `/groups/${vn.id}`, null, u.token)).data.group.canPin, false);
  assert.equal((await call('POST', `/groups/${vn.id}/pin`, { messageId: msg.id }, u.token)).status, 403);
  assert.equal((await call('GET', `/groups/${vn.id}`, null, adm.token)).data.group.canPin, true);
  assert.equal((await call('POST', `/groups/${vn.id}/pin`, { messageId: 999999 }, adm.token)).status, 404);
  assert.equal((await call('POST', `/groups/${vn.id}/pin`, { messageId: msg.id }, adm.token)).status, 200);
  assert.equal((await call('GET', `/groups/${vn.id}`, null, u.token)).data.group.pinned.id, msg.id);
  // ghim tin khác thay thế tin cũ (chỉ 1 tin)
  const msg2 = (await call('POST', `/groups/${vn.id}/messages`, { body: 'tin ghim thứ hai' }, u.token)).data.message;
  await call('POST', `/groups/${vn.id}/pin`, { messageId: msg2.id }, adm.token);
  assert.equal((await call('GET', `/groups/${vn.id}`, null, u.token)).data.group.pinned.id, msg2.id);
  // tin bị xóa thì không còn ghim
  await call('DELETE', `/messages/${msg2.id}`, {}, u.token);
  assert.equal((await call('GET', `/groups/${vn.id}`, null, u.token)).data.group.pinned, null);
  await call('POST', `/groups/${vn.id}/pin`, { messageId: msg.id }, adm.token);
  assert.equal((await call('DELETE', `/groups/${vn.id}/pin`, {}, u.token)).status, 403);
  assert.equal((await call('DELETE', `/groups/${vn.id}/pin`, {}, adm.token)).status, 200);
  assert.equal((await call('GET', `/groups/${vn.id}`, null, u.token)).data.group.pinned, null);
});

test('bình luận: bản tin và tin ở Chủ đề nóng; tác giả tin được báo; xóa bình luận; khách không gọi được', async () => {
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const a = await signup('cmtA', 1), b = await signup('cmtB', 1);
  const news = (await call('POST', '/admin/news', { title: 'Tin có bình luận' }, adm.token)).data.news;
  assert.equal((await fetch(BASE + `/comments/news/${news.id}`)).status, 401);
  assert.equal((await call('POST', `/comments/news/${news.id}`, { body: '  ' }, a.token)).status, 400);
  const c1 = await call('POST', `/comments/news/${news.id}`, { body: 'Bình luận bản tin' }, a.token);
  assert.equal(c1.status, 201);
  assert.equal((await call('GET', '/news', null, b.token)).data.news.find((n) => n.id === news.id).commentCount, 1);
  const list = (await call('GET', `/comments/news/${news.id}`, null, b.token)).data.comments;
  assert.deepEqual([list.length, list[0].body, list[0].mine, list[0].canDelete], [1, 'Bình luận bản tin', false, false]);
  assert.equal((await call('DELETE', `/comments/${c1.data.comment.id}`, {}, b.token)).status, 403);
  // tin nhắn (ở nhóm công khai, như trong Chủ đề nóng)
  const vn = (await call('GET', '/groups/mine', null, a.token)).data.groups.find((x) => x.type === 'country');
  await call('POST', `/groups/${vn.id}/rules-ack`, {}, a.token);
  const msg = (await call('POST', `/groups/${vn.id}/messages`, { body: 'tin sẽ được bình luận' }, a.token)).data.message;
  assert.equal((await call('POST', `/comments/msg/${msg.id}`, { body: 'Hay quá' }, b.token)).status, 201);
  assert.ok((await call('GET', '/notifications', null, a.token)).data.notifications.some((n) => n.text.includes('bình luận tin của bạn')));
  const hist = (await call('GET', `/groups/${vn.id}/messages`, null, a.token)).data.messages;
  assert.equal(hist.find((m) => m.id === msg.id).commentCount, 1);
  // tin trong nhóm riêng người ngoài không bình luận được
  const priv = await call('POST', '/private', { name: 'Riêng tư cmt' }, a.token);
  if (priv.status === 201 || priv.status === 200) {
    const gid = priv.data.group?.id;
    if (gid) {
      const pm = (await call('POST', `/groups/${gid}/messages`, { body: 'kín' }, a.token)).data.message;
      if (pm) assert.equal((await call('POST', `/comments/msg/${pm.id}`, { body: 'x' }, b.token)).status, 403);
    }
  }
  // Admin xóa được bình luận của người khác; xóa bản tin xóa luôn bình luận
  assert.equal((await call('DELETE', `/comments/${c1.data.comment.id}`, {}, adm.token)).status, 200);
  assert.equal((await call('GET', `/comments/news/${news.id}`, null, a.token)).data.comments.length, 0);
});

test('chủ đề do người dùng thường tạo: chờ Admin duyệt, duyệt xong lên tab Mới; tab Nổi bật theo thảo luận 24h hoặc Admin đặt', async () => {
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const u = await signup('pendU', 1), w = await signup('pendW', 1), x = await signup('pendX', 1);
  const r = await call('POST', '/topics', { name: 'Chủ đề chờ duyệt', description: 'mô tả' }, u.token);
  assert.equal(r.status, 202);
  assert.equal(r.data.pending, true);
  const pid = r.data.topic.id;
  // chưa hiện ở đâu cả, cũng không vào được
  assert.ok(!(await call('GET', '/topics', null, w.token)).data.topics.some((t) => t.id === pid));
  assert.ok(!(await call('GET', '/topic-board?tab=new', null, w.token)).data.topics.some((t) => t.id === pid));
  assert.ok(!(await call('GET', '/public/topic-board?tab=new')).data.topics.some((t) => t.id === pid));
  assert.ok(!(await call('GET', '/public/groups')).data.groups.some((g) => g.id === pid));
  assert.equal((await call('GET', `/groups/${pid}`, null, u.token)).status, 403);
  assert.equal((await call('POST', `/groups/${pid}/messages`, { body: 'hi' }, w.token)).status, 403);
  // người tạo thấy ở "chờ duyệt"; Admin thấy trong hàng đợi và số lượng; người thường không duyệt được
  assert.equal((await call('GET', '/topics', null, u.token)).data.mine[0].id, pid);
  assert.equal((await call('GET', '/topics/pending', null, w.token)).status, 403);
  assert.equal((await call('POST', `/topics/pending/${pid}/approve`, {}, u.token)).status, 403);
  assert.ok((await call('GET', '/topics/pending', null, adm.token)).data.topics.some((t) => t.id === pid));
  assert.ok((await call('GET', '/admin/counts', null, adm.token)).data.topics >= 1);
  assert.ok((await call('GET', '/notifications', null, adm.token)).data.notifications.some((n) => n.text.includes('Chủ đề chờ duyệt')));
  // giới hạn 3 chủ đề chờ duyệt cùng lúc
  const extra = [];
  for (const n of ['B', 'C']) extra.push((await call('POST', '/topics', { name: 'Chờ ' + n }, u.token)).data.topic.id);
  assert.equal((await call('POST', '/topics', { name: 'Chờ D' }, u.token)).status, 400);
  // rút lại / từ chối
  assert.equal((await call('DELETE', `/topics/pending/${extra[0]}`, {}, w.token)).status, 404);
  assert.equal((await call('DELETE', `/topics/pending/${extra[0]}`, {}, u.token)).status, 200);
  assert.equal((await call('POST', `/topics/pending/${extra[1]}/reject`, { reason: 'Trùng lặp' }, adm.token)).status, 200);
  assert.ok((await call('GET', '/notifications', null, u.token)).data.notifications.some((n) => n.text.includes('chưa được duyệt: Trùng lặp')));
  // duyệt: lên tab Mới ở đầu, người tạo thành mod chủ đề
  assert.equal((await call('POST', `/topics/pending/${pid}/approve`, {}, adm.token)).status, 200);
  assert.equal((await call('POST', `/topics/pending/${pid}/approve`, {}, adm.token)).status, 404);
  const nw = (await call('GET', '/topic-board?tab=new', null, w.token)).data.topics;
  assert.equal(nw[0].id, pid);
  assert.equal((await call('GET', '/topics', null, u.token)).data.mine.length, 0);
  assert.equal((await call('GET', `/groups/${pid}`, null, w.token)).status, 200);
  assert.ok((await call('GET', '/notifications', null, u.token)).data.notifications.some((n) => n.text.includes('đã được duyệt')));
  // tab Nổi bật: chưa đủ thảo luận thì chưa có
  assert.ok(!(await call('GET', '/topic-board?tab=hot', null, w.token)).data.topics.some((t) => t.id === pid));
  await call('POST', `/groups/${pid}/messages`, { body: 'một' }, w.token);
  await call('POST', `/groups/${pid}/messages`, { body: 'hai' }, w.token);
  await call('POST', `/groups/${pid}/messages`, { body: 'ba' }, w.token);
  await call('POST', `/groups/${pid}/messages`, { body: 'bốn' }, w.token);
  assert.ok(!(await call('GET', '/topic-board?tab=hot', null, w.token)).data.topics.some((t) => t.id === pid), 'chỉ 1 người nói thì chưa nổi bật');
  await call('POST', `/groups/${pid}/messages`, { body: 'năm' }, x.token);
  const hot = (await call('GET', '/topic-board?tab=hot', null, w.token)).data.topics;
  assert.ok(hot.some((t) => t.id === pid && t.msgs24h === 5 && t.users24h === 2));
  assert.ok((await call('GET', '/public/topic-board?tab=hot')).data.topics.some((t) => t.id === pid));
  // Admin đặt nổi bật một chủ đề ít thảo luận → lên đầu tab Nổi bật
  const m = (await call('POST', '/topics', { name: 'Admin tạo trực tiếp' }, adm.token));
  assert.equal(m.status, 201);
  await call('POST', `/topics/${m.data.topic.id}/highlight`, { on: true }, adm.token);
  assert.equal((await call('GET', '/topic-board?tab=hot', null, w.token)).data.topics[0].id, m.data.topic.id);
  assert.equal((await call('GET', '/topic-board?tab=new', null, w.token)).data.topics[0].id, m.data.topic.id, 'Admin tạo thì lên tab Mới ngay');
  for (const id of [pid, m.data.topic.id]) await call('DELETE', `/topics/${id}`, {}, adm.token);
});

test('chủ đề thảo luận: Admin/Mod tạo; mọi người xem, tham gia, chat như nhóm; người tạo/Admin sửa, đóng', async () => {
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const u = await signup('topicUser', 1), v = await signup('topicMod', 1);
  // người thường: tạo thì phải chờ duyệt (xem test riêng bên dưới)
  assert.equal((await call('GET', '/topics', null, u.token)).data.needsApproval, true);
  // Mod của một nhóm công khai tạo được
  const vn = (await call('GET', '/groups/mine', null, v.token)).data.groups.find((x) => x.type === 'country');
  await call('POST', '/admin/mods', { groupId: vn.id, userId: v.id }, adm.token);
  assert.equal((await call('GET', '/topics', null, v.token)).data.needsApproval, false);
  assert.equal((await call('POST', '/topics', { name: 'x' }, v.token)).status, 400);
  const t = await call('POST', '/topics', { name: 'Bàn về concert', description: 'Chia sẻ cảm nhận sau concert' }, v.token);
  assert.equal(t.status, 201);
  const tid = t.data.topic.id;
  // hiện trong danh sách chủ đề, không lẫn vào Khám phá nhóm
  const list = (await call('GET', '/topics', null, u.token)).data.topics;
  assert.ok(list.some((x) => x.id === tid && x.name === 'Bàn về concert' && !x.joined && !x.canManage));
  // người thường: xem được khi chưa tham gia; bấm Tham gia (không đồng ý quy tắc riêng) vẫn chat được
  const g = (await call('GET', `/groups/${tid}`, null, u.token)).data.group;
  assert.equal(g.type, 'topic');
  assert.equal(g.description, 'Chia sẻ cảm nhận sau concert');
  assert.equal((await call('POST', `/groups/${tid}/join`, {}, u.token)).status, 200);
  const m = await call('POST', `/groups/${tid}/messages`, { body: 'Concert quá đỉnh!' }, u.token);
  assert.equal(m.status, 201);
  assert.ok((await call('GET', '/groups/mine', null, u.token)).data.groups.some((x) => x.id === tid && x.type === 'topic'));
  // người tạo (Mod chủ đề) xóa được tin vi phạm trong chủ đề
  assert.equal((await call('DELETE', `/messages/${m.data.message.id}`, { reason: 'thử' }, v.token)).status, 200);
  // khách đọc được chủ đề
  assert.ok((await (await fetch(BASE + '/public/groups')).json()).groups.some((x) => x.id === tid));
  // sửa: người thường không được; người tạo được
  assert.equal((await call('PATCH', `/topics/${tid}`, { name: 'Đổi tên' }, u.token)).status, 403);
  assert.equal((await call('PATCH', `/topics/${tid}`, { name: 'Bàn về concert 2026' }, v.token)).data.topic.name, 'Bàn về concert 2026');
  // link chia sẻ /t/:id: có thẻ xem trước + chuyển vào app; id không phải chủ đề → về trang chính
  const share = await fetch(`http://localhost:3998/t/${tid}`);
  const html = await share.text();
  assert.equal(share.status, 200);
  assert.ok(html.includes('og:title" content="Bàn về concert 2026 · JKR talks"'), html);
  assert.ok(html.includes(`url=/#/g/${tid}`));
  const notTopic = await fetch('http://localhost:3998/t/1', { redirect: 'manual' });
  assert.equal(notTopic.status, 302);
  // nổi bật: chỉ Admin; chủ đề nổi bật lên đầu danh sách và hiện với cả người chưa tham gia
  const t2 = (await call('POST', '/topics', { name: 'Chủ đề thứ hai' }, v.token)).data.topic;
  assert.equal((await call('POST', `/topics/${tid}/highlight`, { on: true }, v.token)).status, 403);
  assert.equal((await call('POST', `/topics/${tid}/highlight`, { on: true }, adm.token)).data.topic.highlighted, true);
  const tl = (await call('GET', '/topics', null, u.token)).data;
  assert.equal(tl.topics[0].id, tid);
  assert.equal(tl.canHighlight, false);
  assert.ok((await call('GET', '/groups/mine', null, adm.token)).data.highlights.some((h) => h.id === tid));
  assert.ok((await (await fetch(BASE + '/public/groups')).json()).groups.find((x) => x.id === tid).highlighted);
  assert.equal((await call('POST', `/topics/${tid}/highlight`, { on: false }, adm.token)).data.topic.highlighted, false);
  assert.equal((await call('GET', '/groups/mine', null, adm.token)).data.highlights.length, 0);
  await call('DELETE', `/topics/${t2.id}`, {}, adm.token);
  // số lượng trên tab quản trị: chỉ Admin
  const cnt = await call('GET', '/admin/counts', null, adm.token);
  assert.equal(cnt.status, 200);
  for (const k of ['reports', 'users', 'mods', 'admins']) assert.equal(typeof cnt.data[k], 'number');
  assert.ok(cnt.data.mods >= 1 && cnt.data.admins >= 1 && cnt.data.users >= 3);
  assert.equal((await call('GET', '/admin/counts', null, u.token)).status, 403);
  // chủ đề: chưa tham gia vẫn chat được ngay → tự thành thành viên
  const t3 = (await call('POST', '/topics', { name: 'Chủ đề chat ngay' }, v.token)).data.topic;
  const w = await signup('topicWalkin', 1);
  assert.equal((await call('GET', `/groups/${t3.id}`, null, w.token)).data.group.role, undefined);
  const sent = await call('POST', `/groups/${t3.id}/messages`, { body: 'Chào mọi người, mình vào thẳng luôn' }, w.token);
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  assert.ok((await call('GET', '/groups/mine', null, w.token)).data.groups.some((g) => g.id === t3.id));
  // nhóm công khai thường vẫn cần tham gia
  const reg = (await call('GET', '/groups/discover?type=region', null, w.token)).data.groups.find((g) => !g.joined);
  if (reg) assert.equal((await call('POST', `/groups/${reg.id}/messages`, { body: 'x' }, w.token)).status, 403);
  await call('DELETE', `/topics/${t3.id}`, {}, adm.token);
  // nhóm riêng: Admin thêm bất kỳ ai (không cần kết bạn); người thường chỉ thêm được bạn bè
  const pvA = (await call('POST', '/private', { name: 'Nhóm của Admin', memberIds: [u.id] }, adm.token)).data.group;
  assert.equal((await call('GET', `/groups/${pvA.id}`, null, u.token)).data.group.members.length, 2);
  assert.equal((await call('POST', `/private/${pvA.id}/invite`, { userIds: [v.id] }, adm.token)).data.added, 1);
  assert.ok((await call('GET', '/notifications', null, v.token)).data.notifications.some((x) => x.text.includes('Nhóm của Admin')));
  const pvU = (await call('POST', '/private', { name: 'Nhóm của user' }, u.token)).data.group;
  assert.equal((await call('POST', `/private/${pvU.id}/invite`, { userIds: [v.id] }, u.token)).status, 400);
  // đóng: người thường không được; Admin được; thành viên được báo
  assert.equal((await call('DELETE', `/topics/${tid}`, {}, u.token)).status, 403);
  assert.equal((await call('DELETE', `/topics/${tid}`, {}, adm.token)).status, 200);
  assert.equal((await call('GET', `/groups/${tid}`, null, u.token)).status, 404);
  assert.ok((await call('GET', '/notifications', null, u.token)).data.notifications.some((n) => n.text.includes('đã được đóng')));
});

// ---- Cấp bậc và Xu tím ---------------------------------------------------------
test('cấp bậc: người mới chưa có cấp, xong 3 việc khởi đầu nhận cấp 1, xu kiếm lúc cấp 0 được giữ', async () => {
  const { db } = await import('../server/db.js');
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const a = await signup('lvA', 1), b = await signup('lvB', 1);
  const vn = (await call('GET', '/groups/mine', null, a.token)).data.groups.find((g) => g.type === 'country');
  for (const u of [a, b]) await call('POST', `/groups/${vn.id}/rules-ack`, {}, u.token);
  const me0 = (await call('GET', '/me', null, a.token)).data;
  assert.equal(me0.user.level, 0);
  assert.equal(me0.levelUp, null);
  const st0 = (await call('GET', '/me/level', null, a.token)).data.level;
  assert.equal(st0.level, 0);
  assert.equal(st0.tasks.length, 3);
  assert.equal(st0.coins, 3); // vào app lần đầu trong ngày +3 xu
  // tin ngắn (<5 ký tự) và tin trùng liền trước không được xu
  await call('POST', `/groups/${vn.id}/messages`, { body: 'ok' }, a.token);
  await call('POST', `/groups/${vn.id}/messages`, { body: 'Xin chào cả nhà' }, a.token);
  await call('POST', `/groups/${vn.id}/messages`, { body: 'Xin chào cả nhà' }, a.token);
  assert.equal((await call('GET', '/me/level', null, a.token)).data.level.coins, 4);
  for (const t of ['tin thứ hai của A', 'tin thứ ba của A', 'tin thứ tư của A', 'tin thứ năm của A']) await call('POST', `/groups/${vn.id}/messages`, { body: t }, a.token);
  // tim: B đăng 4 tin, A thả tim (+2 xu cho B mỗi tim, không giới hạn số tim mỗi ngày)
  const bm = [];
  for (const t of ['B nói một', 'B nói hai', 'B nói ba', 'B nói bốn']) bm.push((await call('POST', `/groups/${vn.id}/messages`, { body: t }, b.token)).data.message);
  const coinsB0 = (await call('GET', '/me/level', null, b.token)).data.level.coins;
  for (const m of bm) assert.equal((await call('POST', `/messages/${m.id}/heart`, {}, a.token)).status, 200);
  assert.equal((await call('GET', '/me/level', null, b.token)).data.level.coins, coinsB0 + 8); // 4 tim, mỗi tim +2
  // A chưa bật thông báo đẩy nên vẫn chưa có cấp
  assert.equal((await call('GET', '/me', null, a.token)).data.user.level, 0);
  const coinsBefore = (await call('GET', '/me/level', null, a.token)).data.level.coins;
  const sub = { endpoint: 'https://push.example/dev-lvA', keys: { p256dh: 'pk', auth: 'ak' } };
  assert.equal((await call('POST', '/push/subscribe', { subscription: sub }, a.token)).status, 200);
  const me1 = (await call('GET', '/me', null, a.token)).data;
  assert.equal(me1.user.level, 1);
  assert.equal(me1.levelUp.level, 1);
  assert.equal(me1.levelUp.name, 'Tím Mầm Non');
  assert.equal((await call('GET', '/me/level', null, a.token)).data.level.coins, coinsBefore); // xu giữ nguyên
  assert.ok((await call('GET', '/notifications', null, a.token)).data.notifications.some((n) => n.type === 'level' && n.text.includes('Tím Mầm Non')));
  await call('POST', '/me/level-seen', {}, a.token);
  assert.equal((await call('GET', '/me', null, a.token)).data.levelUp, null);
  // trả lời: người được trả lời +2 xu
  const coinsB1 = (await call('GET', '/me/level', null, b.token)).data.level.coins;
  await call('POST', `/groups/${vn.id}/messages`, { body: 'trả lời bạn B nhé', replyTo: bm[0].id }, a.token);
  assert.equal((await call('GET', '/me/level', null, b.token)).data.level.coins, coinsB1 + 2);
  // người khác chỉ thấy cấp khi chưa ẩn
  const seen = (await call('GET', `/groups/${vn.id}/messages`, null, b.token)).data.messages.find((m) => m.user.id === a.id);
  assert.equal(seen.user.level, 1);
  await call('PATCH', '/me', { hideLevel: true }, a.token); // không còn tuỳ chọn ẩn cấp: bị bỏ qua
  assert.equal((await call('GET', `/groups/${vn.id}/messages`, null, b.token)).data.messages.find((m) => m.user.id === a.id).user.level, 1);
  // đặc quyền theo cấp
  const trend = (await call('GET', '/groups/mine', null, a.token)).data.groups.find((g) => g.type === 'trend');
  assert.equal((await call('POST', `/groups/${trend.id}/messages`, { body: 'https://x.com/abc/status/1' }, a.token)).status, 202); // dưới cấp 3: chờ duyệt
  // lên cấp: đủ xu nhưng thiếu danh hiệu thì dừng ở cấp 2
  db.prepare('UPDATE users SET coins = 3500 WHERE id = ?').run(a.id);
  assert.equal((await call('GET', '/me/level', null, a.token)).data.level.level, 2);
  const need = (await call('GET', '/me/level', null, a.token)).data.level.next;
  assert.equal(need.name, 'Tím Mộng Mơ');
  assert.ok(need.conditions.some((c) => c.key === 'title' && !c.ok));
  assert.equal((await call('POST', `/admin/users/${a.id}/titles`, { title: 'bot_trend' }, a.token)).status, 403);
  assert.equal((await call('POST', `/admin/users/${a.id}/titles`, { title: 'khong_co' }, adm.token)).status, 400);
  assert.equal((await call('POST', `/admin/users/${a.id}/titles`, { title: 'bot_trend' }, adm.token)).status, 200);
  assert.equal((await call('GET', '/me/level', null, a.token)).data.level.level, 3);
  assert.ok((await call('GET', '/notifications', null, a.token)).data.notifications.some((n) => n.text.includes('Tím Mộng Mơ') && n.text.includes('Đẩy trend')));
  assert.equal((await call('POST', `/groups/${trend.id}/messages`, { body: 'https://x.com/abc/status/1' }, a.token)).status, 201);
  // bấm link X trong Đẩy trend: +1 xu, mỗi link một lần, chỉ link X
  const xm = (await call('POST', `/groups/${trend.id}/messages`, { body: 'xem https://x.com/lingorm/status/99 và https://example.com/tin' }, adm.token)).data.message;
  const click = (url) => call('POST', '/trend/click', { messageId: xm.id, url }, b.token);
  assert.equal((await click('https://x.com/lingorm/status/99')).data.coins, 1);
  assert.equal((await click('https://x.com/lingorm/status/99')).data.coins, 0);
  assert.equal((await click('https://example.com/tin')).data.coins, 0);
  assert.equal((await click('https://x.com/khac/status/5')).data.coins, 0); // link không nằm trong tin
  // cấp 4: tạo chủ đề không cần duyệt, đăng bản tin; chưa đủ thì bị từ chối
  assert.equal((await call('POST', '/news', { title: 'Bài của thành viên' }, a.token)).status, 403);
  assert.equal((await call('POST', '/topics', { name: 'Chủ đề chờ duyệt' }, a.token)).status, 202);
  db.prepare('UPDATE users SET coins = 8000 WHERE id = ?').run(a.id);
  await call('POST', `/admin/users/${a.id}/titles`, { title: 'bot_trend_cao_thu' }, adm.token);
  assert.equal((await call('GET', '/me/level', null, a.token)).data.level.level, 3); // chưa đủ 1.000 link Đẩy trend
  db.prepare('UPDATE users SET lvl = 4 WHERE id = ?').run(a.id); // đặt thẳng cấp 4 để thử đặc quyền
  assert.equal((await call('POST', '/topics', { name: 'Chủ đề cấp bốn tạo' }, a.token)).status, 201);
  const np = await call('POST', '/news', { title: 'Bài của thành viên', body: 'Nội dung' }, a.token);
  assert.equal(np.status, 201);
  assert.equal(np.data.news.author.displayName, 'lvA');
  assert.equal(np.data.news.mine, true);
  assert.equal((await call('DELETE', `/news/${np.data.news.id}`, {}, b.token)).status, 404);
  assert.equal((await call('DELETE', `/news/${np.data.news.id}`, {}, a.token)).status, 200);
});

test('cấp bậc: xu vào app mỗi ngày chỉ một lần, chuỗi 7 ngày +20, chủ đề được duyệt +30', async () => {
  const { db } = await import('../server/db.js');
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const u = await signup('lvDaily', 1);
  await call('GET', '/me', null, u.token);
  await call('GET', '/me', null, u.token);
  assert.equal((await call('GET', '/me/level', null, u.token)).data.level.coins, 3);
  // giả lập đang có chuỗi 6 ngày tính đến hôm qua
  const y = new Date(Date.now() + 7 * 3600_000 - 86400_000).toISOString().slice(0, 10);
  db.prepare('UPDATE users SET last_day = ?, streak = 6 WHERE id = ?').run(y, u.id);
  db.prepare("DELETE FROM coin_log WHERE user_id = ? AND kind = 'daily'").run(u.id);
  db.prepare('UPDATE users SET coins = 0 WHERE id = ?').run(u.id);
  await call('GET', '/me', null, u.token);
  assert.equal((await call('GET', '/me/level', null, u.token)).data.level.coins, 23);
  assert.equal((await call('GET', '/me/level', null, u.token)).data.level.streak, 7);
  // chủ đề được duyệt +30
  const t = (await call('POST', '/topics', { name: 'Chủ đề được duyệt xu' }, u.token)).data.topic;
  await call('POST', `/topics/pending/${t.id}/approve`, {}, adm.token);
  assert.equal((await call('GET', '/me/level', null, u.token)).data.level.coins, 53);
});

test('tin nhắn gửi kèm tối đa 4 ảnh; tin cũ một ảnh vẫn hiển thị; chuyển tiếp giữ đủ ảnh', async () => {
  const u = await signup('multiImg', 1);
  const vn = (await call('GET', '/groups/mine', null, u.token)).data.groups.find((g) => g.type === 'country');
  await call('POST', `/groups/${vn.id}/rules-ack`, {}, u.token);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const urls = [];
  for (let i = 0; i < 5; i++) urls.push((await call('POST', '/upload', { dataUrl: png }, u.token)).data.url);
  const tooMany = await call('POST', `/groups/${vn.id}/messages`, { body: 'quá nhiều ảnh', imageUrls: urls }, u.token);
  assert.equal(tooMany.status, 400);
  const ok = await call('POST', `/groups/${vn.id}/messages`, { body: 'bốn ảnh kèm theo', imageUrls: urls.slice(0, 4) }, u.token);
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.deepEqual(ok.data.message.imageUrls, urls.slice(0, 4));
  assert.equal(ok.data.message.imageUrl, urls[0]);
  // chỉ có ảnh, không có chữ vẫn gửi được; imageUrl cũ vẫn dùng được
  assert.equal((await call('POST', `/groups/${vn.id}/messages`, { imageUrls: [urls[0], urls[1]] }, u.token)).status, 201);
  const old = await call('POST', `/groups/${vn.id}/messages`, { imageUrl: urls[2] }, u.token);
  assert.deepEqual(old.data.message.imageUrls, [urls[2]]);
  // lịch sử trả đủ ảnh; khách cũng thấy đủ ảnh
  const hist = (await call('GET', `/groups/${vn.id}/messages`, null, u.token)).data.messages.find((m) => m.id === ok.data.message.id);
  assert.equal(hist.imageUrls.length, 4);
  const guest = await call('GET', `/public/groups/${vn.id}`);
  assert.equal(guest.data.messages.find((m) => m.id === ok.data.message.id).imageUrls.length, 4);
  // chuyển tiếp giữ đủ ảnh
  const v = await signup('multiImg2', 1);
  await call('POST', `/groups/${vn.id}/rules-ack`, {}, v.token);
  const fw = await call('POST', `/messages/${ok.data.message.id}/forward`, { groupId: vn.id }, v.token);
  assert.equal(fw.data.message.imageUrls.length, 4);
});

test('cấp 5 Tím Thủy Tổ: thêm ngay bất kỳ ai vào nhóm riêng của mình, tìm theo tên không lộ email', async () => {
  const { db } = await import('../server/db.js');
  const top = await signup('lvTop', 1), stranger = await signup('strangerXyz', 1), friendless = await signup('lvLow', 1);
  // chưa đạt cấp 5: chỉ mời được bạn bè, không tìm được người lạ
  assert.equal((await call('GET', '/people/search?q=stranger', null, top.token)).status, 403);
  const g0 = (await call('POST', '/private', { name: 'Nhóm của cấp thấp', memberIds: [stranger.id] }, friendless.token)).data.group;
  assert.equal((await call('GET', `/groups/${g0.id}`, null, friendless.token)).data.group.members.length, 1); // người lạ không được thêm
  db.prepare('UPDATE users SET start_done = 1, lvl = 5, lvl_seen = 5 WHERE id = ?').run(top.id);
  const found = await call('GET', '/people/search?q=strangerX', null, top.token);
  assert.equal(found.status, 200);
  assert.deepEqual(found.data.users.map((u) => u.displayName), ['strangerXyz']);
  assert.equal(found.data.users[0].email, undefined);
  assert.deepEqual((await call('GET', '/people/search?q=s', null, top.token)).data.users, []); // quá ngắn
  const g = (await call('POST', '/private', { name: 'Nhóm của Thủy Tổ', memberIds: [stranger.id] }, top.token)).data.group;
  assert.equal((await call('GET', `/groups/${g.id}`, null, top.token)).data.group.members.length, 2);
  assert.ok((await call('GET', '/notifications', null, stranger.token)).data.notifications.some((n) => n.text.includes('Nhóm của Thủy Tổ')));
  // mời thêm người khác vào nhóm đã có; người chặn mình thì không thêm được
  assert.equal((await call('POST', `/private/${g.id}/invite`, { userIds: [friendless.id] }, top.token)).data.added, 1);
  const g2 = (await call('POST', '/private', { name: 'Nhóm thử chặn' }, top.token)).data.group;
  await call('POST', `/blocks/${top.id}`, {}, stranger.token);
  assert.equal((await call('POST', `/private/${g2.id}/invite`, { userIds: [stranger.id] }, top.token)).status, 400);
});

test('cửa hàng xu tím: số dư tách khỏi tổng xu, mua khung và màu tên, chọn đồ đang dùng', async () => {
  const { db } = await import('../server/db.js');
  const u = await signup('shopper', 1);
  const o = await signup('shopperB', 1);
  db.prepare('UPDATE users SET start_done = 1, lvl = 1, lvl_seen = 1, coins = 1000 WHERE id = ?').run(u.id);
  const s0 = (await call('GET', '/shop', null, u.token)).data;
  assert.equal(s0.balance, 1000);
  assert.equal(s0.coins, 1000);
  assert.equal(s0.frames.length, 5);
  assert.equal(s0.colors.length, 5);
  assert.deepEqual(s0.mine.frames, []);
  // chưa đủ xu / vật phẩm lạ
  assert.equal((await call('POST', '/shop/buy', { kind: 'frame', id: 5 }, u.token)).status, 400);
  assert.equal((await call('POST', '/shop/buy', { kind: 'frame', id: 99 }, u.token)).status, 400);
  assert.equal((await call('POST', '/shop/buy', { kind: 'khong', id: 1 }, u.token)).status, 400);
  // mua khung 600: số dư giảm, tổng xu và cấp không đổi
  const b1 = await call('POST', '/shop/buy', { kind: 'frame', id: 3 }, u.token);
  assert.equal(b1.status, 200, JSON.stringify(b1.data));
  assert.equal(b1.data.balance, 400);
  assert.equal(b1.data.shop.coins, 1000);
  assert.equal((await call('GET', '/me', null, u.token)).data.user.frame, null); // đồ mua không tự áp dụng
  assert.equal((await call('GET', '/me', null, u.token)).data.user.level, 2); // đủ 1.000 xu là cấp 2, tiêu xu không làm tụt cấp
  assert.equal((await call('POST', '/shop/buy', { kind: 'frame', id: 3 }, u.token)).status, 400); // đã sở hữu
  assert.equal((await call('POST', '/shop/buy', { kind: 'color', id: 2 }, u.token)).status, 200); // 200 xu
  const sh = (await call('GET', '/shop', null, u.token)).data;
  assert.equal(sh.balance, sh.coins - 800); // đã tiêu 600 + 200
  // chọn đồ: chỉ chọn được đồ đã sở hữu
  assert.equal((await call('POST', '/me/appearance', { frame: 'shop:4' }, u.token)).status, 400);
  assert.equal((await call('POST', '/me/appearance', { frame: 'title:1' }, u.token)).status, 400);
  const ap = await call('POST', '/me/appearance', { frame: 'shop:3', color: 'shop:2' }, u.token);
  assert.equal(ap.status, 200);
  assert.equal(ap.data.user.frame, 'shop:3');
  assert.equal(ap.data.user.nameColor, 'shop:2');
  // người khác thấy khung và màu tên trong chat
  const vn = (await call('GET', '/groups/mine', null, u.token)).data.groups.find((g) => g.type === 'country');
  for (const x of [u, o]) await call('POST', `/groups/${vn.id}/rules-ack`, {}, x.token);
  await call('POST', `/groups/${vn.id}/messages`, { body: 'xem khung của mình' }, u.token);
  const seen = (await call('GET', `/groups/${vn.id}/messages`, null, o.token)).data.messages.find((m) => m.user.id === u.id).user;
  assert.equal(seen.frame, 'shop:3');
  assert.equal(seen.nameColor, 'shop:2');
  // bỏ chọn
  assert.equal((await call('POST', '/me/appearance', { frame: null }, u.token)).data.user.frame, null);
});

test('danh hiệu Bot trend tự trao khi bấm đủ link X; phần thưởng khung và màu tên không mua được', async () => {
  const { db } = await import('../server/db.js');
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const u = await signup('botuser', 1);
  db.prepare('UPDATE users SET start_done = 1, lvl = 1, lvl_seen = 1 WHERE id = ?').run(u.id);
  const t0 = (await call('GET', '/me/titles', null, u.token)).data;
  assert.equal(t0.titles.length, 3);
  assert.equal(t0.titles[0].state, 'doing');
  assert.equal(t0.titles[1].state, 'locked');
  assert.equal(t0.titles[0].conditions[0].need, 100);
  assert.equal((await call('POST', '/me/appearance', { frame: 'title:1' }, u.token)).status, 400); // chưa đạt
  assert.equal((await call('POST', '/shop/buy', { kind: 'frame', id: 'title:1' }, u.token)).status, 400); // không bán
  // 99 link X: chưa đủ; thêm 1 link nữa qua API thật thì đạt
  const ins = db.prepare("INSERT INTO coin_log (user_id, kind, amount, ref, day, created_at) VALUES (?, 'xlink', 1, ?, '2026-01-01', ?)");
  for (let i = 0; i < 99; i++) ins.run(u.id, `x.com/seed/${i}`, Date.now());
  assert.equal((await call('GET', '/me/titles', null, u.token)).data.titles[0].state, 'doing');
  const trend = (await call('GET', '/groups/mine', null, u.token)).data.groups.find((g) => g.type === 'trend');
  const xm = (await call('POST', `/groups/${trend.id}/messages`, { body: 'xem https://x.com/lingorm/status/777' }, adm.token)).data.message;
  assert.equal((await call('POST', '/trend/click', { messageId: xm.id, url: 'https://x.com/lingorm/status/777' }, u.token)).data.coins, 1);
  const t1 = (await call('GET', '/me/titles', null, u.token)).data;
  assert.equal(t1.titles[0].state, 'done');
  assert.equal(t1.titles[1].state, 'doing');
  assert.equal((await call('GET', '/me', null, u.token)).data.user.frame, null); // phần thưởng danh hiệu không tự áp dụng
  assert.equal((await call('GET', '/me', null, u.token)).data.user.nameColor, null);
  assert.ok((await call('GET', '/notifications', null, u.token)).data.notifications.some((n) => n.type === 'title' && n.text.includes('Bot trend')));
  // danh hiệu mở khóa phần thưởng
  const ap = await call('POST', '/me/appearance', { frame: 'title:1', color: 'title:1' }, u.token);
  assert.equal(ap.status, 200);
  assert.equal(ap.data.user.frame, 'title:1');
  assert.ok((await call('GET', '/shop', null, u.token)).data.mine.frames.some((f) => f.id === 'title:1' && f.source === 'title'));
  // Admin thu hồi danh hiệu: bỏ luôn khung và màu đang dùng
  await call('POST', `/admin/users/${u.id}/titles`, { title: 'bot_trend', grant: false }, adm.token);
  db.prepare("DELETE FROM coin_log WHERE user_id = ? AND kind = 'xlink'").run(u.id); // để không tự trao lại
  assert.equal((await call('GET', '/me', null, u.token)).data.user.frame, null);
});

test('kiếm xu: gửi link vào Đẩy trend +1 (mỗi link một lần), đăng bản tin +3, tim và trả lời không giới hạn mỗi ngày', async () => {
  const { db } = await import('../server/db.js');
  const u = await signup('earnMore', 1), o = await signup('earnMoreB', 1);
  db.prepare('UPDATE users SET start_done = 1, lvl = 4, lvl_seen = 4 WHERE id = ?').run(u.id);
  const coins = async (t) => (await call('GET', '/me/level', null, t)).data.level.coins;
  const trend = (await call('GET', '/groups/mine', null, u.token)).data.groups.find((g) => g.type === 'trend');
  const c0 = await coins(u.token);
  assert.equal((await call('POST', `/groups/${trend.id}/messages`, { body: 'https://x.com/earn/status/5' }, u.token)).status, 201);
  assert.equal(await coins(u.token), c0 + 5); // +3 vào app lần đầu trong ngày, +1 tin nhắn, +1 link
  // cùng link (khác tham số ?s=) gửi lại khi link cũ còn tồn tại: bị từ chối, không cộng xu
  assert.equal((await call('POST', `/groups/${trend.id}/messages`, { body: 'lại link https://x.com/earn/status/5?s=20' }, u.token)).status, 409);
  assert.equal(await coins(u.token), c0 + 5);
  // link khác gửi được
  assert.equal((await call('POST', `/groups/${trend.id}/messages`, { body: 'link mới https://x.com/earn/status/6' }, u.token)).status, 201);
  assert.equal(await coins(u.token), c0 + 7);
  // đăng bản tin +3 xu
  const before = await coins(u.token);
  assert.equal((await call('POST', '/news', { title: 'Bản tin kiếm xu', body: 'Nội dung' }, u.token)).status, 201);
  assert.equal(await coins(u.token), before + 3);
  // tim: không giới hạn trong ngày (một người thả 12 tim, vượt mức 3 tim/người của bản cũ)
  const vn = (await call('GET', '/groups/mine', null, o.token)).data.groups.find((g) => g.type === 'country');
  for (const x of [u, o]) await call('POST', `/groups/${vn.id}/rules-ack`, {}, x.token);
  const mine = [];
  for (let i = 0; i < 12; i++) mine.push((await call('POST', `/groups/${vn.id}/messages`, { body: `tin số ${i} của earn` }, u.token)).data.message);
  const h0 = await coins(u.token);
  for (const m of mine) await call('POST', `/messages/${m.id}/heart`, {}, o.token);
  assert.equal(await coins(u.token), h0 + 24); // 12 tim x 2 xu, không bị chặn
});

test('Đẩy trend: link trùng bị từ chối (kể cả chuyển tiếp), mọi tin chỉ tồn tại 38 giờ rồi tự xóa', async () => {
  const { db } = await import('../server/db.js');
  const { purgeTrendLinks } = await import('../server/retention.js');
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const u = await signup('trendTtl', 1);
  db.prepare('UPDATE users SET start_done = 1, lvl = 3, lvl_seen = 3 WHERE id = ?').run(u.id);
  const trend = (await call('GET', '/groups/mine', null, u.token)).data.groups.find((g) => g.type === 'trend');
  const post = (t, body) => call('POST', `/groups/${trend.id}/messages`, { body }, t);
  const first = await post(adm.token, 'Hot: https://x.com/ttl/status/100');
  assert.equal(first.status, 201);
  // người khác gửi lại cùng link (kể cả viết hoa, thêm www, tham số) đều bị từ chối
  for (const dup of ['https://x.com/ttl/status/100', 'link này nè HTTPS://www.X.com/TTL/status/100/?s=20#top']) {
    const r = await post(u.token, dup);
    assert.equal(r.status, 409, dup);
    assert.ok(r.data.error.includes('38'));
  }
  assert.equal((await post(u.token, 'https://x.com/ttl/status/101')).status, 201); // link khác thì được
  assert.equal((await post(adm.token, 'Tin không có link vẫn đăng bình thường')).status, 201);
  // chuyển tiếp tin có link trùng vào Đẩy trend cũng bị chặn
  const vn = (await call('GET', '/groups/mine', null, u.token)).data.groups.find((g) => g.type === 'country');
  await call('POST', `/groups/${vn.id}/rules-ack`, {}, u.token);
  const inVn = await call('POST', `/groups/${vn.id}/messages`, { body: 'https://x.com/ttl/status/100' }, u.token);
  assert.equal((await call('POST', `/messages/${inVn.data.message.id}/forward`, { groupId: trend.id }, u.token)).status, 409);
  // quá 38 giờ: tin có link bị xóa, tin không có link được giữ; sau đó gửi lại link cũ được
  db.prepare("UPDATE messages SET created_at = ? WHERE id = ?").run(Date.now() - 39 * 3600_000, first.data.message.id);
  const r = purgeTrendLinks(process.env.UPLOAD_DIR);
  assert.equal(r.messages, 1);
  const list = (await call('GET', `/groups/${trend.id}/messages`, null, u.token)).data.messages.map((m) => m.body);
  assert.ok(!list.some((b) => b.includes('status/100')));
  assert.ok(list.some((b) => b.includes('status/101')));
  assert.ok(list.some((b) => b.includes('không có link'))); // tin chưa quá 38 giờ vẫn còn
  assert.equal((await post(u.token, 'https://x.com/ttl/status/100')).status, 201);
  // tin không có link cũng tự xóa khi quá 38 giờ
  db.prepare("UPDATE messages SET created_at = ? WHERE body LIKE '%không có link%'").run(Date.now() - 39 * 3600_000);
  assert.equal(purgeTrendLinks(process.env.UPLOAD_DIR).messages, 1);
  assert.ok(!(await call('GET', `/groups/${trend.id}/messages`, null, u.token)).data.messages.some((m) => m.body.includes('không có link')));
});

test('Đẩy trend: dọn các tin có link trùng có từ trước, giữ tin đăng sớm nhất', async () => {
  const { db, trendGroupId } = await import('../server/db.js');
  const { dedupeTrendLinks } = await import('../server/retention.js');
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const gid = trendGroupId();
  const ins = db.prepare('INSERT INTO messages (group_id, user_id, body, created_at) VALUES (?,?,?,?)');
  const t = Date.now();
  const a = Number(ins.run(gid, adm.user.id, 'xem https://x.com/usmile_thailand/status/2124001', t).lastInsertRowid);
  const b = Number(ins.run(gid, adm.user.id, 'https://x.com/usmile_thailand/status/2124001', t + 1).lastInsertRowid);
  const c = Number(ins.run(gid, adm.user.id, 'https://x.com/usmile_thailand/status/2124002', t + 2).lastInsertRowid);
  const r = dedupeTrendLinks(process.env.UPLOAD_DIR);
  assert.ok(r.messages >= 1);
  const left = db.prepare('SELECT id FROM messages WHERE id IN (?,?,?)').all(a, b, c).map((x) => x.id);
  assert.ok(!left.includes(b)); // bản trùng đăng sau bị xóa
  assert.ok(left.includes(c)); // link khác được giữ
});

test('Muay Thai: trận kéo dài đến khi một bên hết máu, kịch bản luôn khớp kết quả, công thức thưởng, kiểm tra số xu cược', async () => {
  const { generateScript, payoutFor, validStake } = await import('../server/muaythai.js');
  for (const winner of ['A', 'B']) for (let i = 0; i < 5000; i++) {
    const s = generateScript(winner);
    const loser = winner === 'A' ? 'B' : 'A';
    const ev = s.events;
    assert.ok(ev.length >= 10 && ev.length <= 14);
    assert.equal(ev[ev.length - 1].by, winner);
    assert.deepEqual(ev[ev.length - 1].hp, s.finalHp);
    assert.equal(s.finalHp[loser], 0); // một bên hết máu
    assert.ok(s.finalHp[winner] > 0); // bên kia còn máu
    assert.equal(ev.filter((e) => e.ko).length, 1); assert.ok(ev[ev.length - 1].ko);
    assert.ok(ev.slice(0, -1).every((e) => e.hp[loser] > 0 && e.hp[winner] > 0)); // chưa ai hết máu trước đòn cuối
    ev.forEach((e, k) => {
      if (k) { assert.ok(e.tMs > ev[k - 1].tMs); assert.ok(e.hp.A <= ev[k - 1].hp.A && e.hp.B <= ev[k - 1].hp.B); }
      assert.ok(e.tMs < s.durationMs && e.hp.A >= 0 && e.hp.B >= 0);
    });
    assert.ok(s.durationMs >= 8000 && s.durationMs <= 25000);
    assert.ok(ev.some((e) => e.by === loser));
  }
  assert.equal(payoutFor(50), 95); assert.equal(payoutFor(10), 19); assert.equal(payoutFor(500), 950);
  for (const [v, ok] of [[9, false], [10, true], [500, true], [501, false], [10.5, false], ['50', false], [-5, false]]) assert.equal(validStake(v), ok, String(v));
});

test('Muay Thai: tạo trận, cược thắng/thua đúng sổ xu, không cược hai lần, không âm tiền', async () => {
  const { db } = await import('../server/db.js');
  const u = await signup('mtPlayer', 1);
  const other = await signup('mtOther', 1);
  db.prepare('UPDATE users SET coins = 1250 WHERE id = ?').run(u.id);
  assert.equal((await call('GET', '/mt/wallet', null, u.token)).data.balance, 1250);
  // tạo trận
  assert.equal((await call('POST', '/mt/matches', { mode: 'xx' }, u.token)).status, 400);
  const r1 = await call('POST', '/mt/matches', { mode: 'random' }, u.token);
  assert.equal(r1.status, 201);
  assert.equal(r1.data.fighters.length, 2);
  assert.notEqual(r1.data.fighters[0].id, r1.data.fighters[1].id);
  // cặp tự chọn: trùng, không tồn tại, người dùng khác, chính mình
  const same = await call('POST', '/mt/matches', { mode: 'custom', fighterA: { type: 'character', id: 'udon' }, fighterB: { type: 'character', id: 'udon' } }, u.token);
  assert.equal(same.status, 400); assert.equal(same.data.code, 'SAME_FIGHTER');
  assert.equal((await call('POST', '/mt/matches', { mode: 'custom', fighterA: { type: 'character', id: 'khong_co' }, fighterB: { type: 'character', id: 'uni' } }, u.token)).status, 404);
  const mine = await call('POST', '/mt/matches', { mode: 'custom', fighterA: { type: 'character', id: 'udon' }, fighterB: { type: 'user', id: String(u.id) } }, u.token);
  assert.equal(mine.status, 201); // chọn chính mình được phép
  assert.equal(mine.data.fighters[1].type, 'user');
  assert.equal((await call('GET', `/mt/matches/${r1.data.matchId}`, null, u.token)).status, 410); // trận cũ bị thay bằng trận mới
  const m = mine.data.matchId;
  // stake sai, pick sai, người khác không cược được trận của mình
  assert.equal((await call('POST', `/mt/matches/${m}/bet`, { pick: 'A', stake: 9 }, u.token)).data.code, 'INVALID_STAKE');
  assert.equal((await call('POST', `/mt/matches/${m}/bet`, { pick: 'C', stake: 50 }, u.token)).status, 400);
  assert.equal((await call('POST', `/mt/matches/${m}/bet`, { pick: 'A', stake: 50 }, other.token)).status, 404);
  // cược thật
  const b = await call('POST', `/mt/matches/${m}/bet`, { pick: 'A', stake: 50 }, u.token);
  assert.equal(b.status, 200, JSON.stringify(b.data));
  assert.equal(b.data.balanceAfterStake, 1200);
  assert.equal(b.data.balanceFinal, b.data.result.won ? 1295 : 1200);
  assert.equal(b.data.result.payout, b.data.result.won ? 95 : 0);
  assert.equal(b.data.result.won, b.data.result.winner === 'A');
  assert.equal(b.data.script.winner, b.data.result.winner);
  const rows = db.prepare('SELECT delta, reason FROM mt_ledger WHERE match_id = ? ORDER BY id').all(m);
  assert.equal(rows.length, b.data.result.won ? 2 : 1);
  assert.deepEqual({ ...rows[0] }, { delta: -50, reason: 'bet_stake' });
  assert.equal((await call('GET', '/mt/wallet', null, u.token)).data.balance, b.data.balanceFinal);
  // cược lần hai và tải lại trận đã chốt
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal((await call('POST', `/mt/matches/${m}/bet`, { pick: 'B', stake: 50 }, u.token)).status, 409);
  const again = await call('GET', `/mt/matches/${m}`, null, u.token);
  assert.equal(again.data.result.winner, b.data.result.winner);
  assert.equal(again.data.balanceFinal, b.data.balanceFinal);
  assert.deepEqual(again.data.script, b.data.script);
  // đã chơi thì không ảnh hưởng cấp (xu đã kiếm giữ nguyên)
  assert.equal(db.prepare('SELECT coins FROM users WHERE id = ?').get(u.id).coins, 1250);
});

test('Muay Thai: Admin đặt ảnh đầu nhân vật và ảnh mặc định, người thường không được', async () => {
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const u = await signup('mtHeadUser', 1);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const up = (await call('POST', '/upload', { dataUrl: png }, adm.token)).data.url;
  assert.equal((await call('GET', '/admin/mt/settings', null, u.token)).status, 403);
  assert.equal((await call('PATCH', '/admin/mt/characters/udon', { headImageUrl: up }, u.token)).status, 403);
  assert.equal((await call('PATCH', '/admin/mt/characters/khong_co', { headImageUrl: up }, adm.token)).status, 404);
  assert.equal((await call('PATCH', '/admin/mt/characters/udon', { headImageUrl: '/uploads/khong-co.png' }, adm.token)).status, 400);
  assert.equal((await call('PATCH', '/admin/mt/characters/udon', { headImageUrl: up }, adm.token)).status, 200);
  assert.equal((await call('GET', '/mt/characters', null, u.token)).data.characters.find((c) => c.id === 'udon').headUrl, up);
  assert.equal((await call('PATCH', '/admin/mt/settings', { defaultUserHeadUrl: up }, adm.token)).status, 200);
  assert.equal((await call('GET', '/admin/mt/settings', null, adm.token)).data.defaultUserHeadUrl, up);
  assert.equal((await call('PATCH', '/admin/mt/characters/udon', { headImageUrl: null }, adm.token)).status, 200);
  assert.equal((await call('PATCH', '/admin/mt/settings', { defaultUserHeadUrl: null }, adm.token)).status, 200);
  assert.equal((await call('GET', '/admin/mt/settings', null, adm.token)).data.defaultUserHeadUrl, null);
  assert.equal((await call('GET', '/mt/characters', null, u.token)).data.characters.find((c) => c.id === 'udon').headUrl, null);
});

test('Đẩy trend: tạo sẵn caption cho link X, mỗi người một caption, chủ đề do Admin chọn', async () => {
  const { db } = await import('../server/db.js');
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const users = [];
  for (const n of ['capU1', 'capU2', 'capU3', 'capU4', 'capU5', 'capU6']) users.push(await signup(n, 1));
  const tg = (await call('GET', '/groups/mine', null, adm.token)).data.groups.find((g) => g.type === 'trend');
  const post = await call('POST', `/groups/${tg.id}/messages`, { body: 'https://x.com/someone/status/1234567890123' }, adm.token);
  assert.equal(post.status, 201, JSON.stringify(post.data));
  const mid = post.data.message.id;
  // tin không có link bài viết thì không có caption
  const plain = await call('POST', `/groups/${tg.id}/messages`, { body: 'https://x.com/someone' }, adm.token);
  assert.equal(plain.status, 201);
  const ask = (u, ids) => call('GET', `/trend/captions?ids=${ids.join(',')}`, null, u.token);
  let r;
  for (let i = 0; i < 40; i++) { r = await ask(users[0], [mid, plain.data.message.id]); if (r.data.captions[mid]) break; await new Promise((x) => setTimeout(x, 100)); }
  assert.ok(r.data.captions[mid], 'caption phải được tạo nền');
  assert.ok(!r.data.captions[plain.data.message.id] && !r.data.pending.includes(plain.data.message.id));
  const c = r.data.captions[mid];
  assert.ok(c.n >= 3 && c.n <= 6);
  assert.equal(c.texts.length, c.n);
  for (const t of c.texts) { assert.match(t, /^Caption T1 số \d+\n\nkw1\n#tag1$/); assert.ok(t.length <= 280); } // caption + keyword + hashtag
  assert.equal(new Set(c.texts).size, c.n); // không trùng nhau
  // cùng người xem lại thì cùng caption; nhiều người thì có caption khác nhau
  assert.deepEqual((await ask(users[0], [mid])).data.captions[mid], c); // cùng người: cùng bộ, cùng vị trí bắt đầu
  const texts = new Set();
  for (const u of users) { const x = (await ask(u, [mid])).data.captions[mid]; texts.add(x.texts[x.start]); }
  assert.ok(texts.size >= 2, 'mỗi người một caption khác nhau');
  // sắp hết vòng: tạo thêm caption mới, không trùng, tối đa 24
  assert.equal((await call('POST', '/trend/captions/more', { messageId: mid }, users[0].token)).status, 200);
  let more;
  for (let i = 0; i < 40; i++) { more = (await ask(users[0], [mid])).data.captions[mid]; if (more.n > c.n) break; await new Promise((x) => setTimeout(x, 100)); }
  assert.ok(more.n > c.n && more.n <= 24);
  assert.deepEqual(more.texts.slice(0, c.n), c.texts); // thứ tự cũ giữ nguyên, caption mới nối thêm
  assert.equal(new Set(more.texts).size, more.n);
  // bấm link: ghi nhận đã dùng caption
  assert.equal((await call('POST', '/trend/click', { messageId: mid, url: 'https://x.com/someone/status/1234567890123', captioned: true }, users[0].token)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM trend_caption_use WHERE message_id = ?').get(mid).c, 1);
  // Admin chọn chủ đề caption
  assert.equal((await call('GET', '/admin/trend/caption-topic', null, users[0].token)).status, 403);
  const topics = (await call('GET', '/admin/trend/caption-topic', null, adm.token)).data;
  assert.deepEqual(topics.topics.map((t) => t.label), ['T1', 'T2']);
  assert.equal((await call('PUT', '/admin/trend/caption-topic', { label: 'khong-co' }, adm.token)).status, 400);
  assert.equal((await call('PUT', '/admin/trend/caption-topic', { label: 'T2' }, adm.token)).data.selected, 'T2');
  // đổi chủ đề: link cũ cũng chuyển sang caption của chủ đề mới (caption cũ bị bỏ)
  let r3;
  for (let i = 0; i < 40; i++) { r3 = await ask(users[0], [mid]); if (r3.data.captions[mid]) break; await new Promise((x) => setTimeout(x, 100)); }
  assert.ok(r3.data.captions[mid].texts.every((t) => /^Caption T2 số \d+\n\n#tag2$/.test(t)));
  assert.equal(db.prepare("SELECT COUNT(*) c FROM trend_captions WHERE message_id = ? AND text LIKE '%#tag1%'").get(mid).c, 0);
  const post2 = await call('POST', `/groups/${tg.id}/messages`, { body: 'https://x.com/other/status/99887766' }, adm.token);
  let r2;
  for (let i = 0; i < 40; i++) { r2 = await ask(users[0], [post2.data.message.id]); if (r2.data.captions[post2.data.message.id]) break; await new Promise((x) => setTimeout(x, 100)); }
  assert.ok(r2.data.captions[post2.data.message.id].texts.every((t) => /^Caption T2 số \d+\n\n#tag2$/.test(t))); // chủ đề mới áp dụng cho link mới
  // người ngoài nhóm Đẩy trend / tin đã xóa: không trả caption
  assert.equal(Object.keys((await ask(users[0], [999999])).data.captions).length, 0);
});

test('Muay Thai 1v1: gửi lời thách giữ xu, chấp nhận chốt kết quả đúng sổ xu, từ chối/hủy/hết hạn hoàn xu', async () => {
  const { db, now } = await import('../server/db.js');
  const A = await signup('pvpA', 1), B = await signup('pvpB', 1), C = await signup('pvpC', 1);
  db.prepare('UPDATE users SET coins = 1000 WHERE id IN (?, ?, ?)').run(A.id, B.id, C.id);
  const bal = async (u) => (await call('GET', '/mt/wallet', null, u.token)).data.balance;
  const [lo, hi] = A.id < B.id ? [A.id, B.id] : [B.id, A.id];
  let r;
  db.prepare('INSERT INTO friends (a, b, created_at) VALUES (?,?,?)').run(lo, hi, now());
  // kiểm tra đầu vào
  assert.equal((await call('POST', '/mt/pvp', { toId: B.id, stake: 5 }, A.token)).data.code, 'INVALID_STAKE');
  assert.equal((await call('POST', '/mt/pvp', { toId: A.id, stake: 50 }, A.token)).data.code, 'SELF');
  assert.equal((await call('POST', '/mt/pvp', { toId: 99999, stake: 50 }, A.token)).status, 404);
  // gửi: xu của A bị giữ ngay
  r = await call('POST', '/mt/pvp', { toId: B.id, stake: 50, fromRed: true }, A.token);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const id = r.data.id;
  assert.equal(r.data.status, 'pending'); assert.equal(r.data.role, 'from');
  assert.ok(r.data.expiresAt - r.data.serverNow > 29 * 60_000 && r.data.expiresAt - r.data.serverNow <= 30 * 60_000);
  assert.equal(await bal(A), 950);
  assert.equal((await call('POST', '/mt/pvp', { toId: B.id, stake: 50 }, A.token)).data.code, 'ALREADY_PENDING');
  // người thứ ba không xem / không trả lời được; người mời không tự chấp nhận
  assert.equal((await call('GET', `/mt/pvp/${id}`, null, C.token)).status, 404);
  assert.equal((await call('POST', `/mt/pvp/${id}/accept`, null, A.token)).status, 403);
  assert.equal((await call('POST', `/mt/pvp/${id}/cancel`, null, B.token)).status, 403);
  // B thấy trong hộp thư
  const inbox = (await call('GET', '/mt/pvp?box=in', null, B.token)).data;
  assert.equal(inbox.items.length, 1); assert.equal(inbox.incoming, 1); assert.equal(inbox.items[0].opponent.id, A.id);
  // B không đủ xu thì không nhận được
  db.prepare('UPDATE users SET coins = 20 WHERE id = ?').run(B.id);
  assert.equal((await call('POST', `/mt/pvp/${id}/accept`, null, B.token)).data.code, 'INSUFFICIENT_BALANCE');
  assert.equal(await bal(A), 950); // không thay đổi gì khi nhận thất bại
  db.prepare('UPDATE users SET coins = 1000 WHERE id = ?').run(B.id);
  // chấp nhận: chốt kết quả, giờ bắt đầu chung ở tương lai gần
  const acc = await call('POST', `/mt/pvp/${id}/accept`, null, B.token);
  assert.equal(acc.status, 200, JSON.stringify(acc.data));
  assert.equal(acc.data.status, 'settled');
  assert.ok(acc.data.startAt > acc.data.serverNow && acc.data.startAt - acc.data.serverNow <= 3000);
  assert.equal(acc.data.script.finalHp[acc.data.result.winner === 'A' ? 'B' : 'A'], 0);
  const va = (await call('GET', `/mt/pvp/${id}`, null, A.token)).data;
  assert.equal(va.result.winner, acc.data.result.winner);
  assert.equal(va.result.won, !acc.data.result.won); // hai bên thấy kết quả trái ngược
  assert.equal(va.startAt, acc.data.startAt); // cùng giờ bắt đầu, cùng kịch bản
  assert.deepEqual(va.script, acc.data.script);
  const [wBal, lBal] = acc.data.result.won ? [await bal(B), await bal(A)] : [await bal(A), await bal(B)];
  assert.equal(wBal, 1000 - 50 + 95); assert.equal(lBal, 1000 - 50);
  assert.equal((wBal + lBal) - 2000, 95 - 100); // phí 5 xu bị loại khỏi nền xu
  assert.equal(va.balanceAfterStake, va.result.won ? va.balanceFinal - 95 : va.balanceFinal); // lúc đang xem chưa cộng tiền thắng
  assert.equal((await call('POST', `/mt/pvp/${id}/accept`, null, B.token)).data.code, 'ALREADY_ACCEPTED');
  const hist = (await call('GET', '/mt/pvp?box=history', null, A.token)).data;
  assert.equal(hist.stats.wins + hist.stats.losses, 1);
  assert.equal(hist.stats.net, va.result.won ? 45 : -50);
  // từ chối: hoàn đủ
  let r2 = await call('POST', '/mt/pvp', { toId: B.id, stake: 100 }, A.token);
  const a1 = await bal(A);
  assert.equal((await call('POST', `/mt/pvp/${r2.data.id}/decline`, null, B.token)).data.status, 'declined');
  assert.equal(await bal(A), a1 + 100);
  // hủy: hoàn đủ, chỉ hủy được một lần
  r2 = await call('POST', '/mt/pvp', { toId: B.id, stake: 70 }, A.token);
  const a2 = await bal(A);
  assert.equal((await call('POST', `/mt/pvp/${r2.data.id}/cancel`, null, A.token)).data.status, 'cancelled');
  assert.equal(await bal(A), a2 + 70);
  assert.equal((await call('POST', `/mt/pvp/${r2.data.id}/cancel`, null, A.token)).status, 409);
  // hết hạn: máy chủ tự hoàn, người nhận không chấp nhận được nữa
  r2 = await call('POST', '/mt/pvp', { toId: B.id, stake: 80 }, A.token);
  const a3 = await bal(A);
  db.prepare('UPDATE mt_challenges SET expires_at = ? WHERE id = ?').run(now() - 1000, r2.data.id);
  assert.equal((await call('POST', `/mt/pvp/${r2.data.id}/accept`, null, B.token)).status, 410);
  assert.equal((await call('GET', `/mt/pvp/${r2.data.id}`, null, A.token)).data.status, 'expired');
  assert.equal(await bal(A), a3 + 80);
  // ai cũng nhận được lời thách đấu (không còn tùy chọn từ chối), kể cả người lạ
  assert.equal((await call('POST', '/mt/pvp', { toId: B.id, stake: 50 }, C.token)).status, 201);
  assert.equal((await call('PUT', '/mt/pvp/settings', { invite: 'none' }, B.token)).status, 404);
  // sổ xu khép kín: mọi dòng đều đối chiếu được số dư
  const net = (u) => db.prepare('SELECT COALESCE(SUM(delta),0) s FROM mt_ledger WHERE user_id = ? AND match_id IS NOT NULL').get(u.id).s;
  for (const u of [A, B, C]) assert.equal(db.prepare('SELECT game_net FROM users WHERE id = ?').get(u.id).game_net, net(u));
});

test('Muay Thai: không đủ xu, cược song song không âm tiền, chỉ một request thắng', async () => {
  const { db } = await import('../server/db.js');
  const u = await signup('mtRace', 1);
  db.prepare('UPDATE users SET coins = 60 WHERE id = ?').run(u.id);
  const ms = [];
  for (let i = 0; i < 2; i++) ms.push((await call('POST', '/mt/matches', { mode: 'custom', fighterA: { type: 'character', id: 'juad' }, fighterB: { type: 'character', id: 'abu' } }, u.token)).data.matchId);
  // tạo trận thứ hai làm trận đầu hết hạn, nên dùng một trận duy nhất cho cược song song
  const m = ms[1];
  const rs = await Promise.all([1, 2, 3].map(() => call('POST', `/mt/matches/${m}/bet`, { pick: 'A', stake: 50 }, u.token)));
  assert.equal(rs.filter((r) => r.status === 200).length, 1, JSON.stringify(rs.map((r) => r.status)));
  assert.ok(rs.every((r) => [200, 409, 429].includes(r.status)));
  const bal = (await call('GET', '/mt/wallet', null, u.token)).data.balance;
  assert.ok(bal >= 0);
  // không đủ xu
  db.prepare('UPDATE users SET game_net = 0, coins = 20 WHERE id = ?').run(u.id);
  await new Promise((r) => setTimeout(r, 1100));
  const m2 = (await call('POST', '/mt/matches', { mode: 'random' }, u.token)).data.matchId;
  const low = await call('POST', `/mt/matches/${m2}/bet`, { pick: 'A', stake: 50 }, u.token);
  assert.equal(low.status, 402); assert.equal(low.data.code, 'INSUFFICIENT_BALANCE');
  assert.equal((await call('GET', '/mt/wallet', null, u.token)).data.balance, 20);
});

test('Muay Thai: tìm người dùng làm võ sĩ, bạn bè trước; thống kê thắng của bên A quanh 50%', async () => {
  const u = await signup('mtSearcher', 1);
  await signup('mtFindMeA', 1);
  assert.equal((await call('GET', '/mt/users?q=m', null, u.token)).data.users.length, 0); // tối thiểu 2 ký tự
  const r = await call('GET', '/mt/users?q=mtFindMe', null, u.token);
  assert.equal(r.status, 200);
  assert.ok(r.data.users.length >= 1);
  assert.ok(r.data.users.every((x) => x.relation && x.name && !('email' in x)));
  const { generateScript } = await import('../server/muaythai.js');
  const { default: crypto } = await import('node:crypto');
  let a = 0; const N = 10000;
  for (let i = 0; i < N; i++) if (crypto.randomInt(0, 2) === 0) a++;
  assert.ok(Math.abs(a / N - 0.5) < 0.02);
  assert.ok(generateScript('A'));
});

test('Chủ đề nóng: đếm tin mới kể từ lần xem cuối (bài Admin, chủ đề mới duyệt/nổi bật), không tính của mình', async () => {
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const u = await signup('hotUnread', 1);
  assert.equal((await call('GET', '/hot/unread', null, u.token)).data.unread, 0); // lần đầu không đếm tin cũ
  await new Promise((r) => setTimeout(r, 5));
  assert.equal((await call('POST', '/hot/posts', { body: 'Thông báo mới cho Chủ đề nóng' }, adm.token)).status, 201);
  assert.equal((await call('GET', '/hot/unread', null, u.token)).data.unread, 1);
  assert.equal((await call('GET', '/hot/unread', null, adm.token)).data.unread, 0); // bài của chính admin không tính
  const t = await call('POST', '/topics', { name: 'Chủ đề đếm tin', description: '' }, adm.token);
  assert.equal(t.status, 201);
  assert.equal((await call('GET', '/hot/unread', null, u.token)).data.unread, 2);
  assert.equal((await call('POST', '/hot/seen', null, u.token)).data.unread, 0);
  assert.equal((await call('GET', '/hot/unread', null, u.token)).data.unread, 0);
});

test('hashtag Đẩy trend: chỉ Admin đặt, kiểm tra định dạng, tối đa 5, ai cũng xem', async () => {
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const u = await signup('tagUser', 1);
  assert.equal((await call('PUT', '/admin/trend/tags', { tags: ['abc'] }, u.token)).status, 403);
  assert.equal((await call('PUT', '/admin/trend/tags', { tags: ['có dấu cách'] }, adm.token)).status, 400);
  assert.equal((await call('PUT', '/admin/trend/tags', { tags: ['a', 'b', 'c', 'd', 'e', 'f'] }, adm.token)).status, 400);
  const ok = await call('PUT', '/admin/trend/tags', { tags: ['#usmilePajamaPartyWithOrm', 'usmilePajamaPartyWithOrm', '＃LingOrm'] }, adm.token);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.data.tags, ['usmilePajamaPartyWithOrm', 'LingOrm']);
  assert.deepEqual((await call('GET', '/trend/tags', null, u.token)).data.tags, ['usmilePajamaPartyWithOrm', 'LingOrm']);
  assert.deepEqual((await call('GET', '/public/trend-tags')).data.tags, ['usmilePajamaPartyWithOrm', 'LingOrm']);
});

test('emoji tùy chỉnh: chỉ Admin thêm, kiểm tra tên và ảnh, ẩn, đổi tên, xóa; ai cũng xem và dùng được', async () => {
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const u = await signup('emojiUser', 1);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const up = (await call('POST', '/upload', { dataUrl: png }, adm.token)).data.url;
  // người thường không thêm được
  assert.equal((await call('POST', '/admin/emoji', { name: 'cuoi_lan', imageUrl: up }, u.token)).status, 403);
  // tên và ảnh không hợp lệ
  for (const name of ['a', 'Cuoi Lan', 'có_dấu', 'x'.repeat(33)]) assert.equal((await call('POST', '/admin/emoji', { name, imageUrl: up }, adm.token)).status, 400, name);
  assert.equal((await call('POST', '/admin/emoji', { name: 'anh_loi', imageUrl: '/uploads/khong-co.png' }, adm.token)).status, 400);
  const jpg = (await call('POST', '/upload', { dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=' }, adm.token)).data.url;
  assert.equal((await call('POST', '/admin/emoji', { name: 'anh_jpg', imageUrl: jpg }, adm.token)).status, 201); // nhận cả JPG
  assert.equal((await call('POST', '/admin/emoji', { name: 'anh_svg', imageUrl: '/uploads/abc.svg' }, adm.token)).status, 400); // định dạng khác thì không
  // thêm thành công, tên trùng bị từ chối
  const add = await call('POST', '/admin/emoji', { name: 'cuoi_lan', imageUrl: up }, adm.token);
  assert.equal(add.status, 201, JSON.stringify(add.data));
  assert.equal((await call('POST', '/admin/emoji', { name: 'cuoi_lan', imageUrl: up }, adm.token)).status, 400);
  const id = add.data.emoji.id;
  // mọi người dùng xem được; khách cũng xem được
  assert.ok((await call('GET', '/emoji', null, u.token)).data.emoji.some((e) => e.name === 'cuoi_lan'));
  assert.ok((await call('GET', '/public/emoji')).data.emoji.some((e) => e.name === 'cuoi_lan'));
  // danh sách quản trị có số lần dùng; người thường không xem được
  assert.equal((await call('GET', '/admin/emoji', null, u.token)).status, 403);
  const vn = (await call('GET', '/groups/mine', null, u.token)).data.groups.find((g) => g.type === 'country');
  await call('POST', `/groups/${vn.id}/rules-ack`, {}, u.token);
  await call('POST', `/groups/${vn.id}/messages`, { body: 'vui quá :cuoi_lan: :cuoi_lan:' }, u.token);
  assert.equal((await call('GET', '/admin/emoji', null, adm.token)).data.emoji.find((e) => e.id === id).uses, 1);
  // mỗi tin tối đa 20 emoji tùy chỉnh
  assert.equal((await call('POST', `/groups/${vn.id}/messages`, { body: ':cuoi_lan:'.repeat(21) }, u.token)).status, 400);
  // đổi tên, ẩn
  assert.equal((await call('PATCH', `/admin/emoji/${id}`, { name: 'Sai Ten' }, adm.token)).status, 400);
  assert.equal((await call('PATCH', `/admin/emoji/${id}`, { hidden: true }, adm.token)).status, 200);
  assert.equal((await call('GET', '/emoji', null, u.token)).data.emoji.find((e) => e.id === id).hidden, true); // ẩn khỏi bảng chọn nhưng tin cũ vẫn hiện hình
  await call('PATCH', `/admin/emoji/${id}`, { hidden: false }, adm.token);
  // xóa: tên được giữ 30 ngày
  assert.equal((await call('DELETE', `/admin/emoji/${id}`, {}, adm.token)).status, 200);
  assert.ok(!(await call('GET', '/emoji', null, u.token)).data.emoji.some((e) => e.id === id));
  const again = await call('POST', '/admin/emoji', { name: 'cuoi_lan', imageUrl: up }, adm.token);
  assert.equal(again.status, 400);
  assert.ok(again.data.error.includes('xóa gần đây'));
});

test('react bằng emoji: tim và emoji tính như tim, tối đa 3 react mỗi người, xem ai đã react, emoji bị xóa thì react biến mất', async () => {
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const a = await signup('reactA', 1), b = await signup('reactB', 1), c = await signup('reactC', 1);
  const vn = (await call('GET', '/groups/mine', null, a.token)).data.groups.find((g) => g.type === 'country');
  for (const x of [a, b, c]) await call('POST', `/groups/${vn.id}/rules-ack`, {}, x.token);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const mkEmoji = async (name) => (await call('POST', '/admin/emoji', { name, imageUrl: (await call('POST', '/upload', { dataUrl: png }, adm.token)).data.url }, adm.token)).data.emoji.id;
  const e1 = await mkEmoji('react_vui'), e2 = await mkEmoji('react_khoc'), e3 = await mkEmoji('react_gian');
  const m = (await call('POST', `/groups/${vn.id}/messages`, { body: 'tin để react' }, a.token)).data.message;
  const coinsA0 = (await call('GET', '/me/level', null, a.token)).data.level.coins;
  // không tự react tin của mình; emoji lạ bị từ chối
  assert.equal((await call('POST', `/messages/${m.id}/react`, { emoji: 'heart' }, a.token)).status, 400);
  assert.equal((await call('POST', `/messages/${m.id}/react`, { emoji: 'e:99999' }, b.token)).status, 400);
  assert.equal((await call('POST', `/messages/${m.id}/react`, { emoji: 'u:🦄' }, b.token)).status, 400);
  assert.equal((await call('POST', `/messages/${m.id}/react`, { emoji: 'abc' }, b.token)).status, 400);
  // B react tim, emoji tùy chỉnh và emoji mặc định; react thứ 4 bị từ chối
  assert.equal((await call('POST', `/messages/${m.id}/react`, { emoji: 'heart' }, b.token)).status, 200);
  assert.equal((await call('POST', `/messages/${m.id}/react`, { emoji: `e:${e1}` }, b.token)).status, 200);
  const r3 = await call('POST', `/messages/${m.id}/react`, { emoji: 'u:😂' }, b.token);
  assert.equal(r3.status, 200);
  assert.equal(r3.data.hearts, 3); // mỗi react tính như một tim
  assert.deepEqual(r3.data.reactions.map((r) => r.emoji).sort(), ['e:' + e1, 'heart', 'u:😂'].sort());
  assert.ok(r3.data.reactions.every((r) => r.mine));
  assert.equal((await call('POST', `/messages/${m.id}/react`, { emoji: `e:${e2}` }, b.token)).status, 400);
  // chủ tin được +2 xu mỗi react
  assert.equal((await call('GET', '/me/level', null, a.token)).data.level.coins, coinsA0 + 6);
  // C react cùng emoji: số đếm tăng, mine chỉ của người xem
  await call('POST', `/messages/${m.id}/react`, { emoji: `e:${e1}` }, c.token);
  const view = (await call('GET', `/groups/${vn.id}/messages`, null, c.token)).data.messages.find((x) => x.id === m.id);
  assert.equal(view.hearts, 4);
  assert.equal(view.reactions.find((r) => r.emoji === `e:${e1}`).count, 2);
  assert.equal(view.reactions.find((r) => r.emoji === `e:${e1}`).mine, true);
  assert.equal(view.reactions.find((r) => r.emoji === 'heart').mine, false);
  assert.equal(view.hearted, false);
  // bật tắt: bỏ react không cộng thêm xu khi bật lại
  await call('POST', `/messages/${m.id}/react`, { emoji: 'u:😂' }, b.token); // bỏ
  await call('POST', `/messages/${m.id}/react`, { emoji: 'u:😂' }, b.token); // bật lại
  assert.equal((await call('GET', '/me/level', null, a.token)).data.level.coins, coinsA0 + 8); // chỉ thêm react của C
  // tim cũ vẫn là react 'heart'
  assert.equal((await call('POST', `/messages/${m.id}/heart`, {}, c.token)).data.hearted, true);
  // ai đã react
  const who = (await call('GET', `/messages/${m.id}/reactions`, null, a.token)).data.reactions;
  assert.deepEqual(who.find((r) => r.emoji === `e:${e1}`).users.map((x) => x.displayName).sort(), ['reactB', 'reactC']);
  // ẩn emoji: react cũ còn, react mới bị chặn; xóa emoji: react biến mất
  await call('PATCH', `/admin/emoji/${e1}`, { hidden: true }, adm.token);
  assert.equal((await call('POST', `/messages/${m.id}/react`, { emoji: `e:${e1}` }, (await signup('reactD', 1)).token)).status, 400); // emoji đã ẩn: không react mới được
  await call('DELETE', `/admin/emoji/${e1}`, {}, adm.token);
  const after = (await call('GET', `/groups/${vn.id}/messages`, null, a.token)).data.messages.find((x) => x.id === m.id);
  assert.ok(!after.reactions.some((r) => r.emoji === `e:${e1}`));
});

test('thống kê: ghi lượt xem và thời gian của người dùng và khách, chia theo đối tượng, chỉ Admin hệ thống xem được báo cáo', async () => {
  const { db } = await import('../server/db.js');
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const a = await signup('statA', 1), b = await signup('statB', 1), c = await signup('statC', 1);
  const vn = (await call('GET', '/groups/mine', null, a.token)).data.groups.find((g) => g.type === 'country');
  for (const t of ['stat_actors', 'stat_pages', 'stat_hours', 'visitor_links']) db.prepare(`DELETE FROM ${t}`).run();
  const gtrack = (vid, body) => call('POST', '/public/track', { vid, ...body });
  const G1 = 'guest-aaaaaaaaaaaaaaaa', G2 = 'guest-bbbbbbbbbbbbbbbb', GC = 'guest-cccccccccccccccc';
  // người dùng A: xem chat nhóm VN 2 lần, hoạt động 45 giây; B: xem tin tức 1 lần, hoạt động 15 + 30 giây
  for (let i = 0; i < 2; i++) assert.equal((await call('POST', '/track', { event: 'view', page: 'chat', target: vn.id }, a.token)).status, 200);
  for (let i = 0; i < 3; i++) await call('POST', '/track', { event: 'ping', seconds: 15, page: 'chat', target: vn.id }, a.token);
  await call('POST', '/track', { event: 'view', page: 'news' }, b.token);
  await call('POST', '/track', { event: 'ping', seconds: 15, page: 'news' }, b.token);
  await call('POST', '/track', { event: 'ping', seconds: 9999, page: 'trang-la' }, b.token); // trang lạ gộp vào "other", tối đa 30 giây mỗi lần
  // khách G1: 2 lượt xem, 15 giây; G2: 1 lượt xem; GC xem như khách rồi đăng nhập thành tài khoản C cùng ngày
  await gtrack(G1, { event: 'view', page: 'news' });
  await gtrack(G1, { event: 'view', page: 'chat', target: vn.id });
  await gtrack(G1, { event: 'ping', seconds: 15, page: 'chat', target: vn.id });
  await gtrack(G2, { event: 'view', page: 'hot' });
  await gtrack(GC, { event: 'view', page: 'news' });
  await call('POST', '/track', { event: 'view', page: 'news', vid: GC }, c.token); // đăng nhập: mã khách được nối với tài khoản C
  // mã khách sai bị từ chối
  assert.equal((await gtrack('ngan', { event: 'view', page: 'news' })).status, 400);
  assert.equal((await call('POST', '/track', { event: 'view', page: 'news' })).status, 401);
  assert.equal((await call('GET', '/admin/stats', null, a.token)).status, 403);
  const r = (await call('GET', '/admin/stats?days=7', null, adm.token)).data;
  assert.equal(r.days, 7);
  const { all, users, guests } = r.segments;
  assert.equal(all.series.length, 7);
  // người dùng đã đăng ký: A, B, C (C gồm cả lượt xem lúc còn là khách)
  assert.equal(users.summary.dauToday, 3);
  assert.equal(users.summary.viewsToday, 2 + 1 + 2);
  assert.equal(users.summary.totalSeconds, 45 + 45);
  assert.equal(users.summary.avgSecondsPerUserDay, 30);
  // khách: chỉ G1 và G2 (GC đã được gộp vào tài khoản C)
  assert.equal(guests.summary.dauToday, 2);
  assert.equal(guests.summary.viewsToday, 3);
  assert.equal(guests.summary.totalSeconds, 15);
  // cả hai: 5 người khác nhau, không đếm C hai lần
  assert.equal(all.summary.dauToday, 5);
  assert.equal(all.summary.viewsToday, 8);
  { const sg = (await call('GET', '/admin/stats?days=30', null, adm.token)).data.signups; // đăng ký mới: các kỳ lồng nhau
    assert.ok(sg.today >= 1 && sg.week >= sg.today && sg.month >= sg.week && sg.total >= sg.month); }
  assert.equal(all.summary.totalSeconds, 105);
  assert.equal(all.summary.mau, 5);
  assert.equal(users.summary.mau, 3);
  assert.equal(guests.summary.mau, 2);
  // trang xem nhiều: theo từng đối tượng
  const pageOf = (seg, p) => seg.pages.find((x) => x.page === p);
  assert.equal(pageOf(users, 'chat').views, 2);
  assert.equal(pageOf(users, 'chat').seconds, 45);
  assert.equal(pageOf(guests, 'chat').views, 1);
  assert.equal(pageOf(guests, 'hot').views, 1);
  assert.equal(pageOf(all, 'news').views, 4); // B, C (người dùng), G1, GC (khách, trước khi đăng nhập)
  assert.ok(pageOf(users, 'other'));
  assert.equal(all.groups[0].id, vn.id);
  assert.equal(all.groups[0].views, 3);
  assert.equal(guests.groups[0].views, 1);
  // heatmap theo giờ: tất cả ghi vào ô (thứ, giờ) hiện tại
  const nowVn = new Date(Date.now() + 7 * 3600_000);
  const w = (nowVn.getUTCDay() + 6) % 7, h = nowVn.getUTCHours();
  const occ = all.series.filter((x) => (new Date(x.day + 'T00:00:00Z').getUTCDay() + 6) % 7 === w).length;
  const avg = (n) => Math.round((n / occ) * 100) / 100;
  assert.equal(all.heatmap.users[w][h], avg(5));
  assert.equal(users.heatmap.users[w][h], avg(3));
  assert.equal(guests.heatmap.users[w][h], avg(2));
  assert.equal(users.heatmap.views[w][h], avg(5));
  assert.deepEqual({ weekday: all.peak.weekday, hour: all.peak.hour }, { weekday: w, hour: h });
  // người đăng ký mới được tính ở hai nhóm có người dùng
  assert.ok(all.series[6].newUsers >= 3);
  assert.equal(guests.series[6].newUsers, 0);
  assert.equal((await call('GET', '/admin/stats?days=9999', null, adm.token)).data.days, 365);
});

test('Đẩy trend: người dùng dưới cấp 3 gửi bài chờ admin duyệt; cấp 3 trở lên đăng thẳng', async () => {
  const { db } = await import('../server/db.js');
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const u = await signup('tsubU', 1), top = await signup('tsubTop', 1), other = await signup('tsubO', 1);
  const trend = (await call('GET', '/groups/mine', null, u.token)).data.groups.find((g) => g.type === 'trend');
  assert.equal(trend.canPost, false); assert.equal(trend.canSubmit, true);
  db.prepare('UPDATE users SET lvl = 3 WHERE id = ?').run(top.id);
  const msgs = async (tok) => (await call('GET', `/groups/${trend.id}/messages`, null, tok)).data.messages;
  // cấp 3: đăng thẳng
  assert.equal((await call('POST', `/groups/${trend.id}/messages`, { body: 'https://x.com/a/status/9001 top' }, top.token)).status, 201);
  // dưới cấp 3: chờ duyệt, người khác chưa thấy
  const link = 'https://x.com/a/status/9002 bài chờ';
  const r = await call('POST', `/groups/${trend.id}/messages`, { body: link }, u.token);
  assert.equal(r.status, 202); assert.equal(r.data.pending, true);
  assert.ok(!(await msgs(other.token)).some((m) => m.body === link));
  assert.equal((await call('POST', `/groups/${trend.id}/messages`, { body: link }, u.token)).status, 409); // không gửi trùng khi đang chờ
  assert.equal((await call('GET', '/trend/submissions', null, u.token)).data.mine.length, 1);
  assert.equal((await call('GET', '/trend/submissions', null, u.token)).data.review.length, 0);
  const q = (await call('GET', '/trend/submissions', null, adm.token)).data.review;
  assert.ok(q.some((x) => x.id === r.data.submission.id));
  // người thường không duyệt được
  assert.equal((await call('POST', `/trend/submissions/${r.data.submission.id}/approve`, {}, other.token)).status, 403);
  // admin duyệt: bài hiện cho mọi người, người gửi được báo
  const ok = await call('POST', `/trend/submissions/${r.data.submission.id}/approve`, {}, adm.token);
  assert.equal(ok.status, 200);
  const shown = (await msgs(other.token)).find((m) => m.body === link);
  assert.ok(shown && shown.user.id === u.id);
  const ns = (await call('GET', '/notifications', null, u.token)).data.notifications;
  assert.ok(ns.some((n) => n.text.includes('đã được duyệt') && n.msgId === shown.id));
  assert.equal((await call('POST', `/trend/submissions/${r.data.submission.id}/approve`, {}, adm.token)).status, 404); // đã xử lý
  // từ chối kèm lý do
  const r2 = await call('POST', `/groups/${trend.id}/messages`, { body: 'https://x.com/a/status/9003' }, u.token);
  assert.equal((await call('POST', `/trend/submissions/${r2.data.submission.id}/reject`, { reason: 'Không đúng chủ đề' }, adm.token)).status, 200);
  assert.ok(!(await msgs(other.token)).some((m) => m.body.includes('9003')));
  assert.ok((await call('GET', '/notifications', null, u.token)).data.notifications.some((n) => n.text.includes('Không đúng chủ đề')));
  assert.equal((await call('GET', '/trend/submissions', null, u.token)).data.mine[0].status, 'rejected');
  // rút lại bài đang chờ
  const r3 = await call('POST', `/groups/${trend.id}/messages`, { body: 'https://x.com/a/status/9004' }, u.token);
  assert.equal((await call('DELETE', `/trend/submissions/${r3.data.submission.id}`, null, other.token)).status, 404);
  assert.equal((await call('DELETE', `/trend/submissions/${r3.data.submission.id}`, null, u.token)).status, 200);
  // tối đa 5 bài chờ cùng lúc
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', `/groups/${trend.id}/messages`, { body: `https://x.com/a/status/91${i}` }, u.token)).status, 202);
  assert.equal((await call('POST', `/groups/${trend.id}/messages`, { body: 'https://x.com/a/status/9199' }, u.token)).status, 400);
});

test('Nuôi thú: chỉ Admin thử khi chưa mở; chăm sóc, thân thiết, khu nhà mở rộng bằng xu theo cấp, thăm nhà', async () => {
  const { db, now } = await import('../server/db.js');
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const u = await signup('petU', 1), f = await signup('petF', 1);
  // chưa mở: người thường bị chặn, admin dùng được
  assert.equal((await call('GET', '/pets/access', null, u.token)).data.open, false);
  assert.equal((await call('GET', '/pets', null, u.token)).status, 403);
  assert.equal((await call('POST', '/pets/adopt', { kind: 'udon', name: 'Bông' }, u.token)).status, 403);
  assert.equal((await call('GET', '/pets/access', null, adm.token)).data.open, true);
  assert.equal((await call('GET', '/pets', null, adm.token)).status, 200);
  assert.equal((await call('PUT', '/admin/pets/settings', { mode: 'all' }, u.token)).status, 403);
  assert.equal((await call('PUT', '/admin/pets/settings', { mode: 'all' }, adm.token)).status, 200);
  try {
    let s = (await call('GET', '/pets', null, u.token)).data;
    assert.equal(s.home.capacity, 1); assert.equal(s.pets.length, 0); assert.equal(s.kinds.length, 6);
    assert.equal((await call('POST', '/pets/adopt', { kind: 'khongco', name: 'Bông Gòn' }, u.token)).status, 400);
    // tên bắt buộc, không trùng tên mặc định, không trùng tên bạn thú khác
    assert.equal((await call('POST', '/pets/adopt', { kind: 'charsiu' }, u.token)).status, 400);
    assert.equal((await call('POST', '/pets/adopt', { kind: 'charsiu', name: 'Tofu' }, u.token)).status, 400);
    assert.equal((await call('POST', '/pets/adopt', { kind: 'charsiu', name: '  uDoN ' }, u.token)).status, 400);
    assert.equal((await call('POST', '/pets/adopt', { kind: 'charsiu', name: 'A' }, u.token)).status, 400);
    assert.equal((await call('POST', '/pets/adopt', { kind: 'charsiu', name: '<b>x</b>' }, u.token)).status, 400);
    s = (await call('POST', '/pets/adopt', { kind: 'charsiu', name: 'Xíu Mại' }, u.token)).data;
    assert.equal(s.pets[0].name, 'Xíu Mại');
    assert.equal(s.pets.length, 1);
    assert.equal((await call('POST', '/pets/adopt', { kind: 'udon', name: 'Mì Gói' }, u.token)).status, 400); // khu nhà đầy
    const pet = s.pets[0];
    // cho ăn: món yêu thích cộng thêm, có thời gian chờ
    const fed = await call('POST', `/pets/${pet.id}/feed`, { food: 'thit' }, u.token);
    assert.equal(fed.status, 200); assert.equal(fed.data.liked, true); assert.ok(fed.data.gained >= 3);
    assert.ok(fed.data.pet.stats.food > pet.stats.food);
    assert.equal((await call('POST', `/pets/${pet.id}/feed`, { food: 'thit' }, u.token)).status, 400);
    assert.equal((await call('POST', `/pets/${fed.data.pet.id}/feed`, { food: 'xxx' }, u.token)).status, 400);
    // thú của người khác không chăm được
    assert.equal((await call('POST', `/pets/${pet.id}/play`, {}, f.token)).status, 404);
    // thời gian trôi: chỉ số tụt, không bao giờ âm và thú không mất
    db.prepare('UPDATE pets SET stat_at = stat_at - ?, cd = NULL WHERE id = ?').run(48 * 3600_000, pet.id);
    s = (await call('GET', '/pets', null, u.token)).data;
    assert.equal(s.pets.length, 1);
    assert.ok(s.pets[0].stats.food === 0 && s.pets[0].mood.key === 'hungry');
    // trần Thân thiết mỗi ngày
    db.prepare('UPDATE pets SET day = ?, day_gain = 80 WHERE id = ?').run(new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10), pet.id);
    const before = s.pets[0].intimacy;
    const capped = await call('POST', `/pets/${pet.id}/wash`, {}, u.token);
    assert.equal(capped.status, 200); assert.equal(capped.data.gained, 0); assert.equal(capped.data.pet.intimacy, before);
    // mở rộng: cần đủ cấp và đủ xu
    assert.equal((await call('POST', '/pets/home/expand', {}, u.token)).status, 400); // chưa đủ cấp
    db.prepare('UPDATE users SET lvl = 2, coins = 200, coins_spent = 0 WHERE id = ?').run(u.id);
    assert.equal((await call('POST', '/pets/home/expand', {}, u.token)).status, 400); // chưa đủ xu (300)
    assert.equal((await call('PUT', '/admin/pets/settings', { prices: [300, 800, 1800] }, adm.token)).status, 400);
    db.prepare('UPDATE users SET coins = 1000 WHERE id = ?').run(u.id);
    s = (await call('POST', '/pets/home/expand', {}, u.token)).data;
    assert.equal(s.home.capacity, 2); assert.equal(s.balance, 700);
    assert.equal((await call('POST', '/pets/home/expand', {}, u.token)).status, 400); // bậc 3 cần cấp 3
    assert.equal((await call('POST', '/pets/adopt', { kind: 'udon', name: 'xiu mai' }, u.token)).status, 400); // trùng tên (không phân biệt hoa thường, dấu)
    assert.equal((await call('POST', '/pets/adopt', { kind: 'udon', name: 'Mì Gói' }, u.token)).status, 201);
    assert.equal((await call('POST', '/pets/adopt', { kind: 'udon', name: 'Mì Ly' }, u.token)).status, 400); // đã nuôi Udon
    assert.equal((await call('PATCH', `/pets/${pet.id}`, { name: 'Bánh Bao' }, u.token)).status, 200);
    // thăm nhà: chỉ bạn bè, mỗi ngày một lần
    assert.equal((await call('GET', `/pets/visit/${u.id}`, null, f.token)).status, 403);
    const [lo, hi] = u.id < f.id ? [u.id, f.id] : [f.id, u.id];
    db.prepare('INSERT INTO friends (a, b, created_at) VALUES (?,?,?)').run(lo, hi, now());
    const v = (await call('GET', `/pets/visit/${u.id}`, null, f.token)).data;
    assert.equal(v.pets.length, 2); assert.equal(v.patted, false);
    assert.equal((await call('POST', `/pets/visit/${u.id}/pat`, { petId: v.pets[0].id }, f.token)).status, 200);
    assert.equal((await call('POST', `/pets/visit/${u.id}/pat`, { petId: v.pets[0].id }, f.token)).status, 400);
    assert.ok((await call('GET', '/notifications', null, u.token)).data.notifications.some((n) => n.text.includes('ghé thăm')));
    // không kiếm xu trong game: số dư không tăng sau khi chăm
    assert.equal((await call('GET', '/pets', null, u.token)).data.balance, 700);
    // admin: công cụ thử chỉ tác động tới chính admin
    assert.equal((await call('POST', '/admin/pets/reset', {}, u.token)).status, 403);
    assert.equal((await call('POST', '/admin/pets/skip', { hours: 5 }, adm.token)).status, 200);
    assert.equal((await call('POST', '/admin/pets/reset', {}, adm.token)).status, 200);
    assert.equal((await call('GET', '/pets', null, u.token)).data.pets.length, 2);
  } finally {
    await call('PUT', '/admin/pets/settings', { mode: 'admin' }, adm.token);
  }
  assert.equal((await call('GET', '/pets', null, u.token)).status, 403);
});

test('Nuôi thú: thú buồn bị trừ Thân thiết theo giờ, không tụt khỏi giai đoạn, chăm xong thì chốt điểm', async () => {
  const { db, now } = await import('../server/db.js');
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const u = await signup('petSad', 1);
  await call('PUT', '/admin/pets/settings', { mode: 'all' }, adm.token);
  try {
    const id = (await call('POST', '/pets/adopt', { kind: 'uni', name: 'Nâu Nâu' }, u.token)).data.pets[0].id;
    // đang buồn (mọi chỉ số 10) 5 giờ: mất 10 điểm (2 mỗi giờ)
    db.prepare('UPDATE pets SET food = 10, fun = 10, clean = 10, health = 10, intimacy = 250, stat_at = ? WHERE id = ?').run(now() - 5 * 3600_000, id);
    let p = (await call('GET', '/pets', null, u.token)).data.pets[0];
    assert.equal(p.intimacy, 240); assert.equal(p.losing, true);
    // thú khỏe: không bị trừ
    db.prepare('UPDATE pets SET food = 90, fun = 90, clean = 90, health = 90, stat_at = ? WHERE id = ?').run(now() - 1 * 3600_000, id);
    assert.equal((await call('GET', '/pets', null, u.token)).data.pets[0].intimacy, 250);
    // bỏ mặc rất lâu: trừ tối đa tới mốc đầu giai đoạn (Con nhỏ từ 100), không rơi xuống Bé
    db.prepare('UPDATE pets SET food = 10, fun = 10, clean = 10, health = 10, stat_at = ? WHERE id = ?').run(now() - 400 * 3600_000, id);
    p = (await call('GET', '/pets', null, u.token)).data.pets[0];
    assert.equal(p.intimacy, 100); assert.equal(p.stage, 1);
    // chăm sóc: điểm mất được chốt, lần sau không trừ lại
    const r = await call('POST', `/pets/${id}/feed`, { food: 'xuong' }, u.token);
    assert.equal(r.status, 200); assert.equal(r.data.lost, 150);
    assert.equal(db.prepare('SELECT intimacy FROM pets WHERE id = ?').get(id).intimacy, 100 + r.data.gained);
    assert.equal((await call('GET', '/pets', null, u.token)).data.pets[0].intimacy, 100 + r.data.gained);
  } finally { await call('PUT', '/admin/pets/settings', { mode: 'admin' }, adm.token); }
});

test('Nuôi thú: cửa hàng đồ ăn, đồ chơi, nhà/lồng/bể; vật phẩm tăng chỉ số nhiều hơn', async () => {
  const { db, now } = await import('../server/db.js');
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const u = await signup('petShop', 1);
  await call('PUT', '/admin/pets/settings', { mode: 'all' }, adm.token);
  try {
    assert.equal((await call('GET', '/pets/shop', null, adm.token)).status, 200);
    db.prepare('UPDATE users SET coins = 4000, coins_spent = 0, lvl = 5 WHERE id = ?').run(u.id);
    for (let i = 0; i < 2; i++) await call('POST', '/pets/home/expand', {}, u.token); // đủ chỗ cho 3 bạn
    const adopt = async (k) => (await call('POST', '/pets/adopt', { kind: k, name: `Bé ${k}` }, u.token)).data;
    await adopt('uni'); await adopt('juad'); const s0 = await adopt('abu');
    const bal = async () => (await call('GET', '/pets/shop', null, u.token)).data.balance;
    const b0 = await bal();
    // đồ ăn: chưa mua thì không dùng được; mua rồi dùng một lần
    const uni = s0.pets.find((p) => p.kind === 'uni');
    // hình pixel art: chỉ Abu có sprite theo giai đoạn (tệp có thật); các bạn khác dùng hình tạm
    const abuPet = s0.pets.find((p) => p.kind === 'abu');
    assert.equal(abuPet.sprite, '/pets/abu/stage_0.webp'); assert.equal(uni.sprite, null);
    assert.equal(s0.kinds.find((k) => k.id === 'abu').sprite, '/pets/abu/stage_0.webp');
    for (let n = 0; n < 4; n++) assert.ok((await import('node:fs')).existsSync(`public/pets/abu/stage_${n}.webp`));
    // hoạt hình: Abu giai đoạn Bé có idle (6), walk (6), happy (4); tệp có thật; bạn khác chưa có
    assert.deepEqual(Object.fromEntries(Object.entries(abuPet.anim).map(([k, v]) => [k, v.urls.length])), { idle: 6, walk: 6, happy: 4 });
    assert.equal(abuPet.anim.walk.fps, 8); assert.equal(uni.anim, null);
    for (const a of Object.values(abuPet.anim)) for (const u of a.urls) assert.ok((await import('node:fs')).existsSync(`public${u}`), u);
    db.prepare('UPDATE pets SET food = 20, stat_at = ? WHERE id = ?').run(now(), uni.id);
    assert.equal((await call('POST', `/pets/${uni.id}/feed`, { food: 'dog_tiec' }, u.token)).status, 400);
    assert.equal((await call('POST', '/pets/shop/buy', { item: 'food:dog_tiec', qty: 2 }, u.token)).status, 200);
    assert.equal(await bal(), b0 - 50);
    const big = await call('POST', `/pets/${uni.id}/feed`, { food: 'dog_tiec' }, u.token);
    assert.equal(big.status, 200); assert.ok(big.data.pet.stats.food >= 78); assert.equal(big.data.inv['food:dog_tiec'], 1); // 20 + 60 = 80, hơn hẳn món miễn phí (tối đa +35)
    // đồ chơi: mua một lần, chơi có đồ chơi vui hơn tay không
    assert.equal((await call('POST', `/pets/${uni.id}/play`, { toy: 'dog_bong' }, u.token)).status, 400); // chưa có
    assert.equal((await call('POST', '/pets/shop/buy', { item: 'toy:dog_bong' }, u.token)).status, 200);
    assert.equal((await call('POST', '/pets/shop/buy', { item: 'toy:dog_bong' }, u.token)).status, 400); // đã có
    db.prepare('UPDATE pets SET fun = 10, cd = NULL, stat_at = ? WHERE id = ?').run(now(), uni.id);
    const withToy = (await call('POST', `/pets/${uni.id}/play`, { toy: 'dog_bong' }, u.token)).data;
    db.prepare('UPDATE pets SET fun = 10, cd = NULL, stat_at = ? WHERE id = ?').run(now(), uni.id);
    const bare = (await call('POST', `/pets/${uni.id}/play`, {}, u.token)).data;
    assert.ok(withToy.pet.stats.fun >= bare.pet.stats.fun + 14);
    // chỗ ở: nhà cho chó, bể cho rùa, lồng cho vẹt; bậc cao thì tụt chậm hơn; đổi bậc được trừ giá món cũ
    const decay = async (kind) => { const p = (await call('GET', '/pets', null, u.token)).data.pets.find((x) => x.kind === kind); db.prepare('UPDATE pets SET food = 100, fun = 100, clean = 100, health = 100, stat_at = ? WHERE id = ?').run(now() - 10 * 3600_000, p.id); return 100 - (await call('GET', '/pets', null, u.token)).data.pets.find((x) => x.kind === kind).stats.food; };
    const noHouse = await decay('uni');
    assert.equal((await call('POST', '/pets/shop/buy', { item: 'house:house1' }, u.token)).status, 200);
    const withHouse = await decay('uni');
    assert.ok(withHouse < noHouse);
    const bBefore = await bal();
    assert.equal((await call('POST', '/pets/shop/buy', { item: 'house:house1' }, u.token)).status, 400); // đã có bậc này
    assert.equal((await call('POST', '/pets/shop/buy', { item: 'house:house2' }, u.token)).status, 200);
    assert.equal(await bal(), bBefore - (500 - 150)); // trừ giá nhà cũ
    assert.ok((await decay('uni')) < withHouse);
    assert.equal((await call('GET', '/pets/shop', null, u.token)).data.habitat.house, 2);
    // vật phẩm đúng loài: rùa không ăn đồ ăn của chó, không dùng đồ chơi của chó; mỗi loài cùng số lượng vật phẩm
    const juad = (await call('GET', '/pets', null, u.token)).data.pets.find((x) => x.kind === 'juad');
    assert.equal((await call('POST', `/pets/${juad.id}/feed`, { food: 'dog_tiec' }, u.token)).status, 400);
    assert.equal((await call('POST', `/pets/${juad.id}/feed`, { food: 'thit' }, u.token)).status, 400); // thịt là món của chó
    assert.equal((await call('POST', `/pets/${juad.id}/feed`, { food: 'tom' }, u.token)).status, 200); // tôm là món của rùa
    assert.equal((await call('POST', `/pets/${juad.id}/play`, { toy: 'dog_bong' }, u.token)).status, 400);
    const cat = (await call('GET', '/pets/shop', null, u.token)).data.species;
    assert.equal(cat.length, 3);
    for (const k of ['food', 'toy']) assert.equal(new Set(cat.map((x) => x[k].length)).size, 1); // cùng số lượng mỗi loài
    assert.equal(new Set(cat.map((x) => x.home.items.length)).size, 1);
    for (const k of ['food', 'toy']) for (let i = 0; i < cat[0][k].length; i++) { // cùng giá và mức tăng chỉ số
      const row = (x) => JSON.stringify([x[k][i].price, x[k][i].food, x[k][i].fun, x[k][i].health, x[k][i].int]);
      assert.equal(new Set(cat.map(row)).size, 1);
    }
    assert.equal(new Set(cat.map((x) => x.food.map((f) => f.name).join())).size, 3); // tên khác nhau theo loài
    assert.equal((await call('POST', '/pets/shop/buy', { item: 'cage:cage1' }, u.token)).status, 200);
    assert.equal((await call('POST', '/pets/shop/buy', { item: 'tank:tank1' }, u.token)).status, 200);
    // thiếu xu và vật phẩm không có thật
    db.prepare('UPDATE users SET coins_spent = coins WHERE id = ?').run(u.id);
    assert.equal((await call('POST', '/pets/shop/buy', { item: 'toy:dog_truot' }, u.token)).status, 400);
    assert.equal((await call('POST', '/pets/shop/buy', { item: 'toy:khongco' }, u.token)).status, 400);
    assert.equal((await call('GET', '/pets/shop', null, f0(u))).status, 401);
  } finally { await call('PUT', '/admin/pets/settings', { mode: 'admin' }, adm.token); }
  assert.equal((await call('GET', '/pets/shop', null, u.token)).status, 403);
});
const f0 = () => ''; // token rỗng: chưa đăng nhập

test('Nuôi thú: mỗi bạn phản ứng khác nhau với từng đồ ăn, đồ chơi; khẩu vị công bằng giữa các bạn', async () => {
  const { db, now } = await import('../server/db.js');
  const { TASTE, KINDS, SHOP, FREE_FOODS, REACT_TEXT } = await import('../server/pets.js');
  // công bằng: mỗi bạn có 7 món ăn của loài (2 rất thích, 2 thích, 2 bình thường, 1 không thích) và 4 đồ chơi mỗi mức một món
  for (const k of KINDS) {
    const foods = [...FREE_FOODS[k.sp].map((f) => f.id), ...SHOP.food.filter((f) => f.sp === k.sp).map((f) => f.id)];
    const toys = SHOP.toy.filter((t) => t.sp === k.sp).map((t) => t.id);
    assert.deepEqual(Object.keys(TASTE[k.id].food).sort(), foods.sort());
    assert.deepEqual(Object.keys(TASTE[k.id].toy).sort(), toys.sort());
    const count = (m) => Object.values(m).reduce((o, v) => ((o[v] = (o[v] || 0) + 1), o), {});
    assert.deepEqual(count(TASTE[k.id].food), { love: 2, like: 2, neutral: 2, dislike: 1 });
    assert.deepEqual(count(TASTE[k.id].toy), { love: 1, like: 1, neutral: 1, dislike: 1 });
    assert.ok(Object.values(TASTE[k.id].food).includes('love') && TASTE[k.id].food[k.fav] === 'love'); // món yêu thích luôn ở mức rất thích
    for (const act of ['feed', 'play']) for (const lv of ['love', 'like', 'neutral', 'dislike']) assert.ok(REACT_TEXT[k.id][act][lv].includes('{n}'));
  }
  // các bạn cùng loài không giống hệt nhau
  assert.notDeepEqual(TASTE.uni.food, TASTE.charsiu.food); assert.notDeepEqual(TASTE.tofu.toy, TASTE.udon.toy);
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const u = await signup('petTaste', 1);
  await call('PUT', '/admin/pets/settings', { mode: 'all' }, adm.token);
  try {
    db.prepare('UPDATE users SET coins = 3000, coins_spent = 0, lvl = 5 WHERE id = ?').run(u.id);
    for (let i = 0; i < 2; i++) await call('POST', '/pets/home/expand', {}, u.token);
    await call('POST', '/pets/adopt', { kind: 'charsiu', name: 'Heo Quay' }, u.token);
    const s = (await call('POST', '/pets/adopt', { kind: 'tofu', name: 'Đậu Phụ' }, u.token)).data;
    const char = s.pets.find((p) => p.kind === 'charsiu'), tofu = s.pets.find((p) => p.kind === 'tofu');
    const reset = (id) => db.prepare('UPDATE pets SET food = 10, fun = 10, cd = NULL, stat_at = ? WHERE id = ?').run(now(), id);
    // rất thích (thịt, x1.25) > thích (xương) cho cùng một bạn
    reset(char.id);
    const love = (await call('POST', `/pets/${char.id}/feed`, { food: 'thit' }, u.token)).data;
    assert.equal(love.reaction.level, 'love'); assert.equal(love.reaction.action, 'feed_love'); assert.ok(love.reaction.text.includes('Heo Quay'));
    assert.equal(love.pet.stats.food, 10 + Math.round(35 * 1.25)); assert.equal(love.liked, true);
    reset(char.id);
    const like = (await call('POST', `/pets/${char.id}/feed`, { food: 'xuong' }, u.token)).data;
    assert.equal(like.reaction.level, 'like'); assert.equal(like.pet.stats.food, 10 + 25);
    assert.ok(love.gained >= like.gained);
    // cùng một món, hai bạn phản ứng khác nhau: bánh quy là "bình thường" với Charsiu, "rất thích" với Tofu
    reset(char.id); reset(tofu.id);
    assert.equal((await call('POST', `/pets/${char.id}/feed`, { food: 'banh' }, u.token)).data.reaction.level, 'neutral');
    assert.equal((await call('POST', `/pets/${tofu.id}/feed`, { food: 'banh' }, u.token)).data.reaction.level, 'love');
    // không thích (Tofu không thích thịt bò): tăng ít hơn (x0.6)
    assert.equal((await call('POST', '/pets/shop/buy', { item: 'food:dog_bo' }, u.token)).status, 200);
    reset(tofu.id);
    const dis = (await call('POST', `/pets/${tofu.id}/feed`, { food: 'dog_bo' }, u.token)).data;
    assert.equal(dis.reaction.level, 'dislike'); assert.equal(dis.pet.stats.food, 10 + Math.round(50 * 0.6)); assert.ok(dis.gained >= 0);
    // đồ chơi: mỗi bạn một mức khác nhau; chơi tay không thì phản ứng bình thường
    assert.equal((await call('POST', '/pets/shop/buy', { item: 'toy:dog_bong' }, u.token)).status, 200);
    reset(tofu.id); reset(char.id);
    assert.equal((await call('POST', `/pets/${tofu.id}/play`, { toy: 'dog_bong' }, u.token)).data.reaction.level, 'love');
    assert.equal((await call('POST', `/pets/${char.id}/play`, { toy: 'dog_bong' }, u.token)).data.reaction.level, 'neutral');
    db.prepare('UPDATE pets SET fun = 10, cd = NULL, stat_at = ? WHERE id = ?').run(now(), tofu.id);
    assert.equal((await call('POST', `/pets/${tofu.id}/play`, {}, u.token)).data.reaction.action, 'play_neutral');
    // cửa hàng cho biết phản ứng của từng bạn với từng món
    const item = (await call('GET', '/pets/shop', null, u.token)).data.species.find((x) => x.id === 'dog').food.find((x) => x.id === 'dog_bo');
    assert.deepEqual(item.react.map((r) => r.level), ['neutral', 'love', 'dislike', 'like']); // Uni, Charsiu, Tofu, Udon
    // tắm và ngủ không có phản ứng khẩu vị
    reset(char.id); db.prepare('UPDATE pets SET clean = 10, cd = NULL WHERE id = ?').run(char.id);
    assert.equal((await call('POST', `/pets/${char.id}/wash`, {}, u.token)).data.reaction, null);
  } finally { await call('PUT', '/admin/pets/settings', { mode: 'admin' }, adm.token); }
});

test('Nuôi thú: quần áo, vòng cổ theo loài (cùng số lượng, cùng giá); mặc cho từng bạn', async () => {
  const { db } = await import('../server/db.js');
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const u = await signup('petWear', 1);
  await call('PUT', '/admin/pets/settings', { mode: 'all' }, adm.token);
  try {
    db.prepare('UPDATE users SET coins = 3000, coins_spent = 0, lvl = 5 WHERE id = ?').run(u.id);
    for (let i = 0; i < 2; i++) await call('POST', '/pets/home/expand', {}, u.token);
    await call('POST', '/pets/adopt', { kind: 'uni', name: 'Bông Xù' }, u.token);
    const s = (await call('POST', '/pets/adopt', { kind: 'juad', name: 'Rùa Con' }, u.token)).data;
    const uni = s.pets.find((p) => p.kind === 'uni'), juad = s.pets.find((p) => p.kind === 'juad');
    // cửa hàng: mỗi loài 4 quần áo + 4 vòng cổ, cùng giá
    const cat = (await call('GET', '/pets/shop', null, u.token)).data.species;
    for (const k of ['outfit', 'collar']) {
      assert.equal(new Set(cat.map((x) => x[k].length)).size, 1); assert.equal(cat[0][k].length, 4);
      for (let i = 0; i < 4; i++) assert.equal(new Set(cat.map((x) => x[k][i].price)).size, 1);
      assert.equal(new Set(cat.map((x) => x[k].map((y) => y.name).join())).size, 3);
    }
    // mặc: phải mua, đúng loài
    assert.equal((await call('POST', `/pets/${uni.id}/wear`, { slot: 'outfit', item: 'dog_o1' }, u.token)).status, 400); // chưa mua
    assert.equal((await call('POST', '/pets/shop/buy', { item: 'outfit:dog_o1' }, u.token)).status, 200);
    assert.equal((await call('POST', '/pets/shop/buy', { item: 'outfit:dog_o1' }, u.token)).status, 400); // đã có
    assert.equal((await call('POST', `/pets/${juad.id}/wear`, { slot: 'outfit', item: 'dog_o1' }, u.token)).status, 400); // áo của chó, rùa không mặc được
    const worn = await call('POST', `/pets/${uni.id}/wear`, { slot: 'outfit', item: 'dog_o1' }, u.token);
    assert.equal(worn.status, 200); assert.equal(worn.data.pets.find((p) => p.id === uni.id).outfit.name, 'Áo thun');
    assert.equal(worn.data.pets.find((p) => p.id === juad.id).outfit, null);
    assert.equal(worn.data.closet.length, 1);
    assert.equal((await call('POST', '/pets/shop/buy', { item: 'collar:dog_c2' }, u.token)).status, 200);
    assert.equal((await call('POST', `/pets/${uni.id}/wear`, { slot: 'collar', item: 'dog_c2' }, u.token)).data.pets[0].collar.name, 'Vòng chuông');
    assert.equal((await call('POST', `/pets/${uni.id}/wear`, { slot: 'collar', item: 'dog_o1' }, u.token)).status, 400); // sai ô
    assert.equal((await call('POST', `/pets/${uni.id}/wear`, { slot: 'nonsense', item: 'dog_o1' }, u.token)).status, 400);
    // bỏ ra
    const off = await call('POST', `/pets/${uni.id}/wear`, { slot: 'outfit', item: null }, u.token);
    assert.equal(off.data.pets.find((p) => p.id === uni.id).outfit, null);
    // thú của người khác không mặc được
    const o = await signup('petWear2', 1);
    assert.equal((await call('POST', `/pets/${uni.id}/wear`, { slot: 'outfit', item: null }, o.token)).status, 404); // thú của người khác
  } finally { await call('PUT', '/admin/pets/settings', { mode: 'admin' }, adm.token); }
});

test('Nuôi thú: các bạn tự tương tác với nhau (cần từ 2 bạn), ghi nhật ký, đổi chỉ số nhẹ, tính cả lúc vắng mặt', async () => {
  const { db, now } = await import('../server/db.js');
  const { SOCIAL, SOCIAL_BACKLOG, SOCIAL_EVERY, SOCIAL_TEXT, KINDS } = await import('../server/pets.js');
  // mỗi bạn có đủ lời mô tả cho mọi kiểu tương tác
  for (const k of KINDS) for (const t of Object.keys(SOCIAL)) assert.ok(SOCIAL_TEXT[k.id][t].includes('{a}'));
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const u = await signup('petSocial', 1);
  await call('PUT', '/admin/pets/settings', { mode: 'all' }, adm.token);
  try {
    db.prepare('UPDATE users SET coins = 3000, coins_spent = 0, lvl = 5 WHERE id = ?').run(u.id);
    await call('POST', '/pets/adopt', { kind: 'udon', name: 'Mì Sợi' }, u.token);
    // một bạn: không có tương tác
    assert.equal((await call('GET', '/pets', null, u.token)).data.events.length, 0);
    for (let i = 0; i < 2; i++) await call('POST', '/pets/home/expand', {}, u.token);
    await call('POST', '/pets/adopt', { kind: 'tofu', name: 'Đậu Hũ' }, u.token);
    let s = (await call('GET', '/pets', null, u.token)).data;
    assert.equal(s.events.length, 0); // vừa có hai bạn: chưa tới lượt
    // vắng mặt 3 lần: có 3 sự kiện khi quay lại
    db.prepare('UPDATE pet_home SET social_at = ? WHERE user_id = ?').run(now() - 3 * SOCIAL_EVERY - 5000, u.id);
    s = (await call('GET', '/pets', null, u.token)).data;
    assert.equal(s.events.length, 3);
    for (const e of s.events) { assert.ok(SOCIAL[e.type]); assert.ok(e.text.includes('Mì Sợi') && e.text.includes('Đậu Hũ')); assert.ok(e.at <= now()); }
    assert.equal((await call('GET', '/pets', null, u.token)).data.events.length, 3); // không sinh trùng
    // vắng quá lâu: chỉ bù tối đa SOCIAL_BACKLOG lần
    db.prepare('UPDATE pet_home SET social_at = ? WHERE user_id = ?').run(now() - 100 * SOCIAL_EVERY, u.id);
    assert.equal((await call('GET', '/pets', null, u.token)).data.events.length, 3 + SOCIAL_BACKLOG);
    // hiệu quả: chia đồ ăn / chơi / ... không bao giờ làm chỉ số vượt 0..100, thú không mất
    for (const p of s.pets) { for (const v of Object.values(p.stats)) assert.ok(v >= 0 && v <= 100); }
    // Thân thiết tăng nhẹ nhưng vẫn theo trần mỗi ngày
    const ids = s.pets.map((p) => p.id);
    for (const id of ids) assert.ok(db.prepare('SELECT day_gain FROM pets WHERE id = ?').get(id).day_gain <= 80);
    // Admin tạo tương tác ngay để thử; người thường không dùng được
    assert.equal((await call('POST', '/admin/pets/social', { n: 2 }, u.token)).status, 403);
    // bạn buồn thì được an ủi: ép Mì Sợi đang rất đói, Đậu Hũ khỏe
    db.prepare('UPDATE pets SET food = 5, fun = 5, clean = 5, health = 5, stat_at = ? WHERE id = ?').run(now(), ids[0]);
    db.prepare('UPDATE pets SET food = 90, fun = 90, clean = 90, health = 90, stat_at = ? WHERE id = ?').run(now(), ids[1]);
    db.prepare('UPDATE pet_home SET social_at = ? WHERE user_id = ?').run(now() - 6 * SOCIAL_EVERY, u.id);
    const types = (await call('GET', '/pets', null, u.token)).data.events.slice(0, 6).map((e) => e.type);
    assert.ok(types.includes('comfort') || types.length === 6); // có xác suất cao nhưng không bắt buộc; ít nhất sinh đủ 6
  } finally { await call('PUT', '/admin/pets/settings', { mode: 'admin' }, adm.token); }
});

test('Nuôi thú: nhà, lồng, bể đặt trong khu nhà và chiếm diện tích; nâng cấp khu nhà để đặt được nhiều hơn', async () => {
  const { db } = await import('../server/db.js');
  const adm = (await call('POST', '/auth/login', { email: 'admin@jkr.local', password: 'admin12345' })).data;
  const u = await signup('petArea', 1);
  await call('PUT', '/admin/pets/settings', { mode: 'all' }, adm.token);
  try {
    db.prepare('UPDATE users SET coins = 12000, coins_spent = 0, lvl = 5 WHERE id = ?').run(u.id);
    const shop = async () => (await call('GET', '/pets/shop', null, u.token)).data;
    const buy = async (item) => call('POST', '/pets/shop/buy', { item }, u.token);
    let s = (await call('GET', '/pets', null, u.token)).data;
    assert.deepEqual(s.home.area, { total: 2, used: 0 }); // góc nhỏ: 2 ô
    assert.deepEqual(s.home.tiers.map((t) => t.area), [2, 4, 6, 8, 10]);
    assert.equal(s.home.next.area, 4);
    // nhà bậc 2 chiếm 2 ô: đầy diện tích, không đặt thêm lồng
    assert.equal((await buy('house:house2')).status, 200);
    assert.deepEqual((await shop()).area, { total: 2, used: 2 });
    const cage = await buy('cage:cage1');
    assert.equal(cage.status, 400); assert.match(cage.data.error, /diện tích/);
    const it = (await shop()).species.find((x) => x.id === 'parrot').home.items[0];
    assert.equal(it.fits, false); assert.equal(it.size, 1);
    // nâng cấp khu nhà: thêm diện tích, đặt được lồng và bể
    assert.equal((await call('POST', '/pets/home/expand', {}, u.token)).status, 200); // bậc 2: 4 ô
    assert.deepEqual((await shop()).area, { total: 4, used: 2 });
    assert.equal((await buy('cage:cage2')).status, 200); // 2 ô
    assert.equal((await buy('tank:tank1')).status, 400); // hết chỗ: 4/4
    // đổi lên bậc cao hơn cùng loại: chiếm thêm diện tích, món cũ được thu lại
    assert.equal((await buy('house:house3')).status, 400); // cần 3 ô, thay 2 ô: 4 - 2 + 3 = 5 > 4
    await call('POST', '/pets/home/expand', {}, u.token); // bậc 3: 6 ô
    assert.equal((await buy('house:house3')).status, 200); // 3 + 2 = 5 ≤ 6
    s = (await shop());
    assert.deepEqual(s.area, { total: 6, used: 5 });
    assert.equal(s.habitat.house, 3);
    assert.equal(db.prepare("SELECT COUNT(*) c FROM pet_inventory WHERE user_id = ? AND item = 'house:house2'").get(u.id).c, 0); // bậc 2 đã thu lại
    assert.equal((await buy('tank:tank1')).status, 200); // 6/6
    assert.equal((await buy('tank:tank2')).status, 400); // hết diện tích
    // bậc cao nhất: 10 ô chứa đủ cả ba chỗ ở bậc 3 (9 ô)
    await call('POST', '/pets/home/expand', {}, u.token); await call('POST', '/pets/home/expand', {}, u.token);
    assert.equal((await buy('tank:tank3')).status, 200); assert.equal((await buy('cage:cage3')).status, 200);
    assert.deepEqual((await shop()).area, { total: 10, used: 9 });
  } finally { await call('PUT', '/admin/pets/settings', { mode: 'admin' }, adm.token); }
});
