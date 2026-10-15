// コンテキストマップ 第2段: 各瞬間の「熱くなる理由」を下から束ねて共通の文脈にし、瞬間どうしのつながりに理由を付ける。事実の点検も行う
//   NODE_USE_ENV_PROXY=1 node scripts/contextmap/build_map.mjs docs/contextmap/reasons.json docs/contextmap/map_sample.json
import { createRequire } from "module";
import { readFileSync, writeFileSync } from "fs";
const require = createRequire(import.meta.url);
const V = require("../vertex.js");
const [inp, out, only] = process.argv.slice(2);
const R0 = JSON.parse(readFileSync(inp, "utf8"));
const R = only ? Object.fromEntries(only.split(",").filter((no) => R0[no]).map((no) => [no, R0[no]])) : R0;
const retry = async (fn) => { for (let k = 0; ; k++) { try { return await fn(); } catch (e) { if (k >= 3) throw e; console.log("retry", String(e).slice(0, 80)); await new Promise((r) => setTimeout(r, 3000 * (k + 1))); } } };
const MAT = JSON.parse(readFileSync("docs/design/material.json", "utf8"));
const SH = JSON.parse(readFileSync("data/sheet2026.json", "utf8"));
const items = [];
for (const m of Object.values(R)) m.reasons.forEach((r, k) => items.push({ id: `${m.no}-${k}`, no: m.no, title: m.title, sport: m.sport, ...r }));

// 1) 事実の点検: 理由の文章に、映像の書き起こし・シートで確かめられないことが入っていないか
const check = {};
await Promise.all(Object.values(R).map(async (m) => {
  const src = `シート: ${(SH.find((x) => x.no === m.no) || {}).moment}\n${MAT[m.no] ? `懸かっていたもの: ${MAT[m.no].stakes}\n出来事:\n${MAT[m.no].beats.map((b) => `[${b.t}] ${b.what}`).join("\n")}\n直後: ${MAT[m.no].aftermath}` : ""}`;
  const r = await retry(() => V.json("渡した「元の資料」と「理由の文章」を照らし合わせ、元の資料で確かめられない事実（数字・年数・人物の経歴・発言・出来事）を理由ごとに挙げる。解釈や感情の言い方は事実ではないので挙げない。無ければ空。",
    `${src}\n\n理由の文章:\n${m.reasons.map((x, k) => `(${k}) ${x.seen} / ${x.why}`).join("\n")}`,
    { model: "gemini-3.8-flash", temperature: 0.1, schema: { type: "OBJECT", properties: { items: { type: "ARRAY", items: { type: "OBJECT", properties: { k: { type: "INTEGER" }, claims: { type: "ARRAY", items: { type: "STRING" } } }, required: ["k", "claims"] } } }, required: ["items"] } }));
  for (const it of r.items) if (it.claims.length) check[`${m.no}-${it.k}`] = it.claims;
}));
console.log("確かめられない事実:", JSON.stringify(check, null, 1));

// 2) 束ねる: 同じ文脈を生きている理由どうしをまとめ、観る人の言葉で名前と定義を付ける
const SYS = `100のスポーツの瞬間を、観る人の熱狂の文脈でつなぐ地図を作っています。渡すのは、いくつかの瞬間について「観る人がなぜ熱くなるか」を書いた理由です。
同じ文脈を生きている理由どうしを束ね、文脈ごとに名前と定義を付けます。
- 文脈の名前は、観る人が自分の人生や記憶と重ねられる人の言葉（10〜24字）。出来事の種類（逆転・優勝・ゴール・記録）や競技用語、タグのような短い名詞は使わない。
- 束ねる基準は「何が起きたか」が似ていることではなく、「なぜ熱くなるか」が同じこと。競技も勝ち負けも違うのに同じ文脈を生きている、という束を探す。
- 定義は一文。その文脈で観る人の心に何が起きるか。
- 1つの理由は1つの文脈にだけ入れる。どこにも入らない理由は、その瞬間だけの文脈として単独で残してよい（name を付ける）。
- 文脈ごとに、束ねた瞬間どうしのつながりを書く: 2つの瞬間の組ごとに一文（30〜60字）。両方の具体（誰が・何を）を入れ、その文脈の言葉でなぜつながるかを言う。「どちらも泣いている」のような見た目の一致だけは理由にしない。`;
const SCHEMA = { type: "OBJECT", properties: { contexts: { type: "ARRAY", items: { type: "OBJECT", properties: {
  name: { type: "STRING" }, definition: { type: "STRING" }, members: { type: "ARRAY", items: { type: "STRING" } },
  links: { type: "ARRAY", items: { type: "OBJECT", properties: { a: { type: "STRING" }, b: { type: "STRING" }, line: { type: "STRING" } }, required: ["a", "b", "line"] } },
}, required: ["name", "definition", "members", "links"] } } }, required: ["contexts"] };
const user = items.map((x) => `[${x.id}] No.${x.no} ${x.title}（${x.sport}） ${x.t}\n  文脈: ${x.context}\n  見えるもの: ${x.seen}\n  なぜ: ${x.why}`).join("\n");
const r = await retry(() => V.json(SYS, user, { model: "gemini-3.8-flash", temperature: 0.3, schema: SCHEMA }));
// 検査: すべての理由がちょうど1回ずつ入っているか
const seen = {}; r.contexts.forEach((c) => c.members.forEach((id) => (seen[id] = (seen[id] || 0) + 1)));
const missing = items.filter((x) => !seen[x.id]).map((x) => x.id), dup = Object.entries(seen).filter(([, n]) => n > 1).map(([id]) => id);
console.log("文脈", r.contexts.length, "入っていない理由", missing, "重複", dup);
for (const c of r.contexts) { const ms = c.members.map((id) => items.find((x) => x.id === id)).filter(Boolean); console.log(`\n■ ${c.name}（${ms.length}）— ${c.definition}`); for (const x of ms) console.log(`   ${x.no} ${x.title}（${x.sport}）[${x.t}] ${x.context}`); for (const l of c.links) console.log(`   ⇔ ${l.a}–${l.b}: ${l.line}`); }
writeFileSync(out, JSON.stringify({ items, check, contexts: r.contexts, missing, dup }, null, 1));
