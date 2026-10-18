// 「競技を越えて、同じ熱が集まる」（/lab/brain）を通しで撮る: node scripts/lab/brain_flow.mjs W H tag （URL・O、VID=051 の元映像を webm にしたもの）
//   headless は H.264 を再生できないので、元映像（detail.mp4）の要求を VID の webm に差し替える。時間は __bw.manual/adv で止めて進める
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
import { readFileSync } from "fs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]]; const { O, URL, VID } = process.env; const sp = W < 600;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: sp, isMobile: sp }); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
if (VID) { const buf = readFileSync(VID); await p.route(/m\/051_01\/detail\.mp4/, (r) => r.fulfill({ status: 200, contentType: "video/webm", body: buf, headers: { "Access-Control-Allow-Origin": "*" } })); }
const shot = (n) => p.screenshot({ path: `${O}/${tag}_${n}.png` }); const adv = (s) => p.evaluate((s) => __bw.adv(s), s); const wait = (ms) => p.waitForTimeout(ms);
await p.goto(URL, { timeout: 180000 }); await p.waitForFunction(() => window.__bw && document.querySelector(".bw-q"), null, { timeout: 180000 }); await wait(1500);
await p.evaluate(() => __bw.manual(true)); await adv(4); await shot("0free");
const c = await p.evaluate(() => __bw.find("亡き兄に捧げた先制弾"));
await p.evaluate((c) => __bw.watch(__bw.momOf(c)), c); await wait(3000); await adv(2.5); await shot("1watch");
await p.evaluate((c) => __bw.heat(c), c); for (let i = 0; i < 5; i++) { await adv(0.17); await wait(150); await shot(`2scrub${i}`); } await adv(0.4); await shot("3slam"); await wait(1500); await adv(2.5); await shot("4heat");
await p.click(".bw-watch .pill"); for (const t of [0.6, 1.4, 2.4, 3.4]) { await adv(t === 0.6 ? 0.6 : t - [0.6, 1.4, 2.4, 3.4][[0.6, 1.4, 2.4, 3.4].indexOf(t) - 1]); await shot(`5gather_${t}`); }
await wait(2500); await shot("6digest"); await p.click(".bw-dg .skip"); await wait(300); await shot("7end"); await p.click(".bw-dg .row .pill"); await wait(1500); await adv(1.5); await wait(1500); await adv(2); await shot("7back");
for (let i = 0; i < 3 && (await p.locator(".bw-close").count()); i++) { await p.click(".bw-close"); await wait(400); await adv(0.5); }
await p.fill(".bw-q input", "ベテランの意地").catch(() => {}); if (await p.locator(".bw-q").count()) { await p.click(".bw-q button"); await adv(1); await shot("8search"); await p.waitForFunction(() => __bw.st().k === "word", null, { timeout: 90000 }).catch(() => {}); await adv(3); await shot("9word"); }
console.log(JSON.stringify(await p.evaluate(() => __bw.st().k))); await b.close(); console.log(errs.slice(0, 8).join("\n") || "no errors");
