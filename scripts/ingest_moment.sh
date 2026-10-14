#!/usr/bin/env bash
# 1本の納品mp4から Web 用素材一式を作る。  usage: ingest_moment.sh <no> <src.mp4> <outdir> [peak_sec] [title]
#   loop.mp4/loop.webm : 体験用の無音ループ（3秒・480×270、山場を音量ピークから自動選択。peak_sec で上書き可）
#   detail.mp4         : 詳細・フィード用（720p・H.264・約4Mbps、音あり）
#   poster.webp / thumb.jpg : ポスター（720p）と 3Dカード用サムネ（384×216）
#   og.jpg             : シェア用 OGP（1200×630、タイトルを焼き込み）
#   meta.json          : 尺・解像度・選んだ山場
set -euo pipefail
NO="$1"; SRC="$2"; OUT="$3"; PEAK="${4:-}"; TITLE="${5:-}"
mkdir -p "$OUT"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")
W=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$SRC")
H=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$SRC")
LOOP=3
if [ -z "$PEAK" ]; then
  # 1秒ごとの音量（RMS）→ 3秒窓の合計が最大の位置を山場にする（解説・歓声が最も盛り上がる所）
  ffmpeg -v error -i "$SRC" -af "astats=metadata=1:reset=50,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=$OUT/rms.txt" -f null - >/dev/null 2>&1 || true
  PEAK=$(python3 - "$OUT/rms.txt" "$DUR" "$LOOP" <<'PY'
import sys,re,math
lines=open(sys.argv[1]).read().split('\n'); dur=float(sys.argv[2]); L=int(sys.argv[3])
pts=[]; t=None
for ln in lines:
    m=re.match(r'frame:\d+\s+pts:\d+\s+pts_time:([\d.]+)',ln)
    if m: t=float(m.group(1))
    m=re.search(r'RMS_level=(-?[\d.]+|-inf)',ln)
    if m and t is not None:
        v=m.group(1); pts.append((t, -120.0 if v=='-inf' else float(v)))
if not pts: print(max(0.0,dur/2-L/2)); sys.exit()
# 1秒ビンに丸めて3秒窓
bins={}
for t,v in pts: bins.setdefault(int(t),[]).append(v)
sec=sorted(bins); e={s:sum(bins[s])/len(bins[s]) for s in sec}
best=max(((sum(e.get(s+k,-120) for k in range(L)),s) for s in sec if s+L<=dur), default=(0,0))
print(best[1])
PY
  )
fi
PEAK=$(python3 -c "print(max(0.0,min(float('$PEAK'), float('$DUR')-$LOOP)))")
# 体験用ループ（無音・480×270・30fps・H.264 baseline/WebM VP9）。最後の0.3秒をクロスフェード風に見せるため ループは短く切るだけ（UI側で loop）
ffmpeg -v error -y -ss "$PEAK" -t $LOOP -i "$SRC" -an -vf "scale=480:270:flags=lanczos,fps=30" -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p -crf 23 -movflags +faststart "$OUT/loop.mp4"
ffmpeg -v error -y -ss "$PEAK" -t $LOOP -i "$SRC" -an -vf "scale=480:270:flags=lanczos,fps=30" -c:v libvpx-vp9 -b:v 0 -crf 34 -deadline good -cpu-used 2 "$OUT/loop.webm"
# 詳細・フィード用（720p、音あり）。SKIP_DETAIL=1 で省略（まずループ・画像だけ全件回すとき）
if [ -z "${SKIP_DETAIL:-}" ]; then
ffmpeg -v error -y -i "$SRC" -vf "scale=1280:720:flags=lanczos,fps=30" -c:v libx264 -preset medium -crf 22 -maxrate 4500k -bufsize 9000k -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "$OUT/detail.mp4"
fi
# ポスター・サムネ（山場の中央のフレーム）
MID=$(python3 -c "print(float('$PEAK')+$LOOP/2)")
ffmpeg -v error -y -ss "$MID" -i "$SRC" -frames:v 1 -vf "scale=1280:720" -q:v 80 "$OUT/poster.webp"
ffmpeg -v error -y -ss "$MID" -i "$SRC" -frames:v 1 -vf "scale=384:216" -q:v 3 "$OUT/thumb.jpg"
# OGP: 1200×630、下に黒のグラデーションとタイトル・番号を焼き込む
python3 - "$OUT" "$NO" "$TITLE" <<'PY'
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
out,no,title=sys.argv[1],sys.argv[2],sys.argv[3]
im=Image.open(f"{out}/poster.webp").convert("RGB")
W,H=1200,630
sc=max(W/im.width,H/im.height); im=im.resize((int(im.width*sc)+1,int(im.height*sc)+1)); im=im.crop(((im.width-W)//2,(im.height-H)//2,(im.width-W)//2+W,(im.height-H)//2+H))
grad=Image.new("L",(1,H)); 
for y in range(H): grad.putpixel((0,y), int(255*max(0,(y-H*0.45)/(H*0.55))**1.2*0.88))
im.paste(Image.new("RGB",(W,H),(0,0,0)), (0,0), grad.resize((W,H)))
d=ImageDraw.Draw(im)
f=lambda s: ImageFont.truetype('/usr/share/fonts/truetype/fonts-japanese-gothic.ttf', s)
d.text((60,470), f"No.{no}", fill=(235,255,0), font=f(28))
if title:
    d.rectangle((52,512,52+f(54).getlength(title)+32,512+74), fill=(235,255,0))
    d.text((68,520), title, fill=(10,10,12), font=f(54))
d.text((W-60-f(22).getlength("DAZN 100 MOMENTS  一般投票受付中"),40), "DAZN 100 MOMENTS  一般投票受付中", fill=(255,255,255), font=f(22))
im.save(f"{out}/og.jpg", quality=86)
PY
python3 -c "import json;json.dump({'no':'$NO','src_duration':float('$DUR'),'src_size':[int('$W'),int('$H')],'peak_sec':float('$PEAK'),'loop_sec':$LOOP},open('$OUT/meta.json','w'))"
ls -la "$OUT" | awk '{print $5, $9}' | grep -v '^ $'
cat "$OUT/meta.json"
