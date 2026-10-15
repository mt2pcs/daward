// 「100本を1秒ずつ読んだ世界」: 全映像の時刻ごとの出来事＋手触りを埋め込み、違う映像の1秒どうしを気持ちの近さでつなぐ
//   NODE_USE_ENV_PROXY=1 node scripts/design/world.mjs out.json
import { createRequire } from "module";
import { writeFileSync, existsSync, readFileSync } from "fs";
const require = createRequire(import.meta.url);
const { getToken, projectId } = require("../gcp_auth.js");
const MAT = JSON.parse(readFileSync("docs/design/material.json", "utf8"));
const tok = await getToken();
const embed = async (texts) => { const res = []; for (let i = 0; i < texts.length; i += 200) { const r = await fetch(`https://asia-northeast1-aiplatform.googleapis.com/v1/projects/${projectId()}/locations/asia-northeast1/publishers/google/models/text-multilingual-embedding-002:predict`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ instances: texts.slice(i, i + 200).map((c) => ({ content: c, task_type: "SEMANTIC_SIMILARITY" })) }) }); const j = await r.json(); if (!j.predictions) throw new Error(JSON.stringify(j).slice(0, 200)); res.push(...j.predictions.map((p) => p.embeddings.values)); } return res; };
const sec = (t) => { const p = t.split(":").map(Number); return p.length === 2 ? p[0] * 60 + p[1] : 0; };
// 1秒 = 出来事＋その時刻の手触り。つなぐのは「手触り」側（何が起きたかではなく、どう感じるか）
const units = [];
for (const m of Object.values(MAT)) { const dur = Math.max(...m.beats.map((b) => sec(b.t)), 1); m.beats.forEach((b) => { const tx = m.textures.filter((x) => x.t === b.t).map((x) => x.text); units.push({ no: m.no, title: m.title, sport: m.sport, t: b.t, pos: sec(b.t) / dur, what: b.what, feel: tx.join(" / "), text: tx.length ? tx.join(" / ") : b.what }); }); }
const E = await embed(units.map((u) => u.text));
const cos = (a, b) => { let s = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return s / Math.sqrt(x * y); };
const links = [];
for (let i = 0; i < units.length; i++) {
  const c = [];
  for (let j = 0; j < units.length; j++) if (units[j].no !== units[i].no) c.push([j, cos(E[i], E[j])]);
  c.sort((a, b) => b[1] - a[1]);
  for (const [j, s] of c.slice(0, 2)) if (i < j || !links.some((l) => l.a === j && l.b === i)) links.push({ a: i, b: j, s: +s.toFixed(3) });
}
const cross = links.filter((l) => units[l.a].sport !== units[l.b].sport).length;
console.log("units", units.length, "links", links.length, "別の競技どうし", cross, (cross / links.length * 100).toFixed(0) + "%");
// 例: 気持ちでつながった別競技の1秒
for (const l of links.filter((l) => units[l.a].sport !== units[l.b].sport).sort((a, b) => b.s - a.s).slice(0, 8)) console.log(l.s, `${units[l.a].title}[${units[l.a].t}] ${units[l.a].feel || units[l.a].what}`, " ⇔ ", `${units[l.b].title}[${units[l.b].t}] ${units[l.b].feel || units[l.b].what}`);
writeFileSync(process.argv[2], JSON.stringify({ units: units.map(({ text, ...u }) => u), links }));
