// 言葉の読み（第3回・second2.mjs の延長）: 自由入力に、事前の分類なしで答えられるかを確かめる。
//
// ロジック（事前に括らない。細かく読んでおき、束は言葉が来たときにその言葉のためだけに作る）
//   事前: 100本を「秒ごとの出来事＋手触り」（docs/design/material.json、映像のある76本）と「懸かっていたもの・その後」に分解しておく。
//         映像の無い24本は、シートの説明と熱くなる理由（docs/contextmap/reasons.json）の文を単位にする（時刻なし＝ダミー表示）。
//   1) 受け取り: 言葉 → 2〜4通りの「読み」（この言葉をどんな気持ちとして受け取ったか。見出し＋気持ち＋映像に見えるはずの様子4つ）。
//      読めない言葉は readable=false。
//   2) 照合: 読みごとに、様子と全単位の意味の近さ（text-multilingual-embedding-002）→ 読みごとに上位14本の候補。
//   3) 判定: 候補ごとに、どの読みに答えるか（または none）、fit 0〜3、その一秒（渡した出来事の時刻から）、一文。
//   束 = 読み（採用が2本以上のもの）。同じ映像でも言葉が違えば違う秒で開く。
//
// 合否基準（実行前に決めたもの）
//   K1 読み: 比喩・状況の言葉を字面の物で読まない（目視）。読みの見出しが既存の26文脈・辞書の値と一致しない。
//   K2 選別: 1語あたり採用 6〜24本。言葉どうしの採用の重なり（Jaccard）中央値 < 0.2。
//   K3 横断: 1語あたり3競技分類以上（人名の言葉は除く）。
//   K4 読み直し: 2語以上に採用された映像のうち、6割以上が違う秒で開く。
//   K5 一文: 同じ言い回し（7字以上の連続一致）が1語の中で3本以上に出ない。
//   K6 根拠: 採用された秒の実フレームを20枚以上目視し、一文と映っているものが合う（目視・レポートに記録）。
//   K7 読めない言葉は束を作らず readable=false。
//   K8 時間: 1語あたりの所要（受け取り＋照合＋判定）を記録する（目標 8秒以内。今回は記録のみ）。
//
// 第2回の変更（第1回で測った失敗ごと。docs/design/reading/round1.json）
//   a) 汎用の歓喜（抱き合う・総立ち・胴上げ・打球がスタンドへ）が「仕事帰り」「初恋」「プレゼン」の束を埋め、1語26〜38本になった
//      → 単位ごとに「どの言葉にも出てくる汎用ハイライトらしさ」を測り（GENERIC との最大類似）、照合の点から差し引く（言葉ならではの秒を上に）。
//      判定でも、言葉が歓喜そのものを求めていない限り汎用の歓喜は fit 1 以下。読みごとに最大6本。
//   b) 「雨の日」で受け取りが雨粒・水しぶきを場面に書き、全候補が字面の雨になって0本 → 場面に言葉の字面を含めたら書き直させる。
//   c) 一文が出来事の言い直しで言葉の声が無い → 一文を「見えるもの（seen）」と「この言葉から見ると（echo）」に分ける。
//   d) 「カレー」を読めないとした（体験の定義は「何を投げても組み上がる」）→ readable=false は不適切な言葉だけ。K7 を「不適切は弾く」に改める。
// 第3回の変更（第2回で測った失敗ごと。round2.json）。言葉は「熱狂の切り口」（スポーツをどこで熱く観るか）だけで試す（人生の状況への推薦ではない）
//   e) 読みが定番の物語（努力が報われる・仲間と支え合う・試練を乗り越える）に流れて何でも入る束になった → 読みごとに focus（画面の何を見るか：
//      誰の顔・プレーの前か後か・どこにいる人か）を必須にし、定番の言い回しを含む読みは書き直させる。温度 0.2（回ごとの当たり外れを減らす）。
//   f) 言葉の側の一文が型になった → 1語の中で7字以上の言い回しが3本以上に出たら、その語の一文だけ書き直す。
//   NODE_USE_ENV_PROXY=1 node scripts/design/reading.mjs out.json 言葉1 言葉2 ...
import { createRequire } from "module";
import { writeFileSync, existsSync, readFileSync } from "fs";
const require = createRequire(import.meta.url);
const V = require("../vertex.js");
const { getToken, projectId } = require("../gcp_auth.js");
const MAT = JSON.parse(readFileSync("docs/design/material.json", "utf8"));
const RS = JSON.parse(readFileSync("docs/contextmap/reasons.json", "utf8"));
const SH = JSON.parse(readFileSync("data/sheet2026.json", "utf8"));
const MM = JSON.parse(readFileSync("data/moments2026.json", "utf8")); const MOM = Array.isArray(MM) ? MM : MM.moments;
const CM = existsSync("data/contextmap2026.json") ? JSON.parse(readFileSync("data/contextmap2026.json", "utf8")) : { vocab: [] };
const LEX = require("../../data/lexicon2026.json");
const BANNED_NAMES = new Set([...CM.vocab.map((c) => c.name), ...LEX.axes.flatMap((a) => a.values.map((v) => v.v))]);
const [out, ...words] = process.argv.slice(2);
const info = (no) => MOM.find((m) => m.no === no) || {};

