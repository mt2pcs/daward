// 本体の体験（/experience）の現状確認: node scripts/lab/exp_check.mjs W H tag（OUT=撮影先）
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]], out = process.env.OUT;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: W, height: H } });
const logs = []; p.on("console", (m) => m.type() === "error" && logs.push(m.text().slice(0, 160))); p.on("pageerror", (e) => logs.push("ERR " + e.message));
await p.goto("http://localhost:3142/experience?dtmax=0.5", { waitUntil: "load", timeout: 90000 });
const shot = (n) => p.screenshot({ path: `${out}/${tag}_${n}.png` });
await p.waitForTimeout(6000); await shot("0entrance");
const btn = p.locator("button", { hasText: /飛び込む|入る|ENTER/ }).first();
if (await btn.count()) await btn.click({ timeout: 5000 }).catch(() => {}); else await p.mouse.click(W / 2, H / 2);
await p.waitForTimeout(12000); await shot("1space");
const inp = p.locator("input, textarea").first();
if (await inp.count()) { await inp.fill("ベテランの熱量"); await inp.press("Enter"); }
await p.waitForTimeout(4000); await shot("2pending"); await p.waitForTimeout(14000); await shot("3arms");
console.log(tag, logs.slice(0, 8).join("\n") || "no errors"); await b.close();
