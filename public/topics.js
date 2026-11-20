// Chủ đề thảo luận: Admin / Mod tạo, mọi người vào bàn luận như một nhóm chat
import { $, esc, api, go, icon, fmtDateTime, toast, fail, ask, confirmBox, actions, refreshGroups, avatarR, roleOf, roleClass } from './core.js';

const ago = (t) => {
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
};

export async function renderTopics(view) {
  const { topics, canCreate } = await api('GET', '/topics');
  view.innerHTML = `<div class="page"><div class="page-inner">
    <div class="row between wrap"><h1>Chủ đề thảo luận</h1>${canCreate ? '<button class="btn primary" data-act="topic-new">Tạo chủ đề</button>' : ''}</div>
    <p class="small muted">Các chủ đề do Admin và Mod mở để mọi người cùng bàn luận. Bấm vào một chủ đề để đọc, bấm "Tham gia" để cùng trò chuyện.</p>
    <div class="list">${topics.map((t) => {
      const r = roleOf(t.creator);
      return `<article class="card col topic-card">
      <a class="topic-link" href="#/chat/${t.id}">
        <span class="topic-ic" aria-hidden="true">${icon('chat', 20)}</span>
        <span class="grow"><b class="topic-name">${esc(t.name)}</b>${t.joined ? ' <span class="pill">Đã tham gia</span>' : ''}
          ${t.description ? `<span class="small muted topic-desc">${esc(t.description)}</span>` : ''}
          <span class="tiny muted">${t.memberCount} thành viên · hoạt động ${ago(t.lastAt)}${t.creator ? ` · tạo bởi <span class="${roleClass(r).trim()}">${esc(t.creator.displayName)}</span>` : ''}</span></span>
      </a>
      <div class="row wrap" style="gap:6px"><button class="btn sm" data-act="share-topic" data-id="${t.id}" data-name="${esc(t.name)}">${icon('share', 15)} Chia sẻ</button>${t.canManage ? `<button class="btn sm" data-act="topic-edit" data-id="${t.id}" data-name="${esc(t.name)}" data-desc="${esc(t.description)}">Sửa</button><button class="btn sm danger" data-act="topic-del" data-id="${t.id}" data-name="${esc(t.name)}">Đóng chủ đề</button>` : ''}</div>
    </article>`;
    }).join('') || '<p class="muted">Chưa có chủ đề nào.</p>'}</div>
  </div></div>`;
}

const fields = (v = {}) => [
  { name: 'name', label: 'Tên chủ đề', value: v.name || '', required: true, max: 60 },
  { name: 'description', label: 'Mô tả ngắn (không bắt buộc)', type: 'textarea', value: v.description || '', max: 300 },
];
actions['topic-new'] = async () => {
  const v = await ask({ title: 'Tạo chủ đề thảo luận', text: 'Chủ đề hiện cho mọi người. Ai cũng có thể vào đọc và tham gia bàn luận, theo quy tắc cộng đồng.', fields: fields(), ok: 'Tạo' });
  if (!v) return;
  try {
    const { topic } = await api('POST', '/topics', v);
    await refreshGroups();
    toast('Đã tạo chủ đề');
    go(`#/chat/${topic.id}`);
  } catch (e) { fail(e); }
};
actions['topic-edit'] = async (el) => {
  const v = await ask({ title: 'Sửa chủ đề', fields: fields({ name: el.dataset.name, description: el.dataset.desc }), ok: 'Lưu' });
  if (!v) return;
  try { await api('PATCH', `/topics/${el.dataset.id}`, v); await refreshGroups(); renderTopics($('#view')); } catch (e) { fail(e); }
};
actions['topic-del'] = async (el) => {
  if (!(await confirmBox(`Đóng chủ đề "${el.dataset.name}"?`, 'Toàn bộ tin nhắn trong chủ đề sẽ bị xóa và thành viên sẽ nhận thông báo.', 'Đóng chủ đề', true))) return;
  try { await api('DELETE', `/topics/${el.dataset.id}`); await refreshGroups(); toast('Đã đóng chủ đề'); renderTopics($('#view')); } catch (e) { fail(e); }
};
