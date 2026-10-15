// 触れる試作用: fragments.json の各かけらの1秒を映像から1コマ切り出す（16:9 のまま、切り抜かない）
//   node scripts/fragments/frag_frames.mjs docs/design/zap/burst/fragments.json <outDir> [秒のずらし JSON]
import { readFileSync, mkdirSync } from "fs";
import { execFile } from "child_process";
const F = JSON.parse(readFileSync(process.argv[2], "utf8")), OUT = process.argv[3];
const adj = process.argv[4] ? JSON.parse(readFileSync(process.argv[4], "utf8")) : {};
mkdirSync(OUT, { recursive: true });
const sec = (t) => t.split(":").map(Number).reduce((a, b) => a * 60 + b, 0);
const q = [...F]; let ng = 0;
await Promise.all(Array.from({ length: 8 }, async () => { while (q.length) { const f = q.shift(); const ss = sec(f.t) + (adj[f.i] ?? 0.5);
  await new Promise((r) => execFile("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(ss), "-i", f.src, "-frames:v", "1", "-vf", "scale=640:360", "-q:v", "4", `${OUT}/${f.i}.jpg`], (e) => { if (e) { ng++; console.log("NG", f.i, e.message.slice(0, 80)); } r(); })); } }));
console.log("done", F.length - ng, "ng", ng);
