// コンテキストマップの見本を、判断用の文書（HTML）にする。根拠の1秒の実フレームを添える
//   node scripts/contextmap/render_doc.mjs docs/contextmap/map_sample.json <framesDir> out.html
import { readFileSync, writeFileSync, existsSync } from "fs";
const [inp, fdir, out] = process.argv.slice(2);
const J = JSON.parse(readFileSync(inp, "utf8"));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const img = (id) => existsSync(`${fdir}/${id}.jpg`) ? `data:image/jpeg;base64,${readFileSync(`${fdir}/${id}.jpg`).toString("base64")}` : "";
const byId = Object.fromEntries(J.items.map((x) => [x.id, x]));
// 実フレームを目で見て、説明と合っていなかったもの（AI の時刻が数秒ずれた）
const MISMATCH = new Set((process.env.MISMATCH || "").split(",").filter(Boolean));
const tc = (t) => (t || "").replace(/^0(\d:)/, "$1");
const nosOf = (c) => [...new Set(c.members.map((id) => byId[id]?.no))];
const sportsOf = (c) => [...new Set(c.members.map((id) => byId[id]?.sport))];
const ctx = [...J.contexts].sort((a, b) => sportsOf(b).length - sportsOf(a).length || nosOf(b).length - nosOf(a).length);
const shared = ctx.filter((c) => nosOf(c).length > 1), single = ctx.filter((c) => nosOf(c).length === 1);
const momentList = [...new Map(J.items.map((x) => [x.no, x])).values()];
const card = (id) => { const x = byId[id]; if (!x) return ""; const bad = MISMATCH.has(id); const flags = J.check[id] || [];
  return `<article class="m"><figure>${img(id) ? `<img src="${img(id)}" alt="${esc(x.title)} ${tc(x.t)} のフレーム" loading="lazy">` : `<div class="noimg">映像なし</div>`}<figcaption><b>${tc(x.t)}</b>${bad ? `<span class="warn">フレームが説明とずれている</span>` : ""}</figcaption></figure>
  <div class="mt"><div class="who"><span class="no">${x.no}</span><span>${esc(x.title)}</span><em>${esc(x.sport)}</em></div>
  <p class="ctx">${esc(x.context)}</p><p class="seen"><span>映っているもの</span>${esc(x.seen)}</p><p class="why"><span>なぜ熱くなるか</span>${esc(x.why)}</p>
  ${flags.length ? `<p class="flag"><span>資料で確かめられない事実</span>${flags.map(esc).join(" / ")}</p>` : ""}</div></article>`; };
const section = (c, i) => { const ns = nosOf(c), sp = sportsOf(c);
  const cross = c.links.filter((l) => byId[l.a] && byId[l.b] && byId[l.a].no !== byId[l.b].no), inner = c.links.filter((l) => byId[l.a] && byId[l.b] && byId[l.a].no === byId[l.b].no);
  return `<section class="c" id="c${i}"><header><div class="meta">${ns.length}の瞬間 · ${sp.length}競技</div><h3>${esc(c.name)}</h3><p class="def">${esc(c.definition)}</p></header>
  <div class="ms">${c.members.map(card).join("")}</div>
  ${cross.length ? `<div class="links"><h4>瞬間どうしのつながり</h4>${cross.map((l) => `<div class="lk"><span class="pair">${byId[l.a].no} ${esc(byId[l.a].sport)} ⇄ ${byId[l.b].no} ${esc(byId[l.b].sport)}</span><p>${esc(l.line)}</p></div>`).join("")}</div>` : ""}
  ${inner.length ? `<div class="links in"><h4>同じ瞬間の中のつながり</h4>${inner.map((l) => `<div class="lk"><span class="pair">${byId[l.a].no} ${tc(byId[l.a].t)} → ${tc(byId[l.b].t)}</span><p>${esc(l.line)}</p></div>`).join("")}</div>` : ""}</section>`; };
