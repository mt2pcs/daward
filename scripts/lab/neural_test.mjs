// 体験 /experience（熱狂の神経系）を通しで操作して撮る: node scripts/lab/neural_test.mjs W H tag
//   OUT=出力先、CLIPS=映像のローカルフォルダ（ctx/c/<id>.webm|jpg, ctx/atlas*.jpg, m/<key>.webm）、BASE=http://localhost:3142、WORD=投げる言葉、PATH_=/d/<code>（シェアを開く）
// 流れ: 全体 → 航路で跳ぶ → ホイールで寄る（動き出す・文脈の世界） → 瞬間をロックオン → 分解 → 文脈をロックオン → 視点 → 視点の先へ渡る → この熱で探す → ダイジェスト → 終わり → 言葉
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
import { readFileSync, existsSync } from "fs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]], out = process.env.OUT, CL = process.env.CLIPS, BASE = process.env.BASE || "http://localhost:3142", WORD = process.env.WORD || "最後の花道";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const sp = W < 600, p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: sp, isMobile: sp });
const logs = []; p.on("console", (m) => m.type() === "error" && !/404/.test(m.text()) && logs.push(m.text().slice(0, 200))); p.on("pageerror", (e) => logs.push("ERR " + e.message));
const CT = { webm: "video/webm", mp4: "video/mp4", jpg: "image/jpeg" };
await p.route("https://storage.googleapis.com/e-mooments-assets/**", async (r) => {
  const u = new URL(r.request().url()); let f = null, m;
  if ((m = u.pathname.match(/\/ctx\/(.+)$/))) f = `${CL}/ctx/${m[1]}`;
  else if ((m = u.pathname.match(/m\/([^/]+)\/loop\.(webm|mp4)/))) f = `${CL}/m/${m[1]}.webm`;
  if (f && existsSync(f)) return r.fulfill({ status: 200, headers: { "Content-Type": CT[f.split(".").pop()] || "application/octet-stream", "Access-Control-Allow-Origin": "*" }, body: readFileSync(f) });
  return r.fulfill({ status: 404, body: "" });
});
const shot = (n) => p.screenshot({ path: `${out}/${tag}_${n}.png` });
const st = () => p.evaluate(() => { const s = __nw.stage(); return { k: s.k, kind: s.kind, id: s.id, mode: s.mode, i: s.i, playing: __nw.playing(), sound: __nw.screenSound(), ring: __nw.ringN() }; });
const tap = async (x, y) => { if (sp) await p.touchscreen.tap(x, y); else { await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.up(); } };
const click = async (kind, id) => { const [x, y] = await p.evaluate(([k, i]) => __nw.screenOf(k, i), [kind, id]); await tap(x, y); return [Math.round(x), Math.round(y)]; };
const N = JSON.parse(readFileSync("data/ctx/net.json", "utf8"));
await p.goto(`${BASE}${process.env.PATH_ || "/experience"}`); await p.waitForFunction(() => window.__nw && __nw.ready(), null, { timeout: 120000 });
await p.waitForTimeout(5000); await shot("0free");
if (process.env.PATH_) { for (let k = 1; k < 6; k++) { await p.waitForTimeout(2500); await shot(`share${k}`); console.log("share", JSON.stringify(await st())); } console.log(logs.join("\n") || "no errors"); await b.close(); process.exit(0); }
const ring = async (k) => { const [x, y, o, id] = await p.evaluate((k) => __nw.ringOf(k), k); await tap(x, y); return [Math.round(x), Math.round(y), id, N.ctx[id]?.title]; };
console.log("dest", await p.locator(".nw-dest button").count());
await p.locator(".nw-dest button").first().click(); await p.waitForTimeout(600); await shot("1jump_a"); await p.waitForTimeout(3000); await shot("1jump_b");
console.log("jump", JSON.stringify(await st()));
if (!sp) { for (let k = 0; k < 5; k++) { await p.mouse.move(W / 2, H / 2); await p.mouse.wheel(0, -260); await p.waitForTimeout(300); } await p.waitForTimeout(3000); await shot("2zoom"); }
const mk = await p.evaluate(() => __nw.nearSoma()); console.log("lock m", mk, N.moments[mk]?.title, await click("m", mk));
await p.waitForTimeout(1500); await shot("3m_play"); await p.waitForTimeout(1600); await shot("3m_burst"); await p.waitForTimeout(2500); await shot("3m_ring"); console.log(JSON.stringify(await st()), "ring", await p.evaluate(() => __nw.ringN()));
console.log("tap ring", await ring(0)); await p.waitForTimeout(800); await shot("4c_a"); await p.waitForTimeout(2500); await shot("4c"); console.log(JSON.stringify(await st()), "ring", await p.evaluate(() => __nw.ringN()));
const nd = await p.locator(".nw-bar .v button").count(); console.log("dims", nd);
if (nd > 1) { await p.locator(".nw-bar .v button").nth(1).click(); await p.waitForTimeout(700); await shot("5dim_a"); await p.waitForTimeout(2200); await shot("5dim"); console.log("dim", JSON.stringify(await st())); }
console.log("zap", await ring(1)); await p.waitForTimeout(800); await shot("6zap_a"); await p.waitForTimeout(2600); await shot("6zap"); console.log(JSON.stringify(await st()));
console.log("zap2", await ring(2)); await p.waitForTimeout(3200); await shot("7zap2"); console.log(JSON.stringify(await st()));
await p.click(".nw-bar .a .go"); await p.waitForTimeout(2500); await shot("8ex");
await p.waitForFunction(() => __nw.stage().k === "digest", null, { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(3500); await shot("9dg"); console.log("digest", JSON.stringify(await st()));
const n = await p.evaluate(() => __nw.stage().d?.items.length || 0); if (n) { await p.click(`.nw-chain button:nth-child(${n})`); await p.waitForFunction(() => __nw.stage().k === "end", null, { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(3000); await shot("10end"); }
const share = await p.evaluate(() => document.querySelector(".nw-end a.x")?.getAttribute("href")); console.log("share", (share || "").slice(-120));
await p.click(".nw-end .b2 button:nth-child(2)").catch(() => {}); await p.waitForTimeout(2000);
await p.fill(".nw-in input", WORD); await p.click(".nw-in button"); await p.waitForFunction(() => __nw.stage().k === "digest", null, { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(3000); await shot("11word"); console.log("word", JSON.stringify(await st()));
console.log(tag, logs.join("\n") || "no errors"); await b.close();
