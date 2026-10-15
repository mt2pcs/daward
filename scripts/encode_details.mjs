// 詳細ページ用のフル映像（720p・音あり）を作って公開バケットへ上げる。元mp4は Dropbox から再取得し、処理後に削除する。
//   node scripts/encode_details.mjs <assetsDir> [parallel=2]   （manifest.json の url を使う。detail.ok がある clip はスキップ）
import { readFileSync, writeFileSync, existsSync, rmSync, statSync } from "fs";
import { execFileSync, spawn } from "child_process";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { getToken } = require("./gcp_auth.js");
const [assetsDir, parArg] = process.argv.slice(2); const PAR = +(parArg || 2);
const BUCKET = process.env.ASSET_BUCKET || "e-mooments-assets";
const manifest = JSON.parse(readFileSync(`${assetsDir}/manifest.json`, "utf8"));
const jobs = [];
for (const no of Object.keys(manifest)) for (const c of manifest[no].clips || []) { if (!c || c.error || !c.url) continue; if (existsSync(`${assetsDir}/${c.key}/detail.ok`)) continue; jobs.push(c); }
console.log(`jobs ${jobs.length}`);
let token = await getToken(), tokenAt = Date.now();
async function upload(path, name, ct) {
  if (Date.now() - tokenAt > 45 * 60 * 1000) { token = await getToken(); tokenAt = Date.now(); }
  const r = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(name)}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": ct }, body: readFileSync(path) });
  if (r.status >= 300) throw new Error(`upload ${r.status} ${(await r.text()).slice(0, 120)}`);
}
const run = (cmd, args) => new Promise((res, rej) => { const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] }); let err = ""; p.stderr.on("data", (d) => (err += d)); p.on("close", (code) => (code === 0 ? res() : rej(new Error(`${cmd} exit ${code} ${err.slice(-200)}`)))); });
async function one(c) {
  const dir = `${assetsDir}/${c.key}`, src = `${assetsDir}/_src_${c.key}.mp4`, out = `${dir}/detail.mp4`; const t0 = Date.now();
  try {
    await run("curl", ["-sS", "-L", "--max-time", "900", "-o", src, c.url]);
    await run("ffmpeg", ["-v", "error", "-y", "-i", src, "-vf", "scale=1280:720:flags=lanczos,fps=30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-maxrate", "4500k", "-bufsize", "9000k", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out]);
    const size = statSync(out).size;
    await upload(out, `m/${c.key}/detail.mp4`, "video/mp4");
    writeFileSync(`${dir}/detail.ok`, JSON.stringify({ size, at: new Date().toISOString() }));
    console.log(`ok ${c.key} ${(size / 1e6).toFixed(1)}MB ${((Date.now() - t0) / 1000) | 0}s`);
  } catch (e) { console.log(`FAIL ${c.key} ${String(e.message || e).slice(0, 160)}`); }
  finally { rmSync(src, { force: true }); rmSync(out, { force: true }); }
}
let i = 0; await Promise.all(Array.from({ length: PAR }, async () => { while (i < jobs.length) { const c = jobs[i++]; await one(c); } }));
console.log("done");
