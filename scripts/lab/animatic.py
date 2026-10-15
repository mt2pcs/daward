# 体験モックの動画（アニマティック）: キー画像をズームでつなぎ、右に「倍率のダイヤル」（宇宙/映像/1秒/細胞）、左下に操作と起きることを出す。
#   python3 scripts/lab/animatic.py <keyDir> <out.mp4>
import sys, os, subprocess, math
from PIL import Image, ImageDraw, ImageFont
K, OUT = sys.argv[1], sys.argv[2]
W, H, FPS = 1280, 720, 30
FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"
fB, fS, fL = ImageFont.truetype(FONT, 34), ImageFont.truetype(FONT, 20), ImageFont.truetype(FONT, 18)
LEVELS = ["宇宙", "映像", "1秒", "細胞"]
# (画像, 秒, ズーム開始, ズーム終了, 中心x, 中心y, ダイヤル段, 操作, 起きること)
S = [
  ("k1", 3.6, 1.00, 1.10, .5, .5, 0, "ひらく", "今年の100の瞬間が、ひとつの宇宙に浮かんでいる"),
  ("k2", 3.8, 1.00, 1.14, .38, .5, 1, "1本へ寄る（スクロール／ピンチ）", "その映像が、1秒ずつにほどけて奥へ並ぶ"),
  ("k3", 3.8, 1.00, 1.10, .62, .5, 2, "涙の1秒へ寄る", "その1秒が、顔・手・観客・スコアに分かれる＝細胞"),
  ("k4", 3.0, 1.00, 1.08, .48, .5, 3, "涙の細胞を、ぽちっ", "その細胞が選ばれる"),
  ("k5", 4.0, 1.16, 1.00, .5, .5, 0, "引いて宇宙へ戻る", "宇宙中の映像から、同じ“涙”の細胞が剥がれて集まってくる"),
  ("k5b", 3.8, 1.00, 1.08, .5, .5, 0, "", "100本が“涙”で組み直された、新しい塊になる"),
  ("k6", 3.6, 1.00, 1.18, .5, .5, 1, "気になった1つへ飛び込む", "その映像の“その1秒”から再生 → また次の細胞へ"),
  ("k7", 3.8, 1.00, 1.08, .5, .55, 0, "言葉を入れる（慣れてきたら）", "その言葉の細胞で、宇宙がまた組み直される"),
]
S = [s for s in S if os.path.exists(f"{K}/{s[0]}.png")]
imgs = {s[0]: Image.open(f"{K}/{s[0]}.png").convert("RGB") for s in S}
XF = 0.6  # 切り替えの重なり（秒）
def view(name, z, cx, cy):
  im = imgs[name]; iw, ih = im.size; cw, ch = iw / z, ih / z
  x0 = min(max(cx * iw - cw / 2, 0), iw - cw); y0 = min(max(cy * ih - ch / 2, 0), ih - ch)
  return im.crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch))).resize((W, H), Image.LANCZOS)
ease = lambda k: k * k * (3 - 2 * k)
starts, t = [], 0.0
for s in S: starts.append(t); t += s[1] - XF
total = t + XF
os.makedirs("/tmp/anim", exist_ok=True)
n = int(total * FPS)
for f in range(n):
  T = f / FPS
  # 今の場面（重なり中は次と混ぜる。次の場面はズームを少し大きくから入る＝寄っていく感じ）
  i = max(j for j, st in enumerate(starts) if st <= T)
  s = S[i]; k = (T - starts[i]) / s[1]
  fr = view(s[0], s[2] + (s[3] - s[2]) * ease(min(1, k)), s[4], s[5])
  if i + 1 < len(S) and T > starts[i + 1]:
    s2 = S[i + 1]; a = ease((T - starts[i + 1]) / XF); k2 = (T - starts[i + 1]) / s2[1]
    zoomin = s2[6] >= s[6]
    z2 = s2[2] + (s2[3] - s2[2]) * ease(k2)
    fr2 = view(s2[0], z2 * (1 + (0.25 if zoomin else -0.12) * (1 - a)) if zoomin else max(1.0, z2 * (1 + 0.12 * (1 - a))), s2[4], s2[5])
    fr = Image.blend(fr, fr2, a)
    lvl, cap, act = (s2[6], s2[8], s2[7]) if a > 0.5 else (s[6], s[8], s[7])
  else: lvl, cap, act = s[6], s[8], s[7]
  d = ImageDraw.Draw(fr, "RGBA")
  # 下の帯（操作と起きること）
  d.rectangle((0, H - 118, W, H), fill=(0, 0, 0, 170))
  if act: d.text((40, H - 104), "▶ " + act, font=fS, fill=(255, 255, 0))
  d.text((40, H - 72), cap, font=fB, fill=(255, 255, 255))
  # 右の倍率ダイヤル（たまごっちのズームダイヤルと同じ構造）
  x = W - 120; y0 = 70
  d.rectangle((x - 24, y0 - 24, W - 24, y0 + 4 * 46 - 2), fill=(0, 0, 0, 150))
  for j, name in enumerate(LEVELS):
    on = j == lvl
    d.ellipse((x - 10, y0 + j * 46 - 2, x + 4, y0 + j * 46 + 12), fill=(255, 255, 0) if on else (90, 90, 90))
    d.text((x + 16, y0 + j * 46 - 6), name, font=fL, fill=(255, 255, 0) if on else (170, 170, 170))
  fr.save(f"/tmp/anim/{f:04d}.jpg", quality=90)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", "/tmp/anim/%04d.jpg", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", OUT], check=True)
print("frames", n, "sec", round(total, 1), "scenes", [s[0] for s in S])
