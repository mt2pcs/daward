// ピント送りモックを通しで触って撮る: node scripts/lab/focus_flow.mjs W H tag   （URL・O）
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]]; const O = process.env.O, URL = process.env.URL; const sp = W < 600;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: sp, isMobile: sp }); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
const shot = (n) => p.screenshot({ path: `${O}/${tag}_${n}.png` });
const swipe = async (dx) => { const y = H * 0.45, x0 = W / 2 + 60, x1 = x0 + dx; await p.mouse.move(x0, y); await p.mouse.down(); await p.mouse.move(x1, y, { steps: 6 }); await p.mouse.up(); };
await p.goto(URL); await p.waitForTimeout(1200); await shot("0a"); await p.waitForTimeout(2500); await shot("0b");
await swipe(-200); await p.waitForTimeout(500); await shot("1a"); await p.waitForTimeout(2200); await shot("1b"); await swipe(200); await p.waitForTimeout(2600); await shot("1c");
await p.click(".pill"); await p.waitForTimeout(600); await shot("2a"); await p.waitForTimeout(2200); await shot("2b");
await p.click(".pill"); for (const t of [300, 600, 900, 1500]) { await p.waitForTimeout(t === 300 ? 300 : 300); await shot(`3_${t}`); } await p.waitForTimeout(2200); await shot("3b");
await swipe(-200); await p.waitForTimeout(600); await shot("4a"); await p.waitForTimeout(2200); await shot("4b");
console.log(JSON.stringify(await p.evaluate(() => __f.st()))); await b.close(); console.log(errs.join("\n") || "no errors");
