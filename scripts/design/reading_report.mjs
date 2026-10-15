// 言葉の読み（reading.mjs）の結果を、実フレーム付きの判断用ページにする。
//   node scripts/design/reading_report.mjs <framesDir> <out.html>
import { readFileSync, existsSync, writeFileSync } from "fs";
const [dir, out] = process.argv.slice(2);
const R1 = JSON.parse(readFileSync("docs/design/reading/round1.json", "utf8"));
const R2 = JSON.parse(readFileSync("docs/design/reading/round2.json", "utf8"));
const MM = JSON.parse(readFileSync("data/moments2026.json", "utf8")); const MOM = Array.isArray(MM) ? MM : MM.moments;
const info = (no) => MOM.find((m) => m.no === no) || {};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const imgCache = new Map();
const frame = (no, t) => {
  if (!t) return null; const f = `${dir}/${no}_${t.padStart(5, "0").replace(":", "")}.jpg`;
  if (!existsSync(f)) return null; if (!imgCache.has(f)) imgCache.set(f, "data:image/jpeg;base64," + readFileSync(f).toString("base64")); return imgCache.get(f);
};
const card = (j, wide) => {
  const src = frame(j.no, j.t), m = info(j.no);
  const [seen, echo] = j.seen ? [j.seen, j.echo] : [j.line, ""];
  return `<figure class="card${wide ? " wide" : ""}">${src ? `<img src="${src}" alt="" loading="lazy">` : `<div class="noimg"><span>${j.no}</span>映像なし</div>`}
<figcaption><div class="meta"><b>${j.no}</b><span class="ti">${esc(m.title)}</span><span class="sp">${esc(m.group || m.sport)}</span><span class="t">${j.t ? "▶ " + esc(j.t.padStart(5, "0")) : ""}</span></div>
<p class="seen">${esc(seen)}</p>${echo ? `<p class="echo">${esc(echo)}</p>` : ""}</figcaption></figure>`;
};
const WORDS = Object.keys(R2.result);

// 1) 同じ映像が、言葉ごとに違う一秒で開く
const opens = {};
for (const [tag, R] of [["第1回", R1.result], ["第2回", R2.result]]) for (const [w, x] of Object.entries(R)) for (const b of x.bundles || []) for (const j of b.members) {
  if (!j.t) continue; const t = j.t.padStart(5, "0"); (opens[j.no] = opens[j.no] || []).push({ ...j, t, w, tag });
}
const SHOW = ["033", "071", "026"];
let reopen = "";
for (const no of SHOW) {
  const seenT = new Set(), seenW = new Set(); const rows = [];
  for (const x of opens[no].sort((a, b) => a.t.localeCompare(b.t))) { if (seenT.has(x.t) || seenW.has(x.w)) continue; seenT.add(x.t); seenW.add(x.w); rows.push(x); }
  reopen += `<section class="reopen"><h3><span class="no">${no}</span>${esc(info(no).title)}<span class="sp">${esc(info(no).group)}</span></h3><div class="strip">${rows.map((x) => `<div class="cell"><div class="word">「${esc(x.w)}」</div>${card(x)}</div>`).join("")}</div></section>`;
}

// 2) 言葉ごと（第1回 / 第2回）
const runHtml = (x) => {
  if (!x) return "";
  if (!x.readable) return `<p class="none">読まなかった — ${esc(x.lens?.reason)}</p>`;
  const bs = x.bundles || [];
  const dropped = (x.lens.readings || []).filter((r) => !bs.find((b) => b.name === r.name));
  return `<div class="timing">${((x.T.lens + x.T.embed + x.T.judge) / 1000).toFixed(1)}秒 · 採用 ${Object.keys(x.picked).length}本</div>` +
    (bs.length ? "" : `<p class="none">束ができなかった</p>`) +
    bs.map((b) => `<div class="bundle"><h4>${esc(b.name)}</h4><p class="feel">${esc(b.feeling)}</p><div class="grid">${b.members.map((j) => card(j)).join("")}</div></div>`).join("") +
    (dropped.length ? `<p class="dropped">束にならなかった読み: ${dropped.map((r) => esc(r.name)).join(" / ")}</p>` : "");
};
const words = WORDS.map((w, i) => `<section class="word-sec" id="w${i}"><h2>「${esc(w)}」</h2>
<div class="tabs" role="tablist"><button class="on" data-r="2">第2回</button><button data-r="1">第1回</button></div>
<div class="run" data-r="2">${runHtml(R2.result[w])}</div><div class="run" data-r="1" hidden>${runHtml(R1.result[w])}</div></section>`).join("");

