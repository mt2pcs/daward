// コンテキストマップ（100本）: 熱くなる理由 → 文脈の一覧を下から作る → 各理由を文脈へ割り当て → 文脈ごとに瞬間どうしのつながりの一文 → 事実の点検
//   NODE_USE_ENV_PROXY=1 node scripts/contextmap/map_all.mjs docs/contextmap/reasons.json data/contextmap2026.json
import { createRequire } from "module";
import { readFileSync, writeFileSync, existsSync } from "fs";
const require = createRequire(import.meta.url);
const V = require("../vertex.js");
const [inp, out] = process.argv.slice(2);
const R = JSON.parse(readFileSync(inp, "utf8"));
const MAT = JSON.parse(readFileSync("docs/design/material.json", "utf8"));
const SH = JSON.parse(readFileSync("data/sheet2026.json", "utf8"));
const prev = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : {};
// 429（共有枠）が出たら待って、3回目からは別のモデルに切り替える
let altModel = false;
const retry = async (fn) => { for (let k = 0; ; k++) { try { return await fn(altModel || k >= 3); } catch (e) { if (k >= 8) throw e; if (String(e).includes("429") && k >= 2) altModel = true; console.log("retry", k, String(e).slice(0, 70)); await new Promise((r) => setTimeout(r, 6000 * (k + 1))); } } };
const FAST = (alt) => (alt ? "gemini-3.8-flash" : "gemini-2.5-flash");
const pool = async (arr, n, fn) => { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < arr.length) { const x = arr[i++]; await fn(x); } })); };
const items = [];
for (const m of Object.values(R)) m.reasons.forEach((r, k) => items.push({ id: `${m.no}-${k}`, no: m.no, title: m.title, sport: m.sport, ...r }));
console.log("瞬間", Object.keys(R).length, "理由", items.length);

// 1) 文脈の一覧: すべての理由から、同じ「なぜ熱くなるか」を束ねて名前と定義を付ける
let vocab = prev.vocab;
if (!vocab) {
  const SYS = `100のスポーツの瞬間を、観る人の熱狂の文脈でつなぐ地図を作っています。渡すのは各瞬間の「観る人がなぜ熱くなるか」の理由（約400）です。
これを束ねて、地図の中心になる「熱狂の文脈」の一覧を作ります。
- 文脈は、観る人が自分の人生や記憶と重ねられる人の言葉（10〜24字）。出来事の種類（逆転・優勝・ゴール・記録）・競技用語・短い名詞のタグにしない。
- 束ねる基準は「なぜ熱くなるか」が同じこと。競技も勝ち負けも違うのに同じ文脈を生きている、という束になるように。
- 24〜34個。どれも複数の瞬間（できれば複数の競技）を束ねられる広さで、しかし「感動する」のような何でも入る広さにはしない。互いに重ならないように。
- 各文脈に、定義（その文脈で観る人の心に何が起きるか、一文）。`;
  const user = items.map((x) => `${x.no}（${x.sport}）${x.context}`).join("\n");
  const r = await retry(() => V.json(SYS, user, { model: "gemini-3.8-flash", temperature: 0.3, schema: { type: "OBJECT", properties: { contexts: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, definition: { type: "STRING" } }, required: ["name", "definition"] } } }, required: ["contexts"] } }));
  vocab = r.contexts.map((c, i) => ({ id: `c${String(i + 1).padStart(2, "0")}`, ...c }));
  writeFileSync(out, JSON.stringify({ ...prev, vocab }, null, 1));
}
console.log("文脈", vocab.length); vocab.forEach((c) => console.log(" ", c.id, c.name));

