// 熱狂の神経系の配置（data/ctx/net.json に位置を書き足す）。
//   瞬間 = 細胞体。繋がりの多い瞬間どうしが近くなる（ばね）＋全体は反発、半径 R の球の中。
//   文脈 = 細胞体から伸びる樹状突起の先。向きは、その文脈が繋がる相手の細胞体の方向（強さで重み）＝繋がる相手へ手を伸ばす形になる。
//   node scripts/ctx/layout.mjs
import { readFileSync, writeFileSync } from "fs";
const N = JSON.parse(readFileSync("data/ctx/net.json", "utf8"));
const R = 120, M = N.moments.length;
let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const P = N.moments.map(() => { const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1), r = R * Math.cbrt(rnd()); return [r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.8, r * Math.sin(ph) * Math.sin(th)]; });
const mi = Object.fromEntries(N.moments.map((m, k) => [m.no, k]));
const W = Array.from({ length: M }, () => new Float32Array(M));
for (const [a, b, s] of N.links) { const x = mi[N.ctx[a].no], y = mi[N.ctx[b].no]; W[x][y] += s; W[y][x] += s; }
let mx = 0; for (const r of W) for (const v of r) mx = Math.max(mx, v);
for (let it = 0; it < 900; it++) {
  const t = 1 - it / 900, F = P.map(() => [0, 0, 0]);
  for (let i = 0; i < M; i++) for (let j = i + 1; j < M; j++) {
    const d = [P[j][0] - P[i][0], P[j][1] - P[i][1], P[j][2] - P[i][2]], L = Math.hypot(...d) + 0.01;
    const rep = 2600 / (L * L), att = (W[i][j] / mx) * L * 0.09, f = att - rep;
    for (let k = 0; k < 3; k++) { F[i][k] += (d[k] / L) * f; F[j][k] -= (d[k] / L) * f; } }
  for (let i = 0; i < M; i++) { for (let k = 0; k < 3; k++) P[i][k] += Math.max(-4, Math.min(4, F[i][k])) * t;
    const L = Math.hypot(...P[i]); if (L > R) for (let k = 0; k < 3; k++) P[i][k] *= R / L; }
}
N.moments.forEach((m, k) => { m.p = P[k].map((v) => +v.toFixed(2)); });
const nb = new Map(); for (const [a, b, s] of N.links) { for (const [x, y] of [[a, b], [b, a]]) { if (!nb.has(x)) nb.set(x, []); nb.get(x).push([y, s]); } }
for (const m of N.moments) {
  const n = m.ctx.length;
  m.ctx.forEach((id, j) => {
    const c = N.ctx[id], o = m.p; let d = [0, 0, 0];
    for (const [y, s] of nb.get(id) || []) { const q = N.moments[mi[N.ctx[y].no]].p, v = [q[0] - o[0], q[1] - o[1], q[2] - o[2]], L = Math.hypot(...v) + 0.01; for (let k = 0; k < 3; k++) d[k] += (v[k] / L) * s; }
    // 同じ細胞体の突起どうしが重ならないよう、黄金角の方向を混ぜる
    const a = j * 2.39996 + rnd(), z = 1 - (2 * (j + 0.5)) / n, r = Math.sqrt(1 - z * z), g = [Math.cos(a) * r, z, Math.sin(a) * r];
    let L = Math.hypot(...d); const k0 = L > 0 ? 0.35 : 0; d = d.map((v, k) => (L > 0 ? (v / L) * k0 : 0) + g[k] * (1 - k0)); L = Math.hypot(...d);
    const len = 16 + 7 * rnd();
    c.p = d.map((v, k) => +(o[k] + (v / L) * len).toFixed(2));
  });
}
writeFileSync("data/ctx/net.json", JSON.stringify(N)); writeFileSync("public/ctx/net.json", JSON.stringify(N));
console.log("layout ok", M, N.ctx.length);
