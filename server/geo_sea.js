// Tỉnh/thành (cấp hành chính thứ nhất) của các nước Đông Nam Á ngoài Việt Nam.
// Tên viết theo chữ Latinh thông dụng ở địa phương; riêng Thái Lan có thêm tên tiếng Thái (hiện cho người dùng chọn ngôn ngữ ไทย).
// Chưa có tên chữ Khmer, Lào, Miến Điện, Hoa. Singapore là thành quốc nên chỉ có cấp quốc gia.
// Nhóm chat của từng tỉnh/thành CHỈ được tạo khi có người dùng chọn nơi đó (xem homeGroupsOf trong db.js).
const L = (s) => s.split('|').map((x) => x.trim()).filter(Boolean);

const TH = L(`Bangkok~กรุงเทพมหานคร|Amnat Charoen~อำนาจเจริญ|Ang Thong~อ่างทอง|Bueng Kan~บึงกาฬ|Buriram~บุรีรัมย์|Chachoengsao~ฉะเชิงเทรา|Chai Nat~ชัยนาท|Chaiyaphum~ชัยภูมิ|Chanthaburi~จันทบุรี|Chiang Mai~เชียงใหม่|Chiang Rai~เชียงราย|Chonburi~ชลบุรี|Chumphon~ชุมพร|Kalasin~กาฬสินธุ์|Kamphaeng Phet~กำแพงเพชร|Kanchanaburi~กาญจนบุรี|Khon Kaen~ขอนแก่น|Krabi~กระบี่|Lampang~ลำปาง|Lamphun~ลำพูน|Loei~เลย|Lopburi~ลพบุรี|Mae Hong Son~แม่ฮ่องสอน|Maha Sarakham~มหาสารคาม|Mukdahan~มุกดาหาร|Nakhon Nayok~นครนายก|Nakhon Pathom~นครปฐม|Nakhon Phanom~นครพนม|Nakhon Ratchasima~นครราชสีมา|Nakhon Sawan~นครสวรรค์|Nakhon Si Thammarat~นครศรีธรรมราช|Nan~น่าน|Narathiwat~นราธิวาส|Nong Bua Lamphu~หนองบัวลำภู|Nong Khai~หนองคาย|Nonthaburi~นนทบุรี|Pathum Thani~ปทุมธานี|Pattani~ปัตตานี|Phang Nga~พังงา|Phatthalung~พัทลุง|Phayao~พะเยา|Phetchabun~เพชรบูรณ์|Phetchaburi~เพชรบุรี|Phichit~พิจิตร|Phitsanulok~พิษณุโลก|Phra Nakhon Si Ayutthaya~พระนครศรีอยุธยา|Phrae~แพร่|Phuket~ภูเก็ต|Prachinburi~ปราจีนบุรี|Prachuap Khiri Khan~ประจวบคีรีขันธ์|Ranong~ระนอง|Ratchaburi~ราชบุรี|Rayong~ระยอง|Roi Et~ร้อยเอ็ด|Sa Kaeo~สระแก้ว|Sakon Nakhon~สกลนคร|Samut Prakan~สมุทรปราการ|Samut Sakhon~สมุทรสาคร|Samut Songkhram~สมุทรสงคราม|Saraburi~สระบุรี|Satun~สตูล|Sing Buri~สิงห์บุรี|Sisaket~ศรีสะเกษ|Songkhla~สงขลา|Sukhothai~สุโขทัย|Suphan Buri~สุพรรณบุรี|Surat Thani~สุราษฎร์ธานี|Surin~สุรินทร์|Tak~ตาก|Trang~ตรัง|Trat~ตราด|Ubon Ratchathani~อุบลราชธานี|Udon Thani~อุดรธานี|Uthai Thani~อุทัยธานี|Uttaradit~อุตรดิตถ์|Yala~ยะลา|Yasothon~ยโสธร`);

