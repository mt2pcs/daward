// 素材シートの長文「モーメント」から短いタイトル案（3案）を LLM で下書きする。人が承認する前提。
//   NODE_USE_ENV_PROXY=1 node scripts/gen_titles.mjs in.json out.json
import { readFileSync, writeFileSync } from "fs";
const [inp, out] = process.argv.slice(2);
const rows = JSON.parse(readFileSync(inp, "utf8"));
const key = process.env.OPENAI_API_KEY; if (!key) { console.error("OPENAI_API_KEY missing"); process.exit(1); }
const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const SYS = `あなたはスポーツ番組の見出しを書くコピーライターです。各「モーメント」（長い説明文）に、Webの一覧カードに載る短いタイトルを3案書きます。
基準: 例「鎌田の1mm」。
- 8〜14文字。固有名詞（選手名・クラブ名）は使ってよい。体言止め。記号・絵文字・感嘆符は使わない。
- 何が起きたかが一目で分かる具体語を優先（「1mm」「300号」「486日ぶり」など数字が強い）。
- 案1=最も端的、案2=感情が乗る、案3=別の切り口。
- 説明文に無い事実を足さない。「WSC素材なし」「※」以降などの注記は無視する。
出力はJSONのみ: {"items":[{"no":"001","titles":["…","…","…"],"short":"…"}]}。short は一覧用の1行説明（30文字以内、体言止め不可、文末は「。」なし）。`;
const batches = []; for (let i = 0; i < rows.length; i += 12) batches.push(rows.slice(i, i + 12));
async function run(b, attempt = 0) {
  const user = JSON.stringify(b.map((r) => ({ no: r.no, sport: r.sport, moment: r.moment, date: r.date, emo: r.emo })));
  const res = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYS }, { role: "user", content: user }] }) });
  if (!res.ok) { if (attempt < 2) { await new Promise((r) => setTimeout(r, 3000)); return run(b, attempt + 1); } throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`); }
  const j = await res.json(); const items = JSON.parse(j.choices[0].message.content).items;
  if (!Array.isArray(items) || items.length !== b.length) { if (attempt < 2) return run(b, attempt + 1); throw new Error("bad shape"); }
  return items;
}
const results = [];
for (let i = 0; i < batches.length; i += 4) { const part = await Promise.all(batches.slice(i, i + 4).map((b) => run(b))); for (const p of part) results.push(...p); console.error(`done ${results.length}/${rows.length}`); }
const byNo = new Map(results.map((r) => [String(r.no), r]));
writeFileSync(out, JSON.stringify(rows.map((r) => ({ ...r, titles: byNo.get(String(r.no))?.titles ?? [], short: byNo.get(String(r.no))?.short ?? "" })), null, 1));
console.error("wrote", out);
