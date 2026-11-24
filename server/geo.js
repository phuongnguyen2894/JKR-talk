// Dữ liệu địa lý MVP: chỉ Việt Nam. Ánh xạ tỉnh/thành -> 3 miền.
// (Câu hỏi mở: 3 miền hay 6 vùng - đổi ở đây, group sẽ tự được tạo theo bảng này.)
export const COUNTRY = { code: 'VN', name: 'Việt Nam' };

export const REGIONS = [
  { code: 'north', name: 'Miền Bắc', short: 'MB' },
  { code: 'central', name: 'Miền Trung', short: 'MT' },
  { code: 'south', name: 'Miền Nam', short: 'MN' },
];

const P = (region, names) => names.map((name) => ({ name, region }));

export const PROVINCES = [
  ...P('north', ['Hà Nội', 'Hải Phòng', 'Quảng Ninh', 'Hải Dương', 'Hưng Yên', 'Thái Bình', 'Hà Nam', 'Nam Định', 'Ninh Bình', 'Vĩnh Phúc', 'Bắc Ninh', 'Bắc Giang', 'Phú Thọ', 'Thái Nguyên', 'Lạng Sơn', 'Cao Bằng', 'Bắc Kạn', 'Tuyên Quang', 'Hà Giang', 'Lào Cai', 'Yên Bái', 'Điện Biên', 'Lai Châu', 'Sơn La', 'Hòa Bình']),
  ...P('central', ['Thanh Hóa', 'Nghệ An', 'Hà Tĩnh', 'Quảng Bình', 'Quảng Trị', 'Thừa Thiên Huế', 'Đà Nẵng', 'Quảng Nam', 'Quảng Ngãi', 'Bình Định', 'Phú Yên', 'Khánh Hòa', 'Ninh Thuận', 'Bình Thuận', 'Kon Tum', 'Gia Lai', 'Đắk Lắk', 'Đắk Nông', 'Lâm Đồng']),
  ...P('south', ['TP. Hồ Chí Minh', 'Bình Phước', 'Tây Ninh', 'Bình Dương', 'Đồng Nai', 'Bà Rịa - Vũng Tàu', 'Long An', 'Tiền Giang', 'Bến Tre', 'Trà Vinh', 'Vĩnh Long', 'Đồng Tháp', 'An Giang', 'Kiên Giang', 'Cần Thơ', 'Hậu Giang', 'Sóc Trăng', 'Bạc Liêu', 'Cà Mau']),
].map((p, i) => ({ id: i + 1, ...p }));

export const provinceById = (id) => PROVINCES.find((p) => p.id === Number(id));
export const regionByCode = (code) => REGIONS.find((r) => r.code === code);

// ---- Quốc gia Đông Nam Á (mở rộng đa quốc gia) ---------------------------------
// Mức quốc gia: mỗi nước một nhóm chat (chưa có tỉnh/thành, vùng). Việt Nam giữ nguyên 3 miền + 63 tỉnh/thành.
// Các nước ngoài Việt Nam chỉ hiện cho Admin cho tới khi Admin bật "mở cho mọi người" (xem bảng app_settings, khoá intl_public).
// Tên: [Việt, Anh, Thái, Trung giản thể]
const C = (code, vi, en, th, zh) => ({ code, name: vi, names: { vi, en, th, zh } });
export const COUNTRIES = [
  C('VN', 'Việt Nam', 'Vietnam', 'เวียดนาม', '越南'),
  C('TH', 'Thái Lan', 'Thailand', 'ไทย', '泰国'),
  C('ID', 'Indonesia', 'Indonesia', 'อินโดนีเซีย', '印度尼西亚'),
  C('MY', 'Malaysia', 'Malaysia', 'มาเลเซีย', '马来西亚'),
  C('PH', 'Philippines', 'Philippines', 'ฟิลิปปินส์', '菲律宾'),
  C('SG', 'Singapore', 'Singapore', 'สิงคโปร์', '新加坡'),
  C('KH', 'Campuchia', 'Cambodia', 'กัมพูชา', '柬埔寨'),
  C('LA', 'Lào', 'Laos', 'ลาว', '老挝'),
  C('MM', 'Myanmar', 'Myanmar', 'เมียนมา', '缅甸'),
  C('BN', 'Brunei', 'Brunei', 'บรูไน', '文莱'),
  C('TL', 'Đông Timor', 'Timor-Leste', 'ติมอร์-เลสเต', '东帝汶'),
];
export const countryByCode = (code) => COUNTRIES.find((c) => c.code === code);
export const isIntlCountry = (code) => !!countryByCode(code) && code !== COUNTRY.code;