// 3) 合否
const s1 = R1.summary, s2 = R2.summary;
const row = (k, label, a, b, ok) => `<tr><th>${k}</th><td>${label}</td><td>${a}</td><td>${b}</td><td class="${ok}">${{ pass: "合格", fail: "不合格", part: "一部" }[ok]}</td></tr>`;
const n = (s) => Object.values(s.verdict).map((v) => v.n);
const table = `<table><thead><tr><th></th><th>基準（実行前に決めたもの）</th><th>第1回</th><th>第2回</th><th>判定</th></tr></thead><tbody>
${row("K1", "比喩を字面で読まない", "雨の日を雨粒で読み0本", "読み直し後17本", "part")}
${row("K2", "1語6〜24本・言葉どうしの重なり中央値&lt;0.2", `${Math.min(...n(s1))}〜${Math.max(...n(s1))}本 · ${s1.jaccardMedian.toFixed(2)}`, `${Math.min(...n(s2))}〜${Math.max(...n(s2))}本 · ${s2.jaccardMedian.toFixed(2)}`, "part")}
${row("K3", "1語3競技分類以上", "親父だけ1分類", "初恋だけ3、他は4〜6", "pass")}
${row("K4", "複数の言葉に入った映像の6割以上が違う秒で開く", `${s1.reopenDiff}/${s1.reopenBoth}`, `${s2.reopenDiff}/${s2.reopenBoth}`, "pass")}
${row("K5", "同じ言い回しが1語で3本以上に出ない", "ほぼ無し（ただし出来事の言い直し）", "6語で型が出た（〜に自分も頑張ろうと思う 等）", "fail")}
${row("K6", "実フレームが一文と合う（目視）", "約7割", "—（第1回と同じ素材の時刻）", "fail")}
${row("K7", "不適切な言葉は弾く（第1回後に改めた）", "カレーを弾いた", "全部読んだ（不適切は未試験）", "part")}
${row("K8", "1語8秒以内", "9〜21秒", "16〜32秒", "fail")}
</tbody></table>`;