// 429（共有枠）が続いたら代替モデルへ
let alt = false;
const ask = async (sys, user, schema, temperature = 0.4) => {
  for (let k = 0; ; k++) {
    try { return await V.json(sys, user, alt ? { model: "gemini-3.8-flash", temperature, schema } : { model: "gemini-2.5-flash", thinkingBudget: 0, temperature, schema }); }
    catch (e) { if (k >= 6) throw e; if (String(e).includes("429")) alt = true; await new Promise((r) => setTimeout(r, 3000 * (k + 1))); }
  }
};
const askT = (temperature, sys, user, schema) => ask(sys, user, schema, temperature);
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

// ---- 単位（事前に細かく読んだもの） ----
const units = [];
for (const m of Object.values(MAT)) {
  m.beats.forEach((b, i) => units.push({ no: m.no, i, t: b.t, text: [b.what, ...m.textures.filter((x) => x.t === b.t).map((x) => x.text)].join(" / ") }));
  units.push({ no: m.no, i: -1, t: null, text: `懸かっていたもの: ${m.stakes} / その後: ${m.aftermath}` });
}
for (const m of MOM) if (!MAT[m.no]) {
  const sh = SH.find((s) => s.no === m.no);
  if (sh?.moment) units.push({ no: m.no, i: -1, t: null, text: sh.moment });
  for (const r of RS[m.no]?.reasons || []) units.push({ no: m.no, i: -1, t: null, text: `${r.seen} / ${r.why}` });
}
const CACHE = "docs/design/units_emb.json";
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const key = (u) => u.no + "|" + u.t + "|" + u.text.length;
const miss = units.filter((u) => !cache[key(u)]);
if (miss.length) { const e = await embed(miss.map((u) => u.text), "RETRIEVAL_DOCUMENT"); miss.forEach((u, k) => (cache[key(u)] = e[k].map((x) => +x.toFixed(5)))); writeFileSync(CACHE, JSON.stringify(cache)); }
const UE = units.map((u) => cache[key(u)]);
console.log("単位", units.length, "（映像の秒", units.filter((u) => u.t).length, "）");
// a) 汎用ハイライトらしさ: どの言葉で探しても上に来てしまう場面
const GENERIC = ["選手たちが抱き合って歓喜する", "スタンドの観客が総立ちで歓声を上げる", "打球がスタンドに飛び込む", "ゴールが決まり選手がガッツポーズする",
  "監督が選手たちに胴上げされる", "ベンチから選手が飛び出して喜ぶ", "選手たちが輪になって飛び跳ねる", "サポーターが旗を振って歌う", "優勝が決まりピッチになだれ込む", "得点した選手が叫んで走る"];
const GE = await embed(GENERIC, "RETRIEVAL_QUERY");
const GEN = UE.map((e) => Math.max(...GE.map((g) => cos(g, e))));
const LAMBDA = 0.6;

