// 「競技を越えて、同じ熱が集まる」（/lab/brain）を通しで撮り、状態の移り変わりを全部たどる: node scripts/lab/brain_flow.mjs W H tag
//   環境変数: URL（/lab/brain）、O（撮った画像の置き場）、VID（051 の元映像を webm にしたもの。headless は H.264 を再生できないので差し替える）
//   時間は __bw.manual/adv で止めて進める。待つところは「その状態になるまで」進める（until）。各段で状態（k・i・ph）と、同時に音が出ている映像の数（1本以下）を確かめる
//   たどる順: 開く → 観る（熱の分解）→ 熱を選ぶ（時を走る→場面）→ 熱狂接続中 → 繋がる → 旅（飛ぶ→繋がり→流れる、を全部）→ 全体図 → シェア → 戻る → 別の熱
//            → 旅の途中（飛行中・繋がり・流れている間）で戻る → また別の熱 → 押して次へ → 旅の途中で「全体を見る」→ 全体図の映像を押す → 観る → 最初へ
//            → 熱狂を探す → 旅 → 全体図 → もう一度 → 最初へ
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
import { readFileSync } from "fs";
const ng = [], log = [];
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]]; const { O, URL, VID } = process.env; const sp = W < 600;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: sp, isMobile: sp }); const errs = []; p.on("pageerror", (e) => errs.push(`[${log.length}] ${(e.stack || e.message).split("\n").slice(0, 4).join(" | ")}`)); p.on("console", (m) => m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text()) && errs.push(m.text()));
if (VID) { const buf = readFileSync(VID); await p.route(/m\/051_01\/detail\.mp4/, (r) => r.fulfill({ status: 200, contentType: "video/webm", body: buf, headers: { "Access-Control-Allow-Origin": "*" } })); }
const shot = (n) => p.screenshot({ path: `${O}/${tag}_${n}.png` }); const adv = (s) => p.evaluate((s) => __bw.adv(s), s); const wait = (ms) => p.waitForTimeout(ms);
const st = () => p.evaluate(() => { const s = __bw.st(), m = __bw.media(); return { k: s.k, i: s.i, ph: s.ph, ready: s.ready, c: s.c, seed: s.seed, n: s.items?.length, snd: m.audible }; });
async function expect(name, want) { const s = await st(); const ok = Object.entries(want).every(([k, v]) => s[k] === v) && s.snd <= 1; log.push(`${ok ? "OK" : "NG"} ${name} ${JSON.stringify(s)}`); if (!ok) ng.push(`${name}: want ${JSON.stringify(want)} got ${JSON.stringify(s)}`); return s; }
// その状態になるまで進める（音が2本以上重なったら、その場で NG）
async function until(name, pred, max = 30) { for (let t = 0; t < max; t += 0.25) { const s = await st(); if (s.snd > 1) ng.push(`${name}: 音が${s.snd}本重なった ${JSON.stringify(s)}`); if (pred(s)) return s; await adv(0.25); await wait(40); } const s = await st(); ng.push(`${name}: ${max}秒たっても来ない ${JSON.stringify(s)}`); return s; }
const labels = (cls) => p.evaluate((cls) => Array.from(document.querySelectorAll(`.bw-t.${cls}`)).filter((e) => e.style.opacity !== "0").map((e) => ({ t: e.textContent, v: e.dataset.v })), cls);
async function clickLabel(cls, text) { return p.evaluate(([cls, text]) => { const e = Array.from(document.querySelectorAll(`.bw-t.${cls}`)).find((e) => e.style.opacity !== "0" && (!text || e.textContent.includes(text))); if (!e) return false; e.click(); return e.textContent; }, [cls, text]); }
// 旅を最後まで: 各行き先で「飛ぶ→繋がり→流れる」が順に来ることを確かめ、繋がりと流れているところを撮る
async function ride(pre, maxShots = 8) { let stops = 0;
  for (let k = 0; k < 10; k++) { const f = await until(`${pre}飛ぶ${k}`, (s) => s.k !== "trip" || (s.i === k && s.ph === "fly"), 20); if (f.k !== "trip") break;
    const l = await until(`${pre}繋がり${k}`, (s) => s.k !== "trip" || (s.i === k && s.ph === "link"), 12); if (l.k !== "trip") break; await wait(1300); if (k < maxShots) await shot(`${pre}link${k}`);
    const pl = await until(`${pre}流れる${k}`, (s) => s.k !== "trip" || (s.i === k && s.ph === "play"), 6); if (pl.k !== "trip") break; await adv(0.8); await wait(600); if (k < maxShots) await shot(`${pre}play${k}`);
    const m = await p.evaluate(() => __bw.media()); if (m.audible !== 1) ng.push(`${pre}流れる${k}: 音の出ている映像が ${m.audible} 本`);
    stops++; if (k === (await st()).n - 1) break; }
  return stops; }

await p.goto(URL, { timeout: 180000 }); await p.waitForFunction(() => window.__bw && document.querySelector(".bw-q"), null, { timeout: 180000 }); await wait(2500);
await p.evaluate(() => __bw.manual(true)); await adv(4); await wait(400); await shot("00free"); await expect("開く", { k: "free" });

// ===== 観る: 熱の分解 =====
const c0 = await p.evaluate(() => __bw.find("亡き兄に捧げた先制弾"));
await p.evaluate((c) => __bw.watch(__bw.momOf(c)), c0); await wait(2500);
await until("観る（熱が採れる）", (s) => s.k === "watch" && s.ready, 12); await wait(1200); await shot("02watch");
const hw = await labels("hw"); log.push(`  熱の言葉 ${hw.length}: ${hw.map((x) => x.t).join(" / ")}`); if (hw.length < 4) ng.push(`熱の言葉が少ない ${hw.length}`);

