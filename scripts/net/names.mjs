// かけらを中心にしたときの塊（中心＋直接繋がるかけら）に、その組にしか当てはまらない短い名前を付ける → data/net/names.json {中心のi: 名前}
//   node scripts/net/names.mjs   （PAR=並列数）
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createRequire } from "module"; const require = createRequire(import.meta.url); const V = require("../vertex.js");
const W = JSON.parse(readFileSync("data/net/world.json", "utf8")), P = W.people;
const OUT = "data/net/names.json", names = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const nb = new Map(); for (const [a, b, k, r, xa, xb, why] of W.links) for (const [x, y, ex] of [[a, b, xa], [b, a, xb]]) { if (!nb.has(x)) nb.set(x, []); nb.get(x).push({ y, r, why, ex }); }
const centers = [...nb.keys()].filter((i) => names[i] == null);
const desc = (i) => `${P[i].name}（${W.moments.find((m) => m.no === P[i].no).sport}）: ${P[i].state}`;
const SYS = `スポーツの瞬間の「かけら」（ある人のその1秒）を中心に、同じ具体的なものを持つ別の競技のかけらが集まった塊があります。
塊に名前を付けます。条件:
- 4〜10文字。その塊の中心と周りに共通して映っている具体的な所作・関係・境遇を言う（例「子を抱き上げる父」「天を仰ぐ敗者」「肩を貸す主将」）。
- 誰にでも当てはまる総称（歓喜、感動、熱い瞬間、ドラマ、絆、執念）だけの名前は不可。比喩・詩的表現・英語・人名・チーム名・競技名は使わない。
- 中心のかけらの具体を必ず含む。`;
const PAR = +(process.env.PAR || 4); const q = []; for (let k = 0; k < centers.length; k += 12) q.push(centers.slice(k, k + 12));
let done = 0;
await Promise.all(Array.from({ length: PAR }, async () => { while (q.length) { const g = q.shift();
  const user = g.map((i) => { const ns = nb.get(i).sort((a, b) => b.r - a.r).slice(0, 6); return `[${i}] 中心: ${desc(i)}（${P[i].el[ns[0].ex]?.[0] || ""}）\n` + ns.map((n) => `  - ${desc(n.y)} … ${n.why}`).join("\n"); }).join("\n\n");
  for (let tr = 0; tr < 4; tr++) { try {
    const r = await V.json(SYS, user, { schema: { type: "OBJECT", properties: { names: { type: "ARRAY", items: { type: "OBJECT", properties: { i: { type: "INTEGER" }, name: { type: "STRING" } }, required: ["i", "name"] } } }, required: ["names"] }, temperature: 0.3 });
    for (const x of r.names) if (g.includes(x.i) && x.name && x.name.length <= 12) names[x.i] = x.name; break;
  } catch (e) { await new Promise((s) => setTimeout(s, 3000 * (tr + 1))); } }
  done += g.length; writeFileSync(OUT, JSON.stringify(names)); process.stdout.write(`${done} `); } }));
console.log("\nnamed", Object.keys(names).length, "of", nb.size);
