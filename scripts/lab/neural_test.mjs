// 体験 /experience（熱狂の神経系）を通しで操作して撮る: node scripts/lab/neural_test.mjs W H tag
//   OUT=出力先、CLIPS=映像のローカルフォルダ（ctx/c/<id>.webm|jpg, ctx/atlas*.jpg, m/<key>.webm）、BASE=http://localhost:3142、WORD=投げる言葉、NO=入る瞬間
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
import { readFileSync, existsSync } from "fs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]], out = process.env.OUT, CL = process.env.CLIPS, BASE = process.env.BASE || "http://localhost:3142", WORD = process.env.WORD || "最後の花道";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: W < 600, isMobile: W < 600 });
const logs = []; p.on("console", (m) => m.type() === "error" && logs.push(m.text().slice(0, 200))); p.on("pageerror", (e) => logs.push("ERR " + e.message));
const CT = { webm: "video/webm", mp4: "video/mp4", jpg: "image/jpeg" };
await p.route("https://storage.googleapis.com/e-mooments-assets/**", async (r) => {
  const u = new URL(r.request().url()); let f = null, m;
  if ((m = u.pathname.match(/\/ctx\/(.+)$/))) f = `${CL}/ctx/${m[1]}`;
  else if ((m = u.pathname.match(/m\/([^/]+)\/loop\.(webm|mp4)/))) f = `${CL}/m/${m[1]}.webm`;
  if (f && existsSync(f)) return r.fulfill({ status: 200, headers: { "Content-Type": CT[f.split(".").pop()] || "application/octet-stream", "Access-Control-Allow-Origin": "*" }, body: readFileSync(f) });
  return r.fulfill({ status: 404, body: "" });
});
const shot = (n) => p.screenshot({ path: `${out}/${tag}_${n}.png` });
const st = () => p.evaluate(() => { const s = __nw.stage(); return { k: s.k, i: s.i, m: s.m, playing: __nw.playing(), sound: __nw.screenSound() }; });
const tap = async (x, y) => { if (W < 600) await p.touchscreen.tap(x, y); else { await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.up(); } };
const click = async (kind, id) => { const [x, y] = await p.evaluate(([k, i]) => __nw.screenOf(k, i), [kind, id]); await tap(x, y); return [Math.round(x), Math.round(y)]; };
const N = JSON.parse(readFileSync("data/ctx/net.json", "utf8"));
await p.goto(`${BASE}${process.env.PATH_ || "/experience"}${process.env.NO ? `?no=${process.env.NO}` : ""}`); await p.waitForFunction(() => window.__nw && __nw.ready(), null, { timeout: 120000 });
await p.waitForTimeout(4500); await shot("0over");
if (process.env.PATH_) { for (let k = 1; k < 8; k++) { await p.waitForTimeout(2500); await shot(`share${k}`); console.log("share", JSON.stringify(await st())); } console.log(logs.join("\n") || "no errors"); await b.close(); process.exit(0); }
let mk = process.env.NO ? N.moments.findIndex((m) => m.no === process.env.NO) : await p.evaluate(() => __nw.nearSoma());
if (!process.env.NO) console.log("soma", mk, N.moments[mk].title, await click("m", mk));
for (const [t, n] of [[1200, "1fly"], [1800, "1play"], [1500, "1wedge"], [600, "1wedge2"], [2500, "1open"]]) { await p.waitForTimeout(t); await shot(n); }
console.log("moment", JSON.stringify(await st()), logs.join("|"));
const md = await p.evaluate(() => __nw.stage()); if (md.k === "moment") mk = md.m;
const seed = N.moments[mk].ctx[0]; console.log("seed", seed, N.ctx[seed].title, await click("c", seed));
for (const [t, n] of [[1000, "2ex1"], [1500, "2ex2"], [1500, "2ex3"]]) { await p.waitForTimeout(t); await shot(n); }
await p.waitForFunction(() => __nw.stage().k === "digest", null, { timeout: 60000 }).catch(() => {}); await shot("3gather");
console.log("digest", JSON.stringify(await st()), await p.evaluate(() => document.querySelector(".nw-big")?.textContent));
await p.waitForTimeout(3000); await shot("3item0"); await p.waitForTimeout(4000); await shot("3item0b");
await p.waitForFunction(() => __nw.stage().i >= 1, null, { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(2500); await shot("3item1"); console.log("item", JSON.stringify(await st()));
const n = await p.evaluate(() => __nw.stage().d.items.length); await p.click(`.nw-chain button:nth-child(${n})`); await p.waitForTimeout(3000);
await p.waitForFunction(() => __nw.stage().k === "end", null, { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(3000); await shot("4end"); console.log("end", JSON.stringify(await st()));
const share = await p.evaluate(() => document.querySelector(".nw-end a.x")?.getAttribute("href")); console.log("share", decodeURIComponent(share || "").slice(0, 260));
await p.click(".nw-end .b2 button:nth-child(2)"); await p.waitForTimeout(2500);
await p.fill(".nw-in input", WORD); await p.click(".nw-in button"); await p.waitForTimeout(1500); await shot("5word1"); await p.waitForTimeout(2000); await shot("5word2");
await p.waitForFunction(() => __nw.stage().k === "digest", null, { timeout: 60000 }).catch(() => {}); await shot("5gather"); await p.waitForTimeout(3500); await shot("5item0");
console.log("word", JSON.stringify(await st()), await p.evaluate(() => document.querySelector(".nw-big")?.textContent));
console.log(tag, logs.join("\n") || "no errors"); await b.close();
