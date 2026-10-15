#!/bin/bash
k=$1; s=$2; u=$3; o=$(dirname $0)/$k.jpg
[ -s "$o" ] && exit 0
ffmpeg -loglevel error -y -ss $s -i "$u" -frames:v 1 -vf scale=256:-2 -q:v 6 "$o" || echo FAIL $k
