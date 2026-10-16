// ネットワークの世界の試作に埋め込むデータを作る
//   node scripts/net/build_page.mjs <out/data.js>   （data/net/layers.json と links.json から）
import { readFileSync, writeFileSync } from "fs";
const OUT = process.argv[2];
const L = JSON.parse(readFileSync("data/net/layers.json", "utf8"));
const LK = JSON.parse(readFileSync("data/net/links.json", "utf8")).links;
let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const nodes = [], idOf = {}, moments = [];
const add = (lv, parent, label, extra = {}) => { nodes.push({ lv, p: parent, label, ...extra }); return nodes.length - 1; };
for (const m of Object.values(L).sort((a, b) => a.no.localeCompare(b.no))) {
  const mi = add(0, -1, m.title, { no: m.no, sport: m.sport }); moments.push(mi); idOf[m.no] = mi;
  m.events.forEach((e, ei) => { const en = add(1, mi, e.label);
    e.people.forEach((p, pi) => { const pn = add(2, en, `${p.name}｜${p.state}`, { unit: p.unit, t: p.t });
      p.elements.forEach((x, xi) => { idOf[`${m.no}.${ei}.${pi}.${xi}`] = add(3, pn, x.text); }); }); });
}
const up = (i) => { const c = [i]; while (nodes[c[c.length - 1]].p >= 0) c.push(nodes[c[c.length - 1]].p); return c; }; // 要素→人→出来事→瞬間
const fibers = [], whys = [], rates = [], w = {};
for (const l of LK) {
  if (!l.rate) continue;                          // 0=同じ人物どうしは外す
  const a = idOf[l.a], b = idOf[l.b]; if (a == null || b == null) continue;
  const ca = up(a), cb = up(b); fibers.push([...ca, ...cb.reverse()]); whys.push(l.why); rates.push(l.rate);
  const k = [ca[3], cb[0]].sort((x, y) => x - y).join("|"); w[k] = (w[k] || 0) + (l.rate >= 2 ? 1 : 0.3);
}
// 瞬間の配置: 球の表面。繋がりの多い瞬間どうしが近くなるばね（表面に拘束）。外側＝分解の枝、内側＝繋がりの束
const P = moments.map((_, i) => { const y = 1 - (2 * (i + 0.5)) / moments.length, r = Math.sqrt(1 - y * y), th = i * 2.399963; return [Math.cos(th) * r, y, Math.sin(th) * r]; });
const ix = Object.fromEntries(moments.map((n, i) => [n, i]));
const pairs = Object.entries(w).map(([k, c]) => { const [a, b] = k.split("|").map(Number); return [ix[a], ix[b], c]; });
const nrm = (q) => { const l = Math.hypot(...q) || 1; for (let k = 0; k < 3; k++) q[k] /= l; };
for (let it = 0; it < 500; it++) {
  const F = P.map(() => [0, 0, 0]), cool = 0.05 * (1 - it / 500) + 0.005;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const d = [P[j][0] - P[i][0], P[j][1] - P[i][1], P[j][2] - P[i][2]], r2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2 + 1e-3, f = 0.012 / r2;
    for (let k = 0; k < 3; k++) { F[i][k] -= d[k] * f; F[j][k] += d[k] * f; }
  }
  for (const [a, b, c] of pairs) { const d = [P[b][0] - P[a][0], P[b][1] - P[a][1], P[b][2] - P[a][2]], f = 0.006 * Math.min(3, c);
    for (let k = 0; k < 3; k++) { F[a][k] += d[k] * f; F[b][k] -= d[k] * f; } }
  for (let i = 0; i < P.length; i++) { for (let k = 0; k < 3; k++) P[i][k] += Math.max(-1, Math.min(1, F[i][k] * 4)) * cool; nrm(P[i]); }
}
const RS = 130; const U = P.map((q) => q.slice()); for (const q of P) for (let k = 0; k < 3; k++) q[k] *= RS;
// 束: 瞬間を球面上の近さで入れ子に分け（5→3→2）、線はその入れ子の中心（深いほど球の内側）を経由する（階層的エッジバンドリング）
const kmeans = (idx, k) => { if (idx.length <= k) return idx.map((i) => [i]);
  let C = idx.slice(0, k).map((i) => U[i].slice()); for (let s = 0; s < k; s++) C[s] = U[idx[Math.floor((s + 0.5) * idx.length / k)]].slice();
  let G; for (let it = 0; it < 20; it++) { G = C.map(() => []); for (const i of idx) { let b = 0, bd = -9; C.forEach((c, s) => { const d = c[0] * U[i][0] + c[1] * U[i][1] + c[2] * U[i][2]; if (d > bd) { bd = d; b = s; } }); G[b].push(i); }
    C = G.map((g, s) => { if (!g.length) return C[s]; const m = [0, 0, 0]; for (const i of g) for (let d = 0; d < 3; d++) m[d] += U[i][d]; nrm(m); return m; }); }
  return G.filter((g) => g.length); };
