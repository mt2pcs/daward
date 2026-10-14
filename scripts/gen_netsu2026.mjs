// 各瞬間に「熱狂の種類」（競技横断の固定語彙から主1・副1）を Vertex で付け、data/context2026.json に netsu として書き戻す。
//   node scripts/gen_netsu2026.mjs [data/context2026.json]
import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { json } = require("./vertex.js");
const path = process.argv[2] || "data/context2026.json";
const rows = JSON.parse(readFileSync(path, "utf8"));
export const NETSU = ["土壇場の一撃","ベテランの熱量","新星の衝撃","王者の証明","ジャイアントキリング","めちゃくちゃ泣ける","スタジアムが揺れた","執念の結実","息を呑む攻防","歴史が動いた"];
const SYS = `あなたはスポーツの「熱狂」を分類する編集者です。各ハイライトを、競技に関係なく共通する熱狂の種類に分類します。
語彙は次の10個だけ: ${NETSU.join(" / ")}
出力はJSONのみ: {"items":[{"no":"001","primary":"語彙のどれか","secondary":"語彙のどれか（primaryと別）","line":"なぜその熱狂か、12〜22文字の一文（競技名を入れない）"}]}
10個が偏らないよう、迷ったら少ない語彙を選ぶ。`;
const batches = []; for (let i = 0; i < rows.length; i += 10) batches.push(rows.slice(i, i + 10));
async function run(b, attempt = 0) {
  try { const out = await json(SYS, JSON.stringify(b.map((r) => ({ no: r.no, title: r.title, beat: r.beat, why: r.why, motifs: r.motifs, emo: r.emo }))), { temperature: 0.4 });
    const items = out.items || out; if (!Array.isArray(items) || items.length !== b.length) throw new Error("shape"); return items; }
  catch (e) { if (attempt < 3) { await new Promise((r) => setTimeout(r, 2500)); return run(b, attempt + 1); } throw e; }
}
const res = []; for (let i = 0; i < batches.length; i += 3) { const part = await Promise.all(batches.slice(i, i + 3).map((b) => run(b))); for (const p of part) res.push(...p); console.error(`done ${res.length}/${rows.length}`); }
const by = Object.fromEntries(res.map((r) => [String(r.no).padStart(3, "0"), r]));
for (const r of rows) { const n = by[r.no] || {}; const ok = (x) => NETSU.includes(x) ? x : null; r.netsu = [ok(n.primary), ok(n.secondary)].filter(Boolean); if (!r.netsu.length) r.netsu = [NETSU[8]]; r.netsuLine = n.line || ""; }
writeFileSync(path, JSON.stringify(rows, null, 1));
const cnt = {}; for (const r of rows) for (const n of r.netsu) cnt[n] = (cnt[n] || 0) + 1; console.error(Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(" "));
