// Tiêu đề + nội dung bản tin theo ngôn ngữ người xem, kèm nhãn "Đã dịch tự động" và nút chuyển qua lại bản gốc.
import { esc, linkify, icon, actions, $ } from './core.js';
import { t } from './i18n.js';

const cache = new Map(); // id -> { n, orig }
const textHtml = (title, body) => `${title ? `<h2 style="font-size:18px">${esc(title)}</h2>` : ''}
  ${body ? `<p class="news-body clamp" style="white-space:pre-wrap;overflow-wrap:anywhere">${linkify(body)}</p><button type="button" class="link-btn news-more" data-act="news-more" hidden>${t('news.more')}</button>` : ''}`;
const trBar = (n, orig) => n.autoTranslated
  ? `<div class="tiny muted news-tr">${icon('globe', 13)}<span>${orig ? t('news.origNote') : t('news.autoTr')}</span><button type="button" class="link-btn" data-act="news-orig" data-id="${n.id}">${orig ? t('news.viewTr') : t('news.viewOrig')}</button></div>` : '';

export function newsText(n) {
  cache.set(n.id, { n, orig: false });
  return `<div class="news-text col" data-nid="${n.id}" style="gap:8px">${textHtml(n.title, n.body)}${trBar(n, false)}</div>`;
}
// sau khi vẽ: gỡ giới hạn dòng nếu bài ngắn, hiện nút "Xem thêm" nếu bài dài
export function fitNews(root) {
  root.querySelectorAll('.news-body').forEach((p) => { if (p.scrollHeight > p.clientHeight + 1) p.nextElementSibling.hidden = false; else p.classList.remove('clamp'); });
}
actions['news-orig'] = (el) => {
  const box = el.closest('.news-text'); const c = cache.get(Number(el.dataset.id)); if (!box || !c) return;
  c.orig = !c.orig;
  const { n } = c;
  box.innerHTML = `${c.orig ? textHtml(n.titleOrig, n.bodyOrig) : textHtml(n.title, n.body)}${trBar(n, c.orig)}`;
  fitNews(box);
};
