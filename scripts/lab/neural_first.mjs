// 初めて開いた人の最初の30秒（スマホ）: 開く → 自動で1本に飛び込み割れて周りに並ぶ → 案内 → 周りを押す → 見方を替える
//   node scripts/lab/neural_first.mjs W H tag   （OUT・CLIPS・BASE は neural_test.mjs と同じ）
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
import { readFileSync, existsSync } from "fs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]], out = process.env.OUT, CL = process.env.CLIPS, BASE = process.env.BASE || "http://localhost:3142";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const sp = W < 600, p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: sp, isMobile: sp });
const logs = []; p.on("pageerror", (e) => logs.push("ERR " + e.message));
if (CL) await p.route("https://storage.googleapis.com/e-mooments-assets/**", async (r) => { const u = new URL(r.request().url()); let f = null, m;
  if ((m = u.pathname.match(/\/ctx\/(.+)$/))) f = `${CL}/ctx/${m[1]}`; else if ((m = u.pathname.match(/m\/([^/]+)\/loop\.(webm|mp4)/))) f = `${CL}/m/${m[1]}.webm`;
  if (f && existsSync(f)) return r.fulfill({ status: 200, headers: { "Content-Type": f.endsWith("jpg") ? "image/jpeg" : "video/webm", "Access-Control-Allow-Origin": "*" }, body: readFileSync(f) }); return r.fulfill({ status: 404, body: "" }); });
const shot = (n) => p.screenshot({ path: `${out}/${tag}_${n}.png` });
const tap = async (x, y) => { if (sp) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); };
await p.goto(`${BASE}/experience`); await p.waitForFunction(() => window.__nw && __nw.ready(), null, { timeout: 120000 });
for (const t of [2, 4, 6, 8]) { await p.waitForTimeout(2000); await shot(`t${t}`); }
console.log("start", JSON.stringify(await p.evaluate(() => ({ s: __nw.stage(), ring: __nw.ringN() }))), await p.locator(".nw-coach").textContent().catch(() => "-"));
const [x, y] = await p.evaluate(() => __nw.ringOf(1)); await tap(x, y); await p.waitForTimeout(3500); await shot("zap1");
console.log("zap", JSON.stringify(await p.evaluate(() => __nw.stage())), await p.locator(".nw-coach").textContent().catch(() => "-"));
await p.locator(".nw-bar .v button").nth(1).click(); await p.waitForTimeout(3000); await shot("dim");
console.log("dim", JSON.stringify(await p.evaluate(() => __nw.stage())), await p.locator(".nw-coach").count());
console.log(logs.join("\n") || "no errors"); await b.close();