// 2) 割り当て: 各理由を、文脈の一覧のどれか1つへ（合わなければ none）。強さ 0〜1
// v2: 文脈はIDの列挙で縛り、理由は配列の位置で対応させる（v1 は名前や別の番号が返って半数が地図から落ちた）
let assign = prev.assignV === 2 ? (prev.assign || {}) : {};
const SYS2 = `熱狂の文脈の一覧と、ある瞬間の「観る人が熱くなる理由」を渡します。各理由を、いちばん近い文脈1つに割り当てます。
- 見た目や出来事の種類が似ているかではなく、「なぜ熱くなるか」が同じかで選ぶ。
- どれにも当てはまらなければ none。無理に入れない。
- fit: その文脈にどれだけはっきり当てはまるか（0〜1）。
- 返す配列は理由と同じ数・同じ順番。context には文脈のID（c01 など）か none だけを書く。`;
const vocabText = vocab.map((c) => `${c.id}: ${c.name} — ${c.definition}`).join("\n");
const byNo = Object.values(R).filter((m) => !assign[m.no]);
const IDS = [...vocab.map((c) => c.id), "none"];
await pool(byNo, Number(process.env.PAR || 2), async (m) => {
  const n = m.reasons.length;
  const r = await retry(async (alt) => {
    const o = await V.json(SYS2, `文脈の一覧:\n${vocabText}\n\nNo.${m.no} ${m.title}（${m.sport}）の理由（${n}つ）:\n${m.reasons.map((x, k) => `${k + 1}. ${x.context} — ${x.why}`).join("\n")}`,
      { model: FAST(alt), ...(alt ? {} : { thinkingBudget: 0 }), temperature: 0.1, schema: { type: "OBJECT", properties: { a: { type: "ARRAY", minItems: n, maxItems: n, items: { type: "OBJECT", properties: { context: { type: "STRING", enum: IDS }, fit: { type: "NUMBER" } }, required: ["context", "fit"] } } }, required: ["a"] } });
    if (!o.a || o.a.length !== n || o.a.some((x) => !IDS.includes(x.context))) throw new Error(`bad assign ${m.no} ${JSON.stringify(o).slice(0, 80)}`);
    return o;
  });
  assign[m.no] = r.a.map((x, k) => ({ k, context: x.context, fit: x.fit })); console.log("割当", m.no, r.a.map((x) => x.context).join(","));
  writeFileSync(out, JSON.stringify({ ...prev, vocab, assign, assignV: 2 }, null, 1));
});
writeFileSync(out, JSON.stringify({ ...prev, vocab, assign, assignV: 2 }, null, 1));
const member = {}; // context id -> [{id,no,fit}]
for (const [no, arr] of Object.entries(assign)) for (const a of arr) { if (!vocab.find((c) => c.id === a.context) || a.fit < 0.45) continue; const id = `${no}-${a.k}`; if (!items.find((x) => x.id === id)) continue; (member[a.context] = member[a.context] || []).push({ id, no, fit: a.fit }); }
// 同じ瞬間が同じ文脈に複数の理由で入る場合は一番強いものだけ
for (const c of Object.keys(member)) { const best = {}; for (const m of member[c]) if (!best[m.no] || m.fit > best[m.no].fit) best[m.no] = m; member[c] = Object.values(best); }