const chain = P.map(() => []);           // 瞬間ごと: 葉から根への入れ子の中心
const DEPTHR = [0.08, 0.38, 0.62, 0.8];
const split = (idx, depth) => { const m = [0, 0, 0]; for (const i of idx) for (let d = 0; d < 3; d++) m[d] += U[i][d]; nrm(m);
  const node = { pt: m.map((v) => v * RS * DEPTHR[depth]), id: Math.random() }; for (const i of idx) chain[i].unshift(node);
  if (depth < 3 && idx.length > 2) for (const g of kmeans(idx, [5, 3, 2][depth])) split(g, depth + 1); };
split(P.map((_, i) => i), 0);
const SUB = 6, PE = pairs.map(([a, b, c]) => ({ a, b, c }));
for (const e of PE) { const ca = chain[e.a], cb = chain[e.b]; let l = 0; while (l < ca.length && l < cb.length && ca[ca.length - 1 - l] === cb[cb.length - 1 - l]) l++;
  const lca = ca[ca.length - l];  // 共通の一番深い入れ子
  const path = [P[e.a], ...ca.slice(0, ca.length - l).map((n) => n.pt), lca.pt, ...cb.slice(0, cb.length - l).reverse().map((n) => n.pt), P[e.b]];
  const segL = []; let tot = 0; for (let k = 1; k < path.length; k++) { const d = Math.hypot(...[0, 1, 2].map((q) => path[k][q] - path[k - 1][q])); segL.push(d); tot += d; }
  e.pts = []; for (let k = 1; k <= SUB; k++) { let s = tot * k / (SUB + 1), j = 0; while (j < segL.length - 1 && s > segL[j]) { s -= segL[j]; j++; } const t = s / segL[j];
    e.pts.push([0, 1, 2].map((q) => path[j][q] + (path[j + 1][q] - path[j][q]) * t)); } }
const bundles = PE.map((e) => e.pts.map((p, k) => { const t = (k + 1) / (SUB + 1); return [0, 1, 2].map((d) => +(p[d] - (P[e.a][d] + (P[e.b][d] - P[e.a][d]) * t)).toFixed(2)); }));
const pairIx = {}; PE.forEach((e, i) => (pairIx[moments[e.a] + "|" + moments[e.b]] = i));
const fpair = fibers.map((c) => { const ma = c[3], mb = c[4]; if (pairIx[ma + "|" + mb] != null) return [pairIx[ma + "|" + mb], 1]; return [pairIx[mb + "|" + ma], -1]; });
const out = {
  nodes: nodes.map((n) => [n.lv, n.p, n.label, n.unit ?? -1, n.no || "", n.sport || ""]),
  pos: Object.fromEntries(moments.map((n, i) => [n, P[i].map((v) => +v.toFixed(2))])),
  fibers, whys, rates, bundles, fpair,
};
writeFileSync(OUT, "window.NET=" + JSON.stringify(out) + ";\n");
const lv = [0, 0, 0, 0]; nodes.forEach((n) => lv[n.lv]++);
console.log("nodes by level", lv.join("/"), "fibers", fibers.length, "moment pairs", pairs.length, "bytes", JSON.stringify(out).length);
