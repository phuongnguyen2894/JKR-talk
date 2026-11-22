# YÊU CẦU THIẾT KẾ: GAME "NUÔI THÚ" (web app mobile)

## 1. Bối cảnh

Game nuôi thú ảo nằm trong một web app chat tiếng Việt dành cho cộng đồng fan (màu chủ đạo **tím**). Người chơi nuôi tối đa 6 bạn thú trong **một khu nhà chung**, chăm sóc mỗi ngày (cho ăn, chơi, tắm, ngủ), tăng điểm "Thân thiết", mua đồ ở cửa hàng và mở rộng khu nhà. Dùng chủ yếu trên **điện thoại dọc (390×844)**.

**Phong cách:** dễ thương, ấm áp, chibi 2D, nét sạch, tô màu phẳng kèm đổ bóng nhẹ. Không rùng rợn, không giống sản phẩm có bản quyền (không dùng nhân vật hay phong cách của Pokémon, Tamagotchi hay game có sẵn).

**Bảng màu:** tím chủ đạo `#6D28D9` (tím đậm `#4C1D95`, tím nhạt `#EDE9FE`), nền sáng `#FAF7FF`, cỏ xanh `#8FD17A`, trời `#BFE3FF`. Vật phẩm dùng màu tươi, viền mềm, độ tương phản đủ đọc trên màn nhỏ.

## 2. Nhân vật (6 bạn, 3 loài)

Mỗi bạn là **chibi, đầu to, mắt tròn lớn**, cùng một phong cách vẽ. Mỗi bạn có **màu nhấn** để làm viền huy hiệu (không bắt buộc là màu lông).

| Tên | Loài / giống | Tính cách | Ngoại hình | Màu nhấn |
|---|---|---|---|---|
| **Juad** | Rùa | Chậm mà chắc, hiền | Mai tròn nâu cam có họa tiết, má hồng | `#B45309` |
| **Abu** | Vẹt | Nói nhiều, tinh nghịch | Vẹt đuôi dài, lông đỏ, cánh xanh vàng, mỏ cong | `#B91C1C` |
| **Uni** | Chó **Pomeranian** (phốc sóc, lông xù tròn như cục bông) | Dịu dàng, thích tắm | Thân tròn nhỏ, lông kem xù bồng bềnh, tai nhỏ nhọn dựng, mõm ngắn, đuôi xù cuộn lên lưng, mặt nhỏ nổi giữa đám lông | `#0E7490` |
| **Charsiu** | Chó **golden retriever** | Tham ăn, đói nhanh | Lông vàng nâu đậm hơn (màu thịt xá xíu), thân mập tròn, tai cụp, hay thè lưỡi | `#B91C5C` |
| **Tofu** | Chó **golden retriever** | Hay ngủ, hiền | Lông vàng kem nhạt (như đậu hũ), tai cụp, thanh hơn Charsiu, mắt lim dim ngái ngủ | `#4D7C0F` |
| **Udon** | Chó **xúc xích** (dachshund) | Nghịch ngợm, nhiều năng lượng | Thân dài, chân ngắn, tai cụp dài, lông vàng be màu sợi mì, đuôi cong vẫy | `#6D28D9` |

### Lưu ý phân biệt các bạn

- **Hai bạn golden phải phân biệt được.** Charsiu: lông **vàng nâu đậm**, **mập tròn**, thè lưỡi. Tofu: lông **vàng kem nhạt**, **thanh hơn**, mắt lim dim, hay nằm cuộn. Khác tông màu, dáng người và nét mặt, không chỉ khác màu.
- **Udon dáng dài** nên khung hình sprite của bạn ấy cần rộng hơn. Giữ chiều cao tương đương các bạn khác để cảnh không bị lệch.
- **Uni** lông xù nên viền ngoài mềm, nhiều bồng. Khi **tắm**, lông xẹp xuống, nhìn nhỏ hẳn lại. Nên vẽ cả trạng thái này.
- **Giống chó khi lớn lên:** golden to và cao rõ rệt; Pomeranian chỉ xù hơn chứ không to nhiều; xúc xích thân dài thêm.
- **Uni là Pomeranian:** giống chó nhỏ, lông hai lớp dày xù, mặt giống cáo nhỏ. Cần vẽ đúng đặc điểm này (tai nhọn dựng, đuôi xù cuộn lên lưng), tránh vẽ thành poodle hay bichon.

