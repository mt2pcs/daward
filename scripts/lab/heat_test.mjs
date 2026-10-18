// 体験 /experience（HeatViewer）を通しで操作して撮る: node scripts/lab/heat_test.mjs W H tag
//   OUT=出力先、CLIPS=映像のローカルフォルダ（ctx/c/<id>.webm|jpg, ctx/atlas*.jpg, m/<key>.webm）、BASE、WORD
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
import { readFileSync, existsSync } from "fs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]], out = process.env.OUT, CL = process.env.CLIPS, BASE = process.env.BASE || "http://localhost:3142", WORD = process.env.WORD || "親父";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const sp = W < 600, p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: sp, isMobile: sp });
const logs = []; p.on("pageerror", (e) => logs.push("ERR " + e.message));
if (CL) await p.route("https://storage.googleapis.com/e-mooments-assets/**", async (r) => { const u = new URL(r.request().url()); let f = null, m;
  if ((m = u.pathname.match(/\/ctx\/(.+)$/))) f = `${CL}/ctx/${m[1]}`; else if ((m = u.pathname.match(/m\/([^/]+)\/loop\.(webm|mp4)/))) f = `${CL}/m/${m[1]}.webm`;
  if (f && existsSync(f)) return r.fulfill({ status: 200, headers: { "Content-Type": f.endsWith("jpg") ? "image/jpeg" : "video/webm", "Access-Control-Allow-Origin": "*" }, body: readFileSync(f) }); return r.fulfill({ status: 404, body: "" }); });
const shot = (n) => p.screenshot({ path: `${out}/${tag}_${n}.png` });
const tap = async (x, y) => { if (sp) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); };
const mode = () => p.evaluate(() => { const m = __hv.mode(); return m.k + (m.phase ? ":" + m.phase : "") + (m.i !== undefined ? ":" + m.i : ""); });
await p.goto(`${BASE}/experience`); await p.waitForFunction(() => window.__hv && __hv.ready(), null, { timeout: 120000 });
await p.waitForTimeout(5000); await shot("0home");
let c = null; for (let k = 0; k < 20 && c === null; k++) { c = await p.evaluate(() => __hv.center()); if (c === null) await p.waitForTimeout(500); }
const r = await p.evaluate((i) => __hv.tileAt(i), c); console.log("tile", c, r); await tap(r.x, r.y);
await p.waitForTimeout(250); await shot("1grow_a"); await p.waitForTimeout(500); await shot("1grow_b"); await p.waitForTimeout(2500); await shot("1play"); console.log(await mode());
await p.locator(".hv-split").click(); await p.waitForTimeout(200); await shot("2split_a"); await p.waitForTimeout(400); await shot("2split_b"); await p.waitForTimeout(900); await shot("2cards_a"); await p.waitForTimeout(1800); await shot("2cards"); console.log(await mode());
await p.waitForFunction(() => __hv.mode().phase === "cards", null, { timeout: 20000 }); await p.waitForTimeout(800); await p.locator(".hv-card").first().click(); await p.waitForTimeout(1200); await shot("3scan_a"); await p.waitForTimeout(1600); await shot("3scan_b");
await p.waitForFunction(() => __hv.mode().phase === "reveal", null, { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(600); await shot("3rev_a"); await p.waitForTimeout(1200); await shot("3rev_b"); await p.waitForTimeout(1500); await shot("3rev_c");
await p.waitForFunction(() => __hv.mode().phase === "gather", null, { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(300); await shot("3gather_a"); await p.waitForTimeout(1500); await shot("3gather"); console.log(await mode());
await p.waitForFunction(() => __hv.mode().k === "digest", null, { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(400); await shot("4dg_a"); await p.waitForTimeout(2500); await shot("4dg"); console.log(await mode());
await p.waitForFunction(() => __hv.mode().k === "end", null, { timeout: 90000 }).catch(() => {}); await p.waitForTimeout(1500); await shot("5end"); console.log(await mode());
await p.locator(".hv-end .b2 button").nth(1).click(); await p.waitForTimeout(2500);
await p.fill(".hv-in input", WORD); await p.click(".hv-in button"); await p.waitForTimeout(2500); await shot("6word");
await p.waitForFunction(() => __hv.mode().k === "digest", null, { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(2500); await shot("6dg"); console.log(await mode());
console.log(tag, logs.join("\n") || "no errors"); await b.close();
