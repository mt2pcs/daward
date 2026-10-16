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
// 瞬間の配置: 繋がりの多い瞬間どうしが近くなる3次元のばね
const P = moments.map((_, i) => { const y = 1 - (2 * (i + 0.5)) / moments.length, r = Math.sqrt(1 - y * y), th = i * 2.399963; return [Math.cos(th) * r * 110, y * 110, Math.sin(th) * r * 110]; });
const ix = Object.fromEntries(moments.map((n, i) => [n, i]));
const pairs = Object.entries(w).map(([k, c]) => { const [a, b] = k.split("|").map(Number); return [ix[a], ix[b], c]; });
for (let it = 0; it < 600; it++) {
  const F = P.map(() => [0, 0, 0]), cool = 1 - it / 600;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const d = [P[j][0] - P[i][0], P[j][1] - P[i][1], P[j][2] - P[i][2]], r2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2 + 1, f = 2600 / r2;
    for (let k = 0; k < 3; k++) { F[i][k] -= d[k] * f / Math.sqrt(r2); F[j][k] += d[k] * f / Math.sqrt(r2); }
  }
  for (const [a, b, c] of pairs) {
    const d = [P[b][0] - P[a][0], P[b][1] - P[a][1], P[b][2] - P[a][2]], r = Math.hypot(...d) + 1e-3, rest = 70 / (1 + Math.log(1 + c)), f = (r - rest) * 0.02 * Math.min(4, c);
    for (let k = 0; k < 3; k++) { F[a][k] += d[k] / r * f; F[b][k] -= d[k] / r * f; }
  }
  for (let i = 0; i < P.length; i++) for (let k = 0; k < 3; k++) { F[i][k] -= P[i][k] * 0.004; P[i][k] += Math.max(-6, Math.min(6, F[i][k])) * cool; }
}
{ const mx = Math.max(...P.map((q) => Math.hypot(...q))); for (const q of P) for (let k = 0; k < 3; k++) q[k] *= 165 / mx; }   // 半径165に広げる
// 瞬間どうしの線を束ねる（力指向のエッジバンドリング: 向き・長さ・位置が近い線どうしの中間点が引き合う）
const PE = pairs.filter((x) => x[2] > 0).map(([a, b, c]) => ({ a, b, c }));
const SUB = 6;
for (const e of PE) { e.pts = []; for (let k = 1; k <= SUB; k++) { const t = k / (SUB + 1); e.pts.push([0, 1, 2].map((d) => P[e.a][d] + (P[e.b][d] - P[e.a][d]) * t)); } }
const vec = (e) => [0, 1, 2].map((d) => P[e.b][d] - P[e.a][d]), len = (v) => Math.hypot(...v);
const mid = (e) => [0, 1, 2].map((d) => (P[e.a][d] + P[e.b][d]) / 2);
const comp = [];
for (let i = 0; i < PE.length; i++) { comp[i] = [];
  for (let j = 0; j < PE.length; j++) { if (i === j) continue; const p = vec(PE[i]), q = vec(PE[j]), lp = len(p), lq = len(q);
    const ang = Math.abs((p[0] * q[0] + p[1] * q[1] + p[2] * q[2]) / (lp * lq)), la = (lp + lq) / 2, sc = 2 / (la / Math.min(lp, lq) + Math.max(lp, lq) / la);
    const pos = la / (la + len([0, 1, 2].map((d) => mid(PE[i])[d] - mid(PE[j])[d])));
    const c = ang * sc * pos; if (c > 0.55) comp[i].push([j, c]); } }
for (let cyc = 0, step = 3.2; cyc < 5; cyc++, step *= 0.5) for (let it = 0; it < 30; it++) {
  const F = PE.map((e) => e.pts.map(() => [0, 0, 0]));
  PE.forEach((e, i) => { const kp = 0.08 / (len(vec(e)) * (SUB + 1)) * 40;
    for (let k = 0; k < SUB; k++) { const prev = k ? e.pts[k - 1] : P[e.a], next = k < SUB - 1 ? e.pts[k + 1] : P[e.b], p = e.pts[k];
      for (let d = 0; d < 3; d++) F[i][k][d] += kp * (prev[d] - p[d] + next[d] - p[d]);
      for (const [j, c] of comp[i]) { const q = PE[j].pts[k], dv = [0, 1, 2].map((d) => q[d] - p[d]), r = len(dv) + 0.5; for (let d = 0; d < 3; d++) F[i][k][d] += c * dv[d] / r * Math.min(1, PE[j].c) * 0.6; } } });
  PE.forEach((e, i) => e.pts.forEach((p, k) => { const f = F[i][k], m = len(f) || 1; for (let d = 0; d < 3; d++) p[d] += f[d] / m * Math.min(step, m); }));
}
// 束の形は「両端を結ぶ直線からのずれ」として持つ（選んだときに瞬間が寄っても形が崩れない）
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
