// 体験 /experience（炸裂 × かけら）を通しで操作して撮る: node scripts/lab/burst_world_test.mjs W H tag
//   OUT=出力先、CLIPS=映像のローカルフォルダ（c/<i>.webm, m/<key>.webm, atlas0/1.jpg）、BASE=http://localhost:3142、WORD=投げる言葉
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
import { readFileSync, existsSync } from "fs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]], out = process.env.OUT, CL = process.env.CLIPS, BASE = process.env.BASE || "http://localhost:3142", WORD = process.env.WORD || "親父";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: W < 600, isMobile: W < 600 });
const logs = []; p.on("console", (m) => m.type() === "error" && logs.push(m.text().slice(0, 200))); p.on("pageerror", (e) => logs.push("ERR " + e.message));
const CT = { webm: "video/webm", mp4: "video/mp4", jpg: "image/jpeg" };
await p.route("https://storage.googleapis.com/e-mooments-assets/**", async (r) => {
  const u = new URL(r.request().url()); let f = null, m;
  if ((m = u.pathname.match(/lab\/net\/(.+)$/))) f = `${CL}/${m[1]}`;
  else if ((m = u.pathname.match(/m\/([^/]+)\/loop\.(webm|mp4)/))) f = `${CL}/m/${m[1]}.webm`;
  if (f && existsSync(f)) return r.fulfill({ status: 200, headers: { "Content-Type": CT[f.split(".").pop()] || "application/octet-stream", "Access-Control-Allow-Origin": "*" }, body: readFileSync(f) });
  return r.fulfill({ status: 404, body: "" });
});
const shot = (n) => p.screenshot({ path: `${out}/${tag}_${n}.png` });
const info = () => p.evaluate(() => ({ playing: __bw.playing(), sound: __bw.sound(), mode: __bw.mode().kind }));
const tap = async (x, y) => { if (W < 600) await p.touchscreen.tap(x, y); else { await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.up(); } };
const click = async (kind, id) => { const [x, y] = await p.evaluate(([k, i]) => __bw.screenOf(k, i), [kind, id]); await tap(x, y); return [Math.round(x), Math.round(y)]; };
const Wd = JSON.parse(readFileSync("data/net/world.json", "utf8"));
await p.goto(`${BASE}/experience${process.env.NO ? `?no=${process.env.NO}` : ""}`); await p.waitForFunction(() => window.__bw && __bw.ready(), null, { timeout: 120000 });
await p.waitForTimeout(6000); await shot("0stream"); await p.waitForTimeout(1500); await shot("0stream_b"); console.log("stream", JSON.stringify(await info()));
let mk = Wd.moments.findIndex((m) => m.no === (process.env.M || "090"));
if (!process.env.NO) { mk = (await p.evaluate(() => __bw.near()))[0]; console.log("open", mk, Wd.moments[mk].title, await click("m", mk)); }
await p.waitForTimeout(1200); await shot("1open_a"); await p.waitForTimeout(5000); await shot("1open"); console.log("open", JSON.stringify(await info()), logs.join("|"));
const md = await p.evaluate(() => __bw.mode()); if (md.kind === "open") mk = md.m; console.log("opened", mk, Wd.moments[mk].title);
const mo = Wd.moments[mk], deg = (i) => Wd.links.filter((l) => l[0] === i || l[1] === i).length, pick = mo.people.slice().sort((a, c) => deg(c) - deg(a))[0];
console.log("focus", pick, Wd.people[pick].state, await click("p", pick)); await p.waitForTimeout(700); await shot("2focus_a"); await p.waitForTimeout(6000); await shot("2focus"); console.log("focus", JSON.stringify(await info()));
const ring = await p.evaluate(() => __bw.ring()); const nxt = ring[2] ?? ring[0];
console.log("zap", nxt, Wd.people[nxt]?.state, await click("p", nxt)); await p.waitForTimeout(700); await shot("3zap_a"); await p.waitForTimeout(6000); await shot("3zap"); console.log("zap", JSON.stringify(await info()));
await p.click(".bw-acts button"); await p.waitForTimeout(3000); await shot("4watch"); console.log("watch", JSON.stringify(await info())); await p.click(".bw-acts button"); await p.waitForTimeout(2000);
await p.fill(".bw-in input", WORD); await p.click(".bw-in button"); await p.waitForTimeout(1500); await shot("5reading");
await p.waitForFunction(() => !document.querySelector(".bw-in button").disabled, null, { timeout: 60000 }); await p.waitForTimeout(1000); await shot("6word_a"); await p.waitForTimeout(5000); await shot("6word"); console.log("word", JSON.stringify(await info()));
const r2 = await p.evaluate(() => __bw.ring()); if (r2.length) { await click("p", r2[0]); await p.waitForTimeout(6500); await shot("7fromword"); console.log("fromword", JSON.stringify(await info())); }
console.log(tag, logs.join("\n") || "no errors"); await b.close();
