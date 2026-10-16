// 動きの試作の状態を空間の時計で止めて撮る: node scripts/lab/motion_test.mjs W H tag（OUT=撮影先、python http.server 3180 で配信）
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]], out = process.env.OUT;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: W, height: H } });
const logs = []; p.on("console", (m) => m.type() === "error" && logs.push(m.text())); p.on("pageerror", (e) => logs.push("ERR " + e.message));
await p.goto("http://127.0.0.1:3180/index.html?dtmax=0.35");
await p.waitForFunction(() => window.__m, null, { timeout: 60000 });
const at = async (t, n) => {
  await p.waitForFunction((t) => __m.now >= t, t, { timeout: 120000, polling: 50 });
  await p.evaluate(() => (window.__hold = true)); await p.waitForTimeout(150);
  await p.screenshot({ path: `${out}/${tag}_${n}.png` }); await p.evaluate(() => (window.__hold = false));
};
await at(0.5, "00"); await at(2.6, "01"); await at(3.6, "02"); await at(4.6, "03"); await at(6.0, "04"); await at(8.0, "05");
const seq = (process.env.WORDS || "家族,最後").split(",");
for (const w of seq) {
  const t0 = await p.evaluate((w) => { __m.choose(w); return __m.now; }, w);
  const off = (await p.evaluate(() => __m.proc().length)) && (w === seq[0] ? 0 : 2.2);
  for (const [dt, n] of [[off + 0.8, "a"], [off + 1.8, "b"], [off + 3.0, "c"], [off + 4.0, "d"], [off + 5.0, "e"], [off + 6.8, "f"]]) await at(t0 + dt, `${w}_${n}`);
}
console.log(tag, "fps", await p.evaluate(() => __m.fps.toFixed(1)), logs.join("\n") || "no errors"); await b.close();
