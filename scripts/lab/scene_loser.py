# 体験の一場面を実映像で描き出す: 神戸の映像 → 倒れた敗者のかけらを押す → 他の競技の「負けた側」のかけらが集まる
# → 勝者の歓喜と敗者が左右（縦画面は上下）に並んで次々流れる。
#   /usr/bin/python3 scripts/lab/scene_loser.py <srcDir: <no>.mp4> <thumbsDir> <fontDir> <outDir> [pc|sp]
import sys, os, subprocess, math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

SRC, THUMBS, FONTS, OUT = sys.argv[1:5]
MODE = sys.argv[5] if len(sys.argv) > 5 else "pc"
W, H = (1280, 720) if MODE == "pc" else (720, 1280)
FPS = 30
F9 = lambda s: ImageFont.truetype(f"{FONTS}/NotoSansJP-900.ttf", s)
F7 = lambda s: ImageFont.truetype(f"{FONTS}/NotoSansJP-700.ttf", s)
YEL = (255, 255, 0)
os.makedirs(OUT, exist_ok=True)
TMP = f"{OUT}/src"; os.makedirs(TMP, exist_ok=True)

def clip(name, no, t0, dur, speed=1.0):  # speed<1 はスロー（敗者の映像が短いときに使う）
  d = f"{TMP}/{name}_{t0}"
  if not os.path.isdir(d) or len(os.listdir(d)) < int(dur * FPS) - 2:
    os.makedirs(d, exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(t0), "-t", str(dur), "-i", f"{SRC}/{no}.mp4", "-vf", f"fps={FPS},scale=1280:720", "-q:v", "3", f"{d}/%04d.jpg"], check=True)
  fs = sorted(os.listdir(d))
  return lambda t: Image.open(f"{d}/{fs[min(len(fs) - 1, max(0, int(t * speed * FPS)))]}").convert("RGB")

# 素材（時刻はすべて実フレームで確認済み）
K = clip("K", "090", 47.4, 8.5)          # 神戸: 47.4〜（49前後 勝者の歓喜 → 51.4〜 敗者）
PAIRS = [  # (勝者, 敗者, 字幕)
  (clip("W1", "090", 47.0, 3.4), clip("L1", "090", 51.4, 2.9, 0.9), "ラグビー　リーグワン決勝　神戸 × クボタ"),
  (clip("W2", "010", 50.0, 3.4), clip("L2", "010", 55.2, 3.4), "W杯　ブラジル × 日本"),
  (clip("W3", "030", 7.0, 3.4), clip("L3", "030", 22.0, 2.3, 0.72), "ACL決勝　アル・アハリ × 町田"),
  (clip("W4", "088", 27.6, 3.4), clip("L4", "088", 38.6, 3.4), "パシフィックネーションズカップ　日本 × フィジー"),
]
def keyframe(no, t):
  p = f"{TMP}/key_{no}_{t}.png"
  if not os.path.exists(p): subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(t), "-i", f"{SRC}/{no}.mp4", "-frames:v", "1", "-vf", "scale=1280:720", p], check=True)
  return Image.open(p).convert("RGB")
# かけら = その人のその1秒の切り抜き（正規化した矩形）と短い名前
FRAG = [
  dict(img=keyframe("090", 52.4), box=(0.06, 0.40, 0.96, 0.86), name="倒れ込んだ敗者", sub="ラグビー　0:52"),
  dict(img=keyframe("010", 55.8), box=(0.14, 0.18, 0.80, 0.96), name="顔を覆う田中碧", sub="W杯　0:55"),
  dict(img=keyframe("030", 23.0), box=(0.24, 0.32, 1.00, 0.88), name="大の字の守護神", sub="ACL　0:23"),
  dict(img=keyframe("088", 40.0), box=(0.28, 0.14, 0.78, 0.98), name="膝をつくフィジー", sub="ラグビー日本代表　0:40"),
]
for f in FRAG:
  x0, y0, x1, y1 = f["box"]; f["crop"] = f["img"].crop((int(x0 * 1280), int(y0 * 720), int(x1 * 1280), int(y1 * 720)))
