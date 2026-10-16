// かけらごとの埋め込み（言葉で組み替えるときの照合用）→ data/net/emb.bin（Float32、488×768、正規化済み）
import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module"; const require = createRequire(import.meta.url);
const { getToken, projectId } = require("../gcp_auth.js");
const W = JSON.parse(readFileSync("data/net/world.json", "utf8")), tok = await getToken();
const texts = W.people.map((p) => `${p.state}。${p.event}。${p.el.map((x) => x[0]).join("、")}`);
const out = new Float32Array(texts.length * 768);
for (let i = 0; i < texts.length; i += 100) {
  const r = await fetch(`https://asia-northeast1-aiplatform.googleapis.com/v1/projects/${projectId()}/locations/asia-northeast1/publishers/google/models/text-multilingual-embedding-002:predict`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ instances: texts.slice(i, i + 100).map((c) => ({ content: c, task_type: "RETRIEVAL_DOCUMENT" })) }) });
  const j = await r.json(); if (!j.predictions) throw new Error(JSON.stringify(j).slice(0, 200));
  j.predictions.forEach((p, k) => { const v = p.embeddings.values, n = Math.hypot(...v); v.forEach((x, d) => (out[(i + k) * 768 + d] = x / n)); });
}
writeFileSync("data/net/emb.bin", Buffer.from(out.buffer)); console.log("emb", texts.length);
