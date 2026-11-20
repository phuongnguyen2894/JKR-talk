// Chủ đề thảo luận: Admin / Mod tạo, mọi người vào bàn luận như một nhóm chat
import { $, esc, api, go, icon, fmtDateTime, toast, fail, ask, confirmBox, actions, refreshGroups, avatarR, roleOf, roleClass } from './core.js';

export const ago = (t) => {
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
};

// Nút tạo chủ đề + danh sách chủ đề của tôi đang chờ duyệt (dùng ở trang Chủ đề nóng và Tất cả chủ đề)
export const createTopicHtml = (needsApproval) => `<button class="btn primary" data-act="topic-new" data-approval="${needsApproval ? 1 : 0}">+ Tạo chủ đề</button>`;
export const pendingMineHtml = (mine = []) => mine.length ? `<section class="card col" style="gap:6px" aria-label="Chủ đề đang chờ duyệt">
  <div class="h2" style="margin:0">Đang chờ Admin duyệt</div>
  ${mine.map((t) => `<div class="row wrap" style="gap:8px"><span class="pill warn">Chờ duyệt</span><b class="grow">${esc(t.name)}</b><span class="tiny muted">${ago(t.createdAt)}</span><button class="btn sm" data-act="topic-withdraw" data-id="${t.id}">Rút lại</button></div>`).join('')}
  <p class="tiny muted" style="margin:0">Duyệt xong chủ đề sẽ hiện ở mục Chủ đề nóng và bạn nhận được thông báo.</p></section>` : '';

export async function renderTopics(view) {
  const { topics, mine, needsApproval, canHighlight } = await api('GET', '/topics');
  view.innerHTML = `<div class="page" id="topics-page"><div class="page-inner">
    <div class="row between wrap"><h1>Chủ đề thảo luận</h1>${createTopicHtml(needsApproval)}</div>
    <p class="small muted">Ai cũng có thể đề xuất chủ đề; chủ đề của người dùng sẽ hiện sau khi Admin duyệt. Bấm vào một chủ đề để đọc và cùng trò chuyện.</p>
    ${pendingMineHtml(mine)}
    <div class="list">${topics.map((t) => {
      const r = roleOf(t.creator);
      return `<article class="card col topic-card${t.highlighted ? ' hl' : ''}">
      <a class="topic-link" href="#/chat/${t.id}">
        <span class="topic-ic" aria-hidden="true">${icon(t.highlighted ? 'star' : 'chat', 20)}</span>
        <span class="grow">${t.highlighted ? '<span class="hl-pill">★ Nổi bật</span>' : ''}<b class="topic-name">${esc(t.name)}</b>${t.joined ? ' <span class="pill">Đã tham gia</span>' : ''}
          ${t.description ? `<span class="small muted topic-desc">${esc(t.description)}</span>` : ''}
          <span class="tiny muted">${t.memberCount} thành viên · hoạt động ${ago(t.lastAt)}${t.creator ? ` · tạo bởi <span class="${roleClass(r).trim()}">${esc(t.creator.displayName)}</span>` : ''}</span></span>
      </a>
      <div class="row wrap" style="gap:6px"><button class="btn sm" data-act="share-topic" data-id="${t.id}" data-name="${esc(t.name)}">${icon('share', 15)} Chia sẻ</button>${canHighlight ? `<button class="btn sm" data-act="topic-hl" data-id="${t.id}" data-on="${t.highlighted ? 0 : 1}">${t.highlighted ? 'Bỏ nổi bật' : '★ Đặt nổi bật'}</button>` : ''}${t.canManage ? `<button class="btn sm" data-act="topic-edit" data-id="${t.id}" data-name="${esc(t.name)}" data-desc="${esc(t.description)}">Sửa</button><button class="btn sm danger" data-act="topic-del" data-id="${t.id}" data-name="${esc(t.name)}">Đóng chủ đề</button>` : ''}</div>
    </article>`;
    }).join('') || '<p class="muted">Chưa có chủ đề nào.</p>'}</div>
  </div></div>`;
}

const fields = (v = {}) => [
  { name: 'name', label: 'Tên chủ đề', value: v.name || '', required: true, max: 60 },
  { name: 'description', label: 'Mô tả ngắn (không bắt buộc)', type: 'textarea', value: v.description || '', max: 300 },
];
actions['topic-new'] = async (el) => {
  const approval = el?.dataset?.approval === '1';
  const v = await ask({ title: 'Tạo chủ đề thảo luận', text: approval ? 'Chủ đề của bạn sẽ được gửi cho Admin duyệt. Sau khi được duyệt, nó hiện ở mục Chủ đề nóng cho mọi người cùng bàn luận.' : 'Chủ đề hiện cho mọi người. Ai cũng có thể vào đọc và tham gia bàn luận, theo quy tắc cộng đồng.', fields: fields(), ok: approval ? 'Gửi duyệt' : 'Tạo' });
  if (!v) return;
  try {
    const r = await api('POST', '/topics', v);
    if (r.pending) { toast('Đã gửi chủ đề cho Admin duyệt. Bạn sẽ nhận thông báo khi có kết quả.', 6000); document.dispatchEvent(new CustomEvent('topics-changed')); return; }
    await refreshGroups();
    toast('Đã tạo chủ đề');
    go(`#/chat/${r.topic.id}`);
  } catch (e) { fail(e); }
};
actions['topic-withdraw'] = async (el) => {
  try { await api('DELETE', `/topics/pending/${el.dataset.id}`); toast('Đã rút lại chủ đề'); document.dispatchEvent(new CustomEvent('topics-changed')); } catch (e) { fail(e); }
};
document.addEventListener('topics-changed', () => { if ($('#topics-page')) renderTopics($('#view')).catch(() => {}); });
actions['topic-edit'] = async (el) => {
  const v = await ask({ title: 'Sửa chủ đề', fields: fields({ name: el.dataset.name, description: el.dataset.desc }), ok: 'Lưu' });
  if (!v) return;
  try { await api('PATCH', `/topics/${el.dataset.id}`, v); await refreshGroups(); renderTopics($('#view')); } catch (e) { fail(e); }
};
actions['topic-hl'] = async (el) => {
  const on = el.dataset.on === '1';
  try {
    await api('POST', `/topics/${el.dataset.id}/highlight`, { on });
    await refreshGroups();
    toast(on ? 'Đã đặt chủ đề nổi bật' : 'Đã bỏ nổi bật');
    renderTopics($('#view'));
  } catch (e) { fail(e); }
};
actions['topic-del'] = async (el) => {
  if (!(await confirmBox(`Đóng chủ đề "${el.dataset.name}"?`, 'Toàn bộ tin nhắn trong chủ đề sẽ bị xóa và thành viên sẽ nhận thông báo.', 'Đóng chủ đề', true))) return;
  try { await api('DELETE', `/topics/${el.dataset.id}`); await refreshGroups(); toast('Đã đóng chủ đề'); renderTopics($('#view')); } catch (e) { fail(e); }
};
