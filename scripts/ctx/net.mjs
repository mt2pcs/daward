// 熱狂の文脈どうしの繋がり（合意のロジック③の下地）。全文脈を8次元ごとに埋め込み、別の瞬間の文脈どうしを次元ごとに照らし合わせる。
//   node scripts/ctx/net.mjs [in=data/ctx/contexts.json]
// 出力: data/ctx/net.json（体験が読むもの）と public/ctx/net.json、public/ctx/emb.bin（言葉の探索用: 文脈ごとに 全体1＋8次元 の埋め込み）
//   net.json: { dims, moments: [{ no, title, sport, ctx: [ids] }], ctx: [{ id, no, title, line, who, t, w: [8], v: [8] }], links: [[a, b, score, dim]] }
//   繋がりの強さ = Σ_d wA_d·wB_d·sim_d（sim_d は同じ次元の言い方どうしの近さを 0.55〜1 → 0〜1 に伸ばしたもの）＋ 文脈全体の近さ×0.4。
//   dim = いちばん効いた次元（光線の色・理由の一文の手がかり）。各文脈の上位 K 本を残す。
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { getToken, projectId } = require("../gcp_auth.js");
const [IN = "data/ctx/contexts.json"] = process.argv.slice(2);
const K = 24;
const DIMS = ["burden", "time", "bond", "emotion", "swing", "reach", "receiver", "body"];
const DIMJ = ["背負っていたもの", "時", "関係", "感情の出方", "落差", "到達", "受け止める側", "体"];
const MS0 = JSON.parse(readFileSync("data/moments2026.json", "utf8")); const MS = Array.isArray(MS0) ? MS0 : Object.values(MS0);
const C = JSON.parse(readFileSync(IN, "utf8"));
const moments = [], ctx = [];
for (const m of MS) { const d = C[m.no]; if (!d || d.error || !m.clips?.[0]?.detail) continue;
  const ids = d.ctx.map((c) => { const id = ctx.length; ctx.push({ id, no: m.no, title: c.title, line: c.line, who: c.who, t: c.t, w: DIMS.map((k) => +(c.dims[k]?.w || 0).toFixed(2)), v: DIMS.map((k) => c.dims[k]?.v || "") }); return id; });
  moments.push({ no: m.no, title: m.title, sport: m.sportLabel, ctx: ids }); }
console.error(`moments ${moments.length} ctx ${ctx.length}`);

async function embed(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 40) {
    const batch = texts.slice(i, i + 40);
    for (let a = 0; ; a++) {
      try {
        const r = await fetch(`https://asia-northeast1-aiplatform.googleapis.com/v1/projects/${projectId()}/locations/asia-northeast1/publishers/google/models/text-multilingual-embedding-002:predict`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
          body: JSON.stringify({ instances: batch.map((c) => ({ content: c || "（なし）", task_type: "SEMANTIC_SIMILARITY" })) }) });
        const j = await r.json(); if (!j.predictions) throw new Error(JSON.stringify(j).slice(0, 200));
        for (const p of j.predictions) { const v = Float32Array.from(p.embeddings.values); let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n); out.push(v.map((x) => x / n)); }
        break;
      } catch (e) { if (a > 4) throw e; await new Promise((r) => setTimeout(r, 3000 * (a + 1))); }
    }
    process.stderr.write(".");
  }
  return out;
}
// 全体（タイトル＋一文）と8次元の言い方を埋め込む。次元の言い方には次元名を前に付ける（同じ語でも次元が違えば別物）
const texts = [];
for (const c of ctx) { texts.push(`${c.title}。${c.line}`); for (let d = 0; d < 8; d++) texts.push(c.v[d] ? `${DIMJ[d]}: ${c.v[d]}` : ""); }
const E = await embed(texts); console.error("");
const D = 768, vec = (i, d) => E[i * 9 + d]; // d=0 全体、1..8 次元
const dot = (a, b) => { let s = 0; for (let k = 0; k < D; k++) s += a[k] * b[k]; return s; };
const stretch = (x, lo) => Math.max(0, (x - lo) / (1 - lo));
const links = [];
for (let a = 0; a < ctx.length; a++) {
  const cand = [];
  for (let b = 0; b < ctx.length; b++) { if (ctx[a].no === ctx[b].no) continue;
    let s = 0.4 * stretch(dot(vec(a, 0), vec(b, 0)), 0.6), best = -1, bs = 0;
    for (let d = 0; d < 8; d++) { const wa = ctx[a].w[d], wb = ctx[b].w[d]; if (!wa || !wb) continue;
      const x = wa * wb * stretch(dot(vec(a, d + 1), vec(b, d + 1)), 0.55); s += x; if (x > bs) { bs = x; best = d; } }
    if (s > 0.12) cand.push([a, b, +s.toFixed(3), best]); }
  cand.sort((x, y) => y[2] - x[2]); links.push(...cand.slice(0, K));
}
// 対で重複を除く（強い方を残す）
const seen = new Map(); for (const l of links) { const k = l[0] < l[1] ? `${l[0]}-${l[1]}` : `${l[1]}-${l[0]}`; const o = seen.get(k); if (!o || o[2] < l[2]) seen.set(k, l); }
const uniq = [...seen.values()].sort((x, y) => y[2] - x[2]);
const out = { dims: DIMJ, moments, ctx, links: uniq };
mkdirSync("public/ctx", { recursive: true });
writeFileSync("data/ctx/net.json", JSON.stringify(out));
writeFileSync("public/ctx/net.json", JSON.stringify(out));
const bin = new Float32Array(ctx.length * 9 * D); E.forEach((v, i) => bin.set(v, i * D)); writeFileSync("public/ctx/emb.bin", Buffer.from(bin.buffer));
const byDim = Array(8).fill(0); uniq.forEach((l) => l[3] >= 0 && byDim[l[3]]++);
console.error(`links ${uniq.length}  by dim ${DIMJ.map((n, d) => `${n}${byDim[d]}`).join(" ")}`);
