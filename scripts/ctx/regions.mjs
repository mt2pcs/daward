// 航路の領域と、視点ごとの繋がり先を data/ctx/net.json に書き足す（2026-10-18 合意の操作 1・3）。
//   node scripts/ctx/regions.mjs   （net.mjs → layout.mjs の後）
//   regions: [{ name, ids, at: [x,y,z] }] … 文脈全体の埋め込みを k-means で K 個に分け、AI が名前。at = 空間でその領域の文脈がいちばん密な点
//   ctx[i].dn: { [次元の番号]: [[相手 id, 強さ], …] } … その文脈が持つ次元ごとに、同じ次元で響き合う上位 6（視点のボタン）
//   ctx[i].r: 領域の番号
import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { json } = require("../vertex.js");
const N = JSON.parse(readFileSync("data/ctx/net.json", "utf8"));
const b = readFileSync("public/ctx/emb.bin"), E = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4), D = 768, n = N.ctx.length;
const vec = (i, d) => E.subarray((i * 9 + d) * D, (i * 9 + d + 1) * D);
const dot = (a, c) => { let s = 0; for (let k = 0; k < D; k++) s += a[k] * c[k]; return s; };
const stretch = (x, lo) => Math.max(0, (x - lo) / (1 - lo));

// 視点ごとの繋がり先
for (const a of N.ctx) { a.dn = {};
  for (let d = 0; d < 8; d++) { if (a.w[d] < 0.3) continue;
    const sc = [];
    for (const c of N.ctx) { if (c.no === a.no || !c.w[d]) continue; const s = a.w[d] * c.w[d] * stretch(dot(vec(a.id, d + 1), vec(c.id, d + 1)), 0.55) + 0.15 * stretch(dot(vec(a.id, 0), vec(c.id, 0)), 0.6); if (s > 0.1) sc.push([c.id, +s.toFixed(3)]); }
    const seen = new Set(), top = []; for (const x of sc.sort((p, q) => q[1] - p[1])) { const no = N.ctx[x[0]].no; if (seen.has(no)) continue; seen.add(no); top.push(x); if (top.length >= 6) break; }
    if (top.length >= 3) a.dn[d] = top; } }

// 領域（k-means++、余弦）
const K = +(process.env.K || 12);
let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const cent = [Float32Array.from(vec(Math.floor(rnd() * n), 0))];
while (cent.length < K) { const dd = N.ctx.map((c) => Math.min(...cent.map((m) => 1 - dot(vec(c.id, 0), m)))); let r = rnd() * dd.reduce((s, x) => s + x * x, 0); let i = 0; for (; i < n; i++) { r -= dd[i] * dd[i]; if (r <= 0) break; } cent.push(Float32Array.from(vec(Math.min(i, n - 1), 0))); }
let asg = new Array(n).fill(0);
for (let it = 0; it < 40; it++) {
  asg = N.ctx.map((c) => { let best = 0, bs = -9; cent.forEach((m, k) => { const s = dot(vec(c.id, 0), m); if (s > bs) { bs = s; best = k; } }); return best; });
  cent.forEach((m, k) => { m.fill(0); let cnt = 0; N.ctx.forEach((c, i) => { if (asg[i] !== k) return; cnt++; const v = vec(c.id, 0); for (let j = 0; j < D; j++) m[j] += v[j]; });
    if (cnt) { let s = 0; for (let j = 0; j < D; j++) s += m[j] * m[j]; s = Math.sqrt(s); for (let j = 0; j < D; j++) m[j] /= s; } });
}
const regions = [];
for (let k = 0; k < K; k++) {
  const ids = N.ctx.filter((_, i) => asg[i] === k).map((c) => c.id); if (ids.length < 5) continue;
  // 空間で最も密な点（半径 45 に入る同じ領域の文脈がいちばん多い文脈の位置、その近傍の平均）
  let best = ids[0], bc = -1; for (const i of ids) { const p = N.ctx[i].p; const c = ids.filter((j) => Math.hypot(...N.ctx[j].p.map((v, q) => v - p[q])) < 45).length; if (c > bc) { bc = c; best = i; } }
  const near = ids.filter((j) => Math.hypot(...N.ctx[j].p.map((v, q) => v - N.ctx[best].p[q])) < 45);
  const at = [0, 1, 2].map((q) => +(near.reduce((s, j) => s + N.ctx[j].p[q], 0) / near.length).toFixed(2));
  // 中心に近い順（その領域らしい文脈）
  ids.sort((a, c) => dot(vec(c, 0), cent[k]) - dot(vec(a, 0), cent[k]));
  regions.push({ ids, at, name: "" });
}
// 名前: その領域の代表の文脈から。総称・分類語は不可
const r = await json(`スポーツの熱狂の文脈を意味で集めた塊が${regions.length}個あります。各塊に、空間の行き先として出す名前（4〜9字）を付けます。
- その塊の文脈に共通する熱を、具体的な言い方で（例「家族が見ていた」「去り際の背中」「敗れた側の沈黙」「土壇場の一撃」）。
- 総称（感動・歓喜・ドラマ・執念・熱狂）だけ・英語・分類語は不可。塊どうしで名前が重ならないように。`,
  regions.map((g, k) => `塊${k}: ${g.ids.slice(0, 12).map((i) => N.ctx[i].title).join(" / ")}`).join("\n"),
  { temperature: 0.4, schema: { type: "OBJECT", properties: { names: { type: "ARRAY", items: { type: "STRING" } } }, required: ["names"] } });
regions.forEach((g, k) => { g.name = (r.names?.[k] || `領域${k + 1}`).trim(); g.ids.forEach((i) => (N.ctx[i].r = k)); });
N.regions = regions;
writeFileSync("data/ctx/net.json", JSON.stringify(N)); writeFileSync("public/ctx/net.json", JSON.stringify(N));
console.log(regions.map((g) => `${g.name}(${g.ids.length}) ${g.ids.slice(0, 3).map((i) => N.ctx[i].title).join(" / ")}`).join("\n"));
console.log("dn", N.ctx.reduce((s, c) => s + Object.keys(c.dn).length, 0));
