#!/usr/bin/env bash
# ザッピング1ループ（/lab/zap）の素材を作る: 本編の区間（音あり 720p）、糸の先のプレビュー（5秒・音なし 480p）、秒ごとのコマ。
#   bash scripts/lab/zap_media.sh <srcDir: <no>.mp4 が並ぶ> <outDir>
# 出力は mp4（H.264, 実機・Safari 用）と webm（VP9, 検証の headless 用）の両方。アップロードは scripts/lab/upload_dir.js。
set -euo pipefail
SRC=$1; OUT=$2; mkdir -p "$OUT/v" "$OUT/f"
main() { # no start end
  local n=$1 s=$2 e=$3 d=$(($3-$2))
  ffmpeg -y -loglevel error -ss "$s" -t "$d" -i "$SRC/$n.mp4" -vf scale=1280:-2 -c:v libx264 -preset veryfast -crf 24 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "$OUT/v/m$n.mp4"
  ffmpeg -y -loglevel error -ss "$s" -t "$d" -i "$SRC/$n.mp4" -vf scale=1280:-2 -c:v libvpx-vp9 -b:v 0 -crf 36 -deadline realtime -cpu-used 8 -row-mt 1 -c:a libopus -b:a 96k "$OUT/v/m$n.webm"
  for ((t=s; t<=e; t++)); do ffmpeg -y -loglevel error -ss "$t" -i "$SRC/$n.mp4" -frames:v 1 -vf scale=256:-2 -q:v 4 "$OUT/f/${n}_$t.jpg"; done
}
prev() { # no start  （5秒）
  local n=$1 s=$2
  ffmpeg -y -loglevel error -ss "$s" -t 5 -i "$SRC/$n.mp4" -an -vf scale=640:-2 -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p -movflags +faststart "$OUT/v/p${n}_$s.mp4"
  ffmpeg -y -loglevel error -ss "$s" -t 5 -i "$SRC/$n.mp4" -an -vf scale=640:-2 -c:v libvpx-vp9 -b:v 0 -crf 38 -deadline realtime -cpu-used 8 -row-mt 1 "$OUT/v/p${n}_$s.webm"
}
main 090 45 62 & main 062 35 50 & main 010 15 32 & wait
prev 062 39 & prev 010 52 & prev 038 47 & wait
prev 010 19 & prev 089 116 & prev 042 10 & wait
prev 060 174 & prev 012 28 & prev 071 81 & wait
ls -la "$OUT/v" | awk '{s+=$5} END {print "total bytes", s}'
