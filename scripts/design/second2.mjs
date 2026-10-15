// 検証2: 言葉が各映像の「その一秒」を選ぶ（第2回）
//  1) 言葉を“気持ち”として受け取る（字面の物を探さない）→ 映像の中の人や場の様子5つ
//  2) 全映像の時刻ごとの出来事＋手触りと意味の近さで照合 → 各映像の最も響く時刻、上位24本
//  3) 1回の呼び出しで: 合う/合わない（0〜3）・時刻の確定・その一秒の一文・束と見出し・糸
//  使い方: NODE_USE_ENV_PROXY=1 node scripts/design/second2.mjs out.json 言葉1 言葉2 ...
import { createRequire } from "module";
import { writeFileSync, existsSync, readFileSync } from "fs";
const require = createRequire(import.meta.url);
const V = require("../vertex.js");
const { getToken, projectId } = require("../gcp_auth.js");
const LEX = require("../../data/lexicon2026.json");
const LABELS = LEX.axes.flatMap((a) => a.values.map((v) => v.v));
const MAT = JSON.parse(readFileSync(process.env.MAT || "docs/design/material.json", "utf8"));
const [out, ...words] = process.argv.slice(2);
const MODEL = process.env.M || "gemini-2.5-flash";
const tok = await getToken();
const embed = async (texts, type) => {
  const res = [];
  for (let i = 0; i < texts.length; i += 200) {
    const r = await fetch(`https://asia-northeast1-aiplatform.googleapis.com/v1/projects/${projectId()}/locations/asia-northeast1/publishers/google/models/text-multilingual-embedding-002:predict`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ instances: texts.slice(i, i + 200).map((c) => ({ content: c, task_type: type })) }) });
    const j = await r.json(); if (!j.predictions) throw new Error(JSON.stringify(j).slice(0, 200));
    res.push(...j.predictions.map((p) => p.embeddings.values));
  }
  return res;
};
const cos = (a, b) => { let s = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return s / Math.sqrt(x * y); };
// 単位の埋め込みはキャッシュ
const units = [];
for (const m of Object.values(MAT)) m.beats.forEach((b, i) => units.push({ no: m.no, i, t: b.t, what: b.what, text: [b.what, ...m.textures.filter((x) => x.t === b.t).map((x) => x.text)].join(" / ") }));
const CACHE = "docs/design/units_emb.json";
let UE; const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const key = (u) => u.no + "|" + u.t + "|" + u.text.length;
const miss = units.filter((u) => !cache[key(u)]);
if (miss.length) { const e = await embed(miss.map((u) => u.text), "RETRIEVAL_DOCUMENT"); miss.forEach((u, k) => (cache[key(u)] = e[k].map((x) => +x.toFixed(5)))); writeFileSync(CACHE, JSON.stringify(cache)); }
UE = units.map((u) => cache[key(u)]);

const LENS_SYS = `観る人がスポーツの瞬間を観るために一つの言葉を投げました。その言葉は、その人のいまの気持ち・状況・好み（熱狂の文脈）です。
- まず feeling: この人はいま、どんな気持ちで、何を観たいのか（一文）。字面ではなく気持ちとして受け取る。例:「雨の日」→ 晴れない気分のまま、それでも前に進む姿を観たい。
- scenes: その気持ちに答える、スポーツ映像の中の人や場の様子を5つ（各20字前後、具体的に見えるもの・聞こえるもの）。
- 字面の物（雨粒・水しぶき・カレーなど）を探さない。ただし言葉がスポーツの具体（「ホームラン」「PK」等）ならそのまま。`;
const PICK_SYS = (w, feeling) => `観る人が「${w}」と言いました（受け取った気持ち: ${feeling}）。候補の瞬間それぞれについて判定し、合うものだけで切り口を作ります。
各候補には時刻つきの出来事が3つあります。
- fit: 0=合わない 1=こじつけ 2=合う 3=強く合う。字面だけの一致（雨→水をかぶる 等）は1以下。半分以上を0〜1にしてよい。迷ったら下げる。
- t: この言葉に最も答える出来事の時刻（渡した3つから選ぶ）。
- line: その一秒に見えるものを、この人の言葉の側から一文（25〜40字）。出来事に無いことは書かない。要約・結果の説明ではなく「その一秒」。「${w}」という語をそのまま繰り返さない。
- arms: fit 2以上を2〜4の束に。name はこの人の言葉の続きのような見出し（6〜14字、具体的に見えるもの）。分類語（${LABELS.slice(0, 10).join("、")} など）や決まり文句（虹・光・奇跡・魂・物語・その先へ）を使わない。
- threads: 違う競技の2本を、この言葉で見たときに響き合う点で一文（20〜35字）。選手・チーム・競技・結果の種類（逆転・優勝など）が同じことを理由にしない。2〜3本。`;
const SCHEMA = { type: "OBJECT", properties: {
  judge: { type: "ARRAY", items: { type: "OBJECT", properties: { no: { type: "STRING" }, fit: { type: "INTEGER" }, t: { type: "STRING" }, line: { type: "STRING" } }, required: ["no", "fit", "t", "line"] } },
  arms: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, nos: { type: "ARRAY", items: { type: "STRING" } } }, required: ["name", "nos"] } },
  threads: { type: "ARRAY", items: { type: "OBJECT", properties: { a: { type: "STRING" }, b: { type: "STRING" }, line: { type: "STRING" } }, required: ["a", "b", "line"] } },
}, required: ["judge", "arms", "threads"] };

