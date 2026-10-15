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
  d = f"{TMP}/{name}_{t0}_{dur}"
  if not os.path.isdir(d) or len(os.listdir(d)) < int(dur * FPS) - 2:
    os.makedirs(d, exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(t0), "-t", str(dur), "-i", f"{SRC}/{no}.mp4", "-vf", f"fps={FPS},scale=1280:720", "-q:v", "3", f"{d}/%04d.jpg"], check=True)
  fs = sorted(os.listdir(d))
  return lambda t: Image.open(f"{d}/{fs[min(len(fs) - 1, max(0, int(t * speed * FPS)))]}").convert("RGB")

# 素材（時刻はすべて実フレームで確認済み。どの区間も主役が途切れずに映っている範囲だけを使う）
# 映像は切り抜かない（顔が枠から切れるため）。組の映像は各素材の区間を PAIR 秒に収まる速さで流す（短い素材はスロー）。
PAIR = 4.5
def fit(no, t0, dur): return clip(f"{no}", no, t0, dur, dur / PAIR)
K = clip("K", "090", 47.4, 8.5)          # 神戸: 47.4〜（勝者の歓喜 → 51.4〜 倒れ込んだ敗者）
PAIRS = [  # (勝者, 敗者, 字幕)
  (fit("090", 47.0, 4.3), fit("090", 51.4, 3.0), "ラグビー　リーグワン決勝　神戸 22-13 クボタ"),
  (fit("010", 49.0, 2.9), fit("010", 58.0, 3.9), "W杯　ブラジル 2-1 日本"),
  (fit("030", 7.0, 3.9), fit("030", 22.0, 2.3), "ACL決勝　アル・アハリ × 町田"),
  (fit("088", 26.5, 3.4), fit("088", 39.0, 3.9), "パシフィックネーションズカップ　日本 × フィジー"),
]
def keyframe(no, t):
  p = f"{TMP}/key_{no}_{t}.png"
  if not os.path.exists(p): subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(t), "-i", f"{SRC}/{no}.mp4", "-frames:v", "1", "-vf", "scale=1280:720", p], check=True)
  return Image.open(p).convert("RGB")
# かけら = その人のその1秒の切り抜き（正規化した矩形。顔と体が入ることを実フレームで確認済み）と短い名前
FRAG = [
  dict(img=keyframe("090", 52.4), box=(0.04, 0.24, 0.66, 0.80), name="倒れ込んだ敗者", sub="ラグビー　0:52"),
  dict(img=keyframe("010", 55.8), box=(0.14, 0.18, 0.80, 0.96), name="顔を覆う田中碧", sub="W杯　0:55"),
  dict(img=keyframe("030", 23.0), box=(0.24, 0.24, 0.92, 0.92), name="大の字の守護神", sub="ACL　0:23"),
  dict(img=keyframe("088", 40.0), box=(0.28, 0.14, 0.78, 0.98), name="膝をつくフィジー", sub="ラグビー日本代表　0:40"),
]
for f in FRAG:
  x0, y0, x1, y1 = f["box"]; f["crop"] = f["img"].crop((int(x0 * 1280), int(y0 * 720), int(x1 * 1280), int(y1 * 720)))
THS = [Image.open(f"{THUMBS}/{x}").convert("RGB") for x in sorted(os.listdir(THUMBS)) if x.endswith(".jpg")]

ease = lambda k: (lambda k: 4 * k * k * k if k < 0.5 else 1 - (-2 * k + 2) ** 3 / 2)(min(1, max(0, k)))
clamp = lambda x, a=0.0, b=1.0: min(b, max(a, x))
lerp = lambda a, b, k: a + (b - a) * k

def fitrect(im, rect):  # 縦横比を保って枠の中に収めた矩形（切り抜かない）
  x, y, w, h = rect; iw, ih = im.size; s = min(w / iw, h / ih)
  return (x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s)
def paste(dst, im, rect, alpha=1.0, edge=None, ew=4):  # rect は fitrect 済みの矩形（縦横比が im と同じ）
  x, y, w, h = [int(round(v)) for v in rect]
  if w < 2 or h < 2 or alpha <= 0.01: return
  p = im.resize((w, h), Image.BILINEAR)
  if edge and ew > 0:
    e = Image.new("RGB", (w + ew * 2, h + ew * 2), edge); dst.paste(e, (x - ew, y - ew), Image.new("L", e.size, int(255 * alpha)))
  dst.paste(p, (x, y), Image.new("L", (w, h), int(255 * alpha)))
def text(d, xy, s, font, fill=(255, 255, 255), anchor="la", alpha=1.0):
  if alpha <= 0.01: return
  c = tuple(int(v) for v in fill) + (int(255 * alpha),)
  d.text((xy[0] + 2, xy[1] + 2), s, font=font, fill=(0, 0, 0, int(200 * alpha)), anchor=anchor); d.text(xy, s, font=font, fill=c, anchor=anchor)