const html = `<title>言葉の読み 検証</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Oswald:wght@500;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#0b0b0c;--panel:#141416;--line:#26262a;--fg:#f2f2ee;--mute:#9a9a93;--acc:#ebff00;--bad:#ff6b5b;--ok:#7dff9b;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:15px/1.7 "Noto Sans JP",system-ui,sans-serif;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
main{max-width:1240px;margin:0 auto;padding-block:40px 80px}
h1{font:900 clamp(26px,4vw,40px)/1.2 "Noto Sans JP",sans-serif;margin:0 0 6px;text-wrap:balance}
.lead{color:var(--mute);max-width:62ch;margin:0 0 40px}
h2{font:900 26px/1.3 "Noto Sans JP",sans-serif;margin:0}
.kicker{font:700 12px/1 Oswald,sans-serif;letter-spacing:.18em;color:var(--acc);margin:56px 0 14px;text-transform:uppercase}
.reopen{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:16px;margin-bottom:16px}
.reopen h3{margin:0 0 12px;font-size:17px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.no{font:700 22px/1 Oswald,sans-serif;color:var(--acc)}
.sp{font-size:12px;color:var(--mute);font-weight:500}
.strip{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.word{font-weight:900;color:var(--acc);margin-bottom:6px;font-size:14px}
.card{margin:0;min-width:0}
.card img,.noimg{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;border-radius:3px;background:#1d1d20}
.noimg{display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--mute);font-size:12px}
.noimg span{font:700 30px/1 Oswald,sans-serif;color:#3a3a40}
figcaption{padding-top:6px}
.meta{font-size:12px;color:var(--mute);display:flex;gap:6px;flex-wrap:wrap;align-items:baseline}
.meta b{color:var(--fg);font-family:Oswald,sans-serif}
.reopen .meta b,.reopen .meta .ti,.reopen .meta .sp{display:none}
.meta .t{color:var(--acc);font-family:Oswald,sans-serif;margin-left:auto}
.seen{margin:4px 0 0;font-size:13px;line-height:1.55}
.echo{margin:4px 0 0;font-size:13px;line-height:1.55;color:var(--acc)}
.word-sec{border-top:1px solid var(--line);padding-top:26px;margin-top:34px}
.tabs{display:flex;gap:6px;margin:10px 0 14px}
.tabs button{background:none;border:1px solid var(--line);color:var(--mute);font:500 13px "Noto Sans JP",sans-serif;padding:4px 12px;border-radius:999px;cursor:pointer}
.tabs button.on{border-color:var(--acc);color:var(--acc)}
.timing{font:500 12px Oswald,sans-serif;letter-spacing:.06em;color:var(--mute);margin-bottom:8px}
.bundle{margin:18px 0 6px}
.bundle h4{display:inline-block;margin:0;background:var(--acc);color:#0b0b0c;font:900 17px/1.35 "Noto Sans JP",sans-serif;padding:2px 10px}
.feel{color:var(--mute);margin:6px 0 10px;font-size:13px;max-width:70ch}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
.dropped,.none{color:var(--mute);font-size:13px}
.tw{overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:640px;font-size:13px}
th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
thead th{color:var(--mute);font-weight:500}
td.pass{color:var(--ok);font-weight:700}td.fail{color:var(--bad);font-weight:700}td.part{color:var(--acc);font-weight:700}
.notes{max-width:70ch}
.notes li{margin-bottom:8px}
</style>
<main>
<div class="kicker">Reading test · 2026-10-15</div>
<h1>言葉が来たときに、100本をその場で読む</h1>
<p class="lead">事前に束は作っていない。各映像を秒ごとの出来事に分解しておき、言葉が来たらその言葉の読みを作り、答える秒を100本から選ぶ。フレームは選ばれた秒の実映像。</p>

<div class="kicker">同じ映像が、言葉ごとに違う一秒で開く</div>
${reopen}

<div class="kicker">10の言葉</div>
${words}

<div class="kicker">合否</div>
<div class="tw">${table}</div>
<div class="kicker">分かったこと</div>
<ul class="notes">
<li>事前の分類なしで、言葉ごとに違う瞬間・違う秒が選ばれる（K4）。「負けて泣いた日」（第1回）は勝者のハイライトの中から敗者の1秒を、「プレゼンで緊張」は打つ・決める直前の1秒を拾った。</li>
<li>読みが「努力が報われる」「仲間と支え合う」「試練を乗り越える」のような定番の物語に流れると、何でも入る束になる。同じ言葉でも回ごとに当たり外れがある。</li>
<li>言葉の側の一文（黄色）は、読みの言い換えを繰り返す型になりやすい。</li>
<li>素材の時刻が実映像と合うのは目視で約7割。1語16〜32秒で、体験としては遅すぎる。</li>
</ul>
</main>
<script>
document.querySelectorAll(".word-sec").forEach(function(sec){sec.querySelectorAll(".tabs button").forEach(function(b){b.addEventListener("click",function(){sec.querySelectorAll(".tabs button").forEach(function(x){x.classList.toggle("on",x===b)});sec.querySelectorAll(".run").forEach(function(r){r.hidden=r.dataset.r!==b.dataset.r})})})});
</script>`;
writeFileSync(out, html);
console.log("written", out, (html.length / 1e6).toFixed(1) + "MB", "frames", imgCache.size);
