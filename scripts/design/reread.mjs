// 実験B: 観る人の言葉で、素材を読み直す（腕の名前・入った理由・糸を、その言葉の声で。理由は映像の時刻を指す）
import { createRequire } from "module";
import { writeFileSync } from "fs";
const require = createRequire(import.meta.url);
const V = require("/home/user/daward/scripts/vertex.js");
const LEX = require("/home/user/daward/data/lexicon2026.json");
const LABELS = LEX.axes.flatMap((a) => a.values.map((v) => v.v));
const mat = require(process.env.MAT || "/home/user/daward/docs/design/material_sample10.json");
const [word, model = "gemini-2.5-flash"] = process.argv.slice(2);
const SYS = `観る人が一つの言葉を投げました。それはその人の今の熱狂の文脈です。あなたはその人の隣で、今年のスポーツの瞬間をその言葉で読み直して見せる語り手です。
- 渡された瞬間のうち、この言葉で読めるものだけを選ぶ（無理に全部入れない）。読み方は言葉に寄せる。分類ではなく、この人の言葉の下に置いたら何が見えるか。
- 選んだ瞬間を2〜3の束（腕）にまとめ、束ごとに見出しを付ける。見出しはこの人の言葉の続きのように（6〜14字）。分類名・タグ（例: ${LABELS.slice(0, 12).join("、")}）をそのまま見出しにしない。
- 各瞬間に「この言葉の下に置いた理由」を一文（25〜45字）。必ずその瞬間の具体的な出来事（beats）を指し、その時刻 t を付ける。出来事に無いことは書かない。詩的な飾りより、具体。
- 糸: 違う競技の瞬間どうしを、この言葉で見たときに響き合う点で2〜4本つなぐ。一文（20〜35字）、両方の出来事に根ざす。選手名・チーム・競技が同じことを理由にしない。`;
const SCHEMA = { type: "OBJECT", properties: {
  arms: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, moments: { type: "ARRAY", items: { type: "OBJECT", properties: { no: { type: "STRING" }, reason: { type: "STRING" }, t: { type: "STRING" } }, required: ["no", "reason", "t"] } } }, required: ["name", "moments"] } },
  threads: { type: "ARRAY", items: { type: "OBJECT", properties: { a: { type: "STRING" }, b: { type: "STRING" }, line: { type: "STRING" } }, required: ["a", "b", "line"] } },
}, required: ["arms", "threads"] };
const user = `言葉: 「${word}」\n\n` + Object.values(mat).map((m) => `No.${m.no} ${m.title}（${m.sport}）\n懸かっていたもの: ${m.stakes}\n出来事: ${m.beats.map((b) => `[${b.t}] ${b.what}`).join(" ")}\n直後: ${m.aftermath}\n手触り: ${m.textures.map((x) => x.text).join(" / ")}`).join("\n\n");
const t0 = Date.now();
const r = await V.json(SYS, user, { model, schema: SCHEMA, temperature: 0.6 });
const ms = Date.now() - t0;
// 機械検査: 時刻が実在する・見出しがタグそのものでない・同じ競技の糸でない
const issues = [];
for (const a of r.arms) { if (LABELS.includes(a.name)) issues.push("見出しがタグ: " + a.name); for (const x of a.moments) { const m = mat[x.no]; if (!m) issues.push("存在しない瞬間 " + x.no); else if (!m.beats.some((b) => b.t === x.t)) issues.push(`時刻が出来事に無い ${x.no} ${x.t}`); } }
for (const th of r.threads) if (mat[th.a]?.sport === mat[th.b]?.sport) issues.push(`同じ競技の糸 ${th.a}-${th.b}`);
console.log(`\n■「${word}」 ${model} ${ms}ms`);
for (const a of r.arms) { console.log(`【${a.name}】`); for (const x of a.moments) console.log(`  ${x.no} ${mat[x.no]?.title}（${mat[x.no]?.sport}） [${x.t}] ${x.reason}`); }
console.log("糸:"); for (const th of r.threads) console.log(`  ${th.a}（${mat[th.a]?.sport}）—${th.b}（${mat[th.b]?.sport}）: ${th.line}`);
console.log("検査:", issues.length ? issues.join(" / ") : "問題なし");
writeFileSync(`rr_${word}.json`, JSON.stringify(r, null, 1));
