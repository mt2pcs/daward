// UIモック（映像なし）を組み立てる: node scripts/lab/build_mock.mjs <data.json> <out.html>
//   data.json は data/ctx/net.json を小さくしたもの（題・一文・位置・見方・繋がり・領域）
import { readFileSync, writeFileSync } from "fs";
const [data, out] = process.argv.slice(2);
writeFileSync(out, readFileSync("docs/design/mock/heat_ui_template.html", "utf8").replace("__DATA__", readFileSync(data, "utf8")));
