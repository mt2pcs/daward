#!/bin/bash
read no t sec url <<< "$1"
st=$(python3 -c "print(max(0,$sec-0.6))")
o=media/${no}_${t}
ffmpeg -loglevel error -y -ss $st -i "$url" -t 2.6 -an -vf "scale=400:-2,fps=25" -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -movflags +faststart $o.mp4 && \
ffmpeg -loglevel error -y -i $o.mp4 -c:v libvpx-vp9 -b:v 0 -crf 42 -row-mt 1 -deadline realtime $o.webm && \
ffmpeg -loglevel error -y -ss 0.6 -i $o.mp4 -frames:v 1 -q:v 6 $o.jpg && echo "ok $no $t" || echo "FAIL $no $t"
