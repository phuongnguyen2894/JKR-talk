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

// ---- Quốc gia trên thế giới (mở rộng đa quốc gia) -------------------------------
// Mọi nước đều ở mức quốc gia; tỉnh/thành chỉ có cho các nước Đông Nam Á (xem geo_sea.js), Việt Nam giữ 3 miền + 63 tỉnh/thành.
// Các nước ngoài Việt Nam chỉ hiện cho Admin cho tới khi Admin bật "mở cho mọi người" (bảng app_settings, khoá intl_public).
// Nhóm chat của từng nước CHỈ được tạo khi có người đầu tiên chọn nước đó. Tên nước 4 thứ tiếng lấy từ dữ liệu ICU của Node (Intl.DisplayNames).
const CODES = ('AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ '
  + 'DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP '
  + 'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ '
  + 'OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ '
  + 'UA UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW').split(' ');
// Đông Nam Á: hiện đầu danh sách chọn (sau Việt Nam)
export const SEA_CODES = ['VN', 'TH', 'ID', 'MY', 'PH', 'SG', 'KH', 'LA', 'MM', 'BN', 'TL'];
const LANGS4 = ['vi', 'en', 'th', 'zh-Hans'];
const dn = Object.fromEntries(LANGS4.map((l) => [l, new Intl.DisplayNames([l], { type: 'region' })]));
const nameIn = (code, l) => { try { const n = dn[l].of(code); return n && n !== code ? n : null; } catch { return null; } };
export const COUNTRIES = CODES.map((code) => {
  const en = nameIn(code, 'en');
  if (!en) return null; // mã không có trong dữ liệu ICU
  const names = { vi: nameIn(code, 'vi') || en, en, th: nameIn(code, 'th') || en, zh: nameIn(code, 'zh-Hans') || en };
  return { code, name: names.vi, names, sea: SEA_CODES.includes(code) };
}).filter(Boolean).sort((a, b) => (SEA_CODES.indexOf(a.code) + 1 || 999) - (SEA_CODES.indexOf(b.code) + 1 || 999) || a.names.en.localeCompare(b.names.en, 'en'));
export const countryByCode = (code) => COUNTRIES.find((c) => c.code === code);
export const isIntlCountry = (code) => !!countryByCode(code) && code !== COUNTRY.code;
