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
