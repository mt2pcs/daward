// 素材シートの長文「モーメント」から短いタイトル案（3案）と一覧用の一行説明を下書きする（Vertex AI Gemini）。人が承認する前提。
//   node scripts/gen_titles.mjs in.json out.json
import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
const { json: ask } = createRequire(import.meta.url)("./vertex.js");
const [inp, out] = process.argv.slice(2);
const rows = JSON.parse(readFileSync(inp, "utf8"));
const SYS = `あなたはスポーツ番組の見出しを書くコピーライターです。各「モーメント」（長い説明文）に、Webの一覧カードに載る短いタイトルを3案書きます。
基準: 例「鎌田の1mm」。
- 8〜14文字。固有名詞（選手名・クラブ名）は使ってよい。体言止め。記号・絵文字・感嘆符・「！」は使わない。
- 何が起きたかが一目で分かる具体語を優先（「1mm」「300号」「486日ぶり」など数字が強い）。
- 案1=最も端的、案2=感情が乗る、案3=別の切り口。
- 説明文に無い事実を足さない。「WSC素材なし」「※」以降などの注記は無視する。
出力はJSON: {"items":[{"no":"001","titles":["…","…","…"],"short":"…"}]}。short は一覧用の1行説明（30文字以内、文末の「。」なし）。入力と同じ件数・同じ no を返す。`;
const batches = []; for (let i = 0; i < rows.length; i += 12) batches.push(rows.slice(i, i + 12));
async function run(b, attempt = 0) {
  try {
    const r = await ask(SYS, JSON.stringify(b.map((x) => ({ no: x.no, sport: x.sport, moment: x.moment, date: x.date, emo: x.emo }))), { temperature: 0.8 });
    const items = r.items; if (!Array.isArray(items) || items.length !== b.length) throw new Error("bad shape " + (items && items.length));
    return items;
  } catch (e) { if (attempt < 3) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); return run(b, attempt + 1); } throw e; }
}
const results = [];
for (let i = 0; i < batches.length; i += 4) { const part = await Promise.all(batches.slice(i, i + 4).map((b) => run(b))); for (const p of part) results.push(...p); console.error(`done ${results.length}/${rows.length}`); }
const byNo = new Map(results.map((r) => [String(r.no), r]));
writeFileSync(out, JSON.stringify(rows.map((r) => ({ ...r, titles: byNo.get(String(r.no))?.titles ?? [], short: byNo.get(String(r.no))?.short ?? "" })), null, 1));
console.error("wrote", out);
