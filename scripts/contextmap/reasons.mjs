// コンテキストマップ 第1段: 各瞬間について「観る人が熱くなる理由」を、出来事の種類ではなく人の言葉で、映像の時刻を根拠に書き出す
//   NODE_USE_ENV_PROXY=1 node scripts/contextmap/reasons.mjs docs/contextmap/reasons.json [no,no,...]
import { createRequire } from "module";
import { readFileSync, writeFileSync, existsSync } from "fs";
const require = createRequire(import.meta.url);
const V = require("../vertex.js");
const MAT = JSON.parse(readFileSync("docs/design/material.json", "utf8"));
const SH = JSON.parse(readFileSync("data/sheet2026.json", "utf8"));
const DJ = JSON.parse(readFileSync("data/decomp2026.json", "utf8")); const DEC = Object.fromEntries((Array.isArray(DJ) ? DJ : Object.values(DJ.moments || DJ)).map((d) => [d.no, d]));
const M = JSON.parse(readFileSync("data/moments2026.json", "utf8")); const A = Array.isArray(M) ? M : M.moments;
const [out, only] = process.argv.slice(2);
const done = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : {};
const nos = (only ? only.split(",") : A.map((m) => m.no)).filter((no) => !done[no]);
const SYS = `あなたは長年スポーツ中継を作ってきたディレクターで、コラムニストでもあります。観る人がこの瞬間に「熱くなる理由」を書き出します。
これは100の瞬間を、観る人の熱狂の文脈でつなぐ地図の材料になります。

- 理由は「何が起きたか」ではなく「なぜ人はこれに熱くなるのか」。出来事の種類（逆転・優勝・ゴール・記録・サヨナラ・番狂わせ）や競技用語を、理由の名前にしない。
- 理由は、観る人が自分の人生や記憶と重ねられる、人間の文脈で書く。たとえば「長く続けてきたことが、最後に報われる」「自分ではない誰かのために戦う」「負けた側の涙に心を持っていかれる」のような水準。これは例で、この瞬間に合わなければ使わない。この瞬間に固有の理由を、具体的な人と事情から探す。
- 各理由には、それが映像で最もよく見える時刻（渡す出来事の t から選ぶ）と、その時刻に映っているもの・聞こえるもの、なぜそれが熱いのか（誰が、何を背負って、何年、などの具体）を書く。
- 映像に無いことは書かない。「懸かっていたもの」とシートの説明は背景として使ってよい。映像の素材が無い瞬間は t を空にし、シートの説明から書く。
- 3〜5個、強い順。汎用の言い方（胸が熱くなる、感動的、熱い瞬間）は禁止。`;
const SCHEMA = { type: "OBJECT", properties: { reasons: { type: "ARRAY", items: { type: "OBJECT", properties: { context: { type: "STRING" }, t: { type: "STRING" }, seen: { type: "STRING" }, why: { type: "STRING" }, strength: { type: "NUMBER" } }, required: ["context", "t", "seen", "why", "strength"] } } }, required: ["reasons"] };
let i = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (i < nos.length) {
    const no = nos[i++]; const m = A.find((x) => x.no === no); const sh = SH.find((x) => x.no === no) || {}; const mat = MAT[no]; const dec = DEC[no];
    const user = [`No.${no} ${m.title}（${m.sportLabel} / ${m.date}）`, `シートの説明: ${sh.moment || m.description}`,
      dec?.facts?.situation ? `状況: ${dec.facts.situation}${dec.facts.score ? "（" + dec.facts.score + "）" : ""}` : "",
      mat ? `懸かっていたもの: ${mat.stakes}\n出来事:\n${mat.beats.map((b) => `[${b.t}] ${b.what}`).join("\n")}\n直後: ${mat.aftermath}` : "（映像の素材なし）"].filter(Boolean).join("\n");
    for (let k = 0; k < 3; k++) {
      try { const r = await V.json(SYS, user, { model: "gemini-3.8-flash", schema: SCHEMA, temperature: 0.5 }); done[no] = { no, title: m.title, sport: m.sportLabel, hasVideo: !!mat, reasons: r.reasons }; console.log(no, r.reasons.map((x) => x.context).join(" / ")); break; }
      catch (e) { console.log(no, "retry", String(e).slice(0, 100)); await new Promise((r) => setTimeout(r, 3000 * (k + 1))); }
    }
    writeFileSync(out, JSON.stringify(done, null, 1));
  }
}));
console.log("done", Object.keys(done).length);