### 4 giai đoạn lớn lên (mỗi bạn có đủ 4 bản)

1. **Bé:** nhỏ nhất, đầu rất to, mắt to.
2. **Con nhỏ:** cao hơn một chút, bắt đầu có nét riêng.
3. **Thiếu niên:** thân cân đối hơn, có thêm phụ kiện nhỏ (nơ, khăn).
4. **Trưởng thành:** to nhất, thần thái tự tin, có thêm vương miện nhỏ hoặc huy hiệu.

Từ bản Bé đến Trưởng thành vẫn **nhận ra là cùng một nhân vật** (cùng màu lông, họa tiết, nét mặt đặc trưng).

### Biểu cảm / trạng thái cho mỗi bạn, mỗi giai đoạn

- Mặc định (idle, nhún nhẹ)
- Vui (rất vui)
- Đói (ôm bụng, nhìn bát trống)
- Buồn chán
- Bẩn (có vệt bùn)
- Buồn ngủ
- Đang ăn
- Đang chơi
- Đang tắm (bọt xà phòng)
- Đang ngủ (nằm cuộn, "Zzz")
- Buồn / bị bỏ mặc (mặt xệ)
- **Phản ứng với đồ ăn / đồ chơi** (8 hoạt hình, xem mục 7): `feed_love`, `feed_like`, `feed_neutral`, `feed_dislike`, `play_love`, `play_like`, `play_neutral`, `play_dislike`

### Quy cách sprite

- Nền trong suốt, PNG/WebP, **512×512 mỗi khung**, nhân vật nhìn nghiêng 3/4 (hơi quay mặt), chân chạm đáy khung, cùng cỡ trong mọi khung của một bạn.
- Tên file: `{ten}_{giaidoan1-4}_{trangthai}.png`, ví dụ `charsiu_2_eating.png`.
- Mỗi trạng thái động (idle, ăn, chơi, tắm, ngủ) có 4–6 khung để chạy hoạt hình.

## 3. Khu nhà (cảnh nền)

Cảnh ngang, có chiều sâu nhẹ (trời phía trên, cỏ phía dưới), thú đi lại trong cảnh. **5 bậc**, mỗi bậc đẹp và rộng hơn:

1. **Góc nhỏ:** một mảng cỏ nhỏ, bụi cây, hàng rào thấp.
2. **Sân vườn:** thêm cây, hoa, đường lát đá.
3. **Nhà có sân:** có ngôi nhà nhỏ, bàn ghế, xích đu.
4. **Biệt thự nhỏ:** có đài phun nước, cổng, vườn hoa.
5. **Công viên riêng:** hồ nhỏ, cầu gỗ, đu quay, cây to, đèn lồng.

Cảnh có **hai phiên bản ngày và đêm**. Vùng đặt thú cách xa mép, chừa chỗ cho chỗ ở (nhà, lồng, bể).

## 4. Vật phẩm cửa hàng

Mỗi loài có bộ **riêng**, **số lượng bằng nhau**. Icon vuông 256×256, nền trong suốt, cùng phong cách. Bậc cao của chỗ ở phải rõ ràng đẹp và to hơn bậc thấp.

### Chỗ ở (3 bậc mỗi loài)

| Loài | Loại | Bậc 1 | Bậc 2 | Bậc 3 |
|---|---|---|---|---|
| Chó | Nhà | Nhà gỗ | Nhà mái đỏ | Nhà vườn |
| Vẹt | Lồng | Lồng tre | Lồng mạ vàng | Lồng cung điện |
| Rùa | Bể | Bể kính | Bể thủy sinh | Bể đại dương |

### Đồ ăn (4 món cao cấp mỗi loài, kèm 3 món miễn phí)