const result = {};
for (const w of words) {
  const T = {}; let t0 = Date.now();
  const lens = await V.json(LENS_SYS, `言葉: 「${w}」`, { model: MODEL, thinkingBudget: 0, temperature: 0.4, schema: { type: "OBJECT", properties: { feeling: { type: "STRING" }, scenes: { type: "ARRAY", items: { type: "STRING" } } }, required: ["feeling", "scenes"] } });
  T.lens = Date.now() - t0; t0 = Date.now();
  const QE = await embed([lens.feeling, ...lens.scenes], "RETRIEVAL_QUERY");
  T.embed = Date.now() - t0; t0 = Date.now();
  const best = {};
  units.forEach((u, i) => { const s = Math.max(...QE.map((q) => cos(q, UE[i]))); if (!best[u.no] || s > best[u.no].s) best[u.no] = { ...u, s }; });
  const cand = Object.values(best).sort((a, b) => b.s - a.s).slice(0, 24);
  const user = cand.map((c) => { const m = MAT[c.no]; const bs = m.beats.slice(Math.max(0, c.i - 1), c.i + 2); return `No.${c.no} ${m.title}（${m.sport}）懸かっていたもの: ${m.stakes.slice(0, 80)}\n${bs.map((b) => `  [${b.t}] ${b.what}`).join("\n")}`; }).join("\n");
  const r = await V.json(PICK_SYS(w, lens.feeling), user, { model: MODEL, thinkingBudget: 0, temperature: 0.4, schema: SCHEMA });
  T.pick = Date.now() - t0;
  const norm = (n) => String(n).replace(/^No\.?/, "");
  r.judge.forEach((j) => (j.no = norm(j.no))); r.arms.forEach((a) => (a.nos = a.nos.map(norm))); r.threads.forEach((x) => { x.a = norm(x.a); x.b = norm(x.b); });
  const sel = r.judge.filter((j) => j.fit >= 2);
  const issues = [];
  for (const j of sel) if (!MAT[j.no]?.beats.some((b) => b.t === j.t)) issues.push(`時刻なし ${j.no}@${j.t}`);
  for (const a of r.arms) if (LABELS.includes(a.name)) issues.push("見出しがタグ " + a.name);
  for (const x of r.threads) if (MAT[x.a]?.sport === MAT[x.b]?.sport) issues.push(`同競技の糸 ${x.a}-${x.b}`);
  const sports = new Set(sel.map((j) => MAT[j.no]?.sport));
  result[w] = { lens, T, judge: r.judge, arms: r.arms, threads: r.threads, issues, picked: Object.fromEntries(sel.map((j) => [j.no, j.t])) };
  console.log(`\n■「${w}」 気持ち: ${lens.feeling}\n  場面: ${lens.scenes.join(" / ")}\n  時間: 受け取り${T.lens} 照合${T.embed} 判定${T.pick} 計${T.lens + T.embed + T.pick}ms  候補24→採用${sel.length}本・${sports.size}競技`);
  for (const a of r.arms) { console.log(`  【${a.name}】`); for (const no of a.nos) { const j = r.judge.find((x) => x.no === no); console.log(`    ${no} ${MAT[no]?.title}（${MAT[no]?.sport}）[${j?.t}] ${j?.line}`); } }
  console.log("  不採用の例: " + r.judge.filter((j) => j.fit <= 1).slice(0, 4).map((j) => `${j.no}${MAT[j.no]?.title}(${j.fit})`).join(" "));
  console.log("  糸: " + r.threads.map((x) => `${x.a}${MAT[x.a]?.sport}—${x.b}${MAT[x.b]?.sport}「${x.line}」`).join(" / "));
  console.log("  検査: " + (issues.join(" / ") || "問題なし"));
}
// 言葉どうしで採用の重なり（Jaccard）と、同じ映像が違う時刻で開いた数
const ws = Object.keys(result); const J = [];
for (let i = 0; i < ws.length; i++) for (let k = i + 1; k < ws.length; k++) { const A = new Set(Object.keys(result[ws[i]].picked)), B = new Set(Object.keys(result[ws[k]].picked)); const inter = [...A].filter((x) => B.has(x)).length; J.push(inter / (A.size + B.size - inter || 1)); }
J.sort((a, b) => a - b);
let both = 0, diffT = 0;
for (let i = 0; i < ws.length; i++) for (let k = i + 1; k < ws.length; k++) for (const no of Object.keys(result[ws[i]].picked)) if (result[ws[k]].picked[no]) { both++; if (result[ws[k]].picked[no] !== result[ws[i]].picked[no]) diffT++; }
console.log(`\n採用の重なり（Jaccard）中央値 ${J[Math.floor(J.length / 2)]?.toFixed(2)} 最大 ${J[J.length - 1]?.toFixed(2)} / 両方に入った映像のうち違う時刻で開いた ${diffT}/${both}`);
writeFileSync(out, JSON.stringify(result, null, 1));
