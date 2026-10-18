// 熱の組織モック（多次元分解と意味の接続の空間表現）を組み立てる: node scripts/lab/build_tissue.mjs <out.html>
//   data/ctx/net.json から s=[競技] c=[熱の名, 競技番号, 瞬間の題, 位置, 見方ごとの重み(8), 見方ごとの言い方(8)] L=[[a, b, 強さ, 見方]] を作り、
//   docs/design/mock/tissue_template.html の __DATA__ に入れる
import { readFileSync, writeFileSync } from "fs";
const [out] = process.argv.slice(2);
const N = JSON.parse(readFileSync("data/ctx/net.json", "utf8"));
const s = [...new Set(N.moments.map((m) => m.sport))], mom = {}; N.moments.forEach((m) => m.ctx.forEach((i) => (mom[i] = m)));
const D = { s, c: N.ctx.map((c) => [c.title, s.indexOf(mom[c.id].sport), mom[c.id].title, c.p, c.w, c.v]), L: N.links.map((l) => [l[0], l[1], +l[2].toFixed(2), l[3]]) };
writeFileSync(out, readFileSync("docs/design/mock/tissue_template.html", "utf8").replace("__DATA__", JSON.stringify(D)));
