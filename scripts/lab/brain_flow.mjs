// 熱狂の脳を通しで撮る: node scripts/lab/brain_flow.mjs W H tag （URL=…/lab/brain・O=出力先）。時間を止めて進めながら撮る（__bw.manual/adv）
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]]; const O = process.env.O, URL = process.env.URL; const sp = W < 600;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: sp, isMobile: sp }); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
const shot = (n) => p.screenshot({ path: `${O}/${tag}_${n}.png` }); const adv = (s) => p.evaluate((s) => __bw.adv(s), s); const wait = (ms) => p.waitForTimeout(ms);
await p.goto(URL, { timeout: 120000 }); await p.waitForFunction(() => window.__bw && document.querySelector(".bw-legend"), null, { timeout: 120000 }); await wait(1500);
await p.evaluate(() => __bw.manual(true)); await adv(1.2); await shot("0intro"); await adv(3); await shot("1whole");
await p.click(".bw-legend button:nth-child(1)"); await adv(.5); await shot("2tract_a"); await adv(2); await shot("2tract");
const c = await p.evaluate(() => __bw.find("亡き兄に捧げた先制弾")); const m = await p.evaluate((c) => { const s = __bw; return c; }, c);
await p.evaluate(() => __bw.select({ k: "moment", m: 36 })); await wait(1500); await adv(2.5); await shot("3moment");
await p.evaluate((c) => __bw.select({ k: "heat", c, d: 0 }), c); await adv(.6); await shot("4heat_a"); await wait(2500); await adv(2.5); await shot("4heat");
const peers = await p.evaluate((c) => __bw.peers(c, 0).map((x) => x.j), c); console.log("peers", peers.length);
await p.evaluate(([c, j]) => __bw.travelTo(c, j, 0), [c, peers[1]]); for (const t of [0.6, 1.4, 2.2, 3, 3.8, 4.6]) { await adv(.8); await shot(`5fly_${t}`); } await adv(1.5); await wait(2000); await adv(1); await shot("6arrive");
await p.click(".bw-card .pill"); await wait(2500); await shot("7digest");
console.log(JSON.stringify(await p.evaluate(() => __bw.st()))); await b.close(); console.log(errs.slice(0, 8).join("\n") || "no errors");
