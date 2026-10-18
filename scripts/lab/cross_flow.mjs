// 熱の横断モックを通しで撮る: node scripts/lab/cross_flow.mjs W H tag （URL・O）。時間を止めて進めながら撮る（__x.manual/adv）
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]]; const O = process.env.O, URL = process.env.URL; const sp = W < 600;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: sp, isMobile: sp }); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
const shot = (n) => p.screenshot({ path: `${O}/${tag}_${n}.png` }); const adv = (s) => p.evaluate((s) => __x.adv(s), s);
await p.goto(URL); await p.waitForTimeout(1500); await p.evaluate(() => __x.manual(true)); await adv(3); await shot("0world");
await p.evaluate(() => __x.hold(__x.find("亡き兄に捧げた先制弾"))); await adv(.5); await shot("1a"); await adv(.5); await shot("1b"); await adv(2.5); await shot("1c");
await p.click(".facet:nth-child(2)"); await adv(.6); await shot("2a"); await adv(2.5); await shot("2b");
// 来た熱を押す（ザッピング）
const box = await p.evaluate(() => { const s = __x.st(); return s; }); await p.mouse.click(W * (sp ? .3 : .12), H * (sp ? .55 : .42)); await adv(3); await shot("3zap");
await p.click("[data-act=play]"); await adv(1.5); await shot("4play"); await p.evaluate(() => new Promise((r) => setTimeout(r, 2700))); await adv(1.5); await shot("4play2");
console.log(JSON.stringify(await p.evaluate(() => __x.st()))); await b.close(); console.log(errs.join("\n") || "no errors");
