// 意味の地図の領域に、熱の言葉で短い名前を付ける。 NODE_USE_ENV_PROXY=1 node scripts/design/meaning_names.mjs
import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
const { json } = createRequire(import.meta.url)("../vertex.js");
const p = "docs/design/zap/meaning_map.json", M = JSON.parse(readFileSync(p, "utf8"));
const sys = `あなたはスポーツ番組のコピーライター。ある「熱くなる理由」の集まりに、観る人が一目で熱の種類が分かる短い名前を付ける。
規則: 8〜14字。出来事の種類・競技用語・タグ（例:逆転、優勝、引退）ではなく、その熱の手触りを言葉にする。比喩に逃げず中身と合っていること。体言止めか短い句。
ほかの領域の名前と重ならないこと。`;
const user = `次の${M.regions.length}個の領域それぞれに名前を付けて。\n` + M.regions.map((r) => `領域${r.id}:\n- ${r.sample.join("\n- ")}`).join("\n\n");
const out = await json(sys, user, { schema: { type: "OBJECT", properties: { names: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "INTEGER" }, name: { type: "STRING" } }, required: ["id", "name"] } } }, required: ["names"] }, temperature: 0.4 });
for (const n of out.names) { const r = M.regions.find((x) => x.id === n.id); if (r) r.name = n.name; }
writeFileSync(p, JSON.stringify(M));
console.log(M.regions.map((r) => `${r.id} ${r.name}`).join("\n"));
