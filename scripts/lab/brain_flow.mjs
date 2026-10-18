// 「競技を越えて、同じ熱が集まる」（/lab/brain）を通しで撮り、状態の移り変わりを全部たどる: node scripts/lab/brain_flow.mjs W H tag
//   環境変数: URL（/lab/brain）、O（撮った画像の置き場）、VID（051 の元映像を webm にしたもの。headless は H.264 を再生できないので差し替える）
//   時間は __bw.manual/adv で止めて進める。各段で状態（k・i）を確かめ、期待と違えば NG を出して最後に数える
//   たどる順: 開く → 観る（抜き取り）→ 熱を選ぶ（コマ飛び→場面）→ 熱狂接続中 → 繋がる → 旅（1本ずつ）→ 全体図 → シェア → 戻る → 別の熱 → 旅の途中で戻る
//            → また別の熱 → 旅の途中で「全体を見る」→ 全体図の映像を押す → 観る → 最初へ → 熱狂を探す → 旅 → 全体図 → 最初へ
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
import { readFileSync } from "fs";
const ng = [], log = [];
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]]; const { O, URL, VID } = process.env; const sp = W < 600;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: sp, isMobile: sp }); const errs = []; p.on("pageerror", (e) => errs.push(`[${log.length}] ${(e.stack || e.message).split("\n").slice(0, 4).join(" | ")}`)); p.on("console", (m) => m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text()) && errs.push(m.text()));
if (VID) { const buf = readFileSync(VID); await p.route(/m\/051_01\/detail\.mp4/, (r) => r.fulfill({ status: 200, contentType: "video/webm", body: buf, headers: { "Access-Control-Allow-Origin": "*" } })); }
const shot = (n) => p.screenshot({ path: `${O}/${tag}_${n}.png` }); const adv = (s) => p.evaluate((s) => __bw.adv(s), s); const wait = (ms) => p.waitForTimeout(ms);
const st = () => p.evaluate(() => { const s = __bw.st(); return { k: s.k, i: s.i, mv: s.mv, ready: s.ready, c: s.c, seed: s.seed, n: s.items?.length }; });

async function expect(name, want) { const s = await st(); const ok = Object.entries(want).every(([k, v]) => s[k] === v); log.push(`${ok ? "OK" : "NG"} ${name} ${JSON.stringify(s)}`); if (!ok) ng.push(`${name}: want ${JSON.stringify(want)} got ${JSON.stringify(s)}`); return s; }
// 画面の文字（押せる熱の言葉・全体図の名前）を、見えているものだけ数える
const labels = (cls) => p.evaluate((cls) => Array.from(document.querySelectorAll(`.bw-t.${cls}`)).filter((e) => e.style.opacity !== "0").map((e) => ({ t: e.textContent, v: e.dataset.v })), cls);
async function clickLabel(cls, text) { const ok = await p.evaluate(([cls, text]) => { const e = Array.from(document.querySelectorAll(`.bw-t.${cls}`)).find((e) => e.style.opacity !== "0" && (!text || e.textContent.includes(text))); if (!e) return false; e.click(); return e.textContent; }, [cls, text]); return ok; }
// 旅を最後まで進める（各行き先で1枚撮る）
async function ride(pre, maxStops = 8) { let s = await st(), stops = 0;
  for (let k = 0; k < 120 && s.k === "trip"; k++) { await adv(0.5); const t = await st(); if (t.k === "trip" && t.i >= 0 && !t.mv && (s.i !== t.i || s.mv)) { stops++; await adv(0.6); await wait(700); if (stops <= maxStops) await shot(`${pre}stop${t.i}`); } s = await st(); }
  return stops; }

await p.goto(URL, { timeout: 180000 }); await p.waitForFunction(() => window.__bw && document.querySelector(".bw-q"), null, { timeout: 180000 }); await wait(1500);
await p.evaluate(() => __bw.manual(true)); await adv(4); await wait(400); await shot("00free"); await expect("開く", { k: "free" });

// ===== 観る: 抜き取り（DNA を採るように映像から熱が剥がれて言葉になる）=====
const c0 = await p.evaluate(() => __bw.find("亡き兄に捧げた先制弾"));
await p.evaluate((c) => __bw.watch(__bw.momOf(c)), c0); await wait(2500); await adv(1.2);
for (const [n, t] of [["a", 0.35], ["b", 0.45], ["c", 0.5], ["d", 1.2]]) { await adv(t); await wait(250); await shot(`01ext_${n}`); }
await adv(0.4); await wait(1200); await shot("02watch"); await expect("観る（抜き取り後）", { k: "watch", ready: true });
const hw = await labels("hw"); log.push(`  熱の言葉 ${hw.length}: ${hw.map((x) => x.t).join(" / ")}`); if (hw.length < 4) ng.push(`熱の言葉が少ない ${hw.length}`);

