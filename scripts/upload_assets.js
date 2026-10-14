// 取り込み済み素材（loop.mp4/loop.webm/poster.webp/thumb.jpg/og.jpg）を公開バケットへアップロードする。
//   node scripts/upload_assets.js <assetsDir> [bucket]   （既定バケット: e-mooments-assets、公開読み取り）
// 配信URL: https://storage.googleapis.com/<bucket>/m/<key>/<file>
const { readFileSync, readdirSync, existsSync, statSync } = require("fs");
const { getToken, projectId } = require("./gcp_auth.js");
const [assetsDir, bucketArg] = process.argv.slice(2);
const bucket = bucketArg || "e-mooments-assets";
const FILES = [["loop.mp4", "video/mp4"], ["loop.webm", "video/webm"], ["poster.webp", "image/webp"], ["thumb.jpg", "image/jpeg"], ["og.jpg", "image/jpeg"]];
(async () => {
  const token = await getToken();
  const H = { Authorization: `Bearer ${token}` };
  const api = async (method, url, body, ct) => { const r = await fetch(url, { method, headers: { ...H, ...(ct ? { "Content-Type": ct } : {}) }, body }); return { status: r.status, text: await r.text() }; };
  // バケット（公開・均一アクセス）
  let b = await api("GET", `https://storage.googleapis.com/storage/v1/b/${bucket}`);
  if (b.status === 404) {
    b = await api("POST", `https://storage.googleapis.com/storage/v1/b?project=${projectId()}`, JSON.stringify({ name: bucket, location: "ASIA-NORTHEAST1", iamConfiguration: { uniformBucketLevelAccess: { enabled: true } }, cors: [{ origin: ["*"], method: ["GET", "HEAD"], responseHeader: ["Content-Type", "Range"], maxAgeSeconds: 3600 }] }), "application/json");
    console.log("bucket create", b.status, b.text.slice(0, 200));
    if (b.status >= 300) process.exit(1);
    const pol = await api("GET", `https://storage.googleapis.com/storage/v1/b/${bucket}/iam`);
    const policy = JSON.parse(pol.text); policy.bindings = [...(policy.bindings || []), { role: "roles/storage.objectViewer", members: ["allUsers"] }];
    const p = await api("PUT", `https://storage.googleapis.com/storage/v1/b/${bucket}/iam`, JSON.stringify(policy), "application/json");
    console.log("public policy", p.status, p.text.slice(0, 120));
  } else console.log("bucket", b.status);
  // 既存オブジェクト一覧（スキップ用）
  const have = new Set(); let pageToken = "";
  do { const r = await api("GET", `https://storage.googleapis.com/storage/v1/o?bucket=${bucket}&prefix=m/&fields=items(name,size),nextPageToken&maxResults=1000${pageToken ? `&pageToken=${pageToken}` : ""}`.replace("/o?", `/b/${bucket}/o?`)); const j = JSON.parse(r.text); for (const it of j.items || []) have.add(`${it.name}:${it.size}`); pageToken = j.nextPageToken || ""; } while (pageToken);
  let n = 0, skipped = 0;
  for (const key of readdirSync(assetsDir).filter((d) => /^\d{3}_\d{2}$/.test(d)).sort()) {
    if (!existsSync(`${assetsDir}/${key}/meta.json`)) continue;
    for (const [f, ct] of FILES) {
      const p = `${assetsDir}/${key}/${f}`; if (!existsSync(p)) continue;
      const name = `m/${key}/${f}`; if (have.has(`${name}:${statSync(p).size}`)) { skipped++; continue; }
      const r = await api("POST", `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(name)}`, readFileSync(p), ct);
      if (r.status >= 300) { console.log("FAIL", name, r.status, r.text.slice(0, 120)); continue; }
      n++;
    }
    process.stdout.write(`${key} `);
  }
  console.log(`\nuploaded ${n}, skipped ${skipped}`);
  const t = await fetch(`https://storage.googleapis.com/${bucket}/m/001_01/thumb.jpg`, { method: "HEAD" });
  console.log("public check:", t.status, t.headers.get("content-type"));
})().catch((e) => { console.error(e); process.exit(1); });
