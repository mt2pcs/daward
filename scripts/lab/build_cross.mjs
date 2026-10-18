// 熱の横断モック（映像なし）を組み立てる: node scripts/lab/build_cross.mjs <out.html>
//   data/ctx/net.json から m=[題, 競技番号, 熱ids] c=[熱の名, 一文, 秒, 見方ごとの言い方(8), 見方ごとの響き合う先{次元:[ids]}] s=[競技] を作り、
//   docs/design/mock/cross_template.html の __DATA__ に入れる
import { readFileSync, writeFileSync } from "fs";
const [out] = process.argv.slice(2);
const N = JSON.parse(readFileSync("data/ctx/net.json", "utf8"));
const s = [...new Set(N.moments.map((m) => m.sport))];
const D = { s, m: N.moments.map((m) => [m.title, s.indexOf(m.sport), m.ctx]),
  c: N.ctx.map((c) => [c.title, c.line, c.t, c.v, Object.fromEntries(Object.entries(c.dn || {}).filter(([d]) => c.v[d]).map(([d, l]) => [d, l.map((x) => x[0])]))]) };
writeFileSync(out, readFileSync("docs/design/mock/cross_template.html", "utf8").replace("__DATA__", JSON.stringify(D)));
