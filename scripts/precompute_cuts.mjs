// 想定入力（data/inputs2026.json）の切り口を、動いているエンジン（/api/v26/cut）で事前に計算して保存する。
// エンジンは起動時にこれを読むので、想定内の言葉は LLM を呼ばずに即答する。分解・辞書を変えたら作り直す。
//   node scripts/precompute_cuts.mjs [base=http://localhost:3142] [out=data/cuts2026.json] [並列=3]
import { readFileSync, writeFileSync, existsSync } from "fs";
const [base = "http://localhost:3142", out = "data/cuts2026.json", par = "3"] = process.argv.slice(2);
const done = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : {};
// 画面から押される言葉も必ず事前計算する: 体験の既定チップ、各切り口の「次の言葉」、辞書の値そのもの
const LEX = JSON.parse(readFileSync("data/lexicon2026.json", "utf8"));
const CHIPS = ["ベテランの熱量", "めちゃくちゃ泣ける", "仕事帰りにスカッと"];
const inputs = [...new Set([
  ...Object.values(JSON.parse(readFileSync("data/inputs2026.json", "utf8"))).flat(),
  ...CHIPS, ...Object.values(done).flatMap((c) => c.next || []), ...LEX.axes.flatMap((a) => a.values.map((v) => v.v)),
])];
const todo = inputs.filter((q) => !done[q]);
console.error(`todo ${todo.length}`);
let i = 0, n = 0;
await Promise.all(Array.from({ length: +par }, async () => {
  while (i < todo.length) {
    const q = todo[i++];
    try {
      const r = await (await fetch(base + "/api/v26/cut", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }) })).json();
      if (r.arms?.length && r.arms.every((a) => a.nameSource !== "template" || a.keys.length === 0)) { delete r.ms; done[q] = r; }
      if (++n % 25 === 0) { writeFileSync(out, JSON.stringify(done)); console.error(n, "/", todo.length); }
    } catch (e) { console.error("fail", q, String(e).slice(0, 80)); }
  }
}));
writeFileSync(out, JSON.stringify(done)); console.error("saved", Object.keys(done).length);