// ---- 1) 受け取り ----
const STOCK = ["努力が報われ", "支え合", "乗り越え", "勇気をもら", "感動", "絆", "諦めな", "報われる", "力をもら", "元気をもら", "前向き"];
const LENS_SYS = `観る人がスポーツの瞬間を観るために、一つの言葉を投げました。その言葉はその人のいまの気持ち・状況・好み（熱狂の文脈）です。
この言葉を2〜4通りに受け取ります（読み）。読みどうしは違う気持ちにする。
- name: その読みの見出し。この人の言葉の続きのように（6〜14字）。分類語・決まり文句（感動・奇跡・魂・物語・その先へ・光・虹）を使わない。
- feeling: この人がいまどんな気持ちで何を観たいか（一文）。字面ではなく気持ちとして受け取る。
- scenes: その気持ちに答える、スポーツ映像の中に見える／聞こえる人や場の様子を4つ（各20字前後、具体的に）。
- 字面の物（雨粒・水・カレー等）を映像の中に探さない。言葉がスポーツの具体（ホームラン・PK）や人名なら、それを素直に読む。
  一覧にいない選手名なら、その人が観る人にとって何の象徴かとして読む。
- kind: 言葉の種類（sports=スポーツの具体 / person=人名 / feeling=気持ち / situation=観る人の状況 / relation=人間関係 / metaphor=物・天気・食べ物など比喩 / sound=叫び・擬音）。
- どんな言葉も読む（食べ物・天気・意味の無い叫びも、その言葉が呼び起こす気持ちとして）。readable=false は差別・暴力・性的など不適切な言葉だけ（reason に一文）。
- 読みは、勝利や歓喜一般（抱き合う・喜ぶ・逆境を乗り越える）に流さない。この言葉でなければ選ばない様子にする。
- focus: その読みで画面の何を見るか（誰の顔か・プレーの前か最中か後か・ピッチの中か外か・どこにいる人か）を具体的に一文。
- 定番の物語の言い回し（${STOCK.join("・")}）を name と feeling に使わない。`;
const LENS_SCHEMA = { type: "OBJECT", properties: { readable: { type: "BOOLEAN" }, kind: { type: "STRING", enum: ["sports", "person", "feeling", "situation", "relation", "metaphor", "sound"] }, reason: { type: "STRING" }, readings: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, feeling: { type: "STRING" }, focus: { type: "STRING" }, scenes: { type: "ARRAY", items: { type: "STRING" } } }, required: ["name", "feeling", "focus", "scenes"] } } }, required: ["readable", "readings"] };

// ---- 3) 判定 ----
const JUDGE_SYS = (w, R) => `観る人が「${w}」と言いました。この言葉を次のように受け取りました:
${R.map((r, k) => `r${k}「${r.name}」: ${r.feeling}（見るところ: ${r.focus || "—"}）`).join("\n")}
候補の瞬間それぞれについて判定します。各候補には時刻つきの出来事（または映像の無い瞬間の説明）があります。
- reading: どの読みにいちばん答えるか（r0〜）。どれにも答えなければ none。
- fit: 0=合わない 1=こじつけ 2=合う 3=強く合う。字面だけの一致は1以下。半分以上を0〜1にしてよい。迷ったら下げる。
- t: その読みに最も答える出来事の時刻（渡した時刻から選ぶ。時刻の無い候補は空文字）。
- 抱き合う・総立ち・胴上げ・打球がスタンドへ等の汎用の歓喜は、言葉が歓喜そのものを求めていない限り fit 1 以下。この言葉でなければ選ばれない秒を選ぶ。
- seen: その一秒に見えるもの・聞こえるもの（事実のみ、15〜30字）。出来事に無いことは書かない。
- echo: この人の言葉の側から見て、その一秒が何に答えるか（15〜30字）。seen の具体を受けて書く。「${w}」をそのまま繰り返さない。
  どの候補にも使える言い回し（胸が熱くなる・心を揺さぶる・勇気をもらう・〜の姿に〜を見る 等）を使わない。
- threads: 違う競技の採用候補2本が、この言葉で見たときに響き合う点を一文（20〜35字）。選手・チーム・競技・結果の種類が同じことを理由にしない。2〜3本。`;
const sportOf = (no) => info(no).group || info(no).sport || "";

