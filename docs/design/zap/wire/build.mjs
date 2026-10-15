// node docs/design/zap/wire/build.mjs → docs/design/zap/wire/index.html（100本の題名を埋め込む）
import { readFileSync, writeFileSync } from "fs";
const M = JSON.parse(readFileSync("data/moments2026.json", "utf8")).map((m) => ({ no: m.no, title: m.title, sport: m.sportLabel }));
const t = readFileSync("docs/design/zap/wire/template.html", "utf8");
writeFileSync("docs/design/zap/wire/index.html", t.replace("__MOMENTS__", JSON.stringify(M)));
