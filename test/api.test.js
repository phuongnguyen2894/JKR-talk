import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.DB_FILE = ':memory:';
process.env.PORT = '3998';
process.env.AUTO_VERIFY = '1';
process.env.REGISTER_RATE_LIMIT = '1000';
process.env.LOGIN_RATE_LIMIT = '1000';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'jkr-test-uploads');
const BASE = 'http://localhost:3998/api';

before(async () => {
  await import('../server/index.js');
});
after(() => setTimeout(() => process.exit(0), 50));

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
  const rp = await call('POST', '/reports', { messageId: msgs.at(-1).id, reason: 'spam' }, linh.token);
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
  assert.equal((await call('POST', `/groups/${trend.id}/messages`, { body: 'spam' }, nguoi.token)).status, 403);
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
