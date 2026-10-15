// フォルダをそのまま公開バケットへ上げる（同じ大きさのものは飛ばす）。
//   node scripts/lab/upload_dir.js <localDir> <prefix>   例: node scripts/lab/upload_dir.js out lab/zap
const { readFileSync, readdirSync, statSync } = require("fs");
const path = require("path");
const { getToken } = require("../gcp_auth.js");
const [dir, prefix] = process.argv.slice(2);
const bucket = "e-mooments-assets";
const CT = { ".mp4": "video/mp4", ".webm": "video/webm", ".jpg": "image/jpeg", ".png": "image/png", ".json": "application/json" };
const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
(async () => {
  const H = { Authorization: `Bearer ${await getToken()}` };
  const have = new Set(); let pt = "";
  do { const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${prefix}/&fields=items(name,size),nextPageToken${pt ? `&pageToken=${pt}` : ""}`, { headers: H }); const j = await r.json(); for (const it of j.items || []) have.add(`${it.name}:${it.size}`); pt = j.nextPageToken || ""; } while (pt);
  let n = 0;
  for (const p of walk(dir)) {
    const name = `${prefix}/${path.relative(dir, p).split(path.sep).join("/")}`;
    if (have.has(`${name}:${statSync(p).size}`)) continue;
    const r = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(name)}`, { method: "POST", headers: { ...H, "Content-Type": CT[path.extname(p)] || "application/octet-stream", "Cache-Control": "public, max-age=3600" }, body: readFileSync(p) });
    if (r.status >= 300) { console.log("FAIL", name, r.status, (await r.text()).slice(0, 120)); continue; }
    n++;
  }
  console.log("uploaded", n);
})().catch((e) => { console.error(e); process.exit(1); });