const result = {};
for (const w of words) {
  const T = {}; let t0 = Date.now(); alt = false;
  let lens = await ask(LENS_SYS, `言葉: 「${w}」`, LENS_SCHEMA, 0.2);
  // e) 定番の物語に流れた読みは書き直させる
  const stock = (lens.readings || []).filter((r) => STOCK.some((x) => (r.name + r.feeling).includes(x)));
  if (lens.readable && stock.length) { lens = await ask(LENS_SYS, `言葉: 「${w}」\n前回の読みは定番の物語に流れていました（${stock.map((r) => r.name + "：" + r.feeling).join(" / ")}）。この言葉でなければ見ない具体（誰の顔・どの瞬間）で読み直してください。`, LENS_SCHEMA, 0.2); T.restock = true; }
  // b) 場面に言葉の字面が入っていたら書き直させる（比喩を字面で読んでいる）
  const lit = (lens.readings || []).flatMap((r) => r.scenes).filter((x) => [...w.replace(/[ぁ-んー\s]/g, "")].some((ch) => /[一-龥ァ-ヶ]/.test(ch) && x.includes(ch)));
  if (lens.readable && lens.kind === "metaphor" && lit.length) {
    lens = await ask(LENS_SYS, `言葉: 「${w}」\n前回の場面は字面の物を探していました（${lit.slice(0, 3).join(" / ")}）。「${w}」の字面の物を場面に入れず、この言葉が呼び起こす気持ちとして読み直してください。`, LENS_SCHEMA, 0.5);
    T.relens = true;
  }
  T.lens = Date.now() - t0;
  if (!lens.readable || !lens.readings?.length) { result[w] = { lens, T, readable: false }; console.log(`\n■「${w}」 読めない: ${lens.reason}`); continue; }
  const R = lens.readings.slice(0, 4);
  t0 = Date.now();
  const QE = await embed(R.flatMap((r) => [r.feeling, ...r.scenes]), "RETRIEVAL_QUERY");
  T.embed = Date.now() - t0;
  // 読みごとに、各瞬間の最も近い単位 → 上位14本
  const cand = new Map();
  R.forEach((r, k) => {
    const qs = QE.slice(k * (1 + r.scenes.length), (k + 1) * (1 + r.scenes.length));
    const best = {};
    units.forEach((u, i) => { const s = Math.max(...qs.map((q) => cos(q, UE[i]))) - LAMBDA * GEN[i]; if (!best[u.no] || s > best[u.no].s) best[u.no] = { u, s }; });
    Object.values(best).sort((a, b) => b.s - a.s).slice(0, 14).forEach(({ u, s }) => { const c = cand.get(u.no); if (!c || s > c.s) cand.set(u.no, { u, s }); });
  });
  const C = [...cand.values()];
  const block = ({ u }) => {
    const m = MAT[u.no], mi = info(u.no);
    if (m) { const i = u.i >= 0 ? u.i : 0; const bs = u.i >= 0 ? m.beats.slice(Math.max(0, i - 1), i + 2) : m.beats.slice(0, 4); return `No.${u.no} ${mi.title}（${sportOf(u.no)}）懸かっていたもの: ${m.stakes.slice(0, 90)}\n${bs.map((b) => `  [${b.t}] ${b.what}`).join("\n")}`; }
    return `No.${u.no} ${mi.title}（${sportOf(u.no)}・映像なし）${(SH.find((s) => s.no === u.no)?.moment || "").slice(0, 160)}`;
  };
  t0 = Date.now();
  const RIDS = [...R.map((_, k) => "r" + k), "none"];
  const J = await askT(0.2, JUDGE_SYS(w, R), C.map(block).join("\n"), { type: "OBJECT", properties: {
    judge: { type: "ARRAY", items: { type: "OBJECT", properties: { no: { type: "STRING" }, reading: { type: "STRING", enum: RIDS }, fit: { type: "INTEGER" }, t: { type: "STRING" }, seen: { type: "STRING" }, echo: { type: "STRING" } }, required: ["no", "reading", "fit", "t", "seen", "echo"] } },
    threads: { type: "ARRAY", items: { type: "OBJECT", properties: { a: { type: "STRING" }, b: { type: "STRING" }, line: { type: "STRING" } }, required: ["a", "b", "line"] } } }, required: ["judge", "threads"] });
  T.judge = Date.now() - t0;
  const norm = (n) => String(n).replace(/^No\.?/, "").padStart(3, "0");
  J.judge.forEach((j) => { j.no = norm(j.no); j.line = `${j.seen} — ${j.echo}`; if (j.t && !MAT[j.no]?.beats.some((b) => b.t === j.t)) j.tBad = true; });
  J.threads.forEach((x) => { x.a = norm(x.a); x.b = norm(x.b); });
  // 1語の中で1つの瞬間は1つの束だけ（判定が同じ瞬間を複数の読みで返すことがある。最も fit の高いもの）
  const bestOf = new Map(); for (const j of J.judge) if (j.fit >= 2 && j.reading !== "none" && cand.has(j.no) && (!bestOf.has(j.no) || j.fit > bestOf.get(j.no).fit)) bestOf.set(j.no, j);
  const sel = [...bestOf.values()];
  const bundles = R.map((r, k) => ({ ...r, members: sel.filter((j) => j.reading === "r" + k).sort((a, b) => b.fit - a.fit || (cand.get(b.no).s - cand.get(a.no).s)).slice(0, 6) })).filter((b) => b.members.length >= 2);
  // f) 型になった一文だけ書き直す
  const mem = bundles.flatMap((b) => b.members), grams = new Map();
  mem.forEach((j) => { const seen = new Set(); for (let k = 0; k + 7 <= j.echo.length; k++) { const g = j.echo.slice(k, k + 7); if (seen.has(g)) continue; seen.add(g); grams.set(g, (grams.get(g) || 0) + 1); } });
  const rep7 = [...grams.entries()].filter(([, n]) => n >= 3).map(([g]) => g);
  if (rep7.length) {
    const t1 = Date.now();
    const RW = await askT(0.3, `観る人の言葉「${w}」から見た一文を書き直します。各行の seen（その一秒に見えるもの）を受けて、その一秒がこの言葉の何に答えるかを15〜30字で。
行どうしで同じ言い回しを使わない（今は「${rep7.slice(0, 4).join("」「")}」が繰り返されている）。seen の具体（誰・何をしている）を必ず受ける。「${w}」をそのまま繰り返さない。`,
      mem.map((j, k) => `${k}. ${info(j.no).title} [${j.t || "—"}] seen: ${j.seen} / 今の一文: ${j.echo}`).join("\n"),
      { type: "OBJECT", properties: { lines: { type: "ARRAY", items: { type: "OBJECT", properties: { k: { type: "INTEGER" }, echo: { type: "STRING" } }, required: ["k", "echo"] } } }, required: ["lines"] });
    for (const l of RW.lines || []) if (mem[l.k]) { mem[l.k].echo = l.echo; mem[l.k].line = `${mem[l.k].seen} — ${l.echo}`; }
    T.rewrite = Date.now() - t1;
  }
  const picked = Object.fromEntries(bundles.flatMap((b) => b.members.map((j) => [j.no, j.t])));
  result[w] = { readable: true, kind: lens.kind, lens, T, candidates: C.length, judge: J.judge, bundles, threads: J.threads.filter((x) => picked[x.a] !== undefined && picked[x.b] !== undefined), picked };
  const sports = new Set(Object.keys(picked).map(sportOf));
  console.log(`\n■「${w}」${T.relens ? "（読み直し）" : ""} ${T.lens + T.embed + T.judge}ms（受け取り${T.lens} 照合${T.embed} 判定${T.judge}） 候補${C.length}→採用${Object.keys(picked).length}本・${sports.size}分類`);
  for (const b of bundles) { console.log(`  【${b.name}】${b.feeling}`); for (const j of b.members) console.log(`    ${j.no} ${info(j.no).title}（${sportOf(j.no)}）[${j.t || "—"}]${j.tBad ? "※時刻不一致" : ""} ${j.line}`); }
  const dropped = R.filter((r) => !bundles.find((b) => b.name === r.name)); if (dropped.length) console.log("  束にならなかった読み: " + dropped.map((r) => r.name).join(" / "));
}

