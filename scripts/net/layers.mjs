// ネットワークの世界の層を作る: 瞬間(L0) → 出来事(L1) → 人とその状態(L2) → 要素(L3)
//   node scripts/net/layers.mjs [out=data/net/layers.json]   （PAR=並列数、途中保存・再開可）
// 入力: docs/design/material.json（映像から書き起こした時刻つきの出来事・懸かっていたもの・その後）
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createRequire } from "module";
const { json } = createRequire(import.meta.url)("../vertex.js");
const OUT = process.argv[2] || "data/net/layers.json", PAR = +(process.env.PAR || 5);
const MAT = ((x) => (Array.isArray(x) ? x : Object.values(x.items || x)))(JSON.parse(readFileSync("docs/design/material.json", "utf8")));
const W = JSON.parse(readFileSync("docs/design/world.json", "utf8"));
const done = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const SYS = `あなたはスポーツ映像を細かく読む編集者。1本の瞬間を「出来事 → その中の人とその状態 → その人のその瞬間を作っている要素」の入れ子に分解する。
規則:
- 書いてあることだけを使う（書き起こしに無い経歴・数字・名前を足さない）。
- 出来事(events)は3〜7個。続いた beats をまとめ、label は12字以内でその瞬間にしか当てはまらない具体（例「ラストワンプレーの蹴り出し」「40歳山下の男泣き」）。「歓喜」「感動」「熱戦」だけのような総称は禁止。
- 人(people)は各出来事に1〜3人。name は書き起こしにある名前、無ければ見た目で特定（「クボタの14番」「スタンドの少年」）。state は14字以内の具体的な状態（「仰向けで悔し涙」）。beat はその人が最もよく映る beats の番号。
- 要素(elements)は各人に2〜4個、16字以内。その人のその瞬間を作っている具体的なもの。kind は 体の動き/表情/声/関係/懸かっていたもの/境遇/場所 のどれか。
  良い例「両手で顔を覆う」「父を語りながら涙」「最年長で初優勝」「兄の急死を背負った打席」「主将に抱き上げられる」。悪い例「努力の結実」「熱い思い」「感動の瞬間」。
- 懸かっていたもの(stakes)やその後(aftermath)から分かる境遇は、その人の要素として入れてよい。`;
const schema = { type: "OBJECT", properties: { events: { type: "ARRAY", items: { type: "OBJECT", properties: {
  label: { type: "STRING" }, beats: { type: "ARRAY", items: { type: "INTEGER" } },
  people: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, state: { type: "STRING" }, beat: { type: "INTEGER" },
    elements: { type: "ARRAY", items: { type: "OBJECT", properties: { text: { type: "STRING" }, kind: { type: "STRING", enum: ["体の動き", "表情", "声", "関係", "懸かっていたもの", "境遇", "場所"] } }, required: ["text", "kind"] } } },
    required: ["name", "state", "beat", "elements"] } } }, required: ["label", "beats", "people"] } } }, required: ["events"] };
const unitIdx = {}; W.units.forEach((u, i) => (unitIdx[u.no + "@" + u.t] = i));
const q = MAT.filter((m) => !done[m.no]).slice(0, +(process.env.LIMIT || 999));
async function one(m) {
  const user = `題: ${m.title}（${m.sport}）\n懸かっていたもの: ${m.stakes}\nその後: ${m.aftermath}\nbeats:\n` + m.beats.map((b, k) => `[${k}] ${b.t} ${b.what}`).join("\n");
  for (let a = 0; a < 3; a++) {
    try {
      const r = await json(SYS, user, { schema, temperature: 0.3, model: a ? "gemini-3.8-flash" : process.env.MODEL || "gemini-3.8-flash" });
      for (const e of r.events) for (const p of e.people) { const b = m.beats[p.beat] || m.beats[e.beats[0]] || m.beats[0]; p.t = b.t; p.unit = unitIdx[m.no + "@" + b.t] ?? null; }
      return { no: m.no, title: m.title, sport: m.sport, events: r.events };
    } catch (e) { console.log("retry", m.no, String(e).slice(0, 120)); await new Promise((r) => setTimeout(r, 4000 * (a + 1))); }
  }
  return null;
}
let n = 0;
await Promise.all(Array.from({ length: PAR }, async () => { while (q.length) { const m = q.shift(); const r = await one(m); if (r) { done[m.no] = r; n++; if (n % 5 === 0) writeFileSync(OUT, JSON.stringify(done)); } } }));
writeFileSync(OUT, JSON.stringify(done));
const all = Object.values(done); const ev = all.flatMap((m) => m.events), pe = ev.flatMap((e) => e.people), el = pe.flatMap((p) => p.elements);
console.log("moments", all.length, "events", ev.length, "people", pe.length, "elements", el.length);
