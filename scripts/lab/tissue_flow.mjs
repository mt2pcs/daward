// 熱の組織モックを通しで撮る: node scripts/lab/tissue_flow.mjs W H tag （URL・O）。時間を止めて進めながら撮る
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]]; const O = process.env.O, URL = process.env.URL; const sp = W < 600;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: sp, isMobile: sp }); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
const shot = (n) => p.screenshot({ path: `${O}/${tag}_${n}.png` }); const adv = (s) => p.evaluate((s) => __x.adv(s), s);
await p.goto(URL); await p.waitForTimeout(1500); await p.evaluate(() => __x.manual(true)); await adv(4); await shot("0free");
await p.evaluate(() => __x.lock(__x.find("亡き兄に捧げた先制弾"))); await adv(3); await shot("1lock");
await p.locator(".t.tip.go").first().dispatchEvent("pointerup"); await adv(3); await shot("2dim");
const n = await p.locator(".t.peer").count(); console.log("peers", n); await p.locator(".t.peer").nth(1).dispatchEvent("pointerup"); await adv(.75); await shot("3travel"); await adv(1.5); await shot("3arrive");
console.log(JSON.stringify(await p.evaluate(() => __x.st()))); await b.close(); console.log(errs.join("\n") || "no errors");
