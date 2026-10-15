// 77本の音声を 16kHz モノラルで取り出す（決定的瞬間＝歓声の立ち上がりを探すため）
//   node scripts/one/audio.mjs <outDir> [並列]
import { readFileSync, existsSync, mkdirSync } from "fs";
import { execFile } from "child_process";
const OUT = process.argv[2], PAR = +(process.argv[3] || 6); mkdirSync(OUT, { recursive: true });
const M = JSON.parse(readFileSync("data/moments2026.json", "utf8")).filter((m) => m.clips?.[0]?.detail);
const q = M.filter((m) => !existsSync(`${OUT}/${m.no}.wav`)); let ok = 0, ng = 0;
await Promise.all(Array.from({ length: PAR }, async () => { while (q.length) { const m = q.shift();
  await new Promise((r) => execFile("ffmpeg", ["-y", "-loglevel", "error", "-i", m.clips[0].detail, "-vn", "-ac", "1", "-ar", "16000", `${OUT}/${m.no}.wav`], (e) => { e ? (ng++, console.log("NG", m.no)) : ok++; r(); })); } }));
console.log("ok", ok, "ng", ng);
