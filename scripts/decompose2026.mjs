// 100の瞬間を「映像（音声込み）＋シートの行」から、切り口の辞書（data/lexicon2026.json）の語彙だけで分解する。
//   node scripts/decompose2026.mjs [nos(comma)|all] [out=data/decomp2026.json]
// 出力（1本）: facts（見えた/聞こえた事実のみ）、values（辞書の値と強さ 0.3..1）、evidence（値ごとの根拠、内部レビュー用）、commentary（実況の要所）
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { getToken, projectId } = require("./gcp_auth.js");
// 映像入りは応答が長く、まれに返ってこない。2分で打ち切って再試行する
async function generate(model, body) {
  const token = await getToken(); const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 120000);
  try {
    const r = await fetch(`https://aiplatform.googleapis.com/v1/projects/${projectId()}/locations/global/publishers/google/models/${model}:generateContent`, { method: "POST", signal: ctl.signal, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok || j.error) throw new Error(`vertex ${r.status} ${(j.error && j.error.message) || ""}`.slice(0, 200)); return j;
  } finally { clearTimeout(t); }
}
const [sel = "all", out = "data/decomp2026.json"] = process.argv.slice(2);
const lex = JSON.parse(readFileSync("data/lexicon2026.json", "utf8"));
const VALUES = lex.axes.flatMap((a) => a.values.map((v) => v.v));
const moments = JSON.parse(readFileSync("data/moments2026.json", "utf8"));
const done = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : {};
const MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash";
const vocab = lex.axes.map((a) => `${a.label}: ${a.values.map((v) => v.v).join(" / ")}`).join("\n");
const SYS = `あなたはスポーツ中継の編集者です。1本のハイライト映像（実況と場内音声つき）を見て、決められた語彙だけで分解します。
規則:
- 事実は「映像で見えたこと・実況で聞こえたこと・与えられた説明」だけ。推測で選手名やスコアを作らない。分からなければ null。
- values は下の語彙から選ぶ（語彙外は禁止）。その瞬間を観た人が実際に感じる/語るものだけ。4〜10個。強さ s は 0.3〜1（1=この瞬間の核心）。
- evidence は各 value の根拠を映像/実況から20字以内で。根拠が無い value は入れない。
- commentary は実況・場内の決定的な一言を最大3つ、聞こえたまま（無音や聞き取れなければ空配列）。
語彙:
${vocab}`;
const schema = {
  type: "OBJECT",
  properties: {
    facts: { type: "OBJECT", properties: { situation: { type: "STRING", nullable: true }, score: { type: "STRING", nullable: true }, people: { type: "ARRAY", items: { type: "STRING" } }, teams: { type: "ARRAY", items: { type: "STRING" } } }, required: ["situation", "score", "people", "teams"] },
    values: { type: "ARRAY", items: { type: "OBJECT", properties: { v: { type: "STRING", enum: VALUES }, s: { type: "NUMBER" }, evidence: { type: "STRING" } }, required: ["v", "s", "evidence"] } },
    commentary: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["facts", "values", "commentary"],
};
async function one(m) {
  const c = m.clips[0];
  const parts = [];
  if (c?.detail) {
    // 2分を超える映像は、山場（音量最大）の60秒前から2分間だけ読ませる（全編は遅く、要点は山場の前後にある）
    const vp = { fileData: { fileUri: c.detail.replace("https://storage.googleapis.com/", "gs://"), mimeType: "video/mp4" } };
    if ((c.srcDuration || 0) > 130) { const st = Math.max(0, Math.min((c.peakSec || 0) - 60, c.srcDuration - 120)); vp.videoMetadata = { startOffset: `${Math.floor(st)}s`, endOffset: `${Math.floor(st + 120)}s` }; }
    parts.push(vp);
  }
  else if (c?.poster) parts.push({ fileData: { fileUri: c.poster.replace("https://storage.googleapis.com/", "gs://"), mimeType: "image/webp" } });
  parts.push({ text: `番号: ${m.no}\n競技: ${m.sportLabel}\n日付: ${m.date || "不明"}\nシートの説明: ${m.description}\n${parts.length ? "" : "（映像なし。説明だけで判断し、事実は説明にあるものだけ）"}` });
  const body = { systemInstruction: { parts: [{ text: SYS }] }, contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2, mediaResolution: "MEDIA_RESOLUTION_LOW" } };
  for (let a = 0; a < 3; a++) {
    try {
      const j = await generate(MODEL, body);
      const r = JSON.parse((j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join(""));
      r.values = (r.values || []).filter((x) => VALUES.includes(x.v)).map((x) => ({ v: x.v, s: Math.max(0.3, Math.min(1, +x.s || 0.5)), evidence: String(x.evidence || "").slice(0, 40) }));
      return { no: m.no, source: c?.detail ? "video" : c?.poster ? "image" : "text", ...r, status: "draft" };
    } catch (e) { if (a === 2) return { no: m.no, error: String(e.message || e).slice(0, 200) }; await new Promise((r) => setTimeout(r, 3000)); }
  }
}
// all: 未処理・エラー・「画像で読んだが今はフル映像がある」ものをやり直す
const todo = moments.filter((m) => (sel === "all" ? !done[m.no] || done[m.no].error || (done[m.no].source !== "video" && m.clips[0]?.detail) : sel.split(",").includes(m.no)));
console.error(`todo ${todo.length}`);
let i = 0;
await Promise.all(Array.from({ length: +(process.env.PAR || 4) }, async () => { while (i < todo.length) { const m = todo[i++]; const t0 = Date.now(); done[m.no] = await one(m); writeFileSync(out, JSON.stringify(done, null, 1)); console.error(`${m.no} ${done[m.no].error ? "ERR " + done[m.no].error : done[m.no].source + " " + done[m.no].values.length + "v"} ${((Date.now() - t0) / 1000) | 0}s`); } }));
