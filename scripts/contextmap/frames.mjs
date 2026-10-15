// 根拠の1秒のフレームを切り出して公開バケットへ置く（ctx/<理由ID>.jpg）。
//   NODE_USE_ENV_PROXY=1 node scripts/contextmap/frames.mjs docs/contextmap/reasons.json <workDir>
import { createRequire } from "module";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";
const require = createRequire(import.meta.url);
const { getToken } = require("../gcp_auth.js");
const [inp, work] = process.argv.slice(2);
const FORCE = new Set((process.env.FORCE || "").split(",").filter(Boolean)); // 上書きし直す瞬間（例: FORCE=069,058）
const R = JSON.parse(readFileSync(inp, "utf8"));
const M = JSON.parse(readFileSync("data/moments2026.json", "utf8")); const A = Array.isArray(M) ? M : M.moments;
mkdirSync(work, { recursive: true });
const jobs = [];
for (const m of Object.values(R)) { const c = A.find((x) => x.no === m.no)?.clips?.[0]; if (!c?.detail) continue; const off = 0; // detail.mp4 は元素材の全尺で、素材（material.json / reasons）の時刻もこのファイル基準
  m.reasons.forEach((r, k) => { const p = String(r.t || "").split(":").map(Number); if (p.length !== 2 || p.some(isNaN)) return; jobs.push({ id: `${m.no}-${k}`, sec: off + p[0] * 60 + p[1], url: c.detail }); }); }
let i = 0;
await Promise.all(Array.from({ length: 8 }, async () => { while (i < jobs.length) { const j = jobs[i++]; const o = `${work}/${j.id}.jpg`; if (existsSync(o)) continue; try { execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", String(j.sec), "-i", j.url, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "5", o]); } catch { console.log("FAIL", j.id); } } }));
const token = await getToken();
const have = new Set(); let pt = "";
do { const r = await fetch(`https://storage.googleapis.com/storage/v1/b/e-mooments-assets/o?prefix=ctx/&fields=items(name),nextPageToken&maxResults=1000${pt ? "&pageToken=" + pt : ""}`, { headers: { Authorization: `Bearer ${token}` } }); const js = await r.json(); for (const it of js.items || []) have.add(it.name); pt = js.nextPageToken || ""; } while (pt);
let n = 0; i = 0;
await Promise.all(Array.from({ length: 8 }, async () => { while (i < jobs.length) { const j = jobs[i++]; const o = `${work}/${j.id}.jpg`; const name = `ctx/${j.id}.jpg`; if (!existsSync(o) || (have.has(name) && !FORCE.has(j.id.split("-")[0]))) continue;
  const r = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/e-mooments-assets/o?uploadType=media&name=${encodeURIComponent(name)}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" }, body: readFileSync(o) }); if (r.status < 300) n++; else console.log("FAIL up", j.id, r.status); } }));
console.log("frames", jobs.length, "uploaded", n);