// 3) つながり: 文脈ごとに、瞬間どうしの組（違う競技を優先、各瞬間から最大2本）に一文
let links = (prev.assignV === 2 && prev.linksV === 2) ? (prev.links || {}) : {};
const SYS3 = `熱狂の文脈と、その文脈を生きている瞬間の組を渡します。組ごとに、2つの瞬間のつながりを一文（30〜60字）で書きます。
- 両方の具体（誰が、何を）を入れ、その文脈の言葉で、なぜつながるかを言う。
- 「どちらも泣いている」のような見た目の一致や、出来事の種類（どちらも逆転）だけを理由にしない。
- 渡した理由に無い事実を足さない。`;
await pool(vocab.filter((c) => (member[c.id] || []).length > 1 && !links[c.id]), 2, async (c) => {
  const ms = member[c.id].map((m) => ({ ...m, it: items.find((x) => x.id === m.id) }));
  const pairs = [], deg = {};
  const cand = [];
  for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) cand.push([ms[i], ms[j], (ms[i].it.sport !== ms[j].it.sport ? 1 : 0) + ms[i].fit * ms[j].fit]);
  cand.sort((a, b) => b[2] - a[2]);
  for (const [a, b] of cand) { if ((deg[a.no] || 0) >= 2 || (deg[b.no] || 0) >= 2) continue; pairs.push([a, b]); deg[a.no] = (deg[a.no] || 0) + 1; deg[b.no] = (deg[b.no] || 0) + 1; }
  if (!pairs.length) return;
  const r = await retry((alt) => V.json(SYS3, `文脈: ${c.name} — ${c.definition}\n\n` + pairs.map(([a, b], k) => `組${k}: [${a.id}] No.${a.no} ${a.it.title}（${a.it.sport}）${a.it.t} ${a.it.seen} / ${a.it.why}\n      [${b.id}] No.${b.no} ${b.it.title}（${b.it.sport}）${b.it.t} ${b.it.seen} / ${b.it.why}`).join("\n"),
    { model: FAST(alt), ...(alt ? {} : { thinkingBudget: 0 }), temperature: 0.3, schema: { type: "OBJECT", properties: { lines: { type: "ARRAY", items: { type: "OBJECT", properties: { k: { type: "INTEGER" }, line: { type: "STRING" } }, required: ["k", "line"] } } }, required: ["lines"] } }));
  links[c.id] = r.lines.filter((l) => pairs[l.k]).map((l) => ({ a: pairs[l.k][0].id, b: pairs[l.k][1].id, line: l.line }));
  console.log("線", c.name, links[c.id].length);
});
writeFileSync(out, JSON.stringify({ ...prev, vocab, assign, assignV: 2, links, linksV: 2 }, null, 1));

// 4) 事実の点検（資料で確かめられない事実）
let check = prev.check || {};
await pool(Object.values(R).filter((m) => !check[m.no]), 2, async (m) => {
  const src = `シート: ${(SH.find((x) => x.no === m.no) || {}).moment}\n${MAT[m.no] ? `懸かっていたもの: ${MAT[m.no].stakes}\n出来事:\n${MAT[m.no].beats.map((b) => `[${b.t}] ${b.what}`).join("\n")}\n直後: ${MAT[m.no].aftermath}` : ""}`;
  const r = await retry((alt) => V.json("渡した「元の資料」と「理由の文章」を照らし合わせ、元の資料で確かめられない事実（数字・年数・人物の経歴・発言・出来事）を理由ごとに挙げる。解釈や感情の言い方は事実ではないので挙げない。無ければ空。",
    `${src}\n\n理由の文章:\n${m.reasons.map((x, k) => `(${k}) ${x.seen} / ${x.why}`).join("\n")}`,
    { model: FAST(alt), ...(alt ? {} : { thinkingBudget: 0 }), temperature: 0.1, schema: { type: "OBJECT", properties: { items: { type: "ARRAY", items: { type: "OBJECT", properties: { k: { type: "INTEGER" }, claims: { type: "ARRAY", items: { type: "STRING" } } }, required: ["k", "claims"] } } }, required: ["items"] } }));
  check[m.no] = Object.fromEntries(r.items.filter((x) => x.claims.length).map((x) => [x.k, x.claims]));
});
const result = { vocab, assign, assignV: 2, links, linksV: 2, check, member, items };
writeFileSync(out, JSON.stringify(result, null, 1));
const used = vocab.map((c) => ({ c, n: (member[c.id] || []).length, sp: new Set((member[c.id] || []).map((m) => items.find((x) => x.id === m.id).sport)).size }));
console.log("\n文脈ごとの瞬間数・競技数"); used.sort((a, b) => b.n - a.n).forEach((u) => console.log(`  ${u.n}本 ${u.sp}競技  ${u.c.name}`));
const covered = new Set(Object.values(member).flat().map((m) => m.no)); console.log("どの文脈にも入らない瞬間", Object.keys(R).filter((no) => !covered.has(no)).join(","));
