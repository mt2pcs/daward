// 最下層（要素）どうしの繋がりを判定する: 違う瞬間の要素が「同じ具体的なもの」か。
//   node scripts/net/links.mjs [layers=data/net/layers.json] [out=data/net/links.json]   （K=候補数, PAR=並列数）
// 候補は意味の近さ（埋め込み）で拾い、AI が対で判定して、両方の具体を入れた一文を付ける。上の層の繋がりはここから積み上げる（画面側）。
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { json } = require("../vertex.js");
const { getToken, projectId } = require("../gcp_auth.js");
const [IN = "data/net/layers.json", OUT = "data/net/links.json"] = process.argv.slice(2);
const K = +(process.env.K || 6), PAR = +(process.env.PAR || 6), BATCH = 30;
const L = JSON.parse(readFileSync(IN, "utf8"));
const els = [];
Object.values(L).forEach((m) => m.events.forEach((e, ei) => e.people.forEach((p, pi) => p.elements.forEach((x, xi) =>
  els.push({ id: `${m.no}.${ei}.${pi}.${xi}`, no: m.no, title: m.title, sport: m.sport, who: `${p.name}（${p.state}）`, text: x.text, kind: x.kind })))));
console.log("elements", els.length);
const tok = await getToken();
async function embed(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 200) {
    const r = await fetch(`https://asia-northeast1-aiplatform.googleapis.com/v1/projects/${projectId()}/locations/asia-northeast1/publishers/google/models/text-multilingual-embedding-002:predict`,
      { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ instances: texts.slice(i, i + 200).map((c) => ({ content: c, task_type: "SEMANTIC_SIMILARITY" })) }) });
    const j = await r.json(); if (!j.predictions) throw new Error(JSON.stringify(j).slice(0, 200));
    out.push(...j.predictions.map((p) => { const v = Float32Array.from(p.embeddings.values); let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n); return v.map((x) => x / n); }));
  }
  return out;
}
const E = await embed(els.map((x) => x.text));
// 候補: 各要素について、違う瞬間の要素から近い順に K 個
const pairs = new Map();
for (let i = 0; i < els.length; i++) {
  const best = [];
  for (let j = 0; j < els.length; j++) {
    if (els[j].no === els[i].no) continue;
    let s = 0; const a = E[i], b = E[j]; for (let d = 0; d < a.length; d++) s += a[d] * b[d];
    if (best.length < K || s > best[best.length - 1][0]) { best.push([s, j]); best.sort((x, y) => y[0] - x[0]); if (best.length > K) best.pop(); }
  }
  for (const [s, j] of best) { const key = i < j ? `${i}|${j}` : `${j}|${i}`; if (!pairs.has(key)) pairs.set(key, s); }
}
console.log("candidate pairs", pairs.size);
const SYS = `2つのスポーツの瞬間から取り出した「人のその瞬間の要素」の組が、同じ具体的なものかを判定する。
same=true にするのは、同じ行為・同じ表情・同じ関係・同じ懸かり方・同じ境遇が、両方に具体的に起きているときだけ（例: 両方とも「両手で顔を覆う」、両方とも「キャリア最後の試合」、両方とも「父の話をする」）。
「喜ぶ」「悔しい」「頑張る」のような誰にでも当てはまる総称でしか共通しないなら false。
same=true のとき why に、両方の具体（誰が・何を）を入れた40字以内の一文を書く。例「クボタの14番も岸本も、出し切って立てずに座り込む」。`;
const schema = { type: "OBJECT", properties: { r: { type: "ARRAY", items: { type: "OBJECT", properties: { i: { type: "INTEGER" }, same: { type: "BOOLEAN" }, why: { type: "STRING" } }, required: ["i", "same"] } } }, required: ["r"] };
const done = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { judged: {}, links: [] };
const todo = [...pairs.keys()].filter((k) => !(k in done.judged));
const batches = []; for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
const desc = (x) => `${x.title}（${x.sport}）の ${x.who}: 「${x.text}」`;
let nb = 0;
await Promise.all(Array.from({ length: PAR }, async () => { while (batches.length) { const b = batches.shift();
  const user = b.map((k, n) => { const [i, j] = k.split("|").map(Number); return `[${n}] A=${desc(els[i])}\n    B=${desc(els[j])}`; }).join("\n");
  for (let a = 0; a < 3; a++) { try {
    const r = await json(SYS, user, { schema, temperature: 0.1, model: "gemini-3.8-flash" });
    for (const x of r.r) { const k = b[x.i]; if (!k) continue; done.judged[k] = !!x.same; if (x.same && x.why) { const [i, j] = k.split("|").map(Number); done.links.push({ a: els[i].id, b: els[j].id, why: x.why }); } }
    break; } catch (e) { console.log("retry", String(e).slice(0, 100)); await new Promise((r) => setTimeout(r, 5000 * (a + 1))); } }
  if (++nb % 10 === 0) { writeFileSync(OUT, JSON.stringify(done)); console.log("batches", nb, "links", done.links.length); } } }));
writeFileSync(OUT, JSON.stringify(done));
console.log("judged", Object.keys(done.judged).length, "links", done.links.length);