| Loài | Món cao cấp | Món miễn phí |
|---|---|---|
| Chó | Kem sữa, Thịt bò, Vitamin cho chó, Tiệc xương | Bánh quy, Xương gặm, Thịt |
| Vẹt | Kẹo trái cây, Hạt dinh dưỡng, Vitamin cho vẹt, Tiệc hạt | Hạt, Trái cây, Ngô |
| Rùa | Dưa hấu mát, Tôm hùm nhỏ, Canxi mai rùa, Tiệc rong biển | Rau củ, Rong biển, Tôm tép |

### Đồ chơi (4 món mỗi loài)

| Loài | Đồ chơi |
|---|---|
| Chó | Quả bóng, Xương cao su, Đĩa bay, Cầu trượt |
| Vẹt | Chuông nhỏ, Gương nhỏ, Xích đu, Cầu leo |
| Rùa | Bóng nổi, Hòn đá ngộ nghĩnh, Thác nước mini, Đảo cát |

## 5. Giao diện (các màn hình)

Thiết kế cho **390×844**, có chế độ sáng, hiển thị rõ chữ tiếng Việt có dấu. Mỗi màn gồm bản vẽ và các trạng thái chính.

1. **Màn chính (khu nhà):** thanh tiêu đề (nút quay lại, tên game, số dư xu tím có biểu tượng đồng xu), nút "Cửa hàng", cảnh khu nhà có các bạn thú, bảng chăm sóc bạn đang chọn, thẻ khu nhà (đang nuôi x/y, nút nhận nuôi, nút mở rộng kèm giá).
2. **Bảng chăm sóc:** tên, loài, giai đoạn, tâm trạng, thanh Thân thiết (có mốc lên giai đoạn), **4 thanh chỉ số** (No, Vui, Sạch, Khỏe) màu khác nhau (cam, hồng, xanh dương, xanh lá), **4 nút hành động lớn** (Cho ăn, Chơi, Tắm, Ngủ) kèm đếm ngược chờ. Cảnh báo đỏ khi thú buồn (Thân thiết đang bị trừ).
3. **Chọn món ăn / đồ chơi:** hàng chip, món thích có nhãn, món cao cấp màu tím nhạt kèm số lượng.
4. **Nhận nuôi:** danh sách 6 bạn kèm tính cách, sau đó hộp **đặt tên** (có thông báo lỗi trùng tên).
5. **Cửa hàng:** hai hàng tab (loài, rồi Đồ ăn / Đồ chơi / Chỗ ở), thẻ vật phẩm (icon, tên, hiệu quả, giá, nút mua, trạng thái "Đã có", "Đang dùng").
6. **Thăm nhà bạn bè:** cảnh nhà bạn, chọn thú rồi nút "Vuốt ve".
7. **Hiệu ứng:** lên giai đoạn mới (pháo giấy, hào quang), nhận nuôi, mua đồ, vuốt ve (trái tim).

### Bộ icon nhỏ (vector 32px)

No, Vui, Sạch, Khỏe, Thân thiết (trái tim), Xu tím, Cửa hàng, Nhà, Lồng, Bể, Ăn, Chơi, Tắm, Ngủ.

## 6. Yêu cầu giao hàng (làm từng bước)

Hãy làm theo thứ tự và **dừng lại cho tôi duyệt sau mỗi bước**:

1. Bảng phong cách và bảng màu, 1 bản vẽ thử cho Charsiu bản Bé và Trưởng thành.
2. Bộ 6 nhân vật (4 giai đoạn, tư thế mặc định).
3. Bộ biểu cảm/trạng thái cho từng nhân vật.
4. 5 cảnh khu nhà (ngày, đêm).
5. Icon vật phẩm (chỗ ở, đồ ăn, đồ chơi) cho cả 3 loài.
6. Mockup 7 màn hình giao diện.

Nếu thiếu thông tin hoặc chỗ nào mâu thuẫn, **hãy hỏi lại trước khi vẽ**. Mỗi ảnh cho tên file đúng quy ước ở mục 2.

> Lưu ý khi dùng: ChatGPT tạo ảnh từng tấm một và thường không giữ nhân vật nhất quán giữa các lần vẽ. Nên gửi lại ảnh nhân vật đã duyệt kèm mỗi yêu cầu vẽ tiếp theo.

## 7. Phản ứng và hành động theo từng loại đồ ăn, đồ chơi

