"""Chuẩn hóa khung hoạt hình thú cưng giao kích thước khác (ví dụ 315x312) về khung 384x384 của game.
Làm: bỏ đốm nhiễu nhỏ, thu phóng đều theo một tỉ lệ chung (để con vật cùng cỡ với các khung idle đã duyệt), rồi dịch từng hoạt hình
để (1) chân/đáy chạm đường chân y=359, (2) nhân vật ở khung 1 nằm giữa theo chiều ngang như idle (x=192).
Tất cả khung trong cùng một hoạt hình dịch giống nhau để giữ nguyên chuyển động (nhảy, ngả...). KHÔNG vẽ lại.
Dùng:  python tools/normalize_pet_frames.py <thư mục gốc (mỗi hành động một thư mục)> <thư mục ra> <tỉ lệ thu phóng>
"""
import glob, os, statistics, sys
from collections import deque
from PIL import Image

S = 384
BASELINE = 359
CENTER_X = 192


def components(img, thr=30):
    W, H = img.size; a = img.split()[3].load()
    seen = [[False] * W for _ in range(H)]; out = []
    for y in range(H):
        for x in range(W):
            if a[x, y] > thr and not seen[y][x]:
                q = deque([(x, y)]); seen[y][x] = True; cells = []
                while q:
                    cx, cy = q.popleft(); cells.append((cx, cy))
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            nx, ny = cx + dx, cy + dy
                            if 0 <= nx < W and 0 <= ny < H and a[nx, ny] > thr and not seen[ny][nx]:
                                seen[ny][nx] = True; q.append((nx, ny))
                xs = [c[0] for c in cells]; ys = [c[1] for c in cells]
                out.append((cells, (min(xs), min(ys), max(xs), max(ys))))
    return out


def load_clean(path):
    img = Image.open(path).convert('RGBA'); px = img.load()
    comps = components(img)
    big = max(len(c[0]) for c in comps)
    for cells, _ in comps:
        if len(cells) < 12 and len(cells) < big * 0.01:  # đốm nhiễu còn sót sau khi xóa nền
            for x, y in cells:
                px[x, y] = (0, 0, 0, 0)
    main = max(comps, key=lambda c: len(c[0]))[1]
    return img, main


def main():
    src, dst, k = sys.argv[1], sys.argv[2], float(sys.argv[3])
    for act in sorted(os.listdir(src)):
        d = os.path.join(src, act)
        if not os.path.isdir(d):
            continue
        files = sorted(glob.glob(os.path.join(d, '*.png')))
        scaled = []
        for f in files:
            img, mb = load_clean(f)
            w, h = img.size
            img = img.resize((round(w * k), round(h * k)), Image.LANCZOS)
            mb = tuple(round(v * k) for v in mb)
            bb = img.split()[3].point(lambda v: 255 if v > 30 else 0).getbbox()
            scaled.append((img, mb, bb))
        dy = BASELINE - round(statistics.median(bb[3] for _, _, bb in scaled))
        mb0 = scaled[0][1]; dx = round(CENTER_X - (mb0[0] + mb0[2]) / 2)
        os.makedirs(os.path.join(dst, act), exist_ok=True)
        for f, (img, mb, bb) in zip(files, scaled):
            out = Image.new('RGBA', (S, S), (0, 0, 0, 0)); out.paste(img, (dx, dy))
            ob = out.split()[3].point(lambda v: 255 if v > 30 else 0).getbbox()
            note = ''
            if ob is None or ob[0] <= 0 or ob[1] <= 0 or ob[2] >= S or ob[3] >= S:
                note = ' (CHAM MEP KHUNG)'
            out.save(os.path.join(dst, act, os.path.basename(f)))
            print(act, os.path.basename(f), 'dx', dx, 'dy', dy, 'bbox', ob, note)


if __name__ == '__main__':
    main()
