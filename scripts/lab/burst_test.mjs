// かけらの炸裂の操作確認: node scripts/lab/burst_test.mjs W H tag（OUT=撮影先、python http.server 3180 で配信）
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]], out = process.env.OUT;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: W, height: H } });
const logs = []; p.on("console", (m) => m.type() === "error" && logs.push(m.text())); p.on("pageerror", (e) => logs.push("ERR " + e.message));
await p.goto("http://127.0.0.1:3180/index.html"); await p.waitForTimeout(1000);
const shot = (n) => p.screenshot({ path: `${out}/${tag}_${n}.png` });
await shot("0intro"); await p.waitForTimeout(5000); await shot("1burst");
// 光線の上のかけら（中心以外で見えているもの）を1つ押す
const clickOn = async (name) => { const r = await p.evaluate((name) => { const i = __b.F.findIndex((f) => f.nm === name); return __b.screen(i); }, name); await p.mouse.click(r[0], r[1]); };
const vis = () => p.evaluate(() => __b.plates.filter((x) => x.cur.o > 0.9 && x.f.i !== __b.center).map((x) => x.f.nm));
console.log(tag, "rays:", (await vis()).join(" / "));
await clickOn("崩れ落ちるプレンガ"); await p.waitForTimeout(700); await shot("2mid"); await p.waitForTimeout(3500); await shot("3re");
console.log(tag, "center", await p.evaluate(() => __b.F[__b.center].nm), "rays:", (await vis()).join(" / "));
const v = await vis(); await clickOn(v[v.length - 1]); await p.waitForTimeout(4000); await shot("4re2");
console.log(tag, "center", await p.evaluate(() => __b.F[__b.center].nm));
console.log(tag, logs.join("\n") || "no errors"); await b.close();
