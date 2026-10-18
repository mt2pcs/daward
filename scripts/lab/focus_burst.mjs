// ピント送りモックの「なぜ熱い？」の割れ方を連続で撮る: node scripts/lab/focus_burst.mjs W H tag （URL・O）
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]]; const O = process.env.O, URL = process.env.URL; const sp = W < 600;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: sp, isMobile: sp });
await p.goto(URL); await p.waitForTimeout(2500); await p.click(".pill"); await p.waitForTimeout(3000); await p.evaluate(() => __f.manual(true)); await p.click(".pill");
// 時間を止め、0.15 秒ずつ進めて撮る
for (let i = 0; i < 15; i++) { await p.evaluate((i) => __f.adv(i ? 0.15 : 0.05), i); await p.screenshot({ path: `${O}/${tag}_b${String(i).padStart(2, "0")}.png` }); }
await b.close();
