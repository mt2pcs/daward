// 体験のデータ（data/net/world.json）を作る: 瞬間・かけら（人×その1秒）・かけらどうしの繋がり（種類・理由・強さ）
//   node scripts/net/build_world.mjs
import { readFileSync, writeFileSync, existsSync } from "fs";
const L = JSON.parse(readFileSync("data/net/layers.json", "utf8")), K = JSON.parse(readFileSync("data/net/links.json", "utf8")).links;
const M = JSON.parse(readFileSync("data/moments2026.json", "utf8")); const MS = Array.isArray(M) ? M : M.moments || Object.values(M);
const meta = Object.fromEntries(MS.map((m) => [m.no, m]));
const sec = (s) => { const p = String(s).split(":").map(Number); return p.length === 2 ? p[0] * 60 + p[1] : +p[0]; };
const KIND = ["体の動き", "表情", "声", "関係", "場所", "境遇", "懸かっていたもの"];
const pid = {}, people = [], moments = [];
for (const m of Object.values(L).sort((a, b) => a.no.localeCompare(b.no))) {
  const mm = { no: m.no, title: meta[m.no]?.titles?.[0] || meta[m.no]?.short || m.title, long: meta[m.no]?.short || m.title, sport: meta[m.no]?.sportLabel || m.sport, people: [] };
  m.events.forEach((e, ei) => e.people.forEach((p, pi) => { const i = people.length; pid[`${m.no}.${ei}.${pi}`] = i; mm.people.push(i);
    people.push({ i, no: m.no, name: p.name, state: p.state, event: e.label, t: sec(p.t), el: p.elements.map((x) => [x.text, KIND.indexOf(x.kind)]) }); }));
  moments.push(mm);
}
// かけらどうし: 同じ組の繋がりが複数あれば強いものを残す
const best = new Map();
for (const l of K) { if (!l.rate) continue;
  const ka = l.a.split("."), kb = l.b.split("."), a = pid[ka.slice(0, 3).join(".")], b = pid[kb.slice(0, 3).join(".")]; if (a == null || b == null || a === b) continue;
  const ea = people[a].el[+ka[3]], eb = people[b].el[+kb[3]]; if (!ea || !eb) continue;
  const key = a < b ? `${a}|${b}` : `${b}|${a}`, cur = best.get(key);
  const v = { a, b, kind: ea[1], xa: +ka[3], xb: +kb[3], why: l.why, rate: l.rate };
  if (!cur || v.rate > cur.rate) best.set(key, v);
}
const links = [...best.values()].map((v) => [v.a, v.b, v.kind, v.rate, v.xa, v.xb, v.why]);
const out = { kinds: KIND, moments, people, links };
if (existsSync("data/net/names.json")) out.names = JSON.parse(readFileSync("data/net/names.json", "utf8"));
writeFileSync("data/net/world.json", JSON.stringify(out));
writeFileSync("public/lab/net/world.json", JSON.stringify(out));
console.log("moments", moments.length, "people", people.length, "links", links.length, "bytes", JSON.stringify(out).length);
