// reading.mjs の結果で採用された「その一秒」の実フレームを切り出す（検証・レポート用）。
//   node scripts/design/reading_frames.mjs docs/design/reading/round1.json <outDir>
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
const [inp, dir] = process.argv.slice(2);
const { result } = JSON.parse(readFileSync(inp, "utf8"));
const MM = JSON.parse(readFileSync("data/moments2026.json", "utf8")); const MOM = Array.isArray(MM) ? MM : MM.moments;
mkdirSync(dir, { recursive: true });
const jobs = new Map();
for (const r of Object.values(result)) for (const b of r.bundles || []) for (const j of b.members) {
  if (!j.t) continue; const c = MOM.find((m) => m.no === j.no)?.clips?.[0]; if (!c?.detail) continue;
  const off = 0; // detail.mp4 は元素材の全尺で、素材（material.json / reasons）の時刻もこのファイル基準
  const tt = j.t.padStart(5, "0"); const p = tt.split(":").map(Number); jobs.set(`${j.no}_${tt.replace(":", "")}`, { sec: off + p[0] * 60 + p[1], url: c.detail });
}
const list = [...jobs.entries()]; let i = 0, fail = 0;
await Promise.all(Array.from({ length: 8 }, async () => { while (i < list.length) { const [id, j] = list[i++]; const o = `${dir}/${id}.jpg`; if (existsSync(o)) continue;
  try { execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", String(j.sec), "-i", j.url, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "6", o]); } catch { fail++; } } }));
console.log("frames", list.length, "fail", fail);
