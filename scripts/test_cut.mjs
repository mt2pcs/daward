// 切り口エンジンの入力テスト。想定内・状況・固有名（いる/いない）・競技・比喩・口語・英語・絵文字・無意味・不適切・長文を通す。
//   node scripts/test_cut.mjs [base=http://localhost:3142] [out.json]
import { writeFileSync, readFileSync } from "fs";
const [base = "http://localhost:3142", out = "cut_test.json"] = process.argv.slice(2);
const titles = Object.fromEntries(JSON.parse(readFileSync("data/moments2026.json", "utf8")).map((m) => [m.no, `${m.title}（${m.sportLabel}）`]));
const CASES = [
  ["想定内", "ベテランの熱量"], ["想定内", "めちゃくちゃ泣ける"], ["想定内", "土壇場の一撃"], ["想定内", "鳥肌"], ["想定内の組合せ", "野球で泣ける"],
  ["観る人の状況", "仕事帰りにスカッとしたい"], ["観る人の状況", "月曜の朝"], ["観る人の状況", "失恋した"],
  ["固有名・いる", "メッシ"], ["固有名・いる", "日本代表"], ["固有名・いる", "つば九郎"],
  ["固有名・いない", "大谷翔平"], ["固有名・いない", "羽生結弦"],
  ["競技だけ", "ラグビー"], ["対象外の競技", "カーリング"],
  ["比喩", "雨の日"], ["比喩", "神様がいた"], ["比喩", "漫画みたい"], ["比喩", "青春"], ["比喩", "カレー"],
  ["口語", "えぐいやつ"], ["英語", "clutch"], ["絵文字", "😭"], ["絵文字", "🔥"],
  ["長文", "子どもの頃に父と見た試合を思い出すような、静かに胸が熱くなるやつ"],
  ["無意味", "あああああ"], ["無意味", "asdfgh"], ["不適切", "死ね"], ["不適切", "八百長"],
];
const results = [];
for (const [kind, q] of CASES) {
  const t0 = Date.now();
  const r = await (await fetch(base + "/api/v26/cut", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }) })).json();
  results.push({ kind, ...r });
  const n = r.arms.reduce((a, x) => a + x.moments.length, 0);
  console.log(`\n■ [${kind}] 「${q}」 → ${r.status}${r.message ? "｜" + r.message : ""}  (${Date.now() - t0}ms, ${r.source})`);
  console.log(`  読み: ${r.read.values.map((x) => `${x.v}(${x.via})`).join(" ") || "-"}${r.read.sports.length ? "  競技:" + r.read.sports.join(",") : ""}${r.read.names.length ? "  名前:" + r.read.names.map((x) => x.name).join(",") : ""}`);
  for (const a of r.arms) console.log(`  腕「${a.name}」[${a.nameSource}] ${a.keys.join("×")} ${a.moments.length}本: ${a.moments.slice(0, 3).map((m) => `${m.no} ${titles[m.no]}`).join(" / ")}`);
  for (const t of r.threads.slice(0, 2)) console.log(`  糸: ${t.a}—${t.b} 〈${t.shared.join("・")}〉`);
  console.log(`  次の言葉: ${r.next.join(" / ")}   計${n}本`);
}
writeFileSync(out, JSON.stringify(results, null, 1));
