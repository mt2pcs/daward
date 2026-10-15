// 言葉を意味の地図に置く: 言葉 → 熱くなる理由の一文に読む → 埋め込み → 近い文脈と地図上の位置。
//   NODE_USE_ENV_PROXY=1 node scripts/design/meaning_word.mjs "ベテランの熱量"
import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
const req = createRequire(import.meta.url);
const { json } = req("../vertex.js"); const { getToken, projectId } = req("../gcp_auth.js");
const word = process.argv[2] || "ベテランの熱量";
const p = "docs/design/zap/meaning_map.json", M = JSON.parse(readFileSync(p, "utf8"));
const E = JSON.parse(readFileSync("docs/design/zap/context_emb.json", "utf8"));
const r = await json("観る人がスポーツのどこに熱くなるかを、その人の言葉から読む。", `言葉「${word}」。この言葉の人が熱くなる瞬間を、熱くなる理由の一文（30〜50字、具体的な場面の手触りで）にして。`, { schema: { type: "OBJECT", properties: { reading: { type: "STRING" } }, required: ["reading"] }, temperature: 0.3 });
const tok = await getToken();
const res = await fetch(`https://asia-northeast1-aiplatform.googleapis.com/v1/projects/${projectId()}/locations/asia-northeast1/publishers/google/models/text-multilingual-embedding-002:predict`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ instances: [{ content: `${word}。${r.reading}`, task_type: "SEMANTIC_SIMILARITY" }] }) });
const v = (await res.json()).predictions[0].embeddings.values;
const cos = (a, b) => { let s = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return s / Math.sqrt(x * y); };
const sims = E.map((e, i) => [i, cos(v, e)]).sort((a, b) => b[1] - a[1]);
const top = sims.slice(0, 8), w = top.map(([, s]) => Math.exp((s - top[0][1]) * 40)), W = w.reduce((a, b) => a + b, 0);
// 平均を取ると離れた点の間（関係ない場所）に落ちるので、いちばん近い文脈のすぐ隣に置き、次の2つの方へ少し寄せる
const pos = [0, 1, 2].map((d) => M.items[top[0][0]].pos[d] * 0.82 + ((M.items[top[1][0]].pos[d] + M.items[top[2][0]].pos[d]) / 2) * 0.18);
M.words = (M.words || []).filter((x) => x.text !== word).concat([{ text: word, reading: r.reading, pos, neighbors: top.map(([i, s]) => [i, +s.toFixed(3)]) }]);
writeFileSync(p, JSON.stringify(M));
console.log(word, "→", r.reading); top.forEach(([i, s]) => console.log(s.toFixed(3), M.items[i].id, M.items[i].sport, M.items[i].t, M.items[i].context));
