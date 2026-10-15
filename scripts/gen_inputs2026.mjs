// 「利用者が投げそうな言葉」を種類ごとに生成し、辞書の値へ事前に翻訳して data/translations2026.json に保存する。
// 実行時のエンジンはまずこの表を引く（LLM を呼ばずに即答・429 を避ける）。
//   node scripts/gen_inputs2026.mjs [step=all|inputs|translate]
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { getToken, projectId } = require("./gcp_auth.js");
const step = process.argv[2] || "all";
const lex = JSON.parse(readFileSync("data/lexicon2026.json", "utf8"));
const VALUES = lex.axes.flatMap((a) => a.values.map((v) => v.v));
const SPORTS = lex.sports.map((s) => s.v);
const dec = JSON.parse(readFileSync("data/decomp2026.json", "utf8"));
const people = [...new Set(Object.values(dec).flatMap((d) => [...(d.facts?.people || []), ...(d.facts?.teams || [])]))];
const INPUTS = "data/inputs2026.json", OUT = "data/translations2026.json";
async function gen(model, system, user, schema, temperature = 0.9, tries = 5) {
  for (let a = 0; a < tries; a++) {
    const token = await getToken(); const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 90000);
    try {
      const r = await fetch(`https://aiplatform.googleapis.com/v1/projects/${projectId()}/locations/global/publishers/google/models/${model}:generateContent`, { method: "POST", signal: ctl.signal, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature } }) });
      const j = await r.json(); if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 120)}`);
      return JSON.parse((j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join(""));
    } catch (e) { console.error("retry", a, String(e).slice(0, 120)); await new Promise((r) => setTimeout(r, 4000 * (a + 1))); } finally { clearTimeout(t); }
  }
  throw new Error("failed");
}
const CATS = [
  ["気分・感情", "泣きたい、鳥肌立ちたい、ぶち上がりたい のような今の気分"],
  ["物語・展開", "逆転劇、ジャイキリ、引退試合、延長戦 のような展開や物語"],
  ["主役・人", "ベテラン、高校生、女子、監督、無名の選手、兄弟 のような主役の立場"],
  ["観る人の状況・時間", "仕事帰り、月曜の朝、眠れない夜、受験前、通勤中 のような観る人の状況"],
  ["人生の出来事", "失恋した、転職する、卒業、子どもが生まれた、親を亡くした のような人生の出来事"],
  ["比喩・情景", "雨の日、夏の終わり、夕焼け、カレー、ジェットコースター のようなスポーツ以外の言葉"],
  ["口語・スラング・ネット語", "えぐい、エモい、神、胸熱、ぶち上がる、震えた のような話し言葉"],
  ["英語・カタカナ語", "clutch、GOAT、comeback、goosebumps、underdog のような英語"],
  ["絵文字・記号", "😭、🔥、😂、💪、🥲、‼️ のような絵文字（1〜3個の組み合わせも）"],
  ["競技・大会", "野球、W杯、Bリーグ、甲子園、F1、相撲、カーリング、オリンピック のような競技や大会（一覧に無いものも含める）"],
  ["作品・たとえ", "スラムダンクみたい、ロッキー、映画のような、漫画みたい のような作品や物語へのたとえ"],
  ["長めの願い", "子どもの頃に父と見た試合を思い出すような、静かに胸が熱くなるやつ のような長い一文"],
  ["二語の組み合わせ", "野球で泣ける、ベテランの逆転、女子の鳥肌 のような二つの切り口の組み合わせ"],
];
if (step === "all" || step === "inputs") {
  const out = existsSync(INPUTS) ? JSON.parse(readFileSync(INPUTS, "utf8")) : {};
  const sys = "スポーツのハイライト100本を『いま、どんな熱狂を観たい？』という入力欄に言葉を投げて組み替えるサービスがあります。利用者が実際に打ち込みそうな言葉を、指定された種類で大量に挙げてください。表記ゆれ・言い回しの違いも別々に。重複なし。";
  for (const [cat, hint] of CATS) {
    if (out[cat]?.length >= 50) continue;
    const r = await gen("gemini-3.8-flash", sys, `種類: ${cat}（例: ${hint}）\n60個。JSON {"items":["..."]}`, { type: "OBJECT", properties: { items: { type: "ARRAY", items: { type: "STRING" } } }, required: ["items"] });
    out[cat] = [...new Set((r.items || []).map((s) => String(s).trim()).filter(Boolean))];
    console.error(cat, out[cat].length); writeFileSync(INPUTS, JSON.stringify(out, null, 1));
  }
  // 一覧にいる人物・チーム（実データから）と、一覧にいない有名選手
  out["一覧にいる人物・チーム"] = people.slice(0, 120);
  if (!out["一覧にいない有名選手"]) { const r = await gen("gemini-3.8-flash", "日本で知られているスポーツ選手・チームの名前を挙げます。", `次の一覧にいない、日本の一般の人が検索しそうな有名選手・チーム・監督を60個。一覧: ${people.join("、")}\nJSON {"items":["..."]}`, { type: "OBJECT", properties: { items: { type: "ARRAY", items: { type: "STRING" } } }, required: ["items"] }); out["一覧にいない有名選手"] = r.items; }
  writeFileSync(INPUTS, JSON.stringify(out, null, 1));
  console.error("inputs", Object.values(out).flat().length);
}
if (step === "all" || step === "translate") {
  const inputs = JSON.parse(readFileSync(INPUTS, "utf8"));
  const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  const vocab = lex.axes.map((a) => `${a.label}: ${a.values.map((v) => v.v).join(" / ")}`).join("\n");
  const sys = `スポーツのハイライト100本を、観る人の言葉で組み替えるサービスの入力解釈器です。入力された各言葉を、下の語彙の値（最大5つ、重み0.3〜1）に翻訳します。
