// Chữ do máy chủ tạo ra (lỗi, thông báo, tên nhóm cố định) theo ngôn ngữ người đọc: vi (gốc) / en / th / zh / es / pt.
// Lỗi: dịch tập trung ở bộ xử lý lỗi, tra theo câu tiếng Việt gốc (không phải sửa từng chỗ ném lỗi); câu có số dùng mẫu (PATTERNS).
// Thông báo: dịch theo ngôn ngữ của người nhận lúc tạo (notify nhận [khoá, biến]).
const IDX = { vi: 0, en: 1, th: 2, zh: 3, es: 4, pt: 5 };
export const isLangCode = (c) => typeof c === 'string' && c in IDX;
// ngôn ngữ của người gửi yêu cầu: header x-lang (app gửi kèm mọi yêu cầu), rồi tài khoản, rồi tiếng Việt
export const langOf = (req) => (isLangCode(req.get?.('x-lang')) ? req.get('x-lang') : isLangCode(req.user?.language) ? req.user.language : 'vi');
const fill = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : s);
const pick = (arr, lang) => arr[IDX[lang] ?? 0] || arr[1] || arr[0];

// ---- tên nhóm cố định ------------------------------------------------------------------
const REGION = {
  north: ['Miền Bắc', 'Northern Vietnam', 'ภาคเหนือ (เวียดนาม)', '越南北部', 'Norte de Vietnam', 'Norte do Vietnã'],
  central: ['Miền Trung', 'Central Vietnam', 'ภาคกลาง (เวียดนาม)', '越南中部', 'Centro de Vietnam', 'Centro do Vietnã'],
  south: ['Miền Nam', 'Southern Vietnam', 'ภาคใต้ (เวียดนาม)', '越南南部', 'Sur de Vietnam', 'Sul do Vietnã'],
};
const TREND = ['Đẩy trend', 'Boost trend', 'ดันเทรนด์', '推热门', 'Impulsar tendencia', 'Impulsionar trend'];
export const regionNameFor = (code, lang, fb) => (REGION[code] ? pick(REGION[code], lang) : fb);
export const trendNameFor = (lang) => pick(TREND, lang);
// tên thay thế khi không có tên (tài khoản đã xóa, nhân vật chưa đặt tên)
const NONAME = {
  user: ['Người dùng', 'User', 'ผู้ใช้', '用户', 'Usuario', 'Usuário'],
  fighter: ['Võ sĩ', 'Fighter', 'นักมวย', '拳手', 'Luchador', 'Lutador'],
};
export const noName = (kind, lang) => pick(NONAME[kind], lang);

