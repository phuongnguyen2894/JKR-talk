"""Dọn các khung hoạt hình thú cưng bị cắt từ bảng tổng quan (nền trắng mờ còn sót, thanh nhãn tím, mảnh của khung bên cạnh).
Cách làm: loại nền sáng nối với mép khung (không lọt qua viền tối của nhân vật), bỏ mọi mảnh chạm mép khung hoặc quá xa nhân vật,
giữ lại biểu tượng cảm xúc gần nhân vật (Zz, giọt mồ hôi, bong bóng), rồi dịch cả khung để chân nhân vật chạm đúng đường chân và nhân vật nằm giữa như các khung đã duyệt.
KHÔNG vẽ lại hay chỉnh màu: chỉ xóa nền và căn vị trí.
Dùng:  python tools/clean_pet_frames.py <thư mục gốc chứa <hành động>/abu_0_<hành động>_NN.png> <thư mục ra> [thư mục idle mẫu để lấy chiều cao/vị trí]
"""
import os, sys, glob
from collections import deque
from PIL import Image

S = 384
BASELINE = 359  # đáy bàn chân của các khung idle đã duyệt (bbox dưới 359)


def is_bg(p):
    r, g, b, a = p
    return a < 30 or (min(r, g, b) >= 195 and max(r, g, b) - min(r, g, b) <= 48)


def clean(img):
    px = img.load()
    # vùng nội dung của khung cắt (ngoài vùng này là lề trong suốt); mảnh chạm mép vùng này là mảnh bị cắt dở
    ab = img.split()[3].point(lambda v: 255 if v > 30 else 0).getbbox() or (0, 0, S, S)
    lo_x, lo_y, hi_x, hi_y = ab[0] + 1, ab[1] + 1, ab[2] - 2, ab[3] - 2
    bg = [[is_bg(px[x, y]) for x in range(S)] for y in range(S)]
    out = [[False] * S for _ in range(S)]  # True = nền bị loại
    dq = deque()
    for i in range(S):
        for x, y in ((i, 0), (i, S - 1), (0, i), (S - 1, i)):
            if bg[y][x] and not out[y][x]:
                out[y][x] = True; dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < S and 0 <= ny < S and bg[ny][nx] and not out[ny][nx]:
                out[ny][nx] = True; dq.append((nx, ny))
    fg = [[not out[y][x] for x in range(S)] for y in range(S)]
    seen = [[False] * S for _ in range(S)]
    comps = []
    for y in range(S):
        for x in range(S):
            if fg[y][x] and not seen[y][x]:
                q = deque([(x, y)]); seen[y][x] = True; cells = []
                while q:
                    cx, cy = q.popleft(); cells.append((cx, cy))
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            nx, ny = cx + dx, cy + dy
                            if 0 <= nx < S and 0 <= ny < S and fg[ny][nx] and not seen[ny][nx]:
                                seen[ny][nx] = True; q.append((nx, ny))
                xs = [c[0] for c in cells]; ys = [c[1] for c in cells]
                comps.append({'cells': cells, 'bbox': (min(xs), min(ys), max(xs), max(ys))})
    # nhân vật chính: mảnh lớn nhất không chạm mép khung
    touches = lambda b: b[0] <= lo_x or b[1] <= lo_y or b[2] >= hi_x or b[3] >= hi_y
    free = [c for c in comps if not touches(c['bbox'])]
    biggest = max(comps, key=lambda c: len(c['cells']))
    if not free or touches(biggest['bbox']):
        return None, None  # nhân vật chính bị cắt dở ở mép khung: không dùng được
    main = max(free, key=lambda c: len(c['cells']))
    mb = main['bbox']
    keep = [main]
    for c in free:
        if c is main or len(c['cells']) < 30:
            continue
        b = c['bbox']
        gap = max(mb[0] - b[2], b[0] - mb[2], mb[1] - b[3], b[1] - mb[3], 0)
        if gap <= 70:  # biểu tượng cảm xúc nằm sát nhân vật
            keep.append(c)
    res = Image.new('RGBA', (S, S), (0, 0, 0, 0)); rp = res.load()
    for c in keep:
        for x, y in c['cells']:
            rp[x, y] = px[x, y][:3] + (255,)
    # lấp lỗ nhỏ bên trong nhân vật (điểm ảnh sáng bị coi là nền nhưng nằm trong thân): các điểm này không nối với mép nên đã được giữ
    return res, mb


def main():
    src, dst = sys.argv[1], sys.argv[2]
    ref = sys.argv[3] if len(sys.argv) > 3 else None
    cx_t = 200.0
    if ref:  # lấy vị trí ngang trung bình của nhân vật trong các khung idle đã duyệt
        xs = []
        for f in glob.glob(os.path.join(ref, '*.png')):
            bb = Image.open(f).convert('RGBA').getbbox(); xs.append((bb[0] + bb[2]) / 2)
        cx_t = sum(xs) / len(xs)
    for act in sorted(os.listdir(src)):
        d = os.path.join(src, act)
        if not os.path.isdir(d):
            continue
        os.makedirs(os.path.join(dst, act), exist_ok=True)
        for f in sorted(glob.glob(os.path.join(d, '*.png'))):
            img, mb = clean(Image.open(f).convert('RGBA'))
            if img is None:
                print('BO QUA (khong tim thay nhan vat):', f); continue
            dx = int(round(cx_t - (mb[0] + mb[2]) / 2)); dy = BASELINE - mb[3]
            out = Image.new('RGBA', (S, S), (0, 0, 0, 0)); out.paste(img, (dx, dy))
            name = os.path.basename(f)
            out.save(os.path.join(dst, act, name))
            print(act, name, 'nhan vat', mb, '-> dich', dx, dy)


if __name__ == '__main__':
    main()
