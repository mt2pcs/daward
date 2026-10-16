// 繋がりに「見た人がへえと思う度合い」を付ける。0=同じ人物どうし（外す） 1=試合でよくある動作 2=はっきりした感情の行為 3=その瞬間ならではの具体の一致
//   node scripts/net/rate.mjs   （data/net/links.json に rate を書き足す）
import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
const { json } = createRequire(import.meta.url)("../vertex.js");
const F = "data/net/links.json", D = JSON.parse(readFileSync(F, "utf8")), Y = JSON.parse(readFileSync("data/net/layers.json", "utf8"));
const g = (id) => { const [no, e, p, x] = id.split("."); const m = Y[no], pp = m.events[e].people[p]; return `${m.title}（${m.sport}）の ${pp.name}（${pp.state}）「${pp.elements[x].text}」`; };
const SYS = `2つのスポーツの瞬間の要素の繋がりを採点する。
0 = 同じ人物（同じ選手・同じ監督・同じチームの同じ人）どうし。
1 = 試合でよくある動作の一致（ハイタッチ、ホームを踏む、拍手、手を挙げる、抱き合う、ガッツポーズ、ベンチから飛び出す など）。
2 = はっきりした感情や身体の一致（顔を覆う、泣き崩れる、天を仰ぐ、雄叫び、膝をつく、呆然と立ち尽くす など）。
3 = その瞬間ならではの具体の一致で、見た人が「へえ、この2つが」と思うもの（同じ境遇・同じ懸かり方・同じ関係・家族や師弟・最後の試合・最年長・亡き人への思い など）。`;
const schema = { type: "OBJECT", properties: { r: { type: "ARRAY", items: { type: "OBJECT", properties: { i: { type: "INTEGER" }, rate: { type: "INTEGER" } }, required: ["i", "rate"] } } }, required: ["r"] };
const todo = D.links.map((l, i) => i).filter((i) => D.links[i].rate == null), B = [];
for (let i = 0; i < todo.length; i += 40) B.push(todo.slice(i, i + 40));
await Promise.all(Array.from({ length: 6 }, async () => { while (B.length) { const b = B.shift();
  const user = b.map((li, n) => `[${n}] A=${g(D.links[li].a)}\n    B=${g(D.links[li].b)}\n    一文: ${D.links[li].why}`).join("\n");
  for (let a = 0; a < 3; a++) { try { const r = await json(SYS, user, { schema, temperature: 0.1 }); for (const x of r.r) if (b[x.i] != null) D.links[b[x.i]].rate = x.rate; break; }
    catch (e) { console.log("retry", String(e).slice(0, 90)); await new Promise((r) => setTimeout(r, 5000)); } } } }));
writeFileSync(F, JSON.stringify(D));
const c = [0, 0, 0, 0, 0]; D.links.forEach((l) => c[l.rate ?? 4]++); console.log("rate 0/1/2/3/none", c.join("/"));