// ===== 熱を選ぶ → 時を走る → 場面 → 熱狂接続中 → 繋がる → 旅 =====
log.push(`  押した: ${await clickLabel("hw", "亡き兄")}`); await expect("熱を選ぶ", { k: "scrub" });
await until("時を走る→場面", (s) => s.k === "trip" && s.i === -2, 14); await shot("06conn"); await expect("熱狂接続中", { k: "trip", i: -2 });
await until("繋がる", (s) => s.i === -1, 6); await wait(300); await shot("07linked");
const n1 = await ride("09_"); log.push(`  行き先 ${n1}`);
await until("全体図", (s) => s.k === "map", 20); await adv(2.5); await wait(1200); await shot("10map"); await expect("全体図", { k: "map" });
const ht = await labels("ht"); log.push(`  全体図の名前 ${ht.length}: ${ht.map((x) => x.t).join(" / ")}`);
await p.click(".bw-map .pill"); await wait(500); await shot("11share"); const link = await p.evaluate(() => document.querySelector(".bw-share .sh a")?.getAttribute("href") || ""); log.push(`  シェア ${decodeURIComponent(link).slice(0, 120)}`);
await p.click(".bw-share .x"); await wait(300);

// ===== 戻る → 別の熱（前回のバグの場面）→ 旅の途中のいろいろな所で戻る =====
await p.click(".bw-close"); await wait(2000); await until("戻る→観る", (s) => s.k === "watch" && s.ready, 12); await wait(1200); await shot("12back"); await expect("戻った", { k: "watch" });
let hw2 = await labels("hw"); const other = hw2.find((x) => !x.t.includes("亡き兄")); log.push(`  押した: ${await clickLabel("hw", other?.t)}`); await expect("別の熱を選ぶ", { k: "scrub" });
await until("別の熱→接続", (s) => s.k === "trip" && s.i === -2, 14);
for (const ph of ["fly", "link", "play"]) {
  await until(`旅の${ph}まで`, (s) => s.k === "trip" && s.i === 0 && s.ph === ph, 20); await adv(0.5); await p.click(".bw-close"); await adv(0.1); await expect(`旅の${ph}で戻る`, { k: "watch" });
  await wait(1200); await until(`旅の${ph}で戻った後`, (s) => s.k === "watch" && s.ready, 12); await wait(800); if (ph === "play") await shot("16back_play");
  const q1 = await p.evaluate(() => __bw.queue()); if (q1 > 2) ng.push(`戻った後の予定が多い ${q1}`);
  if (ph !== "play") { hw2 = await labels("hw"); await clickLabel("hw", hw2[(ph === "fly" ? 2 : 3) % hw2.length].t); await until("また別の熱→接続", (s) => s.k === "trip" && s.i === -2, 14); } }
// 押して次へ（繋がり→流れる→次の行き先）、途中で「全体を見る」
hw2 = await labels("hw"); await clickLabel("hw", hw2[hw2.length - 1].t); await until("最後の熱→接続", (s) => s.k === "trip" && s.i === -2, 14);
await until("押して次へ: 繋がり", (s) => s.i === 0 && s.ph === "link", 20); await p.click(".bw-stop"); await adv(0.1); await expect("押すと流れる", { k: "trip", i: 0, ph: "play" });
await p.click(".bw-stop"); await adv(0.1); await expect("押すと次へ", { k: "trip", i: 1, ph: "fly" });
await adv(1.0); await p.click(".bw-stop .skip"); await adv(0.1); await expect("全体を見る", { k: "map" }); await adv(2.5); await wait(1200); await shot("17skip_map");
const ht3 = await labels("ht"); await clickLabel("ht", ht3[0]?.t?.slice(-6)); await adv(0.2); await expect("全体図の映像を押す", { k: "watch" }); await wait(1500);
await until("別の映像の熱", (s) => s.k === "watch" && s.ready, 12); await wait(1000); await shot("18watch_other");
await p.click(".bw-close"); await adv(2.5); await wait(900); await expect("最初へ", { k: "free" }); await shot("19free_again");

// ===== 熱狂を探す =====
await p.fill(".bw-q input", "ベテランの意地"); await p.click(".bw-q button"); await adv(0.8); await wait(300); await shot("20search"); log.push(`  探す直後 ${JSON.stringify(await st())}`);
await p.waitForFunction(() => __bw.st().k === "trip", null, { timeout: 90000 }).catch(() => {}); await adv(1.2); await shot("21search_conn"); await expect("探す→接続", { k: "trip", seed: -1 });
const n2 = await ride("23_", 2); log.push(`  行き先(探す) ${n2}`);
await until("探す→全体図", (s) => s.k === "map", 20); await adv(2.5); await wait(1200); await shot("24search_map"); await expect("探す→全体図", { k: "map", seed: -1 });
await p.click(".bw-map .ghost"); await adv(0.3); await expect("もう一度", { k: "trip", i: -2 }); await adv(0.5);
await p.click(".bw-close"); await adv(2.5); await expect("最初へ2", { k: "free" }); await shot("25free_end");
const mm = await p.evaluate(() => __bw.media()); if (mm.playing > 3) ng.push(`最初の画面で流れている映像が多い ${mm.playing}`);

console.log(log.join("\n")); console.log(ng.length ? `NG ${ng.length}\n${ng.join("\n")}` : "全段 OK"); console.log(errs.slice(0, 8).join("\n") || "エラーなし"); await b.close();
