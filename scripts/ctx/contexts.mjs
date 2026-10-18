// 1本の瞬間を「熱狂の文脈」5〜8個に超分解し、文脈ごとに熱の構造を8次元で読む（2026-10-18 合意のロジック①②）。
//   node scripts/ctx/contexts.mjs [nos(comma)|all] [out=data/ctx/contexts.json]   （PAR=並列数）
// 材料: フル映像（音声込み、gs:// で Vertex に渡す）＋シートの説明＋映像から読んだ時刻つきの出来事（docs/design/material.json）
// 出力（1本）: { no, ctx: [{ title, line, who, t, dims: { burden, time, bond, emotion, swing, reach, receiver, body: { v, w } } }] }
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { getToken, projectId } = require("../gcp_auth.js");
async function generate(model, body) {
  const token = await getToken(); const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 180000);
  try {
    const r = await fetch(`https://aiplatform.googleapis.com/v1/projects/${projectId()}/locations/global/publishers/google/models/${model}:generateContent`, { method: "POST", signal: ctl.signal, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok || j.error) throw new Error(`vertex ${r.status} ${(j.error && j.error.message) || ""}`.slice(0, 200)); return j;
  } finally { clearTimeout(t); }
}
export const DIMS = [
  ["burden", "背負っていたもの", "その人がこの瞬間に背負っていたもの（亡き家族への思い・最後の舞台・雪辱・怪我からの復帰・期待の重圧・故郷）"],
  ["time", "時", "熱を生む時間の形（残り数秒・延長の果て・開始直後・何年も待った末・最後の打席）"],
  ["bond", "関係", "誰と誰の間の熱か（兄弟・親子・師弟・宿敵・戦友・監督と選手・選手とスタンド）"],
  ["emotion", "感情の出方", "感情がどう表に出たか、出なかったか（押し殺す・爆発・崩れ落ちる涙・無言・笑顔の裏の悔しさ）"],
  ["swing", "落差", "立場や結果のひっくり返り（大逆転・番狂わせ・どん底からの復活・勝者と敗者の明暗）"],
  ["reach", "到達", "その人が何かに到達したか（初・最後・記録・最年長・悲願・夢の舞台）"],
  ["receiver", "受け止める側", "その熱を受け止めた人々の反応（総立ち・静まり返る・敵地の沈黙・相手からの称賛・ベンチの出迎え）"],
  ["body", "体", "体が語っていること（出し切った体・歳を超える体・痛みを押す体・小さな体で大きな相手に挑む）"],
];
const [sel = "all", out = "data/ctx/contexts.json"] = process.argv.slice(2);
const MS0 = JSON.parse(readFileSync("data/moments2026.json", "utf8")); const MS = Array.isArray(MS0) ? MS0 : Object.values(MS0);
const MAT = Object.fromEntries((() => { const m = JSON.parse(readFileSync("docs/design/material.json", "utf8")); return (Array.isArray(m) ? m : Object.values(m)).map((x) => [x.no, x]); })());
mkdirSync("data/ctx", { recursive: true });
const done = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : {};
const MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash";
const SYS = `あなたは、スポーツの熱狂を誰よりも知っている編集者です。1本のハイライト映像（実況と場内音声つき）を観て、
この瞬間に観る人の胸が熱くなる「熱狂の文脈」を5〜8個に超分解します。

熱狂の文脈とは:
- 「スポーツの熱狂って、こういうのだよな」と胸が熱くなる理由そのもの。この瞬間の、この人だけの物語・背負ったもの・感情の出方・観る側の熱。
- 所作やシーンの記述ではない。悪い例: 「ヘルメットに手をやる」「ホームを踏む」「抱き合う選手」「雄叫びを上げる」（何が起きたかの説明で、なぜ熱いかが無い）。
  良い例: 「亡き兄に捧げた先制弾」「笑わない本塁打」「打たれた側が背負う一球」「言葉なく迎えるベンチ」「40歳、最後のノーサイド」。
- 1本の中の別々の熱を拾う。主役の熱だけでなく、敗れた側・ベンチ・スタンド・家族・相手の熱も、映像に映っていれば文脈になる。同じ熱の言い換えを並べない。
- 必ず映像に映っている／実況で聞こえる／与えられた説明にある事実に立つ。推測で物語を作らない（亡くなった・最後の試合、等は根拠があるときだけ）。

各文脈について:
- title: 6〜14字。その瞬間にしか当てはまらない熱の言い方。総称（感動・歓喜・ドラマ・執念・熱い瞬間）だけの名前、比喩の飾り、英語は不可。人名は入れてよい。
- line: 25〜45字。観る人の側から、なぜ胸が熱くなるかを一文で。説明調ではなく、熱を知る人の言葉で。
- who: 誰の熱か（選手名・「スタンド」「相手チーム」など）。
- t: この文脈が一番よく映っている1秒（映像の先頭からの秒、整数）。映像に映っていない（説明だけにある）文脈は、それが最もにじむ1秒。
- dims: 熱の構造を8つの次元で読む。各次元は v（この文脈に固有の言い方、6〜20字。当てはまらなければ空文字）と w（その次元がこの文脈の熱にどれだけ効いているか 0〜1）。
  v は分類語ではなく具体（「亡き兄への思い」「入団から8年待った初打席」のように）。当てはまらない次元は v を空、w を 0。強く効く次元は多くて3つ。
次元:
${DIMS.map(([k, n, d]) => `- ${k}（${n}）: ${d}`).join("\n")}`;
const DIM_SCHEMA = { type: "OBJECT", properties: { v: { type: "STRING" }, w: { type: "NUMBER" } }, required: ["v", "w"] };
const schema = { type: "OBJECT", properties: { ctx: { type: "ARRAY", items: { type: "OBJECT", properties: {
  title: { type: "STRING" }, line: { type: "STRING" }, who: { type: "STRING" }, t: { type: "INTEGER" },
  dims: { type: "OBJECT", properties: Object.fromEntries(DIMS.map(([k]) => [k, DIM_SCHEMA])), required: DIMS.map(([k]) => k) } }, required: ["title", "line", "who", "t", "dims"] } } }, required: ["ctx"] };

