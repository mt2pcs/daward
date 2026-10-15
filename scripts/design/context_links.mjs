// 熱狂の文脈どうしのつながりを試算する: 334の文脈（文脈の一文＋なぜ）を埋め込み、違う映像・できれば違う競技の近い文脈を挙げる。
//   NODE_USE_ENV_PROXY=1 node scripts/design/context_links.mjs <no> [k]
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createRequire } from "module";
const { getToken, projectId } = createRequire(import.meta.url)("../gcp_auth.js");
const [no = "090", K = "5"] = process.argv.slice(2);
const R = JSON.parse(readFileSync("docs/contextmap/reasons.json", "utf8"));
const items = (Array.isArray(R) ? R : Object.values(R)).flatMap((m) => (m.reasons || []).map((x, k) => ({ no: m.no, title: m.title, sport: m.sport, k, ...x })));
const cache = "docs/design/zap/context_emb.json";
let emb = existsSync(cache) ? JSON.parse(readFileSync(cache, "utf8")) : null;
if (!emb || emb.length !== items.length) {
  const tok = await getToken(); emb = [];
  const texts = items.map((x) => `${x.context}。${x.why}`);
  for (let i = 0; i < texts.length; i += 100) {
    const r = await fetch(`https://asia-northeast1-aiplatform.googleapis.com/v1/projects/${projectId()}/locations/asia-northeast1/publishers/google/models/text-multilingual-embedding-002:predict`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ instances: texts.slice(i, i + 100).map((c) => ({ content: c, task_type: "SEMANTIC_SIMILARITY" })) }) });
    const j = await r.json(); if (!j.predictions) throw new Error(JSON.stringify(j).slice(0, 200));
    emb.push(...j.predictions.map((p) => p.embeddings.values));
  }
  writeFileSync(cache, JSON.stringify(emb));
}
const cos = (a, b) => { let s = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return s / Math.sqrt(x * y); };
for (const [i, it] of items.entries()) {
  if (it.no !== no) continue;
  console.log(`\n■ ${it.no} ${it.sport} ${it.t || "--"}「${it.context}」`);
  const near = items.map((x, j) => ({ x, s: cos(emb[i], emb[j]) })).filter((o) => o.x.no !== no).sort((a, b) => b.s - a.s);
  const seen = new Set(); let c = 0;
  for (const o of near) { if (seen.has(o.x.no)) continue; seen.add(o.x.no); console.log(`   ${o.s.toFixed(3)} ${o.x.no} ${o.x.sport} ${o.x.t || "--"}「${o.x.context}」`); if (++c >= +K) break; }
}
