// /lab/brain の描画の重さを部品ごとに比べる: node scripts/lab/brain_gpu.mjs W H （URL）。swiftshader（CPU で描く）なので絶対値でなく比で見る
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
const [W, H] = [+process.argv[2], +process.argv[3]];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await p.goto(process.env.URL, { timeout: 180000 }); await p.waitForFunction(() => window.__bw && document.querySelector(".bw-q"), null, { timeout: 180000 }); await p.waitForTimeout(6000);
await p.evaluate(() => { __bw.manual(true); __bw.adv(4); });
for (const h of [[], ["fibers"], ["tiles"], ["shell"], ["points", "roots"], ["fibers", "tiles", "shell", "points", "roots"]]) console.log((h.join("+") || "all").padEnd(36), (await p.evaluate((h) => __bw.gpu(h, 6), h)).toFixed(1), "ms");
await b.close();
