// コマを押して渡っていく（ザッピング）を実際のクリックで撮る: node scripts/lab/net_zap.mjs W H tag   （OUT=出力先、http.server 3190）
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]], out = process.env.OUT;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: W, height: H } });
const logs = []; p.on("console", (m) => m.type() === "error" && logs.push(m.text())); p.on("pageerror", (e) => logs.push("ERR " + e.message));
await p.goto("http://127.0.0.1:3190/index.html?dtmax=0.6"); await p.waitForFunction(() => window.__n); await p.waitForTimeout(5000);
const shot = (n) => p.screenshot({ path: `${out}/${tag}_${n}.png` });
await shot("0whole");
// 吉田麻也の瞬間のあたりへ寄る
for (let k = 0; k < 5; k++) { await p.evaluate(() => { __n.setAuto(false); const i = __n.find("吉田麻也アイスランド"); const q = __n.pos(i); __n.goal.pivot.set(q[0], q[1], q[2]); __n.goal.dist = 70; }); await p.waitForTimeout(1200); }
await shot("1near");
// 画面上のコマを実際にクリックする: 指定の人のコマの画面位置
const clickOn = async (s) => { const xy = await p.evaluate((s) => { const i = __n.find(s); const q = __n.pos(i); const v = new (__n.V3())(q[0], q[1], q[2]); return __n.proj(i); }, s); await p.mouse.click(xy[0], xy[1]); return xy; };
const c1 = await clickOn("吉田麻也｜"); await p.waitForTimeout(2500); await shot("2sel_mid"); await p.waitForTimeout(5000); await shot("3sel");
const lit = await p.evaluate(() => __n.litPeople()); console.log("lit", JSON.stringify(lit));
if (lit.length) { const xy = await p.evaluate((i) => __n.proj(i), lit[0][0]); await p.mouse.click(xy[0], xy[1]); await p.waitForTimeout(7500); await shot("4zap"); console.log("zap to", lit[0][1], "sel", await p.evaluate(() => __n.sel())); }
console.log(tag, "click", c1, logs.join("\n") || "no errors"); await b.close();