THS = [Image.open(f"{THUMBS}/{x}").convert("RGB") for x in sorted(os.listdir(THUMBS)) if x.endswith(".jpg")]

ease = lambda k: (lambda k: 4 * k * k * k if k < 0.5 else 1 - (-2 * k + 2) ** 3 / 2)(min(1, max(0, k)))
clamp = lambda x, a=0.0, b=1.0: min(b, max(a, x))
lerp = lambda a, b, k: a + (b - a) * k

def cover(im, w, h):
  iw, ih = im.size; s = max(w / iw, h / ih); im = im.resize((max(1, int(iw * s)), max(1, int(ih * s))), Image.BILINEAR)
  l, t = (im.width - w) // 2, (im.height - h) // 2; return im.crop((l, t, l + w, t + h))
def paste_panel(dst, im, rect, alpha=1.0, edge=None, ew=4):
  x, y, w, h = [int(round(v)) for v in rect]
  if w < 2 or h < 2 or alpha <= 0.01: return
  p = cover(im, w, h)
  if edge:
    e = Image.new("RGB", (w + ew * 2, h + ew * 2), edge); m = Image.new("L", e.size, int(255 * alpha)); dst.paste(e, (x - ew, y - ew), m)
  dst.paste(p, (x, y), Image.new("L", (w, h), int(255 * alpha)))
def text(d, xy, s, font, fill=(255, 255, 255), anchor="la", alpha=1.0):
  if alpha <= 0.01: return
  c = tuple(int(v) for v in fill) + (int(255 * alpha),)
  d.text((xy[0] + 2, xy[1] + 2), s, font=font, fill=(0, 0, 0, int(200 * alpha)), anchor=anchor); d.text(xy, s, font=font, fill=c, anchor=anchor)

T_TAP, T_LIFT, T_GATHER, T_SPLIT, T_PAIRS = 5.0, 6.2, 9.6, 10.6, 3.0
END = T_SPLIT + 1.0 + T_PAIRS * len(PAIRS) + 1.4
# 集まったときの置き場所（PC: 2×2、縦: 縦に4つ）
def slots():
  if MODE == "pc":
    pw, ph = W * 0.40, W * 0.40 * 9 / 16; gx, gy = W * 0.03, H * 0.07
    cx, cy = W / 2, H / 2 - 10
    return [(cx - pw - gx / 2, cy - ph - gy / 2, pw, ph), (cx + gx / 2, cy - ph - gy / 2, pw, ph), (cx - pw - gx / 2, cy + gy / 2, pw, ph), (cx + gx / 2, cy + gy / 2, pw, ph)]
  gy = 62; ph = (H - 150 - 3 * gy) / 4; pw = ph * 16 / 9
  top = 96
  return [((W - pw) / 2, top + i * (ph + gy), pw, ph) for i in range(4)]
SL = slots()
random.seed(3)
DRIFT = [(random.uniform(0, 2 * math.pi), random.uniform(0.15, 0.45), random.uniform(0.6, 1.0)) for _ in THS]