// ===== 熱を選ぶ → コマ飛び → 場面 → 熱狂接続中 → 繋がる → 旅 =====
const pick1 = await clickLabel("hw", "亡き兄"); log.push(`  押した: ${pick1}`); await expect("熱を選ぶ", { k: "scrub" });
for (let i = 0; i < 5; i++) { await adv(0.17); await wait(120); await shot(`03scrub${i}`); }
await adv(0.3); await wait(200); await shot("04slam"); await adv(1.4); await shot("05scene");
await adv(1.4); await expect("場面のあと接続へ", { k: "trip", i: -2 }); await wait(300); await shot("06conn_a"); await adv(0.45); await shot("06conn_b"); await adv(0.9); await wait(300); await shot("06conn_c");
await adv(1.5); await expect("繋がる", { k: "trip", i: -1 }); await wait(300); await shot("07linked");
await adv(1.0); await shot("08fly_a"); await adv(0.6); await shot("08fly_b");
const n1 = await ride("09_"); log.push(`  行き先 ${n1}`);
await adv(2.5); await wait(1200); await shot("10map"); await expect("全体図", { k: "map" });
const ht = await labels("ht"); log.push(`  全体図の名前 ${ht.length}: ${ht.map((x) => x.t).join(" / ")}`);
await p.click(".bw-map .pill"); await wait(500); await shot("11share"); const link = await p.evaluate(() => document.querySelector(".bw-share .sh a")?.getAttribute("href") || ""); log.push(`  シェア ${decodeURIComponent(link).slice(0, 140)}`);
await p.click(".bw-share .x"); await wait(300);

// ===== 戻る → 別の熱（前回のバグの場面）=====
await p.click(".bw-close"); await wait(2500); await adv(1.2); await adv(3.0); await wait(1200); await shot("12back"); await expect("戻る→観る", { k: "watch", ready: true });
const hw2 = await labels("hw"); const other = hw2.find((x) => !x.t.includes("亡き兄")); const pick2 = await clickLabel("hw", other?.t); log.push(`  押した: ${pick2}`);
await expect("別の熱を選ぶ", { k: "scrub" }); await adv(1.3); await wait(200); await shot("13slam2"); await adv(3.2); await expect("接続中", { k: "trip", i: -2 }); await shot("14conn2");
await adv(2.8); await expect("繋がる2", { k: "trip", i: -1 }); await adv(2.0); await adv(2.2); await expect("旅1本目", { k: "trip", i: 0 }); await wait(700); await shot("15stop0");
// 旅の途中で戻る（飛んでいる最中）
await adv(4.6); const mid = await st(); log.push(`  途中 ${JSON.stringify(mid)}`); await p.click(".bw-close"); await adv(0.1); await expect("旅の途中で戻る", { k: "watch" }); await adv(1.5); await wait(1500); await adv(2.6); await wait(1200); await shot("16back_mid"); await expect("戻った後", { k: "watch", ready: true });
const q1 = await p.evaluate(() => __bw.queue()); log.push(`  予定の残り ${q1}`);

// また別の熱 → 旅の途中で「全体を見る」
const hw3 = await labels("hw"); const third = hw3[hw3.length - 1]; await clickLabel("hw", third.t); log.push(`  押した: ${third.t}`);
await adv(1.3); await adv(3.2); await adv(2.8); await adv(2.0); await adv(2.2); await expect("旅1本目(3)", { k: "trip", i: 0 }); await adv(4.5);
await p.click(".bw-stop .skip"); await adv(0.1); await expect("全体を見る", { k: "map" }); await adv(2.5); await wait(1200); await shot("17skip_map");
// 全体図の映像の名前を押す → その映像を観る
const ht3 = await labels("ht"); const tgt = ht3[0]; await clickLabel("ht", tgt?.t?.slice(-6)); await adv(0.2); await expect("全体図の映像を押す", { k: "watch" }); await wait(1500); await adv(5.2); await wait(1200); await shot("18watch_other");
const hw4 = await labels("hw"); log.push(`  別の映像の熱の言葉 ${hw4.length}`);
// 最初へ
await p.click(".bw-close"); await adv(2.5); await wait(500); await expect("最初へ", { k: "free" }); await shot("19free_again");

// ===== 熱狂を探す =====
await p.fill(".bw-q input", "ベテランの意地"); await p.click(".bw-q button"); await adv(0.8); await wait(300); await shot("20search"); log.push(`  探す直後 ${JSON.stringify(await st())}`);
await p.waitForFunction(() => __bw.st().k === "trip", null, { timeout: 90000 }).catch(() => {}); await adv(1.2); await shot("21search_conn"); await expect("探す→接続", { k: "trip", seed: -1 });
await adv(1.6); await adv(1.0); await wait(300); await shot("22search_linked");
const n2 = await ride("23_", 3); log.push(`  行き先(探す) ${n2}`); await adv(2.5); await wait(1200); await shot("24search_map"); await expect("探す→全体図", { k: "map", seed: -1 });
await p.click(".bw-map .ghost"); await adv(0.3); await expect("もう一度", { k: "trip", i: -2 }); await adv(0.5);
await p.click(".bw-close"); await adv(2.5); await expect("最初へ2", { k: "free" }); await shot("25free_end");

console.log(log.join("\n")); console.log(ng.length ? `NG ${ng.length}\n${ng.join("\n")}` : "全段 OK"); console.log(errs.slice(0, 8).join("\n") || "エラーなし"); await b.close();
