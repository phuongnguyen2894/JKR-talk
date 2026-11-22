"""Tạo bộ sprite Muay Thai từ gói "unisex fighter" (art/muaythai_unisex): chỉ có 2 tư thế thật (idle, punch) cho mỗi góc.
Các hành động còn lại được dựng từ chính hai tư thế đó bằng kỹ thuật "rối cắt" (cut-out): xoay cả thân quanh bàn chân,
bóp/giãn, và xoay riêng chân trước/chân sau quanh hông (đá, bước đi). Đây KHÔNG phải tranh vẽ tay từng khung.
Chạy:  python tools/make_mt_sprites.py        (cần Pillow)   →  public/mt/{red,blue}/<hành động>/NN.webp  và  public/mt/sprites.json
"""
import json, math, os, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'art', 'muaythai_unisex', 'prototype')
OUT = os.path.join(ROOT, 'public', 'mt')
W, H = 480, 528
SS = 2                       # dựng ở độ phân giải gấp đôi rồi thu nhỏ để viền mịn
HEAD = (240.0, 105.0, 96.5)  # tâm và bán kính vòng tròn đầu (cx, cy, r) của gói; thân đã được cắt đúng theo vòng tròn này
FEET = (240.0, 497.0)        # điểm giữa hai bàn chân trên mặt đất
REAR = (140.0, 497.0)        # bàn chân sau (trục khi ngã ngửa)
MARGIN = 6
# vùng chân (tọa độ ảnh gốc 480x528): chân trước (phải) và chân sau (trái), cắt ngay dưới gấu quần
FRONT_LEG = [(258, 398), (300, 390), (338, 382), (354, 398), (384, 470), (382, 502), (272, 502), (262, 440)]
BACK_LEG = [(160, 396), (228, 388), (246, 394), (240, 424), (198, 470), (192, 502), (104, 502), (108, 468), (134, 416)]
FRONT_PIVOT = (305, 392)
BACK_PIVOT = (205, 394)


def load(team, pose):
    img = clean(Image.open(os.path.join(SRC, team, pose, f'{pose}_prototype.png')).convert('RGBA'))
    if pose == 'idle':  # vết thừa mảnh như sợi tóc phía trên găng phải của bản vẽ gốc
        ImageDraw.Draw(img).rectangle([300, 140, 345, 157], fill=(0, 0, 0, 0))
    return img


def clean(img):
    """Bỏ các mảnh vụn nhỏ (vết thừa của bản vẽ) khỏi tư thế gốc."""
    a = img.split()[3].load()
    seen = [[False] * W for _ in range(H)]
    comps = []
    for y in range(H):
        for x in range(W):
            if a[x, y] > 40 and not seen[y][x]:
                stack = [(x, y)]; seen[y][x] = True; cells = []
                while stack:
                    cx, cy = stack.pop(); cells.append((cx, cy))
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < W and 0 <= ny < H and not seen[ny][nx] and a[nx, ny] > 40:
                            seen[ny][nx] = True; stack.append((nx, ny))
                comps.append(cells)
    big = max(len(c) for c in comps)
    px = img.load()
    for c in comps:
        if len(c) < big * 0.005:
            for x, y in c:
                px[x, y] = (0, 0, 0, 0)
    return img


def split_legs(idle):
    """Tách tư thế idle thành: thân (không chân), chân trước, chân sau."""
    parts = {}
    torso = idle.copy()
    alpha = torso.split()[3]
    for name, poly in (('front', FRONT_LEG), ('back', BACK_LEG)):
        mask = Image.new('L', (W, H), 0); ImageDraw.Draw(mask).polygon(poly, fill=255)
        leg = Image.new('RGBA', (W, H), (0, 0, 0, 0)); leg.paste(idle, (0, 0), mask)
        parts[name] = leg
        alpha = Image.composite(Image.new('L', (W, H), 0), alpha, mask)
    torso.putalpha(alpha)
    parts['torso'] = torso
    return parts


def rot_about(img, ang, piv):
    big = img.resize((W * SS, H * SS), Image.BICUBIC)
    out = big.rotate(ang, center=(piv[0] * SS, piv[1] * SS), resample=Image.BICUBIC)
    return out.resize((W, H), Image.LANCZOS)


