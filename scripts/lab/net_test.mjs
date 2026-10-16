// ネットワークの世界の試作を段階ごとに撮る: node scripts/lab/net_test.mjs W H tag   （OUT=出力先、http.server 3190）
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]], out = process.env.OUT;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: W, height: H } });
const logs = []; p.on("console", (m) => m.type() === "error" && logs.push(m.text())); p.on("pageerror", (e) => logs.push("ERR " + e.message));
await p.goto("http://127.0.0.1:3190/index.html?dtmax=0.6"); await p.waitForFunction(() => window.__n, null, { timeout: 60000 }); await p.waitForTimeout(5000);
const shot = (n) => p.screenshot({ path: `${out}/${tag}_${n}.png` });
await shot("0whole");
const go = (s, d) => p.evaluate(([s, d]) => { __n.setAuto(false); const i = __n.find(s); const q = __n.pos(i); __n.goal.pivot.set(q[0], q[1], q[2]); __n.goal.dist = d; return i; }, [s, d]);
await go("神戸スティーラーズ", 90); await p.waitForTimeout(7000); await shot("1near");
await go("神戸スティーラーズ", 34); await p.waitForTimeout(7000); await shot("2open");
await go("40歳", 12); await p.waitForTimeout(7000); await shot("3event");
await go("40歳", 4.5); await p.waitForTimeout(7000); await shot("4person");
const i = await p.evaluate(() => { const i = __n.find("我が子を腕に抱く"); __n.select(i); return i; }); await p.waitForTimeout(9000); await shot("5select");
console.log(tag, "sel", i, logs.join("\n") || "no errors"); await b.close();