async function one(m) {
  const c = m.clips?.[0], mat = MAT[m.no], parts = [];
  if (c?.detail) {
    const vp = { fileData: { fileUri: c.detail.replace("https://storage.googleapis.com/", "gs://"), mimeType: "video/mp4" } };
    if ((c.srcDuration || 0) > 130) { const st = Math.max(0, Math.min((c.peakSec || 0) - 60, c.srcDuration - 120)); vp.videoMetadata = { startOffset: `${Math.floor(st)}s`, endOffset: `${Math.floor(st + 120)}s` }; }
    parts.push(vp);
  }
  const beats = mat ? `\n映像から読んだ出来事（時刻は映像の先頭から。1〜2秒ずれることがある）:\n${mat.beats.map((b) => `${b.t} ${b.what}`).join("\n")}\n懸かっていたもの: ${mat.stakes}\nその後: ${mat.aftermath}` : "";
  parts.push({ text: `番号: ${m.no}\nタイトル: ${m.title}\n競技: ${m.sportLabel}\n日付: ${m.date || "不明"}\nシートの説明（なぜ100の瞬間に選ばれたか）: ${m.description}${beats}${c?.detail ? "" : "\n（映像なし。説明だけで判断する）"}` });
  const body = { systemInstruction: { parts: [{ text: SYS }] }, contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.6, mediaResolution: "MEDIA_RESOLUTION_LOW" } };
  for (let a = 0; a < 3; a++) {
    try {
      const j = await generate(MODEL, body);
      const r = JSON.parse((j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join(""));
      const dur = c?.srcDuration || 9999;
      const ctx = (r.ctx || []).slice(0, 8).filter((x) => (+x.t || 0) < dur - 1).map((x) => ({ title: String(x.title).trim(), line: String(x.line).trim(), who: String(x.who || "").trim(), t: Math.max(0, +x.t || 0),
        dims: Object.fromEntries(DIMS.map(([k]) => { const d = x.dims?.[k] || {}; const v = String(d.v || "").trim(); return [k, { v, w: v ? Math.max(0, Math.min(1, +d.w || 0)) : 0 }]; })) }));
      return { no: m.no, source: c?.detail ? "video" : "text", ctx };
    } catch (e) { if (a === 2) return { no: m.no, error: String(e.message || e).slice(0, 200) }; await new Promise((r) => setTimeout(r, 4000)); }
  }
}
const todo = MS.filter((m) => (sel === "all" ? !done[m.no] || done[m.no].error : sel.split(",").includes(m.no)));
console.error(`todo ${todo.length}`);
let i = 0;
await Promise.all(Array.from({ length: +(process.env.PAR || 4) }, async () => { while (i < todo.length) { const m = todo[i++]; const t0 = Date.now(); done[m.no] = await one(m);
  writeFileSync(out, JSON.stringify(done, null, 1)); console.error(`${m.no} ${done[m.no].error ? "ERR " + done[m.no].error : done[m.no].source + " " + done[m.no].ctx.length} ${((Date.now() - t0) / 1000) | 0}s`); } }));