Mỗi bạn thú có **khẩu vị riêng**. Khi cho ăn hoặc chơi, bạn ấy phản ứng theo 4 mức. Phản ứng là **hoạt hình riêng của từng bạn** (không dùng chung), kèm bong bóng cảm xúc nổi trên đầu khoảng 3 giây.

| Mức | Bong bóng | Ý nghĩa | Hiệu quả trong game |
|---|---|---|---|
| **Rất thích** (`love`) | 😍 | Hưng phấn nhất, hành động to và vui | Chỉ số tăng ×1,25 và cộng thêm Thân thiết |
| **Thích** (`like`) | 😊 | Hài lòng, vẫy đuôi hoặc gật gù | Bình thường |
| **Bình thường** (`neutral`) | 😐 | Thờ ơ, ăn hoặc chơi cho có | Bình thường |
| **Không thích** (`dislike`) | 🤢 | Quay đi, nhăn mặt, né tránh | Chỉ số tăng ×0,6 và bớt Thân thiết (không bao giờ bị trừ điểm) |

**Phân bố công bằng:** mỗi bạn có đúng **7 món ăn** của loài (2 rất thích, 2 thích, 2 bình thường, 1 không thích) và **4 đồ chơi** (mỗi mức đúng 1 món). Hai bạn cùng loài có khẩu vị khác nhau. **Chơi tay không** luôn phản ứng bình thường. Tắm và ngủ không có phản ứng khẩu vị.

### 7.1 Khẩu vị đồ ăn (😍 rất thích · 😊 thích · 😐 bình thường · 🤢 không thích)

| Bạn | 😍 | 😊 | 😐 | 🤢 |
|---|---|---|---|---|
| **Uni** (Pomeranian) | Xương gặm, Kem sữa | Bánh quy, Tiệc xương | Thịt, Thịt bò | Vitamin cho chó |
| **Charsiu** (golden) | Thịt, Thịt bò | Xương gặm, Tiệc xương | Bánh quy, Kem sữa | Vitamin cho chó |
| **Tofu** (golden) | Bánh quy, Kem sữa | Thịt, Tiệc xương | Xương gặm, Vitamin cho chó | Thịt bò |
| **Udon** (xúc xích) | Thịt, Tiệc xương | Thịt bò, Xương gặm | Bánh quy, Vitamin cho chó | Kem sữa |
| **Abu** (vẹt) | Hạt, Hạt dinh dưỡng | Trái cây, Tiệc hạt | Ngô, Kẹo trái cây | Vitamin cho vẹt |
| **Juad** (rùa) | Rau củ, Dưa hấu mát | Tôm tép, Tiệc rong biển | Rong biển, Tôm hùm nhỏ | Canxi mai rùa |

### 7.2 Khẩu vị đồ chơi

| Bạn | 😍 | 😊 | 😐 | 🤢 |
|---|---|---|---|---|
| **Uni** | Xương cao su | Quả bóng | Đĩa bay | Cầu trượt |
| **Charsiu** | Cầu trượt | Xương cao su | Quả bóng | Đĩa bay |
| **Tofu** | Quả bóng | Đĩa bay | Cầu trượt | Xương cao su |
| **Udon** | Đĩa bay | Cầu trượt | Xương cao su | Quả bóng |
| **Abu** | Gương nhỏ | Chuông nhỏ | Xích đu | Cầu leo |
| **Juad** | Hòn đá ngộ nghĩnh | Bóng nổi | Thác nước mini | Đảo cát |

### 7.3 Hành động riêng của từng bạn (để vẽ hoạt hình)

Mỗi ô là **một hoạt hình** cho bạn đó (4 giai đoạn lớn lên, mỗi giai đoạn có đủ 8 hoạt hình). Hành động thể hiện **tính cách**, không chỉ đổi biểu cảm khuôn mặt.