const html = `<title>コンテキストマップ 見本</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Oswald:wght@500;700&display=swap">
<style>
/* 判断用の文書。文脈ごとに、根拠の1秒（実フレーム）と理由を並べる */
:root { --bg: #f6f5f1; --paper: #ffffff; --ink: #17171a; --sub: #5d5d58; --line: #dedcd4; --acc: #6b7a00; --warn: #b3261e; --mark: #ebff00;
  --body: "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif; --num: "Oswald", "Helvetica Neue", Arial, sans-serif; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0f0f11; --paper: #17171a; --ink: #eeeee8; --sub: #a3a39b; --line: #2c2c30; --acc: #d4e800; --warn: #ff7b72; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #0f0f11; --paper: #17171a; --ink: #eeeee8; --sub: #a3a39b; --line: #2c2c30; --acc: #d4e800; --warn: #ff7b72; color-scheme: dark; }
body { background: var(--bg); color: var(--ink); font: 400 15px/1.8 var(--body); }
.wrap { max-width: 1080px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 40px 80px; }
h1 { font: 900 clamp(24px, 3.4vw, 36px)/1.35 var(--body); margin: 0 0 12px; text-wrap: balance; }
h2 { font: 900 20px/1.4 var(--body); margin: 48px 0 6px; padding-top: 18px; border-top: 2px solid var(--ink); }
.lead { color: var(--sub); max-width: 68ch; margin: 0; }
.how { margin: 20px 0 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.how div { background: var(--paper); border: 1px solid var(--line); padding: 12px 14px; font-size: 14px; min-width: 0; }
.how b { display: block; font-weight: 900; margin-bottom: 2px; }
.toc { margin: 14px 0 0; padding: 0; list-style: none; display: grid; gap: 4px; }
.toc a { color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--line); }
.toc span { font: 500 12px/1 var(--num); color: var(--sub); margin-left: 8px; }
.c { margin-top: 26px; background: var(--paper); border: 1px solid var(--line); padding: 20px; }
.c header .meta { font: 500 12px/1 var(--num); letter-spacing: .08em; color: var(--sub); }
.c h3 { font: 900 clamp(18px, 2.2vw, 23px)/1.45 var(--body); margin: 6px 0 4px; text-wrap: balance; }
.c h3::before { content: ""; display: inline-block; width: 10px; height: 10px; background: var(--mark); border: 1px solid var(--ink); margin-right: 8px; vertical-align: 2px; }
.def { margin: 0; color: var(--sub); font-size: 14px; }
.ms { margin-top: 14px; display: grid; gap: 14px; }
.m { display: grid; grid-template-columns: minmax(0, 240px) minmax(0, 1fr); gap: 14px; border-top: 1px solid var(--line); padding-top: 14px; }
@media (max-width: 640px) { .m { grid-template-columns: minmax(0, 1fr); } }
.m figure { margin: 0; }
.m img, .noimg { width: 100%; max-width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; background: #222; }
.noimg { display: grid; place-items: center; color: #999; font-size: 12px; }
.m figcaption { display: flex; gap: 8px; align-items: center; margin-top: 4px; font: 700 14px/1 var(--num); }
.warn { font: 700 11px/1.4 var(--body); color: var(--warn); }
.who { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.who .no { font: 700 18px/1 var(--num); }
.who span:nth-child(2) { font-weight: 900; }
.who em { font-style: normal; font-size: 12px; color: var(--sub); }
.ctx { margin: 6px 0; font-weight: 700; }
.seen, .why, .flag { margin: 4px 0; font-size: 14px; }
.seen span, .why span, .flag span { display: inline-block; font: 700 11px/1 var(--body); color: var(--sub); border: 1px solid var(--line); padding: 3px 6px; margin-right: 8px; }
.flag { color: var(--warn); }
.flag span { color: var(--warn); border-color: var(--warn); }
.links { margin-top: 16px; border-top: 2px solid var(--ink); padding-top: 10px; display: grid; gap: 8px; }
.links.in { border-top: 1px dashed var(--line); }
.links h4 { margin: 0; font: 900 13px/1.4 var(--body); }
.lk { display: grid; grid-template-columns: minmax(0, 220px) minmax(0, 1fr); gap: 10px; font-size: 14px; }
@media (max-width: 640px) { .lk { grid-template-columns: minmax(0, 1fr); gap: 0; } }
.lk .pair { font: 500 12px/1.6 var(--num); color: var(--acc); }
.lk p { margin: 0; }
.mt { min-width: 0; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl { overflow-x: auto; margin-top: 12px; }
th, td { text-align: left; border-bottom: 1px solid var(--line); padding: 6px 8px; vertical-align: top; }
th { font-weight: 900; white-space: nowrap; }
</style>
<div class="wrap">
  <h1>コンテキストマップ 見本（10本）</h1>
  <p class="lead">100の瞬間を、観る人が熱くなる理由（熱狂の文脈）でつなぐ地図の見本です。固定の分類は当てはめていません。各瞬間について、映像の書き起こしから「なぜ人はこれに熱くなるか」を映像の時刻を根拠に書き出し、同じ理由を生きている瞬間どうしを下から束ねました。</p>
  <div class="how">
    <div><b>文脈</b>観る人が熱くなる理由を、人の言葉で。出来事の種類（逆転・優勝など）や競技用語では書かない。</div>
    <div><b>根拠の1秒</b>その文脈が映像で一番よく見える時刻と、そのフレーム。</div>
    <div><b>つながり</b>同じ文脈を生きている瞬間どうしを、その文脈の言葉で、両方の具体を入れて結ぶ。</div>
  </div>
  <h2>文脈の一覧</h2>
  <p class="lead">10本から${J.contexts.length}の文脈が出ました。複数の瞬間をつなぐ文脈が${shared.length}、その瞬間だけの文脈が${single.length}です。100本に広げると束は変わります。</p>
  <ol class="toc">${ctx.map((c, i) => `<li><a href="#c${ctx.indexOf(c)}">${esc(c.name)}</a><span>${nosOf(c).length}の瞬間 · ${sportsOf(c).length}競技</span></li>`).join("")}</ol>
  <h2>複数の瞬間をつなぐ文脈</h2>
  ${shared.map((c) => section(c, ctx.indexOf(c))).join("")}
  <h2>その瞬間だけの文脈</h2>
  ${single.map((c) => section(c, ctx.indexOf(c))).join("")}
  <h2>瞬間ごとの文脈</h2>
  <div class="tbl"><table><thead><tr><th>瞬間</th><th>文脈（根拠の1秒）</th></tr></thead><tbody>
  ${momentList.map((m) => `<tr><td>${m.no} ${esc(m.title)}<br><span style="color:var(--sub)">${esc(m.sport)}</span></td><td>${J.items.filter((x) => x.no === m.no).map((x) => { const c = ctx.find((c) => c.members.includes(x.id)); return `${tc(x.t)}　${esc(c ? c.name : x.context)}`; }).join("<br>")}</td></tr>`).join("")}
  </tbody></table></div>
  <h2>確かめが必要なこと</h2>
  <p class="lead">理由の文章を元の資料（シートと映像の書き起こし）と機械で照らし合わせ、資料で確かめられない事実を各カードに赤で示しました（${Object.keys(J.check).filter((id) => byId[id]).length}件）。フレームを目で見て説明とずれていたものには「フレームが説明とずれている」を付けました（${[...MISMATCH].filter((id) => byId[id]).length}件。AI が読んだ時刻が数秒ずれている）。どちらも公開前に人の確認が要ります。</p>
</div>`;
writeFileSync(out, html);
console.log("ok", (html.length / 1e6).toFixed(2), "MB", "shared", shared.length, "single", single.length);
