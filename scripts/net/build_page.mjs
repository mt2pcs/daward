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
const fibers = [], whys = [], w = {};
for (const l of LK) {
  const a = idOf[l.a], b = idOf[l.b]; if (a == null || b == null) continue;
  const ca = up(a), cb = up(b); fibers.push([...ca, ...cb.reverse()]); whys.push(l.why);
  const k = [ca[3], cb[0]].sort((x, y) => x - y).join("|"); w[k] = (w[k] || 0) + 1;
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
const out = {
  nodes: nodes.map((n) => [n.lv, n.p, n.label, n.unit ?? -1, n.no || "", n.sport || ""]),
  pos: Object.fromEntries(moments.map((n, i) => [n, P[i].map((v) => +v.toFixed(2))])),
  fibers, whys,
};
writeFileSync(OUT, "window.NET=" + JSON.stringify(out) + ";\n");
const lv = [0, 0, 0, 0]; nodes.forEach((n) => lv[n.lv]++);
console.log("nodes by level", lv.join("/"), "fibers", fibers.length, "moment pairs", pairs.length, "bytes", JSON.stringify(out).length);