| Bạn | `feed_love` | `feed_like` | `feed_neutral` | `feed_dislike` |
|---|---|---|---|---|
| **Juad** | Thò cổ thật dài, mắt long lanh, nhai chầm chậm mãn nguyện | Nhai nhẩn nha, gật gù | Liếc qua rồi ăn cho có | Rụt cổ vào mai, quay đi |
| **Abu** | Xòe cánh, nhảy trên cần, kêu "ngon quá!" | Mổ lách tách, nghiêng đầu | Mổ thử một miếng rồi thôi | Xù lông, nhả ra, quay mỏ đi |
| **Uni** | Xù bông cả người, vẫy đuôi xù tít mù | Ăn ngoan, đuôi xù khẽ vẫy | Ngửi ngửi rồi ăn từ tốn | Nghiêng đầu, hắt xì, lùi lại |
| **Charsiu** | Nhảy cẫng, liếm mép lia lịa, lưỡi thè dài | Ăn ngấu nghiến, đuôi vẫy phành phạch | Ăn xong còn ngó bát tìm thêm | Ngửi rồi ngoảnh mặt, bụng kêu ọc ọc |
| **Tofu** | Mở to đôi mắt lim dim, vẫy đuôi chậm mãn nguyện | Ăn từ tốn, gật gù | Ngáp một cái rồi ăn | Nhăn mũi, ngủ gật luôn |
| **Udon** | Sủa vang, chạy vòng vòng rồi lao vào ăn | Ăn nhanh, đuôi cong vẫy liên hồi | Ăn vội rồi chạy đi | Hất bát, bới đất chôn món ăn |

| Bạn | `play_love` | `play_like` | `play_neutral` | `play_dislike` |
|---|---|---|---|---|
| **Juad** | Bò vòng vòng, đầu thò ra lắc lư vui sướng | Chậm rãi tới đẩy chơi một lúc | Nhìn đồ chơi rồi bò đi chỗ khác | Rụt cả đầu lẫn chân vào mai |
| **Abu** | Vỗ cánh phành phạch, hót vang | Nhảy nhót vài vòng, hót khe khẽ | Liếc nhìn rồi đậu yên | Kêu quang quác sợ hãi, bay đi |
| **Uni** | Nhảy tưng tưng như cục bông lăn khắp sân | Chạy quanh vài vòng, vui vẻ | Đẩy nhẹ món đồ chơi rồi thôi | Xù lông, núp sau lưng bạn |
| **Charsiu** | Ôm đồ chơi gặm say sưa, mắt híp sung sướng | Ngoạm đồ chơi chạy vòng vòng | Đánh hơi xem đồ chơi có ăn được không | Thở dốc, nằm vật ra |
| **Tofu** | Tỉnh hẳn, lăn tròn rồi nằm ngửa vui vẻ | Chơi một lúc rồi ngáp ngủ | Liếc qua rồi nằm cuộn lại | Quay lưng ngủ tiếp |
| **Udon** | Phóng vụt như tên bắn, thân dài uốn lượn khắp sân | Đuổi theo đồ chơi hăng hái | Cắn thử rồi bỏ đó | Chui tọt vào góc, không thèm ngó |

### 7.4 Yêu cầu vẽ cho phần này

- **8 hoạt hình phản ứng cho mỗi bạn, mỗi giai đoạn** (6 bạn × 4 giai đoạn × 8 = 192 hoạt hình; làm trước giai đoạn Bé và Trưởng thành, các giai đoạn giữa làm sau).
- Mỗi hoạt hình 4–8 khung, chạy một lần rồi về tư thế mặc định (idle).
- **Phân biệt rõ 4 mức ngay cả khi không đọc chữ:** `love` động tác to, nhảy, hào hứng; `like` nhẹ nhàng; `neutral` ít chuyển động; `dislike` thu mình, quay đi, né.
- Vẽ **bong bóng cảm xúc** (😍 😊 😐 🤢) kiểu bong bóng thoại nhỏ, 4 icon vector 64px, cùng phong cách.
- Vật phẩm (đồ ăn, đồ chơi) xuất hiện **trong cảnh** lúc phản ứng (ví dụ bát thịt trước mặt Charsiu), nên mỗi icon vật phẩm cần thêm **bản nhỏ để đặt trong cảnh** (128px, nền trong suốt).
- Đặc biệt chú ý các bạn có dáng riêng: **Udon** thân dài uốn lượn, **Uni** lông xù xẹp xuống khi sợ, **Juad** rụt vào mai (cần vẽ mai khép lại), **Abu** xù lông và xòe cánh.
