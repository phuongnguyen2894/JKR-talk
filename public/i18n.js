// Đa ngôn ngữ giao diện: vi (gốc) / en / th / zh (giản thể). Thiếu bản dịch thì rơi về tiếng Anh rồi tiếng Việt.
// Mỗi khoá: [vi, en, th, zh]. Chỉ các màn đã chuyển (menu, đăng nhập/đăng ký, Bản tin, Cài đặt, khách) dùng t(); phần còn lại vẫn là tiếng Việt.
export const LANGS = [
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'en', name: 'English' },
  { code: 'th', name: 'ไทย' },
  { code: 'zh', name: '中文' },
];
const IDX = { vi: 0, en: 1, th: 2, zh: 3 };
export const LOCALE = { vi: 'vi-VN', en: 'en-US', th: 'th-TH', zh: 'zh-CN' };

const D = {
  // ---- ngôn ngữ ----
  'lang.title': ['Chọn ngôn ngữ', 'Choose your language', 'เลือกภาษา', '选择语言'],
  'lang.hint': ['Bạn có thể đổi lại bất cứ lúc nào.', 'You can change this at any time.', 'คุณเปลี่ยนได้ทุกเมื่อ', '你可以随时更改。'],
  'lang.close': ['Đóng', 'Close', 'ปิด', '关闭'],
  'lang.label': ['Ngôn ngữ', 'Language', 'ภาษา', '语言'],
  // ---- menu ----
  'nav.groupsAria': ['Nhóm chat', 'Chat groups', 'กลุ่มแชท', '聊天群组'],
  'nav.navAria': ['Điều hướng', 'Navigation', 'การนำทาง', '导航'],
  'nav.yourGroups': ['Nhóm của bạn', 'Your groups', 'กลุ่มของคุณ', '你的群组'],
  'nav.guestGroups': ['Nhóm công khai', 'Public groups', 'กลุ่มสาธารณะ', '公开群组'],
  'nav.country': ['Cả nước', 'Nationwide', 'ทั่วประเทศ', '全国'],
  'nav.region': ['Vùng', 'Regions', 'ภูมิภาค', '地区'],
  'nav.province': ['Tỉnh / Thành phố', 'Provinces / Cities', 'จังหวัด / เมือง', '省 / 城市'],
  'nav.topics': ['Chủ đề thảo luận', 'Discussion topics', 'หัวข้อสนทนา', '讨论话题'],
  'nav.allTopics': ['Tất cả chủ đề', 'All topics', 'หัวข้อทั้งหมด', '全部话题'],
  'nav.private': ['Nhóm riêng', 'Private groups', 'กลุ่มส่วนตัว', '私密群组'],
  'nav.createPrivate': ['Tạo nhóm riêng', 'Create a private group', 'สร้างกลุ่มส่วนตัว', '创建私密群组'],
  'nav.dm': ['Tin nhắn riêng', 'Direct messages', 'ข้อความส่วนตัว', '私信'],
  'nav.other': ['Khác', 'More', 'อื่น ๆ', '更多'],
  'nav.trend': ['Đẩy trend', 'Boost trend', 'ดันเทรนด์', '推热门'],
  'nav.discover': ['Khám phá nhóm khác', 'Discover more groups', 'ค้นหากลุ่มอื่น', '发现更多群组'],
  'nav.hot': ['Chủ đề nóng', 'Hot topics', 'หัวข้อมาแรง', '热门话题'],
  'nav.news': ['Bản tin', 'News', 'ข่าวสาร', '资讯'],
  'nav.friends': ['Bạn bè', 'Friends', 'เพื่อน', '好友'],
  'nav.level': ['Thăng cấp', 'Level up', 'เลื่อนระดับ', '升级'],
  'nav.shop': ['Cửa hàng xu tím', 'Purple coin shop', 'ร้านค้าเหรียญม่วง', '紫币商店'],
  'nav.titles': ['Danh hiệu', 'Titles', 'ฉายา', '称号'],
  'nav.games': ['Game', 'Games', 'เกม', '游戏'],
  'nav.tools': ['Công cụ', 'Tools', 'เครื่องมือ', '工具'],
  'nav.reportBug': ['Báo lỗi', 'Report a bug', 'แจ้งปัญหา', '反馈问题'],
  'nav.bugs': ['Danh sách lỗi', 'Bug list', 'รายการปัญหา', '问题列表'],
  'nav.admin': ['Quản trị', 'Admin', 'ผู้ดูแล', '管理'],
  'nav.reports': ['Báo cáo', 'Reports', 'รายงาน', '举报'],
  'nav.notifs': ['Thông báo', 'Notifications', 'การแจ้งเตือน', '通知'],
  'nav.settings': ['Cài đặt tài khoản', 'Account settings', 'ตั้งค่าบัญชี', '账号设置'],
  'nav.muted': ['(tắt)', '(muted)', '(ปิดเสียง)', '(已静音)'],
  'nav.featured': ['(nổi bật)', '(featured)', '(แนะนำ)', '(精选)'],
  'nav.unread': ['{n} tin chưa đọc', '{n} unread messages', '{n} ข้อความที่ยังไม่ได้อ่าน', '{n} 条未读消息'],
  'tab.groups': ['Nhóm', 'Groups', 'กลุ่ม', '群组'],
  'tab.login': ['Đăng nhập', 'Log in', 'เข้าสู่ระบบ', '登录'],
  // ---- đăng nhập / đăng ký ----
  'auth.login': ['Đăng nhập', 'Log in', 'เข้าสู่ระบบ', '登录'],
  'auth.loginSub': ['Kết nối và lan tỏa những điều tích cực về LingOrm.', 'Connect and spread positivity about LingOrm.', 'เชื่อมต่อและส่งต่อเรื่องราวดี ๆ เกี่ยวกับ LingOrm', '连接并传播关于 LingOrm 的正能量。'],
  'auth.focus': ['Tập trung vào LingOrm. <b>Only LingOrm</b>', 'Focused on LingOrm. <b>Only LingOrm</b>', 'โฟกัสที่ LingOrm เท่านั้น <b>Only LingOrm</b>', '专注于 LingOrm。<b>Only LingOrm</b>'],
  'auth.email': ['Email', 'Email', 'อีเมล', '邮箱'],
  'auth.password': ['Mật khẩu', 'Password', 'รหัสผ่าน', '密码'],
  'auth.noAccount': ['Chưa có tài khoản?', "Don't have an account?", 'ยังไม่มีบัญชี?', '还没有账号？'],
  'auth.signup': ['Tạo tài khoản', 'Create an account', 'สร้างบัญชี', '创建账号'],
  'auth.preview': ['Xem trước không cần đăng ký →', 'Preview without signing up →', 'ดูตัวอย่างโดยไม่ต้องสมัคร →', '无需注册，先看看 →'],
  'auth.signupSub': ['Chọn nơi bạn ở để vào đúng các nhóm chat cùng khu vực.', 'Choose where you live to join the chat groups in your area.', 'เลือกพื้นที่ที่คุณอยู่เพื่อเข้ากลุ่มแชทในพื้นที่เดียวกัน', '选择你所在的地区，加入同地区的聊天群组。'],
  'auth.displayName': ['Tên hiển thị', 'Display name', 'ชื่อที่แสดง', '显示名称'],
  'auth.confirmPw': ['Xác nhận mật khẩu', 'Confirm password', 'ยืนยันรหัสผ่าน', '确认密码'],
  'geo.sea': ['Việt Nam & Đông Nam Á', 'Vietnam & Southeast Asia', 'เวียดนามและเอเชียตะวันออกเฉียงใต้', '越南与东南亚'],
  'geo.world': ['Các quốc gia khác', 'Other countries', 'ประเทศอื่น ๆ', '其他国家'],
  'auth.country': ['Quốc gia', 'Country', 'ประเทศ', '国家'],
  'auth.intlHint': ['Bạn sẽ vào nhóm quốc gia {c}.', 'You will join the {c} country group.', 'คุณจะเข้ากลุ่มประเทศ{c}', '你将加入{c}国家群组。'],
  'auth.intlHint2': ['Bạn sẽ vào 2 nhóm: {c} và {p}.', 'You will join 2 groups: {c} and {p}.', 'คุณจะเข้า 2 กลุ่ม: {c} และ {p}', '你将加入 2 个群组：{c} 和 {p}。'],
  'auth.where': ['Bạn ở đâu tại Việt Nam?', 'Where are you in Vietnam?', 'คุณอยู่ที่ไหนในเวียดนาม?', '你在越南的哪里？'],
  'auth.region': ['Vùng', 'Region', 'ภูมิภาค', '地区'],
  'auth.city': ['Tỉnh / Thành phố', 'Province / City', 'จังหวัด / เมือง', '省 / 城市'],
  'auth.geoHint': ['Hiện app mới hỗ trợ Việt Nam. Bạn sẽ tự vào 3 nhóm: Việt Nam, {r}, {c}. Có thể vào thêm nhóm vùng, tỉnh/thành khác sau.', 'The app currently supports Vietnam only. You will automatically join 3 groups: Vietnam, {r}, {c}. You can join other regional or provincial groups later.', 'ตอนนี้แอปรองรับเฉพาะเวียดนาม คุณจะเข้า 3 กลุ่มโดยอัตโนมัติ: เวียดนาม, {r}, {c} และเข้ากลุ่มภูมิภาคหรือจังหวัดอื่นเพิ่มได้ภายหลัง', '目前应用仅支持越南。你将自动加入 3 个群组：越南、{r}、{c}。之后可以加入其他地区或省市群组。'],
  'auth.accept': ['JKR talks chỉ dành cho fan <b>Only LingOrm</b>, không chào đón multi, only toxic, anti, chỉ bàn luận về LingOrm ở các nhóm công khai', 'JKR talks is only for <b>Only LingOrm</b> fans. Multi-shippers, toxic-only fans and antis are not welcome, and public groups are for LingOrm discussion only', 'JKR talks สำหรับแฟน <b>Only LingOrm</b> เท่านั้น ไม่ต้อนรับแฟนมัลติ แฟนสายท็อกซิก และแอนตี้ และกลุ่มสาธารณะพูดคุยเฉพาะเรื่อง LingOrm', 'JKR talks 仅面向 <b>Only LingOrm</b> 粉丝，不欢迎 multi、only toxic 和黑粉，公开群组仅讨论 LingOrm'],
  'auth.dnPh': ['Tên mọi người sẽ thấy', 'The name others will see', 'ชื่อที่คนอื่นจะเห็น', '其他人看到的名字'],
  'auth.pw2Ph': ['Nhập lại mật khẩu', 'Re-enter your password', 'กรอกรหัสผ่านอีกครั้ง', '再次输入密码'],
  'auth.pwMismatch': ['Mật khẩu xác nhận không khớp', 'Passwords do not match', 'รหัสผ่านไม่ตรงกัน', '两次输入的密码不一致'],
  'auth.haveAccount': ['Đã có tài khoản?', 'Already have an account?', 'มีบัญชีแล้ว?', '已有账号？'],
  // ---- bản tin ----
  'news.intro': ['Thông báo từ đội vận hành JKR talks. Bạn có thể thả tim và bình luận dưới mỗi bản tin.', 'Announcements from the JKR talks team. You can like and comment under each post.', 'ประกาศจากทีมงาน JKR talks คุณกดหัวใจและแสดงความคิดเห็นใต้แต่ละข่าวได้', '来自 JKR talks 运营团队的通知。你可以给每条资讯点赞和评论。'],
  'news.introGuest': ['Thông báo từ đội vận hành JKR talks.', 'Announcements from the JKR talks team.', 'ประกาศจากทีมงาน JKR talks', '来自 JKR talks 运营团队的通知。'],
  'news.pinned': ['Ghim', 'Pinned', 'ปักหมุด', '置顶'],
  'news.new': ['Mới', 'New', 'ใหม่', '新'],
  'news.more': ['Xem thêm', 'Read more', 'ดูเพิ่มเติม', '展开'],
  'news.less': ['Thu gọn', 'Show less', 'ย่อ', '收起'],
  'news.autoTr': ['Đã dịch tự động', 'Auto-translated', 'แปลอัตโนมัติ', '自动翻译'],
  'news.origNote': ['Đang xem bản gốc', 'Showing the original', 'กำลังดูต้นฉบับ', '正在查看原文'],
  'news.viewOrig': ['Xem bản gốc', 'View original', 'ดูต้นฉบับ', '查看原文'],
  'news.viewTr': ['Xem bản dịch', 'View translation', 'ดูคำแปล', '查看译文'],
  'news.empty': ['Chưa có bản tin nào.', 'No news yet.', 'ยังไม่มีข่าว', '暂无资讯'],
  'news.edited': ['· đã chỉnh sửa', '· edited', '· แก้ไขแล้ว', '· 已编辑'],
  'news.heart': ['Thả tim, hiện có {n} tim', 'Like, {n} likes so far', 'กดหัวใจ ตอนนี้มี {n} หัวใจ', '点赞，目前 {n} 个赞'],
  'news.heartGuest': ['Thả tim (cần đăng ký), hiện có {n} tim', 'Like (sign-up required), {n} likes so far', 'กดหัวใจ (ต้องสมัครสมาชิก) ตอนนี้มี {n} หัวใจ', '点赞（需注册），目前 {n} 个赞'],
  'news.delete': ['Xóa', 'Delete', 'ลบ', '删除'],
  // ---- khách ----
  'guest.welcome': ['Bạn đang xem với tư cách <b>khách</b>. Chỉ đọc được các nhóm công khai, tin nhắn chỉ được lưu 38 ngày.', 'You are browsing as a <b>guest</b>. You can only read public groups, and messages are kept for 38 days.', 'คุณกำลังดูในฐานะ<b>ผู้เยี่ยมชม</b> อ่านได้เฉพาะกลุ่มสาธารณะ และข้อความจะถูกเก็บไว้ 38 วัน', '你正以<b>访客</b>身份浏览。只能阅读公开群组，消息仅保留 38 天。'],
  'guest.cta': ['Đăng ký để thả tim, trò chuyện và tham gia các nhóm.', 'Sign up to like, chat and join groups.', 'สมัครสมาชิกเพื่อกดหัวใจ แชท และเข้าร่วมกลุ่ม', '注册后即可点赞、聊天和加入群组。'],
  'guest.ctaAria': ['Mời đăng ký', 'Invitation to sign up', 'คำเชิญสมัครสมาชิก', '邀请注册'],
  'guest.ctaTrend': ['Đăng ký để thả tim và lan tỏa các bài đẩy trend.', 'Sign up to like and spread trending posts.', 'สมัครสมาชิกเพื่อกดหัวใจและช่วยส่งต่อโพสต์ดันเทรนด์', '注册后即可点赞并传播热门帖子。'],
  'guest.ctaGroup': ['Đăng ký để tham gia nhóm, thả tim và trò chuyện.', 'Sign up to join groups, like and chat.', 'สมัครสมาชิกเพื่อเข้าร่วมกลุ่ม กดหัวใจ และแชท', '注册后即可加入群组、点赞和聊天。'],
  'guest.subTrend': ['Nơi đăng các bài cần tương tác', 'Where posts that need engagement are shared', 'ที่สำหรับโพสต์ที่ต้องการให้ช่วยกันกดหัวใจและแสดงความคิดเห็น', '发布需要互动的帖子'],
  'guest.limit': ['Khách chỉ xem được {n} tin gần nhất.', 'Guests can only see the latest {n} messages.', 'ผู้เยี่ยมชมดูได้เฉพาะ {n} ข้อความล่าสุด', '访客只能查看最近 {n} 条消息。'],
  'guest.limitCta': ['để xem toàn bộ.', 'to see everything.', 'เพื่อดูทั้งหมด', '即可查看全部。'],
  'guest.signup': ['Đăng ký', 'Sign up', 'สมัครสมาชิก', '注册'],
  // ---- cài đặt ----
  'set.title': ['Cài đặt', 'Settings', 'ตั้งค่า', '设置'],
  'set.profile': ['Hồ sơ', 'Profile', 'โปรไฟล์', '个人资料'],
  'set.avatarColor': ['Màu ảnh đại diện', 'Avatar color', 'สีรูปโปรไฟล์', '头像颜色'],
  'set.avatarUpload': ['Hoặc tải ảnh đại diện', 'Or upload an avatar', 'หรืออัปโหลดรูปโปรไฟล์', '或上传头像'],
  'set.saveProfile': ['Lưu hồ sơ', 'Save profile', 'บันทึกโปรไฟล์', '保存资料'],
  'set.changePw': ['Đổi mật khẩu', 'Change password', 'เปลี่ยนรหัสผ่าน', '修改密码'],
  'set.curPw': ['Mật khẩu hiện tại', 'Current password', 'รหัสผ่านปัจจุบัน', '当前密码'],
  'set.newPw': ['Mật khẩu mới', 'New password', 'รหัสผ่านใหม่', '新密码'],
  'set.newPw2': ['Xác nhận mật khẩu mới', 'Confirm new password', 'ยืนยันรหัสผ่านใหม่', '确认新密码'],
  'set.pwHint': ['Ít nhất 8 ký tự', 'At least 8 characters', 'อย่างน้อย 8 ตัวอักษร', '至少 8 个字符'],
  'set.pwNote': ['Sau khi đổi, các thiết bị khác đang đăng nhập sẽ bị đăng xuất.', 'After changing, other signed-in devices will be signed out.', 'หลังเปลี่ยน อุปกรณ์อื่นที่ล็อกอินอยู่จะถูกออกจากระบบ', '修改后，其他已登录的设备将被登出。'],
  'set.home': ['Vị trí "home"', '"Home" location', 'ตำแหน่ง "บ้าน"', '“所在地”'],
  'set.homeNote': ['Chỉ hiển thị tới cấp tỉnh/thành. Đổi được 1 lần / 30 ngày.', 'Shown only to province/city level. You can change it once every 30 days.', 'แสดงถึงระดับจังหวัด/เมืองเท่านั้น เปลี่ยนได้ 1 ครั้งทุก 30 วัน', '仅显示到省/市级别。每 30 天可修改 1 次。'],
  'set.homeCooldown': ['Bạn vừa đổi gần đây nên tạm thời chưa đổi được.', 'You changed it recently, so you cannot change it for now.', 'คุณเพิ่งเปลี่ยนไป จึงยังเปลี่ยนไม่ได้ในตอนนี้', '你最近刚修改过，暂时无法再次修改。'],
  'set.country': ['Quốc gia', 'Country', 'ประเทศ', '国家'],
  'set.changeHome': ['Đổi vị trí', 'Change location', 'เปลี่ยนตำแหน่ง', '修改所在地'],
  'set.privacy': ['Quyền riêng tư & thông báo', 'Privacy & notifications', 'ความเป็นส่วนตัวและการแจ้งเตือน', '隐私与通知'],
  'set.friendPolicy': ['Ai được gửi lời mời kết bạn cho tôi', 'Who can send me friend requests', 'ใครส่งคำขอเป็นเพื่อนถึงฉันได้', '谁可以向我发送好友请求'],
  'set.fp.shared': ['Chỉ người chung nhóm', 'Only people in my groups', 'เฉพาะคนที่อยู่กลุ่มเดียวกัน', '仅同群组的人'],
  'set.fp.everyone': ['Mọi người', 'Everyone', 'ทุกคน', '所有人'],
  'set.fp.none': ['Không ai', 'No one', 'ไม่มีใคร', '不接受'],
  'set.showOnline': ['Hiển thị trạng thái online (tắt thì bạn cũng không thấy trạng thái của người khác)', "Show my online status (if off, you also cannot see others' status)", 'แสดงสถานะออนไลน์ (หากปิด คุณจะไม่เห็นสถานะของผู้อื่นด้วย)', '显示在线状态（关闭后你也看不到他人的状态）'],
  'set.shareLoc': ['Cho bạn bè thấy tỉnh/thành và quốc gia của tôi (người lạ không thấy)', 'Let friends see my province/city and country (strangers cannot)', 'ให้เพื่อนเห็นจังหวัด/เมืองและประเทศของฉัน (คนแปลกหน้าไม่เห็น)', '让好友看到我的省/市和国家（陌生人看不到）'],
  'set.newsPush': ['Nhận thông báo khi có bản tin mới', 'Notify me about new news posts', 'แจ้งเตือนเมื่อมีข่าวใหม่', '有新资讯时通知我'],
  'set.hideSug': ['Ẩn gợi ý nhóm', 'Hide group suggestions', 'ซ่อนคำแนะนำกลุ่ม', '隐藏群组推荐'],
  'set.savePriv': ['Lưu cài đặt', 'Save settings', 'บันทึกการตั้งค่า', '保存设置'],
  'set.saved': ['Đã lưu', 'Saved', 'บันทึกแล้ว', '已保存'],
  'set.account': ['Tài khoản', 'Account', 'บัญชี', '账号'],
  'set.deleteAccount': ['Xóa tài khoản và dữ liệu', 'Delete account and data', 'ลบบัญชีและข้อมูล', '删除账号和数据'],
  // ---- cài app và thông báo đẩy ----
  'push.title': ['Cài app & thông báo đẩy', 'Install the app & push notifications', 'ติดตั้งแอปและการแจ้งเตือนแบบพุช', '安装应用与推送通知'],
  'push.installed': ['✅ Bạn đang dùng JKR talks như một app trên màn hình chính.', '✅ You are using JKR talks as an app on your home screen.', '✅ คุณกำลังใช้ JKR talks เป็นแอปบนหน้าจอหลัก', '✅ 你正在以主屏幕应用的方式使用 JKR talks。'],
  'push.ios': ['Trên iPhone/iPad: bấm nút <b>Chia sẻ</b> (hình vuông có mũi tên lên) trong Safari, chọn <b>Thêm vào Màn hình chính</b>, rồi mở JKR talks từ biểu tượng mới để bật thông báo.', 'On iPhone/iPad: tap <b>Share</b> (the square with an up arrow) in Safari, choose <b>Add to Home Screen</b>, then open JKR talks from the new icon to turn on notifications.', 'บน iPhone/iPad: แตะปุ่ม <b>แชร์</b> (สี่เหลี่ยมมีลูกศรชี้ขึ้น) ใน Safari เลือก <b>เพิ่มไปยังหน้าจอโฮม</b> แล้วเปิด JKR talks จากไอคอนใหม่เพื่อเปิดการแจ้งเตือน', '在 iPhone/iPad 上：在 Safari 中点按<b>分享</b>（带向上箭头的方块），选择<b>添加到主屏幕</b>，然后从新图标打开 JKR talks 以开启通知。'],
  'push.installBtn': ['Cài app lên màn hình chính', 'Install the app on your home screen', 'ติดตั้งแอปบนหน้าจอหลัก', '安装应用到主屏幕'],
  'push.installHow': ['Để cài app: mở menu của trình duyệt và chọn "Cài đặt ứng dụng" hoặc "Thêm vào màn hình chính".', 'To install the app: open your browser menu and choose "Install app" or "Add to Home screen".', 'วิธีติดตั้งแอป: เปิดเมนูของเบราว์เซอร์แล้วเลือก "ติดตั้งแอป" หรือ "เพิ่มไปยังหน้าจอหลัก"', '安装应用：打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。'],
  'push.iosNote': ['iPhone chỉ nhận được thông báo đẩy sau khi bạn thêm app vào Màn hình chính (iOS 16.4 trở lên).', 'iPhone only receives push notifications after you add the app to the Home Screen (iOS 16.4 or later).', 'iPhone จะได้รับการแจ้งเตือนแบบพุชหลังจากเพิ่มแอปไปยังหน้าจอโฮมเท่านั้น (iOS 16.4 ขึ้นไป)', 'iPhone 需先将应用添加到主屏幕才能接收推送通知（iOS 16.4 及以上）。'],
  'push.unsupported': ['Trình duyệt này chưa hỗ trợ thông báo đẩy.', 'This browser does not support push notifications.', 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือนแบบพุช', '此浏览器不支持推送通知。'],
  'push.blocked': ['Thông báo đang bị chặn cho trang này. Hãy bật lại quyền thông báo trong cài đặt của trình duyệt (hoặc của app), rồi tải lại trang.', 'Notifications are blocked for this site. Turn the permission back on in your browser (or app) settings, then reload the page.', 'การแจ้งเตือนถูกบล็อกสำหรับเว็บไซต์นี้ โปรดเปิดสิทธิ์อีกครั้งในการตั้งค่าของเบราว์เซอร์ (หรือแอป) แล้วโหลดหน้าใหม่', '此网站的通知已被阻止。请在浏览器（或应用）设置中重新开启通知权限，然后刷新页面。'],
  'push.intro': ['Nhận thông báo ngay cả khi bạn không mở app: khi có người nhắc đến, trả lời bạn hoặc nhắn tin riêng.', 'Get notified even when the app is closed: when someone mentions you, replies to you or sends you a private message.', 'รับการแจ้งเตือนแม้ไม่ได้เปิดแอป: เมื่อมีคนกล่าวถึง ตอบกลับ หรือส่งข้อความส่วนตัวถึงคุณ', '即使未打开应用也能收到通知：有人提及你、回复你或给你发私信时。'],
  'push.on': ['Bật thông báo trên thiết bị này', 'Turn on notifications on this device', 'เปิดการแจ้งเตือนบนอุปกรณ์นี้', '在此设备上开启通知'],
  'push.off': ['Tắt thông báo trên thiết bị này', 'Turn off notifications on this device', 'ปิดการแจ้งเตือนบนอุปกรณ์นี้', '在此设备上关闭通知'],
  'push.active': ['✅ Thiết bị này đang nhận thông báo đẩy. Bản tin mới được bật/tắt ở mục "Quyền riêng tư & thông báo" bên dưới.', '✅ This device is receiving push notifications. New news posts are switched on or off in "Privacy & notifications" below.', '✅ อุปกรณ์นี้กำลังรับการแจ้งเตือนแบบพุช การแจ้งเตือนข่าวใหม่เปิด/ปิดได้ที่ "ความเป็นส่วนตัวและการแจ้งเตือน" ด้านล่าง', '✅ 此设备正在接收推送通知。新资讯通知可在下方“隐私与通知”中开启或关闭。'],
  'push.pref.mention': ['Khi có người nhắc đến tôi (@tên)', 'When someone mentions me (@name)', 'เมื่อมีคนกล่าวถึงฉัน (@ชื่อ)', '有人提及我（@名字）时'],
  'push.pref.reply': ['Khi có người trả lời tin của tôi', 'When someone replies to my message', 'เมื่อมีคนตอบกลับข้อความของฉัน', '有人回复我的消息时'],
  'push.pref.heart': ['Khi tin của tôi nhận được tim (ở mốc 1, 5, 10, 25, 50, 100)', 'When my message gets likes (at 1, 5, 10, 25, 50, 100)', 'เมื่อข้อความของฉันได้รับหัวใจ (ที่ 1, 5, 10, 25, 50, 100)', '我的消息获得点赞时（达到 1、5、10、25、50、100 个）'],
  'push.pref.dm': ['Tin nhắn riêng', 'Direct messages', 'ข้อความส่วนตัว', '私信'],
  'push.pref.social': ['Lời mời kết bạn, mời vào nhóm', 'Friend requests and group invitations', 'คำขอเป็นเพื่อนและคำเชิญเข้ากลุ่ม', '好友请求和入群邀请'],
  'push.pref.system': ['Thông báo từ quản trị (xử lý báo cáo, vi phạm)', 'Messages from admins (report handling, violations)', 'ประกาศจากผู้ดูแล (การจัดการรายงาน การละเมิด)', '管理员通知（举报处理、违规）'],
  'push.askTitle': ['Bật thông báo?', 'Turn on notifications?', 'เปิดการแจ้งเตือนหรือไม่?', '开启通知？'],
  'push.askBody': ['Biết ngay khi có người trả lời, nhắc đến hoặc nhắn tin riêng cho bạn.', 'Know right away when someone replies, mentions you or messages you privately.', 'รู้ทันทีเมื่อมีคนตอบกลับ กล่าวถึง หรือส่งข้อความส่วนตัวถึงคุณ', '有人回复、提及你或给你发私信时立即知道。'],
  'push.askYes': ['Bật', 'Turn on', 'เปิด', '开启'],
  'push.askLater': ['Để sau', 'Later', 'ไว้ทีหลัง', '以后再说'],
  'push.askNever': ['Đừng hỏi nữa', "Don't ask again", 'อย่าถามอีก', '不再询问'],
  'push.enabled': ['Đã bật thông báo', 'Notifications turned on', 'เปิดการแจ้งเตือนแล้ว', '已开启通知'],
  'push.disabled': ['Đã tắt thông báo trên thiết bị này', 'Notifications turned off on this device', 'ปิดการแจ้งเตือนบนอุปกรณ์นี้แล้ว', '已在此设备上关闭通知'],
  'push.errUnsupported': ['Trình duyệt này chưa hỗ trợ thông báo đẩy', 'This browser does not support push notifications', 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือนแบบพุช', '此浏览器不支持推送通知'],
  'push.errDenied': ['Bạn chưa cho phép thông báo. Hãy bật quyền thông báo cho trang này trong cài đặt trình duyệt.', 'You have not allowed notifications. Turn on the notification permission for this site in your browser settings.', 'คุณยังไม่ได้อนุญาตการแจ้งเตือน โปรดเปิดสิทธิ์การแจ้งเตือนสำหรับเว็บไซต์นี้ในการตั้งค่าเบราว์เซอร์', '你尚未允许通知。请在浏览器设置中为此网站开启通知权限。'],
  'push.errFail': ['Không bật được thông báo: ', 'Could not turn on notifications: ', 'เปิดการแจ้งเตือนไม่สำเร็จ: ', '无法开启通知：'],
  // ---- bình luận ----
  'cmt.label': ['Bình luận', 'Comments', 'ความคิดเห็น', '评论'],
  'cmt.count': ['{n} bình luận', '{n} comments', '{n} ความคิดเห็น', '{n} 条评论'],
  'cmt.loading': ['Đang tải…', 'Loading…', 'กำลังโหลด…', '加载中…'],
  'cmt.empty': ['Chưa có bình luận nào. Hãy là người đầu tiên!', 'No comments yet. Be the first!', 'ยังไม่มีความคิดเห็น มาเป็นคนแรกกัน!', '还没有评论，来做第一个吧！'],
  'cmt.write': ['Viết bình luận…', 'Write a comment…', 'เขียนความคิดเห็น…', '写评论…'],
  'cmt.writeAria': ['Viết bình luận', 'Write a comment', 'เขียนความคิดเห็น', '写评论'],
  'cmt.send': ['Gửi', 'Send', 'ส่ง', '发送'],
  'cmt.delTitle': ['Xóa bình luận?', 'Delete this comment?', 'ลบความคิดเห็นนี้หรือไม่?', '删除这条评论？'],
  'cmt.delText': ['Bình luận sẽ biến mất với mọi người.', 'The comment will disappear for everyone.', 'ความคิดเห็นจะหายไปสำหรับทุกคน', '该评论将对所有人消失。'],
  'cmt.sent': ['Đã gửi bình luận', 'Comment posted', 'ส่งความคิดเห็นแล้ว', '评论已发布'],
  'set.logout': ['Đăng xuất', 'Log out', 'ออกจากระบบ', '退出登录'],
};

let cur = 'vi';
export const getLang = () => cur;
export const isLang = (c) => c in IDX;

export function t(key, vars) {
  const e = D[key];
  let s = e ? (e[IDX[cur]] || e[1] || e[0]) : key;
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k]);
  return s;
}

// Ngôn ngữ gợi ý theo trình duyệt (khi chưa chọn)
export function guessBrowserLang() {
  for (const l of navigator.languages || [navigator.language || 'vi']) {
    const c = String(l).toLowerCase().slice(0, 2);
    if (isLang(c)) return c;
  }
  return 'en';
}
export function storedLang() { try { const l = localStorage.getItem('jkr_lang'); return isLang(l) ? l : null; } catch { return null; } }

export function setLang(code, persist = true) {
  if (!isLang(code)) return;
  cur = code;
  document.documentElement.lang = code === 'zh' ? 'zh-Hans' : code;
  if (persist) { try { localStorage.setItem('jkr_lang', code); } catch { /* bỏ qua */ } }
}
// Khởi động: dùng lựa chọn đã lưu; chưa có thì theo trình duyệt (không lưu để còn hỏi khách)
export function initLang() { setLang(storedLang() || guessBrowserLang(), false); }