def figure_idle(parts, front=0.0, back=0.0):
    f = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    if back: f.alpha_composite(rot_about(parts['back'], back, BACK_PIVOT))
    else: f.alpha_composite(parts['back'])
    if front: f.alpha_composite(rot_about(parts['front'], front, FRONT_PIVOT))
    else: f.alpha_composite(parts['front'])
    f.alpha_composite(parts['torso'])
    return f


def transform(img, ang=0.0, sx=1.0, sy=1.0, tx=0.0, ty=0.0, piv=FEET):
    """Xoay (ngược chiều kim đồng hồ là dương), co giãn quanh piv, rồi tịnh tiến. Dựng trên khung rộng gấp đôi (đệm quanh)
    để phần văng ra ngoài khung không bị cắt trước khi đo. Trả về (ảnh khung lớn 2W x 2H, hàm đổi tọa độ trong khung lớn)."""
    ox, oy = W // 2, H // 2
    th = math.radians(ang); c, s_ = math.cos(th), math.sin(th)
    pv = (piv[0] + ox, piv[1] + oy)

    def fwd(x, y):  # x, y theo tọa độ ảnh gốc (chưa đệm) → tọa độ khung lớn
        qx, qy = (x + ox - pv[0]) * sx, (y + oy - pv[1]) * sy
        return pv[0] + qx * c + qy * s_ + tx, pv[1] - qx * s_ + qy * c + ty

    def inv(x, y):  # khung lớn → tọa độ ảnh đã đệm
        qx, qy = x - pv[0] - tx, y - pv[1] - ty
        return pv[0] + (qx * c - qy * s_) / sx, pv[1] + (qx * s_ + qy * c) / sy

    pad = Image.new('RGBA', (2 * W, 2 * H), (0, 0, 0, 0)); pad.paste(img, (ox, oy))
    big = pad.resize((2 * W * SS, 2 * H * SS), Image.BICUBIC)
    (a0, b0), (a1, b1), (a2, b2) = inv(0, 0), inv(1, 0), inv(0, 1)
    coef = (a1 - a0, a2 - a0, SS * a0, b1 - b0, b2 - b0, SS * b0)
    out = big.transform((2 * W * SS, 2 * H * SS), Image.AFFINE, coef, resample=Image.BICUBIC)
    return out.resize((2 * W, 2 * H), Image.LANCZOS), fwd


def bbox(img):
    return img.split()[3].point(lambda v: 255 if v > 40 else 0).getbbox()


def render(src_img, **kw):
    """Biến đổi, thu nhỏ nếu quá to, rồi dịch vào trong khung (cách mép MARGIN). Trả về (ảnh W x H, (cx, cy, r) của đầu)."""
    ox, oy = W // 2, H // 2
    for _ in range(3):
        big, fwd = transform(src_img, **kw)
        hx, hy = fwd(HEAD[0], HEAD[1]); sc = (kw.get('sx', 1) + kw.get('sy', 1)) / 2; hr = HEAD[2] * sc
        bb = bbox(big)
        x0, y0 = min(bb[0], hx - hr) - ox, min(bb[1], hy - hr) - oy
        x1, y1 = max(bb[2], hx + hr) - ox, max(bb[3], hy + hr) - oy
        w, h = x1 - x0, y1 - y0
        if w > W - 2 * MARGIN or h > H - 2 * MARGIN:
            k = min((W - 2 * MARGIN) / w, (H - 2 * MARGIN) / h) * 0.99
            kw = dict(kw); kw['sx'] = kw.get('sx', 1) * k; kw['sy'] = kw.get('sy', 1) * k
            continue
        break
    dx = MARGIN - x0 if x0 < MARGIN else (W - MARGIN - x1 if x1 > W - MARGIN else 0)
    dy = MARGIN - y0 if y0 < MARGIN else (H - MARGIN - y1 if y1 > H - MARGIN else 0)
    dx, dy = int(round(dx)), int(round(dy))
    img = big.crop((ox - dx, oy - dy, ox - dx + W, oy - dy + H))
    return img, (round(hx - ox + dx, 1), round(hy - oy + dy, 1), round(hr, 1))


