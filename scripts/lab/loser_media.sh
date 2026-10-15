#!/bin/bash
# 「負けた側の顔」の触れるプロトの素材。各組は勝者・敗者とも PAIR 秒に収まる速さでスローを焼き込む（同時に始まり同時に終わる）。
#   bash scripts/lab/loser_media.sh <srcDir: <no>.mp4> <outDir>
set -e
S=$1; O=$2; mkdir -p $O; PAIR=4.5
enc(){ # name no t0 dur
  local r=$(python3 -c "print($4/$PAIR)")
  local vf="setpts=PTS/$r,fps=30,scale=960:540"; local af="atempo=$r"
  [ "$5" = "raw" ] && vf="fps=30,scale=960:540" && af="anull"
  ffmpeg -y -loglevel error -ss $3 -t $4 -i $S/$2.mp4 -vf "$vf" -af "$af" -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart $O/$1.mp4
  ffmpeg -y -loglevel error -ss $3 -t $4 -i $S/$2.mp4 -vf "$vf" -af "$af" -c:v libvpx-vp9 -crf 34 -b:v 0 -row-mt 1 -c:a libopus -b:a 96k $O/$1.webm
}
enc kobe 090 45.25 7.19 raw
enc w1 090 47.0 3.9; enc l1 090 51.0 3.4
enc w2 010 49.0 2.9; enc l2 010 58.0 3.9
enc w3 030 7.0 3.9;  enc l3 030 22.0 2.3
enc w4 088 26.5 3.4; enc l4 088 39.0 3.9
# 神戸の映像の最初と最後のコマ（最後のコマは止めたときにかけらを重ねる位置の基準）
ffmpeg -y -loglevel error -i $O/kobe.mp4 -frames:v 1 -q:v 3 $O/kobe_first.jpg
ffmpeg -y -loglevel error -sseof -0.1 -i $O/kobe.mp4 -frames:v 1 -update 1 -q:v 3 $O/kobe_last.jpg
