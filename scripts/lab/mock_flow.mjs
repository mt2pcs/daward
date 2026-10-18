// UIモックを通しで触って撮る: node scripts/lab/mock_flow.mjs W H tag   （URL=モックのURL、O=出力先）
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]]; const O = process.env.O, URL = process.env.URL; const sp = W < 600;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: sp, isMobile: sp }); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
const shot = (n) => p.screenshot({ path: `${O}/${tag}_${n}.png` }); const tap = async (x, y) => { if (sp) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); };
const st = () => p.evaluate(() => { const s = __m.st(); return [s.k, s.mode, s.ph, s.i, s.dim].filter((x) => x !== undefined).join(":"); });
const at = (k, i) => p.evaluate(([k, i]) => __m.at(k, i), [k, i]);
const tapCell = async (k, ids, want) => { for (let r = 0; r < 4; r++) for (const id of ids) { const q = await at(k, id); if (!(q[1] < H - 260 && q[1] > 80 && q[0] > 30 && q[0] < W - 30 && q[2] < 1)) continue; await tap(q[0], q[1]); await p.waitForTimeout(400); if ((await st()).startsWith(want)) return id; } return null; };
await p.goto(URL); await p.waitForTimeout(3500); await shot("0");
if (!sp) { for (let k = 0; k < 5; k++) { await p.mouse.move(W / 2, H / 2); await p.mouse.wheel(0, -300); await p.waitForTimeout(250); } await p.waitForTimeout(2500); await shot("1zoom"); }
const c = await p.evaluate(() => __m.center()); let [x, y] = await at("m", c); await tap(x, y); await p.waitForTimeout(2500); await shot("2lockm"); console.log(await st());
await p.locator('[data-mode="open"]').click(); await p.waitForTimeout(2500); await shot("3open"); console.log(await st());
const ids = await p.evaluate((i) => __m.D.m[i][2], c); console.log("tap ctx", await tapCell("c", ids, "lockc")); await p.waitForTimeout(2800); await shot("4lockc"); console.log(await st());
const chips = await p.locator("[data-dim]").count(); if (chips > 1) { await p.locator("[data-dim]").nth(1).click(); await p.waitForTimeout(2800); await shot("5dim"); console.log(await st());
  const s = await p.evaluate(() => __m.st()); const tgs = await p.evaluate(([i, d]) => __m.D.c[i][5][d], [s.i, s.dim]); console.log("zap", await tapCell("c", tgs, "lockc:" + tgs[0] ? "lockc" : "lockc")); await p.waitForTimeout(2800); await shot("6zap"); console.log(await st()); }
await p.locator("[data-explore]").first().click(); await p.waitForTimeout(1500); await shot("7scan"); await p.waitForTimeout(2500); await shot("8roads"); await p.waitForTimeout(2500); await shot("9found"); console.log(await st());
await p.locator("[data-digest]").click(); await p.waitForTimeout(1500); await shot("10dg"); await p.waitForTimeout(4200); await shot("11dg2"); console.log(await st());
await p.locator("[data-share]").click(); await p.waitForTimeout(1000); await shot("12end"); console.log(await st());
await b.close(); console.log(errs.join("\n") || "no errors");
