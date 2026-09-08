// 100本の瞬間の「文脈分解」データを LLM で生成して data/context.json に書く（CONTEXT GRAPH ページ用）。
//   NODE_USE_ENV_PROXY=1 node scripts/gen_context.mjs
import { readFileSync, writeFileSync } from "fs";
const moments = JSON.parse(readFileSync("data/moments.json", "utf8"));
const key = process.env.OPENAI_API_KEY;
if (!key) { console.error("OPENAI_API_KEY missing"); process.exit(1); }
const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const SYS = `あなたはスポーツ映像アーカイブの文脈解析エンジンです。各ハイライトを構造化データに分解します。
出力はJSONのみ。キー "items" に配列。各要素:
{ "id": 入力のid,
  "people": [主要人物 最大3。フルネームまたは通称。無ければ空配列],
  "teams": [チーム/国 最大2],
  "competition": "大会・シリーズ名を短く（8〜16文字）",
  "motifs": [3〜5個。物語のモチーフを表す一般語（2〜7文字）。固有名詞禁止。他の瞬間とも共有されるような語を優先。例: 因縁の決着, 土壇場, 初の快挙, 涙の引退, 王者の証明, 番狂わせ, 声援, 最終戦, 世代交代, 記録更新, 復活, ラストプレー],
  "beats": ["起", "転", "結" の3行。各22文字以内。映像の中で起きる出来事の順],
  "why": "この瞬間が心を動かす理由を40文字以内で一文",
  "crowd": "場内の反応を10文字以内で（例: 総立ちの歓声, 静寂ののち爆発, 涙の拍手）" }`;
const batches = [];
for (let i = 0; i < moments.length; i += 10) batches.push(moments.slice(i, i + 10));
async function run(batch, attempt = 0) {
  const user = JSON.stringify(batch.map((m) => ({ id: m.id, title: m.title, sport: m.sport, event: m.event, year: m.year, description: m.description, emotions: m.emotions })));
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYS }, { role: "user", content: user }] }),
  });
  if (!res.ok) { const t = await res.text(); if (attempt < 2) { await new Promise((r) => setTimeout(r, 3000)); return run(batch, attempt + 1); } throw new Error(`${res.status} ${t.slice(0, 300)}`); }
  const j = await res.json();
  const out = JSON.parse(j.choices[0].message.content);
  const items = out.items || out;
  if (!Array.isArray(items) || items.length !== batch.length) { if (attempt < 2) return run(batch, attempt + 1); throw new Error("bad batch shape " + JSON.stringify(out).slice(0, 200)); }
  return items;
}
const results = [];
for (let i = 0; i < batches.length; i += 4) {
  const part = await Promise.all(batches.slice(i, i + 4).map((b) => run(b)));
  for (const p of part) results.push(...p);
  console.error(`done ${results.length}/${moments.length}`);
}
const byId = Object.fromEntries(results.map((r) => [r.id, r]));
const out = moments.map((m) => {
  const r = byId[m.id] || {};
  return { id: m.id, people: (r.people || []).slice(0, 3), teams: (r.teams || []).slice(0, 2), competition: r.competition || m.event, motifs: (r.motifs || []).slice(0, 5), beats: (r.beats || []).slice(0, 3), why: r.why || "", crowd: r.crowd || "" };
});
writeFileSync("data/context.json", JSON.stringify(out, null, 1));
const mot = {}; for (const o of out) for (const t of o.motifs) mot[t] = (mot[t] || 0) + 1;
console.error("motifs:", Object.keys(mot).length, Object.entries(mot).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${k}×${v}`).join(" "));