// ---- thông báo (theo ngôn ngữ người nhận) -------------------------------------------------
const N = {
  welcome: ['Chào mừng bạn đến với JKR talks! Xem lời chào của mọi người ở mục Chào mừng của "{g}"', 'Welcome to JKR talks! See everyone’s greetings in the Welcome section of "{g}"', 'ยินดีต้อนรับสู่ JKR talks! ดูคำทักทายจากทุกคนได้ในส่วนต้อนรับของ "{g}"', '欢迎来到 JKR talks！在“{g}”的欢迎区查看大家的问候', '¡Te damos la bienvenida a JKR talks! Mira los saludos de todos en la sección Bienvenida de "{g}"', 'Boas-vindas ao JKR talks! Veja as saudações de todos na seção Boas-vindas de "{g}"'],
  trendSub: ['{u} gửi bài vào Đẩy trend, đang chờ duyệt', '{u} submitted a post to Boost trend, waiting for review', '{u} ส่งโพสต์เข้าดันเทรนด์ รออนุมัติ', '{u} 向推热门提交了帖子，等待审核', '{u} envió una publicación a Impulsar tendencia, en espera de revisión', '{u} enviou uma publicação para Impulsionar trend, aguardando revisão'],
  trendDup: ['Bài bạn gửi vào Đẩy trend chưa được đăng vì link đã có trong Đẩy trend', 'Your Boost trend post was not published because the link is already there', 'โพสต์ที่คุณส่งเข้าดันเทรนด์ยังไม่ได้เผยแพร่ เพราะลิงก์มีอยู่แล้ว', '你提交到推热门的帖子未发布，因为该链接已存在', 'Tu publicación en Impulsar tendencia no se publicó porque el enlace ya está ahí', 'Sua publicação em Impulsionar trend não foi publicada porque o link já está lá'],
  trendOk: ['Bài của bạn đã được duyệt và hiện trong Đẩy trend', 'Your post was approved and is now in Boost trend', 'โพสต์ของคุณได้รับอนุมัติและแสดงในดันเทรนด์แล้ว', '你的帖子已通过审核，显示在推热门中', 'Tu publicación fue aprobada y ya está en Impulsar tendencia', 'Sua publicação foi aprovada e já está em Impulsionar trend'],
  trendNo: ['Bài bạn gửi vào Đẩy trend chưa được duyệt{r}', 'Your Boost trend post was not approved{r}', 'โพสต์ที่คุณส่งเข้าดันเทรนด์ไม่ผ่านการอนุมัติ{r}', '你提交到推热门的帖子未通过审核{r}', 'Tu publicación en Impulsar tendencia no fue aprobada{r}', 'Sua publicação em Impulsionar trend não foi aprovada{r}'],
  topicOk: ['Chủ đề "{g}" của bạn đã được duyệt và hiện ở mục Chủ đề nóng', 'Your topic "{g}" was approved and now appears in Hot topics', 'หัวข้อ "{g}" ของคุณได้รับอนุมัติและแสดงในหัวข้อมาแรงแล้ว', '你的话题“{g}”已通过审核，显示在热门话题中', 'Tu tema "{g}" fue aprobado y ya aparece en Temas populares', 'Seu tópico "{g}" foi aprovado e já aparece em Tópicos em alta'],
  topicNo: ['Chủ đề "{g}" chưa được duyệt{r}', 'Your topic "{g}" was not approved{r}', 'หัวข้อ "{g}" ไม่ผ่านการอนุมัติ{r}', '话题“{g}”未通过审核{r}', 'Tu tema "{g}" no fue aprobado{r}', 'Seu tópico "{g}" não foi aprovado{r}'],
  topicPending: ['{u} đề xuất chủ đề "{g}" — đang chờ duyệt', '{u} suggested the topic "{g}" — waiting for review', '{u} เสนอหัวข้อ "{g}" — รออนุมัติ', '{u} 提议了话题“{g}”——等待审核', '{u} propuso el tema "{g}": en espera de revisión', '{u} sugeriu o tópico "{g}": aguardando revisão'],
  topicClosed: ['Chủ đề "{g}" đã được đóng', 'The topic "{g}" was closed', 'หัวข้อ "{g}" ถูกปิดแล้ว', '话题“{g}”已关闭', 'El tema "{g}" fue cerrado', 'O tópico "{g}" foi fechado'],
  hotComment: ['{u} đã bình luận tin của bạn ở Chủ đề nóng', '{u} commented on your message in Hot topics', '{u} แสดงความคิดเห็นในข้อความของคุณที่หัวข้อมาแรง', '{u} 在热门话题中评论了你的消息', '{u} comentó tu mensaje en Temas populares', '{u} comentou sua mensagem em Tópicos em alta'],
  mention: ['{u} đã nhắc đến bạn trong {g}', '{u} mentioned you in {g}', '{u} กล่าวถึงคุณใน {g}', '{u} 在 {g} 中提到了你', '{u} te mencionó en {g}', '{u} mencionou você em {g}'],
  mentionAll: ['{u} đã nhắc đến mọi người trong "{g}"', '{u} mentioned everyone in "{g}"', '{u} กล่าวถึงทุกคนใน "{g}"', '{u} 在“{g}”中提到了所有人', '{u} mencionó a todos en "{g}"', '{u} mencionou todo mundo em "{g}"'],
  dmWhere: ['tin nhắn riêng', 'a direct message', 'ข้อความส่วนตัว', '私信', 'un mensaje directo', 'uma mensagem direta'],
  welcomeFrom: ['{u} đã gửi lời chào mừng bạn trong "{g}"', '{u} sent you a welcome in "{g}"', '{u} ส่งคำต้อนรับถึงคุณใน "{g}"', '{u} 在“{g}”中向你发送了欢迎语', '{u} te envió una bienvenida en "{g}"', '{u} enviou boas-vindas para você em "{g}"'],
  reply: ['{u} đã trả lời tin của bạn trong "{g}"', '{u} replied to your message in "{g}"', '{u} ตอบกลับข้อความของคุณใน "{g}"', '{u} 在“{g}”中回复了你的消息', '{u} respondió a tu mensaje en "{g}"', '{u} respondeu sua mensagem em "{g}"'],
  react1: ['{u} đã react tin nhắn của bạn', '{u} reacted to your message', '{u} รีแอคข้อความของคุณ', '{u} 回应了你的消息', '{u} reaccionó a tu mensaje', '{u} reagiu à sua mensagem'],
  reactN: ['Tin nhắn của bạn đã nhận được {n} react', 'Your message has received {n} reactions', 'ข้อความของคุณได้รับ {n} รีแอคแล้ว', '你的消息已收到 {n} 个回应', 'Tu mensaje ha recibido {n} reacciones', 'Sua mensagem recebeu {n} reações'],
  msgDeleted: ['Tin nhắn của bạn trong "{g}" đã bị xóa. Lý do: {r}', 'Your message in "{g}" was deleted. Reason: {r}', 'ข้อความของคุณใน "{g}" ถูกลบ เหตุผล: {r}', '你在“{g}”中的消息已被删除。原因：{r}', 'Tu mensaje en "{g}" fue eliminado. Motivo: {r}', 'Sua mensagem em "{g}" foi apagada. Motivo: {r}'],
  muted: ['Bạn bị tắt tiếng {n} phút trong "{g}". Lý do: {r}', 'You were muted for {n} minutes in "{g}". Reason: {r}', 'คุณถูกปิดเสียง {n} นาทีใน "{g}" เหตุผล: {r}', '你在“{g}”被禁言 {n} 分钟。原因：{r}', 'Te silenciaron {n} minutos en "{g}". Motivo: {r}', 'Você foi silenciado por {n} minutos em "{g}". Motivo: {r}'],
  kicked: ['Bạn đã bị xóa khỏi "{g}". Lý do: {r}', 'You were removed from "{g}". Reason: {r}', 'คุณถูกนำออกจาก "{g}" เหตุผล: {r}', '你已被移出“{g}”。原因：{r}', 'Te quitaron de "{g}". Motivo: {r}', 'Você foi removido de "{g}". Motivo: {r}'],
  friendReq: ['{u} muốn kết bạn với bạn', '{u} wants to be your friend', '{u} อยากเป็นเพื่อนกับคุณ', '{u} 想加你为好友', '{u} quiere ser tu amigo', '{u} quer ser seu amigo'],
  friendOk: ['{u} đã chấp nhận lời mời kết bạn', '{u} accepted your friend request', '{u} ยอมรับคำขอเป็นเพื่อนแล้ว', '{u} 接受了你的好友请求', '{u} aceptó tu solicitud de amistad', '{u} aceitou seu pedido de amizade'],
  addedTo: ['{u} đã thêm bạn vào nhóm "{g}"', '{u} added you to the group "{g}"', '{u} เพิ่มคุณเข้ากลุ่ม "{g}"', '{u} 将你加入了群组“{g}”', '{u} te añadió al grupo "{g}"', '{u} adicionou você ao grupo "{g}"'],
  title: ['Bạn đã nhận danh hiệu {t}. Khung avatar và màu tên mới đang chờ bạn trong mục Danh hiệu.', 'You earned the title {t}. A new avatar frame and name color are waiting for you in Titles.', 'คุณได้รับฉายา {t} กรอบรูปโปรไฟล์และสีชื่อใหม่รอคุณอยู่ในหมวดฉายา', '你获得了称号 {t}。新的头像框和名字颜色已在“称号”中等你。', 'Conseguiste el título {t}. Un nuevo marco de avatar y color de nombre te esperan en Títulos.', 'Você conquistou o título {t}. Uma nova moldura de avatar e cor de nome esperam por você em Títulos.'],
  level1: ['Bạn đã nhận cấp 1 {l}. Xu tím bạn đã kiếm từ trước vẫn được giữ nguyên.', 'You reached level 1, {l}. Purple coins you already earned are kept.', 'คุณได้ระดับ 1 {l} แล้ว เหรียญม่วงที่ได้มาก่อนหน้ายังอยู่ครบ', '你已获得 1 级 {l}。之前获得的紫币会保留。', 'Llegaste al nivel 1, {l}. Conservas las monedas moradas que ya ganaste.', 'Você chegou ao nível 1, {l}. As moedas roxas que você já ganhou são mantidas.'],
  levelUp: ['Bạn đã lên {l} (cấp {n}). {p}', 'You reached {l} (level {n}). {p}', 'คุณเลื่อนเป็น {l} (ระดับ {n}) แล้ว {p}', '你已升到 {l}（{n} 级）。{p}', 'Subiste a {l} (nivel {n}). {p}', 'Você subiu para {l} (nível {n}). {p}'],
  mtExpired: ['Lời thách đấu tới {u} đã hết hạn, đã hoàn {n} xu', 'Your challenge to {u} expired; {n} coins refunded', 'คำท้าถึง {u} หมดเวลาแล้ว คืน {n} เหรียญ', '你对 {u} 的挑战已过期，已退还 {n} 紫币', 'Tu reto a {u} caducó; se te devolvieron {n} monedas', 'Seu desafio para {u} expirou; {n} moedas devolvidas'],
  mtChallenge: ['{u} thách bạn đấu Muay Thai, cược {n} xu. Trả lời trong 30 phút', '{u} challenged you to Muay Thai for {n} coins. Answer within 30 minutes', '{u} ท้าคุณชกมวยไทย เดิมพัน {n} เหรียญ ตอบภายใน 30 นาที', '{u} 向你发起泰拳挑战，押注 {n} 紫币。请在 30 分钟内回复', '{u} te retó a Muay Thai por {n} monedas. Responde en 30 minutos', '{u} desafiou você para Muay Thai valendo {n} moedas. Responda em 30 minutos'],
  mtAccepted: ['{u} đã chấp nhận, trận đang bắt đầu', '{u} accepted; the match is starting', '{u} ยอมรับแล้ว การชกกำลังเริ่ม', '{u} 已接受，比赛即将开始', '{u} aceptó; el combate está empezando', '{u} aceitou; a luta está começando'],
  mtDeclined: ['{u} đã từ chối lời thách đấu, đã hoàn {n} xu', '{u} declined your challenge; {n} coins refunded', '{u} ปฏิเสธคำท้า คืน {n} เหรียญ', '{u} 拒绝了你的挑战，已退还 {n} 紫币', '{u} rechazó tu reto; se te devolvieron {n} monedas', '{u} recusou seu desafio; {n} moedas devolvidas'],
  joinReq: ['{u} xin vào nhóm "{g}"', '{u} asked to join "{g}"', '{u} ขอเข้าร่วม "{g}"', '{u} 申请加入“{g}”', '{u} pidió unirse a "{g}"', '{u} pediu para entrar em "{g}"'],
  joinOk: ['Bạn đã được duyệt vào nhóm "{g}"', 'You were approved to join "{g}"', 'คุณได้รับอนุมัติให้เข้าร่วม "{g}"', '你已获准加入“{g}”', 'Te aprobaron para unirte a "{g}"', 'Você foi aprovado para entrar em "{g}"'],
  groupDissolved: ['Nhóm "{g}" đã được giải tán', 'The group "{g}" was deleted', 'กลุ่ม "{g}" ถูกยุบแล้ว', '群组“{g}”已解散', 'El grupo "{g}" fue disuelto', 'O grupo "{g}" foi desfeito'],
  msgDeletedNoG: ['Tin nhắn của bạn đã bị xóa. Lý do: {r}', 'Your message was deleted. Reason: {r}', 'ข้อความของคุณถูกลบ เหตุผล: {r}', '你的消息已被删除。原因：{r}', 'Tu mensaje fue eliminado. Motivo: {r}', 'Sua mensagem foi apagada. Motivo: {r}'],
  muted24: ['Bạn bị tắt tiếng 24 giờ trong "{g}". Lý do: {r}', 'You were muted for 24 hours in "{g}". Reason: {r}', 'คุณถูกปิดเสียง 24 ชั่วโมงใน "{g}" เหตุผล: {r}', '你在“{g}”被禁言 24 小时。原因：{r}', 'Te silenciaron 24 horas en "{g}". Motivo: {r}', 'Você foi silenciado por 24 horas em "{g}". Motivo: {r}'],
  warn: ['Cảnh cáo từ quản trị viên: {r}', 'Warning from the admins: {r}', 'คำเตือนจากผู้ดูแล: {r}', '管理员警告：{r}', 'Advertencia de los admins: {r}', 'Aviso dos admins: {r}'],
  reportDone: ['Báo cáo của bạn đã được xử lý. Cảm ơn bạn đã giúp giữ cộng đồng lành mạnh.', 'Your report has been handled. Thank you for helping keep the community healthy.', 'รายงานของคุณได้รับการจัดการแล้ว ขอบคุณที่ช่วยดูแลชุมชน', '你的举报已处理。感谢你帮助维护健康的社区。', 'Tu reporte fue atendido. Gracias por ayudar a mantener sana la comunidad.', 'Sua denúncia foi tratada. Obrigado por ajudar a manter a comunidade saudável.'],
  modOn: ['Bạn được trao quyền mod của nhóm "{g}"', 'You are now a mod of the group "{g}"', 'คุณได้รับสิทธิ์ม็อดของกลุ่ม "{g}"', '你已成为群组“{g}”的版主', 'Ahora eres mod del grupo "{g}"', 'Agora você é mod do grupo "{g}"'],
  modOff: ['Quyền mod của bạn đã được thu hồi', 'Your mod rights were removed', 'สิทธิ์ม็อดของคุณถูกเพิกถอนแล้ว', '你的版主权限已被收回', 'Se te retiraron los permisos de mod', 'Seus direitos de mod foram removidos'],
  adminOn: ['Bạn được trao quyền Admin', 'You are now an admin', 'คุณได้รับสิทธิ์แอดมิน', '你已获得管理员权限', 'Ahora eres admin', 'Agora você é admin'],
  adminOff: ['Quyền Admin của bạn đã được thu hồi', 'Your admin rights were removed', 'สิทธิ์แอดมินของคุณถูกเพิกถอนแล้ว', '你的管理员权限已被收回', 'Se te retiraron los permisos de admin', 'Seus direitos de admin foram removidos'],
  everyonePush: ['📣 {u} @everyone · {g}: {b}', '📣 {u} @everyone · {g}: {b}', '📣 {u} @everyone · {g}: {b}', '📣 {u} @everyone · {g}：{b}', '📣 {u} @everyone · {g}: {b}', '📣 {u} @everyone · {g}: {b}'],
  newNotice: ['Có thông báo mới', 'New announcement', 'มีประกาศใหม่', '有新通知', 'Nuevo aviso', 'Novo aviso'],
  sameArea: ['Cùng khu vực với bạn', 'In your area', 'อยู่ในพื้นที่เดียวกับคุณ', '与你同一地区', 'En tu zona', 'Na sua região'],
};
// tên cấp, đặc quyền, danh hiệu dùng trong thông báo
const LV = {
  1: ['Tím Mầm Non', 'Purple Sprout', 'ม่วงต้นกล้า', '紫芽', 'Brote Morado', 'Broto Roxo'],
  2: ['Tím Sương Sương', 'Purple Mist', 'ม่วงสายหมอก', '紫雾', 'Niebla Morada', 'Névoa Roxa'],
  3: ['Tím Mộng Mơ', 'Purple Dream', 'ม่วงช่างฝัน', '紫梦', 'Sueño Morado', 'Sonho Roxo'],
  4: ['Tím Thủy Chung', 'Purple Devotion', 'ม่วงรักมั่น', '紫恒', 'Devoción Morada', 'Devoção Roxa'],
  5: ['Tím Thủy Tổ', 'Purple Ancestor', 'ม่วงต้นตระกูล', '紫祖', 'Ancestro Morado', 'Ancestral Roxo'],
};
const PERK = {
  2: ['Khung avatar tím.', 'A purple avatar frame.', 'กรอบรูปโปรไฟล์สีม่วง', '紫色头像框。', 'Un marco de avatar morado.', 'Uma moldura de avatar roxa.'],
  3: ['Từ giờ bạn có thể gửi link vào Đẩy trend.', 'You can now post links in Boost trend.', 'ตอนนี้คุณส่งลิงก์ในดันเทรนด์ได้แล้ว', '现在你可以在推热门中发布链接了。', 'Ahora puedes publicar enlaces en Impulsar tendencia.', 'Agora você pode publicar links em Impulsionar trend.'],
  4: ['Từ giờ bạn tạo chủ đề không cần duyệt và đăng được bài lên Bản tin.', 'You can now create topics without review and post to News.', 'ตอนนี้คุณสร้างหัวข้อได้โดยไม่ต้องรออนุมัติ และโพสต์ลงข่าวสารได้', '现在你创建话题无需审核，并可发布资讯。', 'Ahora puedes crear temas sin revisión y publicar en Noticias.', 'Agora você pode criar tópicos sem revisão e publicar em Notícias.'],
  5: ['Từ giờ bạn thêm ngay được bất kỳ ai vào nhóm riêng của mình, không cần kết bạn.', 'You can now add anyone to your private groups right away, without being friends.', 'ตอนนี้คุณเพิ่มใครก็ได้เข้ากลุ่มส่วนตัวได้ทันที ไม่ต้องเป็นเพื่อน', '现在你可以直接将任何人加入你的私密群组，无需加好友。', 'Ahora puedes añadir a cualquiera a tus grupos privados al instante, sin ser amigos.', 'Agora você pode adicionar qualquer pessoa aos seus grupos privados na hora, sem serem amigos.'],
};
const TITLE = {
  bot_trend: ['Bot trend', 'Bot trend', 'Bot trend', 'Bot trend', 'Bot trend', 'Bot trend'],
  bot_trend_cao_thu: ['Bot trend cao thủ', 'Bot trend Master', 'Bot trend ระดับเซียน', 'Bot trend 高手', 'Bot trend Experto', 'Bot trend Mestre'],
  bot_trend_huyen_thoai: ['Bot trend huyền thoại', 'Bot trend Legend', 'Bot trend ระดับตำนาน', 'Bot trend 传奇', 'Bot trend Leyenda', 'Bot trend Lenda'],
};
const REASON_SEP = [': ', ': ', ': ', '：', ': ', ': '];
// Thông báo: nt('mention', lang, { u, g }). Biến đặc biệt: lv (số cấp) → {l} tên cấp, {p} đặc quyền; ti (khoá danh hiệu) → {t}; reason → {r} có dấu hai chấm
export function nt(key, lang, vars = {}) {
  const v = { ...vars };
  if (v.lv) { v.l = pick(LV[v.lv], lang); v.p = PERK[v.lv] ? pick(PERK[v.lv], lang) : ''; v.n ??= v.lv; }
  if (v.ti) v.t = TITLE[v.ti] ? pick(TITLE[v.ti], lang) : v.ti;
  if ('reason' in v) v.r = v.reason ? pick(REASON_SEP, lang) + v.reason : '';
  if (v.where === 'dm') v.g = pick(N.dmWhere, lang);
  return N[key] ? fill(pick(N[key], lang), v) : key;
}