kind の判定:
- values: スポーツの熱狂として読める。英語・絵文字・スラング・方言も意味を読んでここへ
- metaphor: スポーツ以外の言葉・比喩・気分。どう読んだかを reading に
- entity_absent: 実在の選手・チーム・大会・競技の名前で、下の「一覧にいる人物・チーム」に無いもの。その人/競技を特徴づける熱狂に最も近い値
- entity_present: 一覧にいる人物・チーム（values はその人の瞬間を特徴づける値）
- not_sports: どう読んでも熱狂の気分や情景にならない
- nonsense: 意味のない文字列
- inappropriate: 誹謗中傷・差別・性的・暴力・私生活・不祥事・賭け・政治
迷ったら values か metaphor。reading は名詞句（8字以内）。選手についての断定や評価は書かない。競技の言葉なら sports にも入れる。
語彙:
${vocab}
競技: ${SPORTS.join(" / ")}
一覧にいる人物・チーム: ${people.join("、")}`;
  const item = { type: "OBJECT", properties: { q: { type: "STRING" }, kind: { type: "STRING", enum: ["values", "metaphor", "entity_absent", "entity_present", "not_sports", "nonsense", "inappropriate"] }, values: { type: "ARRAY", items: { type: "OBJECT", properties: { v: { type: "STRING", enum: VALUES }, w: { type: "NUMBER" } }, required: ["v", "w"] } }, sports: { type: "ARRAY", items: { type: "STRING", enum: SPORTS } }, reading: { type: "STRING" } }, required: ["q", "kind", "values", "sports", "reading"] };
  const all = [...new Set(Object.values(inputs).flat())].filter((q) => !out[q]);
  const batches = []; for (let i = 0; i < all.length; i += 25) batches.push(all.slice(i, i + 25));
  console.error("translate", all.length, "batches", batches.length);
  let bi = 0;
  await Promise.all(Array.from({ length: 4 }, async () => { while (bi < batches.length) { const b = batches[bi++]; try {
    const r = await gen("gemini-3.8-flash", sys, `入力（${b.length}件、順番どおりに返す）:\n${b.map((q, i) => `${i + 1}. ${q}`).join("\n")}\nJSON {"items":[...]}`, { type: "OBJECT", properties: { items: { type: "ARRAY", items: item } }, required: ["items"] }, 0.2);
    for (const [i, x] of (r.items || []).entries()) { const q = b[i]; if (!q) continue; out[q] = { kind: x.kind === "entity_present" ? "values" : x.kind, values: (x.values || []).filter((v) => VALUES.includes(v.v)).slice(0, 5).map((v) => ({ v: v.v, w: Math.max(0.3, Math.min(1, +v.w || 0.6)) })), sports: (x.sports || []).filter((s) => SPORTS.includes(s)), reading: String(x.reading || "").replace(/として読みました。?$/, "").slice(0, 12) }; }
    writeFileSync(OUT, JSON.stringify(out, null, 1)); console.error("batch", bi, "/", batches.length, Object.keys(out).length);
  } catch (e) { console.error("batch fail", String(e).slice(0, 120)); } } }));
  const kinds = {}; for (const v of Object.values(out)) kinds[v.kind] = (kinds[v.kind] || 0) + 1; console.error("done", Object.keys(out).length, kinds);
}
