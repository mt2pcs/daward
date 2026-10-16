// 動きの試作用: world.json の683の1秒それぞれから1コマ（その秒+0.5）を 480×270 で切り出す
//   node scripts/fragments/frames1.mjs <outDir> [並列]
import { readFileSync, existsSync, mkdirSync } from "fs";
import { execFile } from "child_process";
const OUT = process.argv[2], PAR = +(process.argv[3] || 8); mkdirSync(OUT, { recursive: true });
const W = JSON.parse(readFileSync("docs/design/world.json", "utf8"));
const M = JSON.parse(readFileSync("data/moments2026.json", "utf8"));
const url = Object.fromEntries(M.map((m) => [m.no, m.clips?.[0]?.detail]));
const sec = (t) => t.split(":").map(Number).reduce((a, b) => a * 60 + b, 0);
const q = W.units.map((u, i) => ({ u, i })).filter(({ i }) => !existsSync(`${OUT}/${i}.jpg`)); let ok = 0, ng = 0;
await Promise.all(Array.from({ length: PAR }, async () => { while (q.length) { const { u, i } = q.shift();
  await new Promise((r) => execFile("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(sec(u.t) + 0.5), "-i", url[u.no], "-frames:v", "1", "-vf", "scale=480:270", "-q:v", "5", `${OUT}/${i}.jpg`], (e) => { e ? (ng++, console.log("NG", i, u.no)) : ok++; r(); })); } }));
console.log("ok", ok, "ng", ng);
