// ピント送りの UI モック（映像なし）を組み立てる: node scripts/lab/build_focus.mjs <out.html>
//   data/ctx/net.json から m=[題, 競技, 熱ids] c=[熱の名, 一文, 主な次元, 映像内の秒] を作り、docs/design/mock/focus_template.html の __DATA__ に入れる
import { readFileSync, writeFileSync } from "fs";
const [out] = process.argv.slice(2);
const N = JSON.parse(readFileSync("data/ctx/net.json", "utf8"));
const D = { m: N.moments.map((m) => [m.title, m.sport, m.ctx]), c: N.ctx.map((c) => [c.title, c.line, c.w.indexOf(Math.max(...c.w)), c.t]) };
writeFileSync(out, readFileSync("docs/design/mock/focus_template.html", "utf8").replace("__DATA__", JSON.stringify(D)));