n = int(END * FPS)
for fi in range(n):
  T = fi / FPS
  fr = Image.new("RGB", (W, H), (0, 0, 0))
  d = ImageDraw.Draw(fr, "RGBA")
  if T < T_TAP:  # A: 神戸の映像
    fr.paste(cover(K(T), W, H), (0, 0))
  elif T < T_SPLIT:  # B/C: 押したかけらが持ち上がり、他の競技の負けた側のかけらが集まる
    kf = K(T_TAP)
    k = ease((T - T_TAP) / 1.0)
    # 背景の映像は暗く、奥へ下がる
    s = lerp(1, 0.9, k); bw, bh = W * s, H * s
    fr.paste(cover(kf, int(bw), int(bh)).point(lambda v: v * lerp(1, 0.18, k) * (1 - clamp((T - T_LIFT) / 1.2))), (int((W - bw) / 2), int((H - bh) / 2)))
    # 他の瞬間が遠ざかる（100本の中から選ばれていく）
    dk = clamp((T - T_LIFT + 0.3) / 2.6)
    if 0 < dk < 1:
      for (a, r0, sc), th in zip(DRIFT, THS):
        r = lerp(r0, r0 + 0.8, ease(dk)); tw = W * 0.12 * sc * lerp(1, 0.4, dk)
        x = W / 2 + math.cos(a) * r * W - tw / 2; y = H / 2 + math.sin(a) * r * H * 0.9 - tw * 9 / 32
        paste_panel(fr, th, (x, y, tw, tw * 9 / 16), alpha=0.55 * (1 - dk) * min(1, dk * 4))
    for i, f in enumerate(FRAG):
      x0, y0, x1, y1 = f["box"]
      if i == 0:  # 押したかけら: 映像の中の位置から持ち上がる
        cs = max(bw / 1280, bh / 720); ox, oy = (W - bw) / 2 + (bw - 1280 * cs) / 2, (H - bh) / 2 + (bh - 720 * cs) / 2
        src = (ox + x0 * 1280 * cs, oy + y0 * 720 * cs, (x1 - x0) * 1280 * cs, (y1 - y0) * 720 * cs)
        mid = (W * 0.27, H * 0.22, W * 0.46, W * 0.46 * 9 / 16) if MODE == "pc" else ((W - SL[0][2] * 1.3) / 2, H * 0.32, SL[0][2] * 1.3, SL[0][3] * 1.3)
        r = [lerp(a, b, k) for a, b in zip(src, mid)]
        g = ease((T - T_LIFT) / 1.4); r = [lerp(a, b, g) for a, b in zip(r, SL[0])]
        paste_panel(fr, f["crop"], r, edge=YEL, ew=int(lerp(0, 4, k)))
        lab_a = clamp((T - T_TAP - 0.4) / 0.4)
      else:  # 集まってくるかけら: 奥の一点から飛んでくる
        g = ease((T - T_LIFT - 0.15 - i * 0.35) / 1.3)
        if g <= 0: continue
        sx, sy, sw, sh = SL[i]; c0 = (W / 2, H * 0.45)
        cx, cy = lerp(c0[0], sx + sw / 2, g), lerp(c0[1], sy + sh / 2, g); sc = lerp(0.05, 1, g)
        r = (cx - sw * sc / 2, cy - sh * sc / 2, sw * sc, sh * sc)
        paste_panel(fr, f["crop"], r, alpha=min(1, g * 3))
        lab_a = clamp((g - 0.8) / 0.2)
      if lab_a > 0:
        rx, ry, rw, rh = r
        text(d, (rx, ry + rh + 8), f["name"], F9(22 if MODE == "pc" else 26), alpha=lab_a)
        text(d, (rx, ry + rh + (36 if MODE == "pc" else 40)), f["sub"], F7(13 if MODE == "pc" else 15), fill=YEL, alpha=lab_a)
  else:  # D/E: 勝者と敗者を並べて流す
    tE = T - T_SPLIT
    pi = min(len(PAIRS) - 1, max(0, int((tE - 1.0) // T_PAIRS))) if tE >= 1.0 else 0
    W_, L_, cap = PAIRS[pi]
    lt = (tE - 1.0) - pi * T_PAIRS if tE >= 1.0 else 0
    if MODE == "pc": A, Bx = (0, 0, W / 2, H), (W / 2, 0, W / 2, H)
    else: A, Bx = (0, 0, W, H / 2), (0, H / 2, W, H / 2)
    if tE < 1.0:  # 集まったかけらが散り、押したかけらが「負けた側」の半分へ広がる
      k = ease(tE / 1.0)
      for i in range(1, 4):
        sx, sy, sw, sh = SL[i]; paste_panel(fr, FRAG[i]["crop"], (sx + (sx - W / 2) * k, sy + (sy - H / 2) * k, sw, sh), alpha=1 - k)
      r = [lerp(a, b, k) for a, b in zip(SL[0], Bx)]
      paste_panel(fr, L_(0) if k > 0.6 else FRAG[0]["crop"], r)
      paste_panel(fr, W_(0), (A[0] - (A[2] * (1 - k)), A[1] - (A[3] * (1 - k) if MODE == "sp" else 0), A[2], A[3]), alpha=k)
    else:
      # 組の切り替え: 0.35秒で新しい組が滑り込む
      sw = ease(lt / 0.35) if pi > 0 else 1
      if pi > 0 and sw < 1:
        Wp, Lp, _ = PAIRS[pi - 1]
        off = sw
        if MODE == "pc":
          paste_panel(fr, Wp(T_PAIRS - 0.01), (A[0], A[1] - H * off, A[2], A[3])); paste_panel(fr, Lp(T_PAIRS - 0.01), (Bx[0], Bx[1] + H * off, Bx[2], Bx[3]))
          paste_panel(fr, W_(lt), (A[0], A[1] + H * (1 - off), A[2], A[3])); paste_panel(fr, L_(lt), (Bx[0], Bx[1] - H * (1 - off), Bx[2], Bx[3]))
        else:
          paste_panel(fr, Wp(T_PAIRS - 0.01), (A[0] - W * off, A[1], A[2], A[3])); paste_panel(fr, Lp(T_PAIRS - 0.01), (Bx[0] + W * off, Bx[1], Bx[2], Bx[3]))
          paste_panel(fr, W_(lt), (A[0] + W * (1 - off), A[1], A[2], A[3])); paste_panel(fr, L_(lt), (Bx[0] - W * (1 - off), Bx[1], Bx[2], Bx[3]))
      else:
        paste_panel(fr, W_(lt), A); paste_panel(fr, L_(lt), Bx)
      # 境目の黄色い細線と、勝った側／負けた側の小さな札、組ごとの字幕
      if MODE == "pc": d.rectangle((W / 2 - 2, 0, W / 2 + 1, H), fill=YEL)
      else: d.rectangle((0, H / 2 - 2, W, H / 2 + 1), fill=YEL)
      ca = clamp((lt - 0.2) / 0.3) * (1 - clamp((lt - T_PAIRS + 0.3) / 0.3)) if pi < len(PAIRS) - 1 else clamp((lt - 0.2) / 0.3)
      if MODE == "pc":
        text(d, (24, 22), "勝った側", F9(18), alpha=ca); text(d, (W - 24, 22), "負けた側", F9(18), fill=YEL, anchor="ra", alpha=ca)
        text(d, (W / 2, H - 34), cap, F7(18), anchor="ma", alpha=ca)
      else:
        text(d, (20, 22), "勝った側", F9(22), alpha=ca); text(d, (20, H / 2 + 20), "負けた側", F9(22), fill=YEL, alpha=ca)
        text(d, (W / 2, H - 46), cap, F7(18), anchor="ma", alpha=ca)
    # 最後は暗転
    fade = clamp((T - (END - 1.0)) / 0.8)
    if fade > 0: fr = Image.blend(fr, Image.new("RGB", (W, H)), fade); d = ImageDraw.Draw(fr, "RGBA")
  # 切り口の名前（押してから最後まで、上に小さく）
  if T >= T_TAP + 0.6:
    la = clamp((T - T_TAP - 0.6) / 0.5)
    text(d, (W / 2, 18 if MODE == "pc" else 26), "負けた側の顔", F9(24 if MODE == "pc" else 30), fill=YEL, anchor="ma", alpha=la)
  # 押す指（タップの見本）
  if 3.6 <= T < T_TAP + 0.5:
    x0, y0, x1, y1 = FRAG[0]["box"]; tx, ty = W * (x0 + x1) / 2, H * (y0 + y1) / 2 + (0 if MODE == "pc" else 0)
    if MODE == "sp": tx, ty = W / 2, H * 0.62
    m = ease((T - 3.6) / 0.9); cx, cy = lerp(W * 0.8, tx, m), lerp(H * 0.95, ty, m)
    pr = math.sin(math.pi * clamp((T - T_TAP + 0.15) / 0.35)) if T > T_TAP - 0.15 else 0
    rr = 18 * (1 - 0.3 * pr); al = 1 - clamp((T - T_TAP - 0.2) / 0.3)
    d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=(255, 255, 255, int(255 * al)), width=3); d.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), fill=(255, 255, 255, int(255 * al)))
  fr.save(f"{OUT}/{fi:04d}.jpg", quality=90)
print("frames", n, "sec", round(END, 2))
