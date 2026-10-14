#!/bin/bash
no="$1"; url="$2"; title="$3"; out="$ASSETS/${no}_01"; tmp="$ASSETS/_dl_${no}_01.mp4"
[ -f "$out/meta.json" ] && { echo "skip $no"; exit 0; }
t0=$(date +%s)
if curl -sS -L --max-time 900 -o "$tmp" "$url" && SKIP_DETAIL=1 /home/user/daward/scripts/ingest_moment.sh "$no" "$tmp" "$out" "" "$title" >/dev/null 2>&1; then
  echo "ok $no $(( $(date +%s) - t0 ))s peak=$(python3 -c "import json;print(json.load(open('$out/meta.json'))['peak_sec'])")"
else echo "FAIL $no"; fi
rm -f "$tmp"