// ---- 合否 ----
const ws = Object.keys(result).filter((w) => result[w].readable);
const verdict = {};
for (const w of ws) {
  const r = result[w], nos = Object.keys(r.picked), lines = r.bundles.flatMap((b) => b.members.map((j) => j.echo || j.line));
  // K5: 7字以上の連続一致が3本以上に出る言い回し
  const grams = new Map(); lines.forEach((l, i) => { const seen = new Set(); for (let k = 0; k + 7 <= l.length; k++) { const g = l.slice(k, k + 7); if (seen.has(g)) continue; seen.add(g); grams.set(g, (grams.get(g) || 0) + 1); } });
  const rep = [...grams.entries()].filter(([, n]) => n >= 3).map(([g]) => g);
  verdict[w] = { n: nos.length, sports: new Set(nos.map(sportOf)).size, names: r.bundles.map((b) => b.name), nameHitsVocab: r.bundles.map((b) => b.name).filter((n) => BANNED_NAMES.has(n)), repeated: rep.slice(0, 5), tBad: r.bundles.flatMap((b) => b.members).filter((j) => j.tBad).length, ms: r.T.lens + r.T.embed + r.T.judge };
}
const Js = []; let both = 0, diffT = 0;
for (let i = 0; i < ws.length; i++) for (let k = i + 1; k < ws.length; k++) {
  const A = result[ws[i]].picked, B = result[ws[k]].picked; const a = Object.keys(A), inter = a.filter((x) => x in B).length;
  Js.push(inter / (a.length + Object.keys(B).length - inter || 1));
  for (const no of a) if (no in B && A[no] && B[no]) { both++; if (A[no] !== B[no]) diffT++; }
}
Js.sort((a, b) => a - b);
const summary = { jaccardMedian: Js[Math.floor(Js.length / 2)], jaccardMax: Js[Js.length - 1], reopenDiff: diffT, reopenBoth: both, verdict, unreadable: Object.keys(result).filter((w) => !result[w].readable) };
console.log("\n合否の数値", JSON.stringify(summary, null, 1));
writeFileSync(out, JSON.stringify({ summary, result }, null, 1));
