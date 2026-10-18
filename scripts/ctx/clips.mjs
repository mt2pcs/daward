// 文脈ごとに、その熱が一番よく映る1秒（t）の前後 4 秒を切り出す（ダイジェストの1コマ・文脈の細胞の映像）。
//   node scripts/ctx/clips.mjs <outDir> [並列]  → <outDir>/c/<id>.webm / .mp4 / .jpg   （id は data/ctx/net.json の文脈の番号）
//   その後 python3 scripts/net/atlas.py 相当で <outDir>/atlas*.jpg を作り、node scripts/lab/upload_dir.js <outDir> ctx で上げる
import { readFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { execFileSync, execFile } from "child_process";
const [OUT, PARS] = process.argv.slice(2); const PAR = +(PARS || 4);
const N = JSON.parse(readFileSync("data/ctx/net.json", "utf8"));
const M = JSON.parse(readFileSync("data/moments2026.json", "utf8")); const MS = Array.isArray(M) ? M : Object.values(M);
const det = Object.fromEntries(MS.map((m) => [m.no, m.clips?.[0]?.detail]));
mkdirSync(`${OUT}/c`, { recursive: true }); mkdirSync(`${OUT}/tmp`, { recursive: true });
const run = (args) => new Promise((res, rej) => execFile("ffmpeg", ["-v", "error", "-y", ...args], (e) => (e ? rej(e) : res())));
async function doMoment(m) {
  const cs = m.ctx.map((id) => N.ctx[id]);
  if (cs.every((c) => existsSync(`${OUT}/c/${c.id}.mp4`))) return;
  const src = `${OUT}/tmp/${m.no}.mp4`;
  execFileSync("curl", ["-sSf", "-o", src, det[m.no]]);
  for (const c of cs) {
    const st = Math.max(0, c.t - 1.5).toFixed(2), b = `${OUT}/c/${c.id}`;
    await run(["-ss", st, "-i", src, "-t", "4", "-vf", "scale=640:-2,fps=25", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-c:a", "libopus", "-b:a", "64k", `${b}.webm`]);
    await run(["-ss", st, "-i", src, "-t", "4", "-vf", "scale=640:-2,fps=25", "-c:v", "libx264", "-crf", "26", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", `${b}.mp4`]);
    await run(["-ss", String(c.t), "-i", src, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", `${b}.jpg`]);
  }
  rmSync(src); process.stdout.write(`${m.no}(${cs.length}) `);
}
const q = N.moments.slice(); await Promise.all(Array.from({ length: PAR }, async () => { while (q.length) { const m = q.shift(); try { await doMoment(m); } catch (e) { console.log("FAIL", m.no, String(e).slice(0, 160)); } } }));
console.log("\nctx", N.ctx.length);