def frames_for(team, only=()):
    idle, punch = load(team, 'idle'), load(team, 'punch')
    parts = split_legs(idle)
    sin = math.sin

    def walk():  # hai chân luân phiên bước, thân nhún (lặp)
        out = []
        for i in range(7):
            p = 2 * math.pi * i / 7
            out.append(render(figure_idle(parts, front=9 * max(0, sin(p)), back=9 * max(0, -sin(p))), ang=1.2 * sin(p), ty=-5 * abs(sin(p))))  # mỗi chân chỉ bước tới (không xoay ngược) để mối nối không lộ
        return out

    def kick():  # chân trước nhấc lên đá (rối cắt), thân ngả nhẹ ra sau
        return [render(figure_idle(parts, front=fa, back=ba), ang=min(8, fa / 9), tx=tx)
                for fa, ba, tx in [(0, 0, 0), (22, 0, 0), (50, 0, 4), (72, -4, 8), (72, -4, 8), (40, 0, 4), (12, 0, 0)]]

    make = {
        # idle: thở nhẹ (lặp)
        'idle': lambda: [render(idle, sx=1 - 0.006 * sin(2 * math.pi * i / 5), sy=1 + 0.012 * sin(2 * math.pi * i / 5), ang=0.6 * sin(2 * math.pi * i / 5 + 1)) for i in range(5)],
        'walk': walk,
        # punch: lấy đà, tung đòn (tư thế thật), giữ, thu về
        'punch': lambda: [render(idle, ang=3, tx=-4), render(punch, ang=2, tx=-6), render(punch, ang=-2, tx=10), render(punch, tx=6), render(idle)],
        'kick': kick,
        # block: co người đỡ đòn (lặp)
        'block': lambda: [render(idle, sx=1 + 0.01 * k, sy=0.975 - 0.008 * k, ang=1.5 + 0.8 * k, tx=-3) for k in (0, 1, 0, -1)],
        # hit: giật người ra sau rồi hồi lại
        'hit': lambda: [render(idle, ang=a, tx=t, sy=s) for a, t, s in [(4, -6, 0.99), (9, -14, 0.97), (5, -8, 0.985), (1, -2, 1.0)]],
        # knockdown: ngã ngửa quanh bàn chân sau
        'knockdown': lambda: [render(idle, ang=a, piv=REAR, tx=t) for a, t in [(0, 0), (14, -6), (38, -18), (68, -34), (90, -50)]],
        # victory: nhún nhảy ăn mừng rồi giữ dáng
        'victory': lambda: [render(idle, sx=s, sy=s, ang=a, ty=t) for s, a, t in [(0.95, 0, 6), (0.96, -3, -8), (0.96, 3, -2), (0.97, -2, -6), (0.98, 0, 0)]],
        # defeat: xìu xuống, cúi người
        'defeat': lambda: [render(idle, ang=a, sy=s, ty=t) for a, s, t in [(0, 1.0, 0), (-3, 0.96, 6), (-6, 0.92, 10), (-8, 0.89, 14)]],
    }
    return {a: fn() for a, fn in make.items() if not only or a in only}


FPS = {'idle': (8, True), 'walk': (8, True), 'punch': (8, False), 'kick': (8, False), 'block': (8, True), 'hit': (8, False), 'knockdown': (8, False), 'victory': (8, False), 'defeat': (8, False)}


def main():
    only = set(filter(None, os.environ.get('ONLY', '').split(',')))  # ví dụ ONLY=walk,knockdown: chỉ tạo lại các hành động này
    meta = json.load(open(os.path.join(OUT, 'sprites.json'), encoding='utf-8')) if only else {'w': W, 'h': H, 'teams': {}}
    total = 0
    for team in ('red', 'blue'):
        meta['teams'].setdefault(team, {})
        for act, frames in frames_for(team, only).items():
            d = os.path.join(OUT, team, act)
            os.makedirs(d, exist_ok=True)
            for old in os.listdir(d):
                os.remove(os.path.join(d, old))
            lst = []
            for i, (img, (cx, cy, r)) in enumerate(frames):
                rel = f'{team}/{act}/{i:02d}.webp'
                img.save(os.path.join(OUT, rel), 'WEBP', quality=84, method=6)
                total += os.path.getsize(os.path.join(OUT, rel))
                lst.append({'src': rel, 'head': {'cx': cx, 'cy': cy, 'r': r}})
            meta['teams'][team][act] = {'fps': FPS[act][0], 'loop': FPS[act][1], 'frames': lst}
    with open(os.path.join(OUT, 'sprites.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, separators=(',', ':'))
    print('done', sum(len(a['frames']) for t in meta['teams'].values() for a in t.values()), 'frames,', round(total / 1024), 'KB')


if __name__ == '__main__':
    main()
