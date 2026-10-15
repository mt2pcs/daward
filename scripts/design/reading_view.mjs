// 言葉を切り替えると100本が組み替わる様子を確かめるビューア（検証用。体験の画面ではない）。
//   node scripts/design/reading_view.mjs docs/design/reading/round3.json <framesDir> <thumbsDir> <out.html>
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";
const [inp, fdir, tdir, out] = process.argv.slice(2);
const D = JSON.parse(readFileSync(inp, "utf8"));
const MM = JSON.parse(readFileSync("data/moments2026.json", "utf8")); const MOM = Array.isArray(MM) ? MM : MM.moments;
mkdirSync(tdir, { recursive: true });
const b64 = (f) => "data:image/jpeg;base64," + readFileSync(f).toString("base64");
// 100本のサムネ（小さく）
const moments = MOM.map((m) => {
  const u = m.clips?.[0]?.thumb; let thumb = null;
  if (u) { const f = `${tdir}/${m.no}.jpg`; try { if (!existsSync(f)) execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", u, "-vf", "scale=160:-2", "-q:v", "7", f]); thumb = b64(f); } catch {} }
  return { no: m.no, title: m.title, group: m.group, thumb };
});
const words = Object.entries(D.result).filter(([, r]) => r.readable).map(([w, r]) => ({
  w, bundles: r.bundles.map((b) => ({ name: b.name, feeling: b.feeling, members: b.members.map((j) => {
    const t = (j.tv || j.t || "").padStart(5, "0"); const f = j.t ? `${fdir}/${j.no}_${t.replace(":", "")}.jpg` : "";
    return { no: j.no, t: j.t ? t : "", seen: j.seen, echo: j.echo, vok: j.vok, frame: f && existsSync(f) ? b64(f) : null };
  }) })),
}));
const data = JSON.stringify({ moments, words });

const html = `<title>言葉で組み替わる100本</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Oswald:wght@500;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#0a0a0b;--panel:#131315;--line:#25252a;--fg:#f3f3ef;--mute:#8f8f88;--acc:#ebff00;color-scheme:dark}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--fg);font:15px/1.7 "Noto Sans JP",system-ui,sans-serif;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
main{max-width:1240px;margin:0 auto;padding-block:28px 80px}
.words{display:flex;flex-wrap:wrap;gap:8px;position:sticky;top:env(safe-area-inset-top,0px);background:var(--bg);padding-block:12px;z-index:2}
.words button{background:none;border:1px solid var(--line);color:var(--fg);font:700 15px "Noto Sans JP",sans-serif;padding:7px 14px;border-radius:999px;cursor:pointer}
.words button.on{background:var(--acc);border-color:var(--acc);color:#0a0a0b}
.hundred{display:grid;grid-template-columns:repeat(20,1fr);gap:3px;margin:10px 0 6px}
.tile{aspect-ratio:16/9;border-radius:2px;background:#1b1b1e center/cover;position:relative;opacity:.16;filter:grayscale(1);transition:opacity .5s,filter .5s,outline-color .5s;outline:2px solid transparent;outline-offset:-2px}
.tile.in{opacity:1;filter:none}
.tile .n{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 10px Oswald,sans-serif;color:#55555c}
.count{font:500 13px Oswald,sans-serif;letter-spacing:.05em;color:var(--mute);margin-bottom:6px}
.bundle{margin-top:30px}
.bundle h2{display:inline-block;margin:0;font:900 clamp(18px,2.4vw,24px)/1.35 "Noto Sans JP",sans-serif;padding:2px 12px;color:#0a0a0b}
.feel{color:var(--mute);font-size:13px;margin:6px 0 12px;max-width:72ch}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.card{margin:0;min-width:0}
.card .img{width:100%;aspect-ratio:16/9;border-radius:3px;background:#1b1b1e center/cover;position:relative}
.card .img .n{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 34px Oswald,sans-serif;color:#3a3a40}
.meta{font-size:12px;color:var(--mute);display:flex;gap:6px;align-items:baseline;margin-top:6px}
.meta b{font-family:Oswald,sans-serif;color:var(--fg)}
.meta .t{margin-left:auto;font-family:Oswald,sans-serif;color:var(--acc);white-space:nowrap}
.ti{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.seen{margin:4px 0 0;font-size:13px;line-height:1.55}
.echo{margin:3px 0 0;font-size:13px;line-height:1.55;font-weight:700}
.warn{font-size:11px;color:#ff8a7a;margin-top:3px}
.other{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.other button{background:none;border:1px solid var(--line);color:var(--mute);font:500 11px "Noto Sans JP",sans-serif;padding:1px 8px;border-radius:999px;cursor:pointer}
.other button:hover{color:var(--fg);border-color:var(--mute)}
@media (max-width:640px){.hundred{grid-template-columns:repeat(10,1fr)}}
</style>
<main>
<div class="words" id="words"></div>
<div class="hundred" id="hundred"></div>
<div class="count" id="count"></div>
<div id="bundles"></div>
</main>
<script>
var D=${data};
var COLORS=["#ebff00","#ff5a3c","#3cd2ff","#b86bff"];
var byNo={};D.moments.forEach(function(m){byNo[m.no]=m});
// 瞬間 → この瞬間が開いた言葉と秒
var opens={};D.words.forEach(function(w){w.bundles.forEach(function(b){b.members.forEach(function(j){(opens[j.no]=opens[j.no]||[]).push({w:w.w,t:j.t})})})});
var wordsEl=document.getElementById("words"),hundred=document.getElementById("hundred"),bundlesEl=document.getElementById("bundles"),countEl=document.getElementById("count");
var tiles={};
D.moments.forEach(function(m){var d=document.createElement("div");d.className="tile";if(m.thumb)d.style.backgroundImage="url("+m.thumb+")";else d.innerHTML='<span class="n">'+m.no+'</span>';d.title=m.no+" "+m.title;hundred.appendChild(d);tiles[m.no]=d});
D.words.forEach(function(w,i){var b=document.createElement("button");b.textContent=w.w;b.onclick=function(){show(i)};wordsEl.appendChild(b)});
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function show(i){
  var w=D.words[i];
  [].forEach.call(wordsEl.children,function(b,k){b.classList.toggle("on",k===i)});
  var inSet={},groups={};
  w.bundles.forEach(function(b,k){b.members.forEach(function(j){inSet[j.no]=COLORS[k%COLORS.length]})});
  Object.keys(tiles).forEach(function(no){var t=tiles[no];var c=inSet[no];t.classList.toggle("in",!!c);t.style.outlineColor=c||"transparent"});
  var nos=Object.keys(inSet);nos.forEach(function(no){groups[byNo[no].group]=1});
  countEl.textContent="100本のうち "+nos.length+"本 · "+Object.keys(groups).length+"競技分類";
  bundlesEl.innerHTML=w.bundles.map(function(b,k){var c=COLORS[k%COLORS.length];
    return '<section class="bundle"><h2 style="background:'+c+'">'+esc(b.name)+'</h2><p class="feel">'+esc(b.feeling)+'</p><div class="grid">'+b.members.map(function(j){var m=byNo[j.no];
      var other=(opens[j.no]||[]).filter(function(o){return o.w!==w.w});
      return '<figure class="card"><div class="img" style="'+(j.frame?'background-image:url('+j.frame+')':'')+'">'+(j.frame?'':'<span class="n">'+j.no+'</span>')+'</div>'+
        '<div class="meta"><b>'+j.no+'</b><span class="ti">'+esc(m.title)+'</span><span class="t">'+(j.t?'▶ '+j.t:'映像なし')+'</span></div>'+
        '<p class="seen">'+esc(j.seen)+'</p><p class="echo" style="color:'+c+'">'+esc(j.echo)+'</p>'+(j.t&&j.vok===false?'<div class="warn">この秒の映像は一文と合わない</div>':'')+
        (other.length?'<div class="other">'+other.map(function(o){return '<button data-w="'+esc(o.w)+'">「'+esc(o.w)+'」'+(o.t?' '+o.t:'')+'</button>'}).join("")+'</div>':'')+'</figure>'}).join("")+'</div></section>'}).join("");
  [].forEach.call(bundlesEl.querySelectorAll(".other button"),function(btn){btn.onclick=function(){var k=D.words.findIndex(function(x){return x.w===btn.dataset.w});if(k>=0){show(k);window.scrollTo({top:0,behavior:"smooth"})}}});
}
show(0);
</script>`;
writeFileSync(out, html);
console.log("written", out, (html.length / 1e6).toFixed(1) + "MB");
