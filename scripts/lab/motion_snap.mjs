// 配置の確認用: 状態を直接置いて撮る。node scripts/lab/motion_snap.mjs W H tag "whole|lift:家族|proc:家族" [cp(JSON)]
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
const [W, H, tag, list, cp] = [+process.argv[2], +process.argv[3], process.argv[4], process.argv[5], process.argv[6]], out = process.env.OUT;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: W, height: H } });
const logs = []; p.on("console", (m) => m.type() === "error" && logs.push(m.text())); p.on("pageerror", (e) => logs.push("ERR " + e.message));
await p.goto("http://127.0.0.1:3180/index.html" + (cp ? "?cp=" + encodeURIComponent(cp) : ""));
await p.waitForFunction(() => window.__m && __m.now > 0.3, null, { timeout: 60000 });
for (const it of list.split("|")) { const [n, w] = it.split(":"); await p.evaluate(([n, w]) => __m.snap(n, w), [n, w]); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}/${tag}_${n}${w ? "_" + w : ""}.png` }); }
console.log(tag, logs.join("\n") || "no errors"); await b.close();