# 画面の割り付け。映像は常に 16:9 のまま（PC: 全画面 → 左右に並べる / SP: 横幅いっぱい → 上下に並べる）
if MODE == "pc":
  VIEW = (0, 0, W, H)
  pw, ph = W / 2 - 6, (W / 2 - 6) * 9 / 16; py = (H - ph) / 2 + 10
  WIN, LOS = (0, py, pw, ph), (W / 2 + 6, py, pw, ph)
else:
  VIEW = (0, (H - W * 9 / 16) / 2, W, W * 9 / 16)
  ph = W * 9 / 16; top = (H - (2 * ph + 70)) / 2 + 20
  WIN, LOS = (0, top, W, ph), (0, top + ph + 70, W, ph)

T_TAP, T_LIFT, T_SPLIT = 5.0, 6.2, 10.8
END = T_SPLIT + 1.2 + PAIR * len(PAIRS) + 1.2
def slots():  # 集まったときの置き場所（PC: 2×2、SP: 縦に4つ）。各かけらは自分の縦横比のまま収める
  if MODE == "pc":
    sw, sh = W * 0.36, H * 0.30; gx, gy = W * 0.05, H * 0.13; cx, cy = W / 2, H / 2 + 6
    cells = [(cx - sw - gx / 2, cy - sh - gy / 2), (cx + gx / 2, cy - sh - gy / 2), (cx - sw - gx / 2, cy + gy / 2), (cx + gx / 2, cy + gy / 2)]
  else:
    sw, sh = W * 0.80, H * 0.16; gy = 74; t0 = 150
    cells = [((W - sw) / 2, t0 + i * (sh + gy)) for i in range(4)]
  return [fitrect(f["crop"], (x, y, sw, sh)) for f, (x, y) in zip(FRAG, cells)]
SL = slots()
random.seed(3)
DRIFT = [(random.uniform(0, 2 * math.pi), random.uniform(0.15, 0.45), random.uniform(0.6, 1.0)) for _ in THS]
FN, FS = (F9(22), F7(14)) if MODE == "pc" else (F9(28), F7(17))