// ---- lỗi -------------------------------------------------------------------------------
// [en, th, zh, es, pt] theo câu tiếng Việt gốc
const E = {
  'Bạn không có quyền thực hiện thao tác này': ['You do not have permission to do this', 'คุณไม่มีสิทธิ์ทำสิ่งนี้', '你没有权限执行此操作', 'No tienes permiso para hacer esto', 'Você não tem permissão para fazer isso'],
  'Không tìm thấy': ['Not found', 'ไม่พบ', '未找到', 'No encontrado', 'Não encontrado'],
  'Vui lòng đăng nhập': ['Please log in', 'โปรดเข้าสู่ระบบ', '请先登录', 'Inicia sesión', 'Faça login'],
  'Tài khoản không tồn tại': ['This account does not exist', 'ไม่มีบัญชีนี้', '账号不存在', 'Esta cuenta no existe', 'Esta conta não existe'],
  'Tài khoản đang bị khóa tạm thời': ['This account is temporarily locked', 'บัญชีถูกล็อกชั่วคราว', '账号已被临时锁定', 'Esta cuenta está bloqueada temporalmente', 'Esta conta está bloqueada temporariamente'],
  'Tài khoản đã bị khóa': ['This account has been locked', 'บัญชีถูกล็อกแล้ว', '账号已被锁定', 'Esta cuenta ha sido bloqueada', 'Esta conta foi bloqueada'],
  'Email hoặc mật khẩu không đúng': ['Incorrect email or password', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', '邮箱或密码错误', 'Correo o contraseña incorrectos', 'E-mail ou senha incorretos'],
  'Dữ liệu quá lớn': ['The data is too large', 'ข้อมูลใหญ่เกินไป', '数据过大', 'Los datos son demasiado grandes', 'Os dados são grandes demais'],
  'Dữ liệu không hợp lệ': ['Invalid data', 'ข้อมูลไม่ถูกต้อง', '数据无效', 'Datos no válidos', 'Dados inválidos'],
  'Lỗi máy chủ': ['Server error', 'เซิร์ฟเวอร์ขัดข้อง', '服务器错误', 'Error del servidor', 'Erro no servidor'],
  'Tin nhắn không tồn tại': ['This message does not exist', 'ไม่มีข้อความนี้', '消息不存在', 'Este mensaje no existe', 'Esta mensagem não existe'],
  'Không tìm thấy nhóm': ['Group not found', 'ไม่พบกลุ่ม', '未找到群组', 'Grupo no encontrado', 'Grupo não encontrado'],
  'Vui lòng chọn tỉnh/thành': ['Please choose a province/city', 'โปรดเลือกจังหวัด/เมือง', '请选择省/市', 'Elige una provincia/ciudad', 'Escolha uma província/cidade'],
  'Không tìm thấy người dùng': ['User not found', 'ไม่พบผู้ใช้', '未找到用户', 'Usuario no encontrado', 'Usuário não encontrado'],
  'Không tìm thấy chủ đề': ['Topic not found', 'ไม่พบหัวข้อ', '未找到话题', 'Tema no encontrado', 'Tópico não encontrado'],
  'Bạn đang bị tắt tiếng trong nhóm này': ['You are muted in this group', 'คุณถูกปิดเสียงในกลุ่มนี้', '你在此群组中被禁言', 'Estás silenciado en este grupo', 'Você está silenciado neste grupo'],
  'Tên nhóm cần ít nhất 2 ký tự': ['Group name needs at least 2 characters', 'ชื่อกลุ่มต้องมีอย่างน้อย 2 ตัวอักษร', '群组名称至少需要 2 个字符', 'El nombre del grupo necesita al menos 2 caracteres', 'O nome do grupo precisa de pelo menos 2 caracteres'],
  'Tên hiển thị này đã có người dùng, hãy chọn tên khác': ['This display name is taken; please choose another', 'ชื่อที่แสดงนี้มีคนใช้แล้ว โปรดเลือกชื่ออื่น', '该显示名称已被使用，请换一个', 'Este nombre ya está en uso; elige otro', 'Este nome já está em uso; escolha outro'],
  'Tên hiển thị không được trùng email': ['Display name cannot be your email', 'ชื่อที่แสดงต้องไม่ซ้ำกับอีเมล', '显示名称不能与邮箱相同', 'El nombre no puede ser tu correo', 'O nome não pode ser seu e-mail'],
  'Tên hiển thị cần ít nhất 2 ký tự': ['Display name needs at least 2 characters', 'ชื่อที่แสดงต้องมีอย่างน้อย 2 ตัวอักษร', '显示名称至少需要 2 个字符', 'El nombre necesita al menos 2 caracteres', 'O nome precisa de pelo menos 2 caracteres'],
  'Tên chủ đề cần ít nhất 2 ký tự': ['Topic name needs at least 2 characters', 'ชื่อหัวข้อต้องมีอย่างน้อย 2 ตัวอักษร', '话题名称至少需要 2 个字符', 'El nombre del tema necesita al menos 2 caracteres', 'O nome do tópico precisa de pelo menos 2 caracteres'],
  'Thành viên không hợp lệ': ['Invalid member', 'สมาชิกไม่ถูกต้อง', '成员无效', 'Miembro no válido', 'Membro inválido'],
  'Nhóm này không có mục Chào mừng': ['This group has no Welcome section', 'กลุ่มนี้ไม่มีส่วนต้อนรับ', '此群组没有欢迎区', 'Este grupo no tiene sección de Bienvenida', 'Este grupo não tem seção de Boas-vindas'],
  'Mật khẩu xác nhận không khớp': ['Passwords do not match', 'รหัสผ่านไม่ตรงกัน', '两次输入的密码不一致', 'Las contraseñas no coinciden', 'As senhas não coincidem'],
  'Không tìm thấy nhóm công khai': ['Public group not found', 'ไม่พบกลุ่มสาธารณะ', '未找到公开群组', 'Grupo público no encontrado', 'Grupo público não encontrado'],
  'Không tìm thấy emoji': ['Emoji not found', 'ไม่พบอีโมจิ', '未找到表情', 'Emoji no encontrado', 'Emoji não encontrado'],
  'Không thể nhắn tin cho người này': ['You cannot message this person', 'ส่งข้อความถึงผู้ใช้นี้ไม่ได้', '无法给此人发消息', 'No puedes enviar mensajes a esta persona', 'Você não pode enviar mensagens para esta pessoa'],
  'Hãy nhập tiêu đề, nội dung hoặc chọn ảnh': ['Enter a title or content, or choose a photo', 'ใส่หัวข้อ เนื้อหา หรือเลือกรูปภาพ', '请输入标题、内容或选择图片', 'Escribe un título o contenido, o elige una foto', 'Digite um título ou conteúdo, ou escolha uma foto'],
  'Giá trị không hợp lệ': ['Invalid value', 'ค่าไม่ถูกต้อง', '值无效', 'Valor no válido', 'Valor inválido'],
  'Chủ đề này không còn chờ duyệt': ['This topic is no longer waiting for review', 'หัวข้อนี้ไม่ได้รออนุมัติแล้ว', '此话题已不在审核中', 'Este tema ya no está en revisión', 'Este tópico não está mais em revisão'],
  'Bản tin không tồn tại': ['This news post does not exist', 'ไม่มีข่าวนี้', '该资讯不存在', 'Esta noticia no existe', 'Esta notícia não existe'],
  'Bạn cần xác nhận đã đọc quy tắc cộng đồng trước khi chat': ['Please confirm you have read the community rules before chatting', 'โปรดยืนยันว่าอ่านกฎของชุมชนแล้วก่อนแชท', '聊天前请确认已阅读社区规则', 'Confirma que leíste las normas de la comunidad antes de chatear', 'Confirme que leu as regras da comunidade antes de conversar'],
  'Ảnh quá lớn (tối đa 2MB)': ['Image is too large (max 2MB)', 'รูปภาพใหญ่เกินไป (สูงสุด 2MB)', '图片太大（最大 2MB）', 'La imagen es demasiado grande (máx. 2 MB)', 'Imagem grande demais (máx. 2 MB)'],
  'Ảnh không hợp lệ': ['Invalid image', 'รูปภาพไม่ถูกต้อง', '图片无效', 'Imagen no válida', 'Imagem inválida'],
  'Đăng ký thông báo không hợp lệ': ['Invalid notification subscription', 'การสมัครรับการแจ้งเตือนไม่ถูกต้อง', '通知订阅无效', 'Suscripción de notificaciones no válida', 'Inscrição de notificações inválida'],
  'Đã có lời mời đang chờ': ['A request is already pending', 'มีคำขอที่รออยู่แล้ว', '已有待处理的请求', 'Ya hay una solicitud pendiente', 'Já existe um pedido pendente'],
  'Yêu cầu không còn tồn tại': ['This request no longer exists', 'คำขอนี้ไม่มีอยู่แล้ว', '该请求已不存在', 'Esta solicitud ya no existe', 'Este pedido não existe mais'],
  'Yêu cầu của bạn đang chờ duyệt': ['Your request is waiting for approval', 'คำขอของคุณรออนุมัติ', '你的请求正在等待审核', 'Tu solicitud está esperando aprobación', 'Seu pedido está aguardando aprovação'],
  'Vui lòng nêu lý do': ['Please give a reason', 'โปรดระบุเหตุผล', '请说明原因', 'Indica un motivo', 'Informe um motivo'],
  'Vui lòng nhập tiêu đề lỗi (ít nhất 3 ký tự)': ['Please enter a title (at least 3 characters)', 'โปรดใส่หัวข้อ (อย่างน้อย 3 ตัวอักษร)', '请输入标题（至少 3 个字符）', 'Escribe un título (al menos 3 caracteres)', 'Digite um título (pelo menos 3 caracteres)'],
  'Vui lòng mô tả lỗi rõ hơn (ít nhất 10 ký tự)': ['Please describe the problem in more detail (at least 10 characters)', 'โปรดอธิบายปัญหาให้ละเอียดขึ้น (อย่างน้อย 10 ตัวอักษร)', '请更详细地描述问题（至少 10 个字符）', 'Describe el problema con más detalle (al menos 10 caracteres)', 'Descreva o problema com mais detalhes (pelo menos 10 caracteres)'],
  'Tỉnh/thành không hợp lệ': ['Invalid province/city', 'จังหวัด/เมืองไม่ถูกต้อง', '省/市无效', 'Provincia/ciudad no válida', 'Província/cidade inválida'],
  'Tệp ảnh không hợp lệ': ['Invalid image file', 'ไฟล์รูปภาพไม่ถูกต้อง', '图片文件无效', 'Archivo de imagen no válido', 'Arquivo de imagem inválido'],
  'Tin nhắn trống': ['The message is empty', 'ข้อความว่างเปล่า', '消息为空', 'El mensaje está vacío', 'A mensagem está vazia'],
  'Tin nhắn không tồn tại trong nhóm này': ['This message is not in this group', 'ไม่มีข้อความนี้ในกลุ่มนี้', '此群组中没有这条消息', 'Este mensaje no está en este grupo', 'Esta mensagem não está neste grupo'],
  'Tin nhắn gốc không còn': ['The original message is gone', 'ข้อความต้นฉบับไม่มีแล้ว', '原消息已不存在', 'El mensaje original ya no existe', 'A mensagem original não existe mais'],
  'Thời gian không hợp lệ': ['Invalid time', 'เวลาไม่ถูกต้อง', '时间无效', 'Tiempo no válido', 'Tempo inválido'],
  'Quốc gia không hợp lệ': ['Invalid country', 'ประเทศไม่ถูกต้อง', '国家无效', 'País no válido', 'País inválido'],
  'Nhóm đã đầy, không thể thêm thành viên': ['The group is full; no more members can be added', 'กลุ่มเต็มแล้ว เพิ่มสมาชิกไม่ได้', '群组已满，无法添加成员', 'El grupo está lleno; no se pueden añadir más miembros', 'O grupo está cheio; não dá para adicionar membros'],
  'Nhóm cần ít nhất 1 admin': ['The group needs at least 1 admin', 'กลุ่มต้องมีแอดมินอย่างน้อย 1 คน', '群组至少需要 1 名管理员', 'El grupo necesita al menos 1 admin', 'O grupo precisa de pelo menos 1 admin'],
  'Người này không ở trong nhóm': ['This person is not in the group', 'ผู้ใช้นี้ไม่ได้อยู่ในกลุ่ม', '此人不在群组中', 'Esta persona no está en el grupo', 'Esta pessoa não está no grupo'],
  'Người dùng không tồn tại': ['This user does not exist', 'ไม่มีผู้ใช้นี้', '用户不存在', 'Este usuario no existe', 'Este usuário não existe'],
  'Người dùng không hợp lệ': ['Invalid user', 'ผู้ใช้ไม่ถูกต้อง', '用户无效', 'Usuario no válido', 'Usuário inválido'],
  'Ngôn ngữ không hợp lệ': ['Invalid language', 'ภาษาไม่ถูกต้อง', '语言无效', 'Idioma no válido', 'Idioma inválido'],
  'Mỗi tin nhắn gửi kèm tối đa 4 ảnh': ['Up to 4 photos per message', 'แนบรูปได้สูงสุด 4 รูปต่อข้อความ', '每条消息最多 4 张图片', 'Máximo 4 fotos por mensaje', 'Máximo de 4 fotos por mensagem'],
  'Mật khẩu quá dài': ['The password is too long', 'รหัสผ่านยาวเกินไป', '密码过长', 'La contraseña es demasiado larga', 'A senha é longa demais'],
  'Mật khẩu mới phải khác mật khẩu hiện tại': ['The new password must be different from the current one', 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน', '新密码必须与当前密码不同', 'La nueva contraseña debe ser distinta de la actual', 'A nova senha deve ser diferente da atual'],
  'Mật khẩu mới cần ít nhất 8 ký tự': ['The new password needs at least 8 characters', 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร', '新密码至少需要 8 个字符', 'La nueva contraseña necesita al menos 8 caracteres', 'A nova senha precisa de pelo menos 8 caracteres'],
  'Mật khẩu không đúng': ['Incorrect password', 'รหัสผ่านไม่ถูกต้อง', '密码错误', 'Contraseña incorrecta', 'Senha incorreta'],
  'Mật khẩu hiện tại không đúng': ['The current password is incorrect', 'รหัสผ่านปัจจุบันไม่ถูกต้อง', '当前密码错误', 'La contraseña actual es incorrecta', 'A senha atual está incorreta'],
  'Mật khẩu cần ít nhất 8 ký tự': ['Password needs at least 8 characters', 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', '密码至少需要 8 个字符', 'La contraseña necesita al menos 8 caracteres', 'A senha precisa de pelo menos 8 caracteres'],
  'Lời mời không còn tồn tại': ['This invitation no longer exists', 'คำเชิญนี้ไม่มีอยู่แล้ว', '该邀请已不存在', 'Esta invitación ya no existe', 'Este convite não existe mais'],
  'Loại bình luận không hợp lệ': ['Invalid comment type', 'ประเภทความคิดเห็นไม่ถูกต้อง', '评论类型无效', 'Tipo de comentario no válido', 'Tipo de comentário inválido'],
  'Không tìm thấy ảnh đã tải lên': ['Uploaded image not found', 'ไม่พบรูปภาพที่อัปโหลด', '未找到已上传的图片', 'No se encontró la imagen subida', 'Imagem enviada não encontrada'],
  'Không tìm thấy thành viên mới này': ['This new member was not found', 'ไม่พบสมาชิกใหม่นี้', '未找到这位新成员', 'No se encontró a este nuevo miembro', 'Este novo membro não foi encontrado'],
  'Không tìm thấy nhân vật': ['Character not found', 'ไม่พบตัวละคร', '未找到角色', 'Personaje no encontrado', 'Personagem não encontrado'],
  'Không tìm thấy người dùng (hoặc tài khoản đang bị khóa)': ['User not found (or the account is locked)', 'ไม่พบผู้ใช้ (หรือบัญชีถูกล็อก)', '未找到用户（或账号已被锁定）', 'Usuario no encontrado (o la cuenta está bloqueada)', 'Usuário não encontrado (ou a conta está bloqueada)'],
  'Không tìm thấy bản tin của bạn': ['Your news post was not found', 'ไม่พบข่าวของคุณ', '未找到你的资讯', 'No se encontró tu noticia', 'Sua notícia não foi encontrada'],
  'Không tìm thấy bài chờ duyệt': ['Pending post not found', 'ไม่พบโพสต์ที่รออนุมัติ', '未找到待审核的帖子', 'No se encontró la publicación pendiente', 'Publicação pendente não encontrada'],
  'Không thể rời nhóm Đẩy trend': ['You cannot leave Boost trend', 'ออกจากกลุ่มดันเทรนด์ไม่ได้', '无法退出推热门', 'No puedes salir de Impulsar tendencia', 'Você não pode sair de Impulsionar trend'],
  'Không thể rời nhóm quốc gia': ['You cannot leave the country group', 'ออกจากกลุ่มประเทศไม่ได้', '无法退出国家群组', 'No puedes salir del grupo del país', 'Você não pode sair do grupo do país'],
  'Không thể rời cuộc trò chuyện 1-1': ['You cannot leave a one-to-one chat', 'ออกจากแชท 1 ต่อ 1 ไม่ได้', '无法退出一对一聊天', 'No puedes salir de un chat individual', 'Você não pode sair de uma conversa individual'],
  'Không thể kết bạn với admin hệ thống': ['You cannot add a system admin as a friend', 'เพิ่มผู้ดูแลระบบเป็นเพื่อนไม่ได้', '无法添加系统管理员为好友', 'No puedes agregar a un admin del sistema como amigo', 'Você não pode adicionar um admin do sistema como amigo'],
  'Không thể gửi lời mời kết bạn cho người này': ['You cannot send a friend request to this person', 'ส่งคำขอเป็นเพื่อนถึงผู้ใช้นี้ไม่ได้', '无法向此人发送好友请求', 'No puedes enviar una solicitud de amistad a esta persona', 'Você não pode enviar um pedido de amizade para esta pessoa'],
  'Không thể gửi lời chào cho người này': ['You cannot send a welcome to this person', 'ส่งคำทักทายถึงผู้ใช้นี้ไม่ได้', '无法向此人发送欢迎语', 'No puedes enviar una bienvenida a esta persona', 'Você não pode enviar boas-vindas para esta pessoa'],
  'Không thể chuyển tiếp tin từ nhóm riêng bạn chưa tham gia': ['You cannot forward from a private group you have not joined', 'ส่งต่อจากกลุ่มส่วนตัวที่คุณไม่ได้เข้าร่วมไม่ได้', '无法转发你未加入的私密群组中的消息', 'No puedes reenviar desde un grupo privado al que no perteneces', 'Você não pode encaminhar de um grupo privado do qual não participa'],
  'Không có gì để lưu': ['Nothing to save', 'ไม่มีอะไรให้บันทึก', '没有需要保存的内容', 'No hay nada que guardar', 'Nada para salvar'],
  'Hãy viết vài chữ chào mừng': ['Please write a few words of welcome', 'โปรดเขียนคำทักทายสักเล็กน้อย', '请写几句欢迎语', 'Escribe unas palabras de bienvenida', 'Escreva algumas palavras de boas-vindas'],
  'Hãy gỡ quyền admin trước khi xóa': ['Remove admin rights before deleting', 'ถอดสิทธิ์แอดมินก่อนลบ', '删除前请先取消管理员权限', 'Quita los permisos de admin antes de eliminar', 'Remova os direitos de admin antes de apagar'],
  'Hành động không hợp lệ': ['Invalid action', 'การกระทำไม่ถูกต้อง', '操作无效', 'Acción no válida', 'Ação inválida'],
  'Hiện app mới hỗ trợ Việt Nam': ['The app currently supports Vietnam only', 'ตอนนี้แอปรองรับเฉพาะเวียดนาม', '目前应用仅支持越南', 'Por ahora la app solo admite Vietnam', 'No momento o app só aceita o Vietnã'],
  'Hai bạn đã là bạn bè': ['You are already friends', 'คุณเป็นเพื่อนกันอยู่แล้ว', '你们已经是好友了', 'Ya son amigos', 'Vocês já são amigos'],
  'Giới hạn nhỏ hơn số thành viên hiện tại': ['The limit is lower than the current number of members', 'จำนวนจำกัดน้อยกว่าจำนวนสมาชิกปัจจุบัน', '上限低于当前成员数', 'El límite es menor que el número actual de miembros', 'O limite é menor que o número atual de membros'],
  'Email này đã được dùng': ['This email is already in use', 'อีเมลนี้ถูกใช้แล้ว', '该邮箱已被使用', 'Este correo ya está en uso', 'Este e-mail já está em uso'],
  'Email không hợp lệ': ['Invalid email', 'อีเมลไม่ถูกต้อง', '邮箱无效', 'Correo no válido', 'E-mail inválido'],
  'Danh sách ảnh không hợp lệ': ['Invalid photo list', 'รายการรูปภาพไม่ถูกต้อง', '图片列表无效', 'Lista de fotos no válida', 'Lista de fotos inválida'],
  'Cần đạt cấp Tím Thủy Tổ để tìm người dùng': ['You need Purple Ancestor level to search users', 'ต้องถึงระดับม่วงต้นตระกูลจึงจะค้นหาผู้ใช้ได้', '需达到紫祖等级才能搜索用户', 'Necesitas el nivel Ancestro Morado para buscar usuarios', 'Você precisa do nível Ancestral Roxo para buscar usuários'],
  'Cần đạt cấp Tím Thủy Chung để đăng bản tin': ['You need Purple Devotion level to post news', 'ต้องถึงระดับม่วงรักมั่นจึงจะโพสต์ข่าวได้', '需达到紫恒等级才能发布资讯', 'Necesitas el nivel Devoción Morada para publicar noticias', 'Você precisa do nível Devoção Roxa para publicar notícias'],
  'Chỉ nhắn tin riêng được khi đã là bạn bè': ['You can only send direct messages to friends', 'ส่งข้อความส่วนตัวได้เฉพาะกับเพื่อน', '只能给好友发私信', 'Solo puedes enviar mensajes directos a amigos', 'Você só pode enviar mensagens diretas para amigos'],
  'Chỉ nhận ảnh PNG, JPG, GIF hoặc WebP': ['Only PNG, JPG, GIF or WebP images are accepted', 'รองรับเฉพาะรูป PNG, JPG, GIF หรือ WebP', '仅支持 PNG、JPG、GIF 或 WebP 图片', 'Solo se aceptan imágenes PNG, JPG, GIF o WebP', 'Só são aceitas imagens PNG, JPG, GIF ou WebP'],
  'Chỉ hỗ trợ ảnh PNG, JPG, GIF, WEBP': ['Only PNG, JPG, GIF and WEBP images are supported', 'รองรับเฉพาะรูป PNG, JPG, GIF, WEBP', '仅支持 PNG、JPG、GIF、WEBP 图片', 'Solo se admiten imágenes PNG, JPG, GIF y WEBP', 'Só são suportadas imagens PNG, JPG, GIF e WEBP'],
  'Chỉ người được mời mới từ chối được': ['Only the invited person can decline', 'เฉพาะผู้ได้รับเชิญเท่านั้นที่ปฏิเสธได้', '只有被邀请的人才能拒绝', 'Solo la persona invitada puede rechazar', 'Só a pessoa convidada pode recusar'],
  'Chỉ người được mời mới chấp nhận được': ['Only the invited person can accept', 'เฉพาะผู้ได้รับเชิญเท่านั้นที่ยอมรับได้', '只有被邀请的人才能接受', 'Solo la persona invitada puede aceptar', 'Só a pessoa convidada pode aceitar'],
  'Chỉ người mời mới hủy được': ['Only the sender can cancel', 'เฉพาะผู้ส่งเท่านั้นที่ยกเลิกได้', '只有发起人才能取消', 'Solo quien lo envió puede cancelar', 'Só quem enviou pode cancelar'],
  'Chỉ admin, mod và người dùng từ cấp Tím Mộng Mơ mới được đăng trong Đẩy trend': ['Only admins, mods and users at Purple Dream level or above can post in Boost trend', 'เฉพาะแอดมิน ม็อด และผู้ใช้ระดับม่วงช่างฝันขึ้นไปเท่านั้นที่โพสต์ในดันเทรนด์ได้', '只有管理员、版主和紫梦及以上等级的用户可以在推热门发帖', 'Solo admins, mods y usuarios desde el nivel Sueño Morado pueden publicar en Impulsar tendencia', 'Só admins, mods e usuários a partir do nível Sonho Roxo podem publicar em Impulsionar trend'],
  'Chỉ admin của nhóm mới làm được': ['Only group admins can do this', 'เฉพาะแอดมินของกลุ่มเท่านั้นที่ทำได้', '只有群管理员可以执行', 'Solo los admins del grupo pueden hacerlo', 'Só os admins do grupo podem fazer isso'],
  'Bản tin cần có tiêu đề, nội dung hoặc ảnh': ['A news post needs a title, content or a photo', 'ข่าวต้องมีหัวข้อ เนื้อหา หรือรูปภาพ', '资讯需要标题、内容或图片', 'Una noticia necesita título, contenido o una foto', 'Uma notícia precisa de título, conteúdo ou uma foto'],
  'Bạn đã ở trong nhóm này': ['You are already in this group', 'คุณอยู่ในกลุ่มนี้แล้ว', '你已在此群组中', 'Ya estás en este grupo', 'Você já está neste grupo'],
  'Bạn đã bị mời ra khỏi nhóm này': ['You were removed from this group', 'คุณถูกเชิญออกจากกลุ่มนี้', '你已被移出此群组', 'Te quitaron de este grupo', 'Você foi removido deste grupo'],
  'Bạn đang có 3 chủ đề chờ duyệt. Hãy đợi Admin duyệt rồi tạo tiếp.': ['You have 3 topics waiting for review. Please wait for approval before creating more.', 'คุณมี 3 หัวข้อที่รออนุมัติ โปรดรอให้อนุมัติก่อนสร้างเพิ่ม', '你有 3 个话题正在等待审核，请等待审核后再创建。', 'Tienes 3 temas en revisión. Espera la aprobación antes de crear más.', 'Você tem 3 tópicos em revisão. Aguarde a aprovação antes de criar mais.'],
  'Bạn là admin cuối cùng. Hãy chuyển quyền admin cho người khác trước khi rời.': ['You are the last admin. Make someone else admin before leaving.', 'คุณเป็นแอดมินคนสุดท้าย โปรดมอบสิทธิ์แอดมินให้คนอื่นก่อนออก', '你是最后一名管理员，请先将管理员权限转给他人再退出。', 'Eres el último admin. Haz admin a otra persona antes de salir.', 'Você é o último admin. Torne outra pessoa admin antes de sair.'],
  'Bạn không thể tự chào mừng mình': ['You cannot welcome yourself', 'คุณทักทายตัวเองไม่ได้', '你不能欢迎自己', 'No puedes darte la bienvenida a ti mismo', 'Você não pode dar boas-vindas a si mesmo'],
  'Bạn không thể tự báo cáo mình': ['You cannot report yourself', 'คุณรายงานตัวเองไม่ได้', '你不能举报自己', 'No puedes reportarte a ti mismo', 'Você não pode denunciar a si mesmo'],
  'Bạn không thể react tin nhắn của mình': ['You cannot react to your own message', 'คุณรีแอคข้อความของตัวเองไม่ได้', '你不能回应自己的消息', 'No puedes reaccionar a tu propio mensaje', 'Você não pode reagir à sua própria mensagem'],
  'Bạn cần đồng ý: JKR talks chỉ dành cho fan Only LingOrm, không chào đón multi, only toxic, anti, chỉ bàn luận về LingOrm ở các nhóm công khai': ['You need to agree: JKR talks is only for Only LingOrm fans. Multi-shippers, toxic-only fans and antis are not welcome, and public groups are for LingOrm discussion only', 'คุณต้องยอมรับ: JKR talks สำหรับแฟน Only LingOrm เท่านั้น ไม่ต้อนรับแฟนมัลติ แฟนสายท็อกซิก และแอนตี้ และกลุ่มสาธารณะพูดคุยเฉพาะเรื่อง LingOrm', '你需要同意：JKR talks 仅面向 Only LingOrm 粉丝，不欢迎 multi、only toxic 和黑粉，公开群组仅讨论 LingOrm', 'Debes aceptar: JKR talks es solo para fans de Only LingOrm. No damos la bienvenida a multishippers, fans tóxicos ni antis, y los grupos públicos son solo para hablar de LingOrm', 'Você precisa concordar: o JKR talks é só para fãs de Only LingOrm. Multishippers, fãs tóxicos e antis não são bem-vindos, e os grupos públicos são só para falar de LingOrm'],
  'Bạn cần xác nhận đã đọc quy tắc cộng đồng trước khi gửi lời chào': ['Please confirm you have read the community rules before sending a welcome', 'โปรดยืนยันว่าอ่านกฎของชุมชนแล้วก่อนส่งคำทักทาย', '发送欢迎语前请确认已阅读社区规则', 'Confirma que leíste las normas de la comunidad antes de enviar una bienvenida', 'Confirme que leu as regras da comunidade antes de enviar boas-vindas'],
  'Bạn chưa tham gia nhóm này': ['You have not joined this group', 'คุณยังไม่ได้เข้าร่วมกลุ่มนี้', '你尚未加入此群组', 'No te has unido a este grupo', 'Você não entrou neste grupo'],
  'Bình luận trống': ['The comment is empty', 'ความคิดเห็นว่างเปล่า', '评论为空', 'El comentario está vacío', 'O comentário está vazio'],
  'Bài đăng trống': ['The post is empty', 'โพสต์ว่างเปล่า', '帖子为空', 'La publicación está vacía', 'A publicação está vazia'],
  'Bài này đã được xử lý hoặc không còn': ['This post was already handled or no longer exists', 'โพสต์นี้ถูกจัดการแล้วหรือไม่มีอยู่แล้ว', '该帖子已处理或已不存在', 'Esta publicación ya se gestionó o ya no existe', 'Esta publicação já foi tratada ou não existe mais'],
  'Bài này đã được gửi và đang chờ duyệt': ['This post was already submitted and is waiting for review', 'โพสต์นี้ส่งแล้วและรออนุมัติ', '该帖子已提交，正在等待审核', 'Esta publicación ya se envió y está en revisión', 'Esta publicação já foi enviada e está em revisão'],
  'Link này đã có trong Đẩy trend nên bài bị từ chối': ['This link is already in Boost trend, so the post was rejected', 'ลิงก์นี้มีอยู่ในดันเทรนด์แล้ว โพสต์จึงถูกปฏิเสธ', '该链接已在推热门中，帖子被拒绝', 'Este enlace ya está en Impulsar tendencia, así que la publicación fue rechazada', 'Este link já está em Impulsionar trend, então a publicação foi recusada'],
  'Liên kết mời đã hết hạn hoặc bị thu hồi': ['The invite link has expired or was revoked', 'ลิงก์เชิญหมดอายุหรือถูกเพิกถอนแล้ว', '邀请链接已过期或已被撤销', 'El enlace de invitación caducó o fue revocado', 'O link de convite expirou ou foi revogado'],
  'Nhóm không còn tồn tại': ['The group no longer exists', 'กลุ่มนี้ไม่มีอยู่แล้ว', '群组已不存在', 'El grupo ya no existe', 'O grupo não existe mais'],
  'Vật phẩm không tồn tại': ['This item does not exist', 'ไม่มีไอเทมนี้', '物品不存在', 'Este objeto no existe', 'Este item não existe'],
  'Bạn đã sở hữu vật phẩm này': ['You already own this item', 'คุณมีไอเทมนี้แล้ว', '你已拥有此物品', 'Ya tienes este objeto', 'Você já tem este item'],
  'Bạn chưa đủ xu tím để mua vật phẩm này': ['You do not have enough purple coins for this item', 'คุณมีเหรียญม่วงไม่พอซื้อไอเทมนี้', '你的紫币不足以购买此物品', 'No tienes suficientes monedas moradas para este objeto', 'Você não tem moedas roxas suficientes para este item'],
  'Bạn chưa sở hữu vật phẩm này': ['You do not own this item', 'คุณยังไม่มีไอเทมนี้', '你尚未拥有此物品', 'No tienes este objeto', 'Você não tem este item'],
  // Muay Thai
  'Chưa đủ nhân vật để ghép cặp': ['Not enough characters to make a pair', 'ตัวละครไม่พอจับคู่', '角色不足，无法配对', 'No hay suficientes personajes para emparejar', 'Não há personagens suficientes para formar uma dupla'],
  'Chế độ không hợp lệ': ['Invalid mode', 'โหมดไม่ถูกต้อง', '模式无效', 'Modo no válido', 'Modo inválido'],
  'Võ sĩ không hợp lệ': ['Invalid fighter', 'นักมวยไม่ถูกต้อง', '拳手无效', 'Luchador no válido', 'Lutador inválido'],
  'Hãy chọn võ sĩ để cược': ['Choose a fighter to bet on', 'เลือกนักมวยที่จะเดิมพัน', '请选择要押注的拳手', 'Elige un luchador para apostar', 'Escolha um lutador para apostar'],
  'Hai võ sĩ phải khác nhau': ['The two fighters must be different', 'นักมวยทั้งสองต้องไม่ใช่คนเดียวกัน', '两位拳手必须不同', 'Los dos luchadores deben ser distintos', 'Os dois lutadores devem ser diferentes'],
  'Bạn không thể tự thách đấu chính mình': ['You cannot challenge yourself', 'คุณท้าตัวเองไม่ได้', '你不能挑战自己', 'No puedes retarte a ti mismo', 'Você não pode desafiar a si mesmo'],
  'Không đủ xu tím': ['Not enough purple coins', 'เหรียญม่วงไม่พอ', '紫币不足', 'Monedas moradas insuficientes', 'Moedas roxas insuficientes'],
  'Bạn không thể mời người này': ['You cannot challenge this person', 'คุณท้าผู้ใช้นี้ไม่ได้', '你不能挑战此人', 'No puedes retar a esta persona', 'Você não pode desafiar esta pessoa'],
  'Không tìm thấy lời thách đấu': ['Challenge not found', 'ไม่พบคำท้า', '未找到挑战', 'Reto no encontrado', 'Desafio não encontrado'],
  'Không tìm thấy người dùng này': ['This user was not found', 'ไม่พบผู้ใช้นี้', '未找到该用户', 'No se encontró a este usuario', 'Este usuário não foi encontrado'],
  'Không tìm thấy nhân vật này': ['This character was not found', 'ไม่พบตัวละครนี้', '未找到该角色', 'No se encontró a este personaje', 'Este personagem não foi encontrado'],
  'Không tìm thấy trận đấu': ['Match not found', 'ไม่พบการชก', '未找到比赛', 'Combate no encontrado', 'Luta não encontrada'],
  'Không tìm thấy người này': ['This person was not found', 'ไม่พบผู้ใช้นี้', '未找到此人', 'No se encontró a esta persona', 'Esta pessoa não foi encontrada'],
  'Trận này đã diễn ra': ['This match already happened', 'การชกนี้เกิดขึ้นแล้ว', '这场比赛已进行', 'Este combate ya se jugó', 'Esta luta já aconteceu'],
  'Bạn đã có một lời thách đang chờ người này trả lời': ['You already have a challenge waiting for this person', 'คุณมีคำท้าที่รอผู้ใช้นี้ตอบอยู่แล้ว', '你已有一个等待此人回复的挑战', 'Ya tienes un reto esperando la respuesta de esta persona', 'Você já tem um desafio aguardando a resposta desta pessoa'],
  'Lời thách đấu này không còn hiệu lực': ['This challenge is no longer valid', 'คำท้านี้ใช้ไม่ได้แล้ว', '该挑战已失效', 'Este reto ya no es válido', 'Este desafio não é mais válido'],
  'Trận này đã cược rồi': ['You already bet on this match', 'คุณเดิมพันการชกนี้แล้ว', '这场比赛已押注', 'Ya apostaste en este combate', 'Você já apostou nesta luta'],
  'Trận đã hết hạn, hãy tạo trận mới': ['The match expired; please create a new one', 'การชกหมดเวลาแล้ว โปรดสร้างใหม่', '比赛已过期，请创建新比赛', 'El combate caducó; crea uno nuevo', 'A luta expirou; crie uma nova'],
  'Bạn cược nhanh quá, đợi một chút nhé': ['You are betting too fast; wait a moment', 'คุณเดิมพันเร็วเกินไป รอสักครู่นะ', '你押注太快了，请稍等', 'Estás apostando demasiado rápido; espera un momento', 'Você está apostando rápido demais; espere um pouco'],
};
// câu có số / tên: [mẫu tiếng Việt, [en, th, zh, es, pt]] — $1, $2 là phần khớp
const PATTERNS = [
  [/^Ảnh nặng (\d+) KB, vượt mức 512 KB$/, ['Image is $1 KB, over the 512 KB limit', 'รูปภาพขนาด $1 KB เกินกำหนด 512 KB', '图片大小 $1 KB，超过 512 KB 上限', 'La imagen pesa $1 KB, supera el límite de 512 KB', 'A imagem tem $1 KB, acima do limite de 512 KB']],
  [/^Tối đa (\d+) hashtag$/, ['Up to $1 hashtags', 'สูงสุด $1 แฮชแท็ก', '最多 $1 个话题标签', 'Máximo $1 hashtags', 'Máximo de $1 hashtags']],
  [/^Mỗi tin nhắn dùng tối đa (\d+) emoji tùy chỉnh$/, ['Up to $1 custom emoji per message', 'ใช้อีโมจิกำหนดเองได้สูงสุด $1 ตัวต่อข้อความ', '每条消息最多使用 $1 个自定义表情', 'Máximo $1 emojis personalizados por mensaje', 'Máximo de $1 emojis personalizados por mensagem']],
  [/^Mỗi tin chỉ react tối đa (\d+) emoji khác nhau$/, ['You can react with up to $1 different emoji per message', 'รีแอคได้สูงสุด $1 อีโมจิที่ต่างกันต่อข้อความ', '每条消息最多用 $1 种不同表情回应', 'Puedes reaccionar con hasta $1 emojis distintos por mensaje', 'Você pode reagir com até $1 emojis diferentes por mensagem']],
  [/^Mỗi bản tin tối đa (\d+) ảnh$/, ['Up to $1 photos per news post', 'ข่าวหนึ่งมีรูปได้สูงสุด $1 รูป', '每条资讯最多 $1 张图片', 'Máximo $1 fotos por noticia', 'Máximo de $1 fotos por notícia']],
  [/^Giới hạn phải từ 2 đến (\d+)$/, ['The limit must be between 2 and $1', 'จำนวนจำกัดต้องอยู่ระหว่าง 2 ถึง $1', '上限必须在 2 到 $1 之间', 'El límite debe estar entre 2 y $1', 'O limite deve ficar entre 2 e $1']],
  [/^Bạn đã gửi đủ (\d+) lời chào cho thành viên này$/, ['You have already sent $1 welcomes to this member', 'คุณส่งคำทักทายถึงสมาชิกคนนี้ครบ $1 ครั้งแล้ว', '你已向这位成员发送了 $1 条欢迎语', 'Ya enviaste $1 bienvenidas a este miembro', 'Você já enviou $1 boas-vindas a este membro']],
  [/^Bạn đang có (\d+) bài chờ duyệt, hãy đợi admin duyệt rồi gửi tiếp$/, ['You have $1 posts waiting for review; please wait before sending more', 'คุณมี $1 โพสต์ที่รออนุมัติ โปรดรอก่อนส่งเพิ่ม', '你有 $1 篇帖子正在等待审核，请稍后再发', 'Tienes $1 publicaciones en revisión; espera antes de enviar más', 'Você tem $1 publicações em revisão; aguarde antes de enviar mais']],
  [/^Bạn chỉ đổi được vị trí 1 lần \/ 30 ngày\. Thử lại sau (\d+) ngày\.$/, ['You can change your location once every 30 days. Try again in $1 days.', 'เปลี่ยนตำแหน่งได้ 1 ครั้งทุก 30 วัน ลองอีกครั้งใน $1 วัน', '所在地每 30 天只能修改 1 次，请 $1 天后再试。', 'Solo puedes cambiar tu ubicación una vez cada 30 días. Inténtalo en $1 días.', 'Você só pode mudar a localização uma vez a cada 30 dias. Tente de novo em $1 dias.']],
  [/^Hashtag "(.+)" không hợp lệ: chỉ gồm chữ, số, gạch dưới, không có dấu cách$/, ['Hashtag "$1" is invalid: letters, numbers and underscores only, no spaces', 'แฮชแท็ก "$1" ไม่ถูกต้อง: ใช้ได้เฉพาะตัวอักษร ตัวเลข และขีดล่าง ห้ามเว้นวรรค', '话题标签“$1”无效：只能包含字母、数字和下划线，不能有空格', 'El hashtag "$1" no es válido: solo letras, números y guiones bajos, sin espacios', 'A hashtag "$1" é inválida: só letras, números e sublinhados, sem espaços']],
  [/^Link này đã có trong Đẩy trend\. Tin trong Đẩy trend chỉ tồn tại (\d+) giờ, hết hạn mới gửi lại được\.$/, ['This link is already in Boost trend. Messages there last $1 hours; you can post it again after it expires.', 'ลิงก์นี้มีอยู่ในดันเทรนด์แล้ว ข้อความในดันเทรนด์อยู่ได้ $1 ชั่วโมง ส่งซ้ำได้หลังหมดอายุ', '该链接已在推热门中。推热门的消息只保留 $1 小时，过期后才能再发。', 'Este enlace ya está en Impulsar tendencia. Los mensajes duran $1 horas; podrás publicarlo de nuevo cuando caduque.', 'Este link já está em Impulsionar trend. As mensagens duram $1 horas; dá para publicar de novo depois que expirar.']],
  [/^Link này đã có trong Đẩy trend\. Link chỉ tồn tại (\d+) giờ, hết hạn mới gửi lại được\.$/, ['This link is already in Boost trend. Links last $1 hours; you can post it again after it expires.', 'ลิงก์นี้มีอยู่ในดันเทรนด์แล้ว ลิงก์อยู่ได้ $1 ชั่วโมง ส่งซ้ำได้หลังหมดอายุ', '该链接已在推热门中。链接只保留 $1 小时，过期后才能再发。', 'Este enlace ya está en Impulsar tendencia. Los enlaces duran $1 horas; podrás publicarlo de nuevo cuando caduque.', 'Este link já está em Impulsionar trend. Os links duram $1 horas; dá para publicar de novo depois que expirar.']],
  [/^Số xu cược phải là số nguyên từ (\d+) đến (\d+)$/, ['The bet must be a whole number from $1 to $2', 'จำนวนเดิมพันต้องเป็นจำนวนเต็มตั้งแต่ $1 ถึง $2', '押注数必须是 $1 到 $2 之间的整数', 'La apuesta debe ser un número entero de $1 a $2', 'A aposta deve ser um número inteiro de $1 a $2']],
  [/^Hai bạn đã đấu đủ (\d+) trận hôm nay$/, ['You two have already played $1 matches today', 'คุณทั้งสองชกครบ $1 ครั้งแล้ววันนี้', '你们今天已经对战 $1 场了', 'Ya jugaron $1 combates hoy', 'Vocês já lutaram $1 vezes hoje']],
  [/^Bạn đang có (\d+) lời thách chờ trả lời, hãy đợi hoặc hủy bớt$/, ['You have $1 challenges waiting for answers; wait or cancel some', 'คุณมีคำท้า $1 รายการที่รอตอบ โปรดรอหรือยกเลิกบางรายการ', '你有 $1 个挑战在等待回复，请等待或取消一些', 'Tienes $1 retos esperando respuesta; espera o cancela algunos', 'Você tem $1 desafios aguardando resposta; espere ou cancele alguns']],
];
// dịch câu lỗi tiếng Việt sang ngôn ngữ người dùng; không có trong bảng thì giữ nguyên
export function trErr(msg, lang) {
  if (!msg || lang === 'vi' || !(lang in IDX)) return msg;
  const i = IDX[lang] - 1;
  if (E[msg]) return E[msg][i] || E[msg][0];
  for (const [re, out] of PATTERNS) { const m = msg.match(re); if (m) return (out[i] || out[0]).replace(/\$(\d)/g, (_, k) => m[Number(k)]); }
  return msg;
}
