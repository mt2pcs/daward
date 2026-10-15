// node docs/design/zap/burst/build.mjs → index.html（かけら61個の定義を埋め込む。画は f/<i>.jpg として Artifact の files で載せる）
import { readFileSync, writeFileSync } from "fs";
const F = JSON.parse(readFileSync("docs/design/zap/burst/fragments.json", "utf8")).map(({ src, ...f }) => f);
writeFileSync("docs/design/zap/burst/index.html", readFileSync("docs/design/zap/burst/template.html", "utf8").replace("__DATA__", JSON.stringify(F)));