n = int(END * FPS)
for fi in range(n):
  T = fi / FPS
  fr = Image.new("RGB", (W, H), (0, 0, 0))
  d = ImageDraw.Draw(fr, "RGBA")
  if T < T_TAP:  # A: 神戸の映像（切り抜かず全体）
    paste(fr, K(T), VIEW)
  elif T < T_SPLIT:  # B/C: 押したかけらが持ち上がり、他の競技の負けた側のかけらが集まる
    k = ease((T - T_TAP) / 1.0)
    vx, vy, vw, vh = VIEW; s = lerp(1, 0.9, k); bw, bh = vw * s, vh * s; bx, by = vx + (vw - bw) / 2, vy + (vh - bh) / 2
    br = lerp(1, 0.18, k) * (1 - clamp((T - T_LIFT) / 1.2))
    if br > 0.01: paste(fr, K(T_TAP).point(lambda v: v * br), (bx, by, bw, bh))
    dk = clamp((T - T_LIFT + 0.3) / 2.6)  # 他の瞬間が遠ざかる
    if 0 < dk < 1:
      for (a, r0, sc), th in zip(DRIFT, THS):
        r = lerp(r0, r0 + 0.8, ease(dk)); tw = min(W, H) * 0.2 * sc * lerp(1, 0.4, dk)
        x = W / 2 + math.cos(a) * r * W - tw / 2; y = H / 2 + math.sin(a) * r * H * 0.9 - tw * 9 / 32
        paste(fr, th, fitrect(th, (x, y, tw, tw * 9 / 16)), alpha=0.55 * (1 - dk) * min(1, dk * 4))
    for i, f in enumerate(FRAG):
      x0, y0, x1, y1 = f["box"]
      if i == 0:  # 押したかけら: 映像の中の位置から持ち上がって置き場所へ
        src = (bx + x0 * bw, by + y0 * bh, (x1 - x0) * bw, (y1 - y0) * bh)
        mid = fitrect(f["crop"], (W * 0.2, H * 0.24, W * 0.6, H * 0.4))
        r = [lerp(a, b, k) for a, b in zip(src, mid)]
        g = ease((T - T_LIFT) / 1.4); r = [lerp(a, b, g) for a, b in zip(r, SL[0])]
        paste(fr, f["crop"], r, edge=YEL, ew=int(lerp(0, 4, k)))
        lab_a = clamp((T - T_TAP - 0.4) / 0.4)
      else:  # 集まってくるかけら: 奥の一点から飛んでくる
        g = ease((T - T_LIFT - 0.15 - i * 0.35) / 1.3)
        if g <= 0: continue
        sx, sy, sw, sh = SL[i]; c0 = (W / 2, H * 0.45)
        cx, cy = lerp(c0[0], sx + sw / 2, g), lerp(c0[1], sy + sh / 2, g); sc = lerp(0.05, 1, g)
        r = (cx - sw * sc / 2, cy - sh * sc / 2, sw * sc, sh * sc)
        paste(fr, f["crop"], r, alpha=min(1, g * 3))
        lab_a = clamp((g - 0.8) / 0.2)
      if lab_a > 0:
        rx, ry, rw, rh = r
        text(d, (rx, ry + rh + 8), f["name"], FN, alpha=lab_a)
        text(d, (rx, ry + rh + (38 if MODE == "pc" else 46)), f["sub"], FS, fill=YEL, alpha=lab_a)
  else:  # D/E: 勝者と敗者を並べて流す
    tE = T - T_SPLIT
    if tE < 1.2:  # 集まったかけらが退き、押したかけらが「負けた側」の枠へ広がって映像に変わる
      k = ease(tE / 1.2)
      for i in range(1, 4):
        sx, sy, sw, sh = SL[i]; paste(fr, FRAG[i]["crop"], (sx + (sx + sw / 2 - W / 2) * k, sy + (sy + sh / 2 - H / 2) * k, sw, sh), alpha=1 - k)
      r = [lerp(a, b, k) for a, b in zip(SL[0], fitrect(FRAG[0]["crop"], LOS))]
      paste(fr, FRAG[0]["crop"], r)
      L0 = PAIRS[0][1](0)
      if k > 0.5: paste(fr, L0, [lerp(a, b, k) for a, b in zip(r, LOS)], alpha=(k - 0.5) * 2)
      paste(fr, PAIRS[0][0](0), WIN, alpha=k)
      pi, lt, xf = 0, 0, 0
    else:
      u = tE - 1.2; pi = min(len(PAIRS) - 1, int(u // PAIR)); lt = u - pi * PAIR
      Wc, Lc, _ = PAIRS[pi]
      paste(fr, Wc(lt), WIN); paste(fr, Lc(lt), LOS)
      xf = clamp((lt - (PAIR - 0.4)) / 0.4) if pi < len(PAIRS) - 1 else 0  # 次の組へ 0.4 秒で溶ける
      if xf > 0:
        Wn, Ln, _ = PAIRS[pi + 1]; paste(fr, Wn(0), WIN, alpha=xf); paste(fr, Ln(0), LOS, alpha=xf)
    # 札と字幕（映像の外の黒地に置く。映像に重ねない）
    ca = clamp((tE - 1.0) / 0.4) if tE < 1.6 else 1
    cap = PAIRS[pi][2]; cap_a = ca * (1 - xf)
    if xf > 0.5: cap, cap_a = PAIRS[pi + 1][2], ca * (xf - 0.5) * 2
    else: cap_a = ca * (1 - xf * 2)
    if MODE == "pc":
      text(d, (WIN[0] + 4, WIN[1] - 34), "勝った側", F9(20), alpha=ca); text(d, (LOS[0] + 4, LOS[1] - 34), "負けた側", F9(20), fill=YEL, alpha=ca)
      text(d, (W / 2, WIN[1] + WIN[3] + 26), cap, F7(24), anchor="ma", alpha=cap_a)
    else:
      text(d, (16, WIN[1] - 40), "勝った側", F9(26), alpha=ca); text(d, (16, LOS[1] - 40), "負けた側", F9(26), fill=YEL, alpha=ca)
      text(d, (W / 2, LOS[1] + LOS[3] + 28), cap, F7(24), anchor="ma", alpha=cap_a)
    fade = clamp((T - (END - 1.0)) / 0.8)
    if fade > 0: fr = Image.blend(fr, Image.new("RGB", (W, H)), fade); d = ImageDraw.Draw(fr, "RGBA")
  # 切り口の名前（押してから最後まで、上に）
  if T >= T_TAP + 0.6:
    la = clamp((T - T_TAP - 0.6) / 0.5) * (1 - clamp((T - (END - 1.0)) / 0.8))
    text(d, (W / 2, 28 if MODE == "pc" else 60), "負けた側の顔", F9(30 if MODE == "pc" else 38), fill=YEL, anchor="ma", alpha=la)
  # 押す指（タップの見本）
  if 3.6 <= T < T_TAP + 0.5:
    x0, y0, x1, y1 = FRAG[0]["box"]; vx, vy, vw, vh = VIEW
    tx, ty = vx + vw * (x0 + x1) / 2, vy + vh * (y0 + y1) / 2
    m = ease((T - 3.6) / 0.9); cx, cy = lerp(W * 0.8, tx, m), lerp(H * 0.95, ty, m)
    pr = math.sin(math.pi * clamp((T - T_TAP + 0.15) / 0.35)) if T > T_TAP - 0.15 else 0
    rr = 18 * (1 - 0.3 * pr); al = 1 - clamp((T - T_TAP - 0.2) / 0.3)
    d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=(255, 255, 255, int(255 * al)), width=3); d.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), fill=(255, 255, 255, int(255 * al)))
  fr.save(f"{OUT}/{fi:04d}.jpg", quality=90)
print("frames", n, "sec", round(END, 2))
