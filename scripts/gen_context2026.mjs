// 2026 本番素材（素材シート）の「文脈分解」を Vertex AI Gemini で生成し data/context2026.json に書く。
//   node scripts/gen_context2026.mjs [brief/titles.json] [data/context2026.json]
// 人物・チーム名は後で突合するため正規化（通称に統一、敬称なし）を指示する。
import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { json } = require("./vertex.js");
const src = process.argv[2] || "brief/titles.json", dst = process.argv[3] || "data/context2026.json";
const rows = JSON.parse(readFileSync(src, "utf8")).filter((r) => /^\d{3}$/.test(r.no) && +r.no <= 100);
const SYS = `あなたはスポーツ映像アーカイブの文脈解析エンジンです。各ハイライト（2025-26シーズン、DAZN配信）を構造化データに分解します。
出力はJSONのみ。キー "items" に配列。各要素:
{ "no": 入力のno,
  "people": [主要人物 最大3。日本の一般的な通称（例: 久保建英, メッシ, ハーランド, 大谷翔平）。敬称なし。無ければ空配列],
  "teams": [チーム/国/所属 最大2。一般的な短い通称（例: 日本代表, アルゼンチン, 阪神, バルセロナ）],
  "competition": "大会・リーグ名を短く（例: W杯2026, プレミアリーグ, Jリーグ, プロ野球, Bリーグ, WBC, 日本シリーズ）",
  "motifs": [3〜5個。物語のモチーフを表す一般語（2〜7文字）。固有名詞禁止。他の瞬間とも共有されるような語を優先。語彙は次から選ぶのを基本とし、無ければ新語: 土壇場, 番狂わせ, 王者の証明, 新星誕生, 涙の引退, 記録更新, 復活, ラストプレー, 因縁の決着, 初の快挙, 世代交代, 最終戦, 声援, 逆転, 完封, 独走, 歴史的勝利, ベテランの意地, 連覇, 本拠地, 雪辱, 劇的弾, 鉄壁, 神セーブ, 一発, 若手の躍動, 悲願, 歓喜の輪, 沈黙, 執念],
  "beat": "映像で起きる出来事を一文（28文字以内）",
  "why": "この瞬間が心を動かす理由を一文（36文字以内）",
  "crowd": "場内の反応（10文字以内）" }`;
const batches = [];
for (let i = 0; i < rows.length; i += 10) batches.push(rows.slice(i, i + 10));
async function run(batch, attempt = 0) {
  const user = JSON.stringify(batch.map((r) => ({ no: r.no, moment: r.moment, sport: r.sport, emo: r.emo, date: r.date, title: (r.titles || [])[0] })));
  try {
    const out = await json(SYS, user, { temperature: 0.3 });
    const items = out.items || out;
    if (!Array.isArray(items) || items.length !== batch.length) throw new Error("bad shape " + JSON.stringify(out).slice(0, 160));
    return items;
  } catch (e) {
    if (attempt < 3) { await new Promise((r) => setTimeout(r, 2500)); return run(batch, attempt + 1); }
    throw e;
  }
}
const results = [];
for (let i = 0; i < batches.length; i += 3) {
  const part = await Promise.all(batches.slice(i, i + 3).map((b) => run(b)));
  for (const p of part) results.push(...p);
  console.error(`done ${results.length}/${rows.length}`);
}
const byNo = Object.fromEntries(results.map((r) => [String(r.no).padStart(3, "0"), r]));
const out = rows.map((r) => { const c = byNo[r.no] || {}; return { no: r.no, title: (r.titles || [])[0] || "", short: r.short || "", sport: r.sport, emo: r.emo, people: (c.people || []).slice(0, 3), teams: (c.teams || []).slice(0, 2), competition: c.competition || "", motifs: (c.motifs || []).slice(0, 5), beat: c.beat || "", why: c.why || "", crowd: c.crowd || "" }; });
writeFileSync(dst, JSON.stringify(out, null, 1));
const cnt = (k) => { const m = {}; for (const o of out) for (const t of [].concat(o[k])) if (t) m[t] = (m[t] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]); };
console.error("motifs:", cnt("motifs").slice(0, 25).map(([k, v]) => `${k}×${v}`).join(" "));
console.error("people:", cnt("people").filter(([, v]) => v > 1).map(([k, v]) => `${k}×${v}`).join(" "));
console.error("teams:", cnt("teams").filter(([, v]) => v > 1).map(([k, v]) => `${k}×${v}`).join(" "));