const RAW = {
  TH,
  ID: L('Aceh|Sumatera Utara|Sumatera Barat|Riau|Kepulauan Riau|Jambi|Sumatera Selatan|Bangka Belitung|Bengkulu|Lampung|DKI Jakarta|Banten|Jawa Barat|Jawa Tengah|DI Yogyakarta|Jawa Timur|Bali|Nusa Tenggara Barat|Nusa Tenggara Timur|Kalimantan Barat|Kalimantan Tengah|Kalimantan Selatan|Kalimantan Timur|Kalimantan Utara|Sulawesi Utara|Gorontalo|Sulawesi Tengah|Sulawesi Barat|Sulawesi Selatan|Sulawesi Tenggara|Maluku|Maluku Utara|Papua|Papua Barat|Papua Barat Daya|Papua Selatan|Papua Tengah|Papua Pegunungan'),
  MY: L('Johor|Kedah|Kelantan|Melaka|Negeri Sembilan|Pahang|Perak|Perlis|Pulau Pinang|Sabah|Sarawak|Selangor|Terengganu|Kuala Lumpur|Labuan|Putrajaya'),
  PH: L('Metro Manila|Abra|Agusan del Norte|Agusan del Sur|Aklan|Albay|Antique|Apayao|Aurora|Basilan|Bataan|Batanes|Batangas|Benguet|Biliran|Bohol|Bukidnon|Bulacan|Cagayan|Camarines Norte|Camarines Sur|Camiguin|Capiz|Catanduanes|Cavite|Cebu|Cotabato|Davao de Oro|Davao del Norte|Davao del Sur|Davao Occidental|Davao Oriental|Dinagat Islands|Eastern Samar|Guimaras|Ifugao|Ilocos Norte|Ilocos Sur|Iloilo|Isabela|Kalinga|La Union|Laguna|Lanao del Norte|Lanao del Sur|Leyte|Maguindanao del Norte|Maguindanao del Sur|Marinduque|Masbate|Misamis Occidental|Misamis Oriental|Mountain Province|Negros Occidental|Negros Oriental|Northern Samar|Nueva Ecija|Nueva Vizcaya|Occidental Mindoro|Oriental Mindoro|Palawan|Pampanga|Pangasinan|Quezon|Quirino|Rizal|Romblon|Samar|Sarangani|Siquijor|Sorsogon|South Cotabato|Southern Leyte|Sultan Kudarat|Sulu|Surigao del Norte|Surigao del Sur|Tarlac|Tawi-Tawi|Zambales|Zamboanga del Norte|Zamboanga del Sur|Zamboanga Sibugay'),
  KH: L('Phnom Penh|Banteay Meanchey|Battambang|Kampong Cham|Kampong Chhnang|Kampong Speu|Kampong Thom|Kampot|Kandal|Kep|Koh Kong|Kratie|Mondulkiri|Oddar Meanchey|Pailin|Preah Sihanouk|Preah Vihear|Prey Veng|Pursat|Ratanakiri|Siem Reap|Stung Treng|Svay Rieng|Takeo|Tboung Khmum'),
  LA: L('Vientiane Capital|Phongsaly|Luang Namtha|Bokeo|Oudomxay|Luang Prabang|Houaphanh|Xayaburi|Xiangkhouang|Vientiane|Bolikhamsai|Khammouane|Savannakhet|Salavan|Sekong|Champasak|Attapeu|Xaisomboun'),
  MM: L('Yangon|Mandalay|Nay Pyi Taw|Sagaing|Magway|Bago|Ayeyarwady|Tanintharyi|Kachin|Kayah|Kayin|Chin|Mon|Rakhine|Shan'),
  BN: L('Brunei-Muara|Belait|Tutong|Temburong'),
  TL: L('Dili|Aileu|Ainaro|Baucau|Bobonaro|Cova Lima|Ermera|Lautem|Liquica|Manatuto|Manufahi|Viqueque|Oecusse'),
  SG: [], // thành quốc: chỉ có cấp quốc gia
};

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// code = slug ổn định dùng làm khoá nhóm (ví dụ TH:p:chiang-mai); name = chữ Latinh; th = tên tiếng Thái (chỉ Thái Lan)
const SUBS = Object.fromEntries(Object.entries(RAW).map(([cc, list]) => [cc, list.map((x) => {
  const [name, th] = x.split('~');
  return th ? { code: slug(name), name, th } : { code: slug(name), name };
})]));

export const subdivisionsOf = (cc) => SUBS[cc] || [];
export const subdivisionOf = (cc, code) => subdivisionsOf(cc).find((s) => s.code === code);
// tên theo ngôn ngữ người xem: người dùng ไทย thấy tên tiếng Thái của tỉnh Thái Lan, còn lại chữ Latinh
export const subdivisionName = (s, lang) => (lang === 'th' && s.th ? s.th : s.name);
