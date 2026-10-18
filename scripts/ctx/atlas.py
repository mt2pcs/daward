# 文脈の1秒のコマ（<dir>/c/<id>.jpg）を 192×108 で 16×16 に詰めたアトラスにする → <dir>/atlas0.jpg, atlas1.jpg, …
#   python3 scripts/ctx/atlas.py <dir> <文脈の数>
import sys, os
from PIL import Image
d, n = sys.argv[1], int(sys.argv[2]); W, H = 192, 108
for s in range((n + 255) // 256):
    sheet = Image.new("RGB", (W * 16, H * 16))
    for k in range(256):
        i = s * 256 + k
        p = f"{d}/c/{i}.jpg"
        if i >= n or not os.path.exists(p): continue
        im = Image.open(p).convert("RGB").resize((W, H), Image.LANCZOS)
        sheet.paste(im, ((k % 16) * W, (k // 16) * H))
    sheet.save(f"{d}/atlas{s}.jpg", quality=86)
print("ok")
