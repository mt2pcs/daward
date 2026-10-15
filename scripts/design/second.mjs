// 実験C: 言葉が、各映像の中の「その一秒」を選ぶ。出来事・手触りを埋め込み、言葉の“レンズ”と照合 → 最も響く時刻。理由はその時刻の事実から短く
import { createRequire } from "module";
import { writeFileSync } from "fs";
const require = createRequire(import.meta.url);
const V = require("/home/user/daward/scripts/vertex.js");
const { getToken, projectId } = require("/home/user/daward/scripts/gcp_auth.js");
const mat = require(process.env.MAT || "/home/user/daward/docs/design/material_sample10.json");
const words = process.argv.slice(2);
const tok = await getToken();
const embed = async (texts, type) => {
  const out = [];
  for (let i = 0; i < texts.length; i += 200) {
    const r = await fetch(`https://asia-northeast1-aiplatform.googleapis.com/v1/projects/${projectId()}/locations/asia-northeast1/publishers/google/models/text-multilingual-embedding-002:predict`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ instances: texts.slice(i, i + 200).map((c) => ({ content: c, task_type: type })) }) });
    const j = await r.json(); if (!j.predictions) throw new Error(JSON.stringify(j).slice(0, 200));
    out.push(...j.predictions.map((p) => p.embeddings.values));
  }
  return out;
};
const cos = (a, b) => { let s = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return s / Math.sqrt(x * y); };
// 単位 = 時刻ごとの「出来事＋その時刻の手触り」
const units = [];
for (const m of Object.values(mat)) for (const b of m.beats) units.push({ no: m.no, t: b.t, what: b.what, text: [b.what, ...m.textures.filter((x) => x.t === b.t).map((x) => x.text)].join(" / ") });
const t0 = Date.now(); const UE = await embed(units.map((u) => u.text), "RETRIEVAL_DOCUMENT"); console.log("units", units.length, "embed", Date.now() - t0, "ms");
const picks = {};
for (const w of words) {
  const t1 = Date.now();
  const lens = await V.json("観る人の言葉を、スポーツ中継の映像の中で目や耳に入る具体的な場面に言い換えます。分類語は使わない。各20字前後で5つ。", `言葉: 「${w}」`, { model: "gemini-2.5-flash", schema: { type: "OBJECT", properties: { scenes: { type: "ARRAY", items: { type: "STRING" } } }, required: ["scenes"] }, temperature: 0.5 });
  const t2 = Date.now();
  const QE = await embed([w, ...lens.scenes], "RETRIEVAL_QUERY");
  const t3 = Date.now();
  const score = units.map((u, i) => ({ ...u, s: Math.max(...QE.map((q) => cos(q, UE[i]))) }));
  const best = {}; for (const u of score) if (!best[u.no] || u.s > best[u.no].s) best[u.no] = u;
  const arr = Object.values(best).sort((a, b) => b.s - a.s);
  const mean = arr.reduce((s, x) => s + x.s, 0) / arr.length, sd = Math.sqrt(arr.reduce((s, x) => s + (x.s - mean) ** 2, 0) / arr.length);
  const sel = arr.filter((x) => x.s >= mean + 0.0 * sd).slice(0, 6);
  // 理由: その時刻の事実だけから、言葉の側から見た一文
  const rs = await V.json(`観る人が「${w}」と言いました。各瞬間について、指定の時刻の出来事を、この言葉の側から見た一文（20〜35字）にします。出来事に無いことは書かない。飾らず具体的に。要約にしない（その一秒に何が見えるかを書く）。`,
    sel.map((x) => `No.${x.no} ${mat[x.no].title}（${mat[x.no].sport}） 時刻${x.t}: ${x.what}`).join("\n"),
    { model: "gemini-2.5-flash", schema: { type: "OBJECT", properties: { lines: { type: "ARRAY", items: { type: "OBJECT", properties: { no: { type: "STRING" }, line: { type: "STRING" } }, required: ["no", "line"] } } }, required: ["lines"] }, temperature: 0.5 });
  const t4 = Date.now();
  console.log(`\n■「${w}」 レンズ: ${lens.scenes.join(" / ")}`);
  console.log(`  時間: レンズ${t2 - t1}ms 照合${t3 - t2}ms 理由${t4 - t3}ms`);
  for (const x of arr) { const L = rs.lines.find((l) => l.no === x.no || l.no === "No." + x.no); console.log(`  ${sel.includes(x) ? "◎" : "  "} ${x.s.toFixed(3)} ${x.no} ${mat[x.no].title}（${mat[x.no].sport}） [${x.t}] ${L ? "→ " + L.line : "(" + x.what.slice(0, 40) + ")"}`); }
  picks[w] = Object.fromEntries(arr.map((x) => [x.no, x.t]));
}
// 同じ映像が、言葉によって違う一秒で開くか
const nos = Object.keys(mat); let diff = 0, tot = 0;
for (const no of nos) { const ts = words.map((w) => picks[w][no]); tot++; if (new Set(ts).size > 1) diff++; console.log(no, mat[no].title, words.map((w, i) => `${w}:${ts[i]}`).join("  ")); }
console.log(`\n言葉によって開く時刻が変わった映像: ${diff}/${tot}`);
writeFileSync("second_out.json", JSON.stringify(picks, null, 1));
