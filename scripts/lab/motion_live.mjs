// 通常再生での確認: 言葉を押す→先頭の映像が流れるか→行列の3枚目を押して先頭が替わるか。node scripts/lab/motion_live.mjs W H tag
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]], out = process.env.OUT;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: W, height: H } });
const logs = []; p.on("console", (m) => m.type() === "error" && logs.push(m.text())); p.on("pageerror", (e) => logs.push("ERR " + e.message));
await p.goto("http://127.0.0.1:3180/index.html?dtmax=0.5");
await p.waitForFunction(() => window.__m && __m.state === "whole", null, { timeout: 120000, polling: 200 });
await p.getByText("打たれた側", { exact: true }).click();
await p.waitForFunction(() => __m.state === "proc", null, { timeout: 120000, polling: 200 });
await p.waitForTimeout(3000);
const v1 = await p.evaluate(() => ({ head: __m.head(), t: __m.video.currentTime, src: __m.video.currentSrc.split("/").pop(), err: __m.video.error && __m.video.error.code, tex: __m.usingVideo() }));
await p.screenshot({ path: `${out}/live_${tag}_1.png` });
const xy = await p.evaluate(() => __m.screenOf(2)); await p.mouse.click(xy[0], xy[1]);
await p.waitForTimeout(5000);
const v2 = await p.evaluate(() => ({ head: __m.head(), t: __m.video.currentTime, src: __m.video.currentSrc.split("/").pop(), tex: __m.usingVideo() }));
await p.screenshot({ path: `${out}/live_${tag}_2.png` });
console.log(tag, JSON.stringify(v1), JSON.stringify(v2), "click", xy.map(Math.round).join(","), logs.join("\n") || "no errors"); await b.close();
