// かけら（人×その1秒）ごとに 3.6 秒の映像を切り出す。並び順は build_page.mjs の人の順（瞬間番号順→出来事→人）。
//   node scripts/net/clips.mjs <outDir> [並列]   → <outDir>/c/<i>.webm / .mp4 / <i>.jpg（その1秒のコマ）
import { readFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { execFileSync, execFile } from "child_process";
const [OUT, PARS] = process.argv.slice(2); const PAR = +(PARS || 4);
const L = JSON.parse(readFileSync("data/net/layers.json", "utf8"));
const M = JSON.parse(readFileSync("data/moments2026.json", "utf8")); const MS = Array.isArray(M) ? M : M.moments || Object.values(M);
const det = Object.fromEntries(MS.map((m) => [m.no, m.clips?.[0]?.detail]));
mkdirSync(`${OUT}/c`, { recursive: true }); mkdirSync(`${OUT}/tmp`, { recursive: true });
const sec = (s) => { const p = String(s).split(":").map(Number); return p.length === 2 ? p[0] * 60 + p[1] : +p[0]; };
const jobs = []; let idx = 0;
for (const m of Object.values(L).sort((a, b) => a.no.localeCompare(b.no))) {
  const ps = []; for (const e of m.events) for (const p of e.people) ps.push({ i: idx++, t: sec(p.t) });
  jobs.push({ no: m.no, url: det[m.no], ps });
}
const run = (args) => new Promise((res, rej) => execFile("ffmpeg", ["-v", "error", "-y", ...args], (e) => (e ? rej(e) : res())));
async function doMoment(j) {
  if (j.ps.every((p) => existsSync(`${OUT}/c/${p.i}.mp4`))) return;
  if (!j.url) { console.log("no detail", j.no); return; }
  const src = `${OUT}/tmp/${j.no}.mp4`;
  execFileSync("curl", ["-sSf", "-o", src, j.url]);
  for (const p of j.ps) {
    const st = Math.max(0, p.t - 1.2).toFixed(2), b = `${OUT}/c/${p.i}`;
    await run(["-ss", st, "-i", src, "-t", "3.6", "-vf", "scale=480:-2,fps=25", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "40", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-c:a", "libopus", "-b:a", "48k", `${b}.webm`]);
    await run(["-ss", st, "-i", src, "-t", "3.6", "-vf", "scale=480:-2,fps=25", "-c:v", "libx264", "-crf", "27", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", `${b}.mp4`]);
    await run(["-ss", String(p.t), "-i", src, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", `${b}.jpg`]);
  }
  rmSync(src); process.stdout.write(`${j.no}(${j.ps.length}) `);
}
const q = jobs.slice(); await Promise.all(Array.from({ length: PAR }, async () => { while (q.length) { const j = q.shift(); try { await doMoment(j); } catch (e) { console.log("FAIL", j.no, String(e).slice(0, 160)); } } }));
console.log("\npeople", idx);
