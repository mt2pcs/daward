// 体験の試作 /lab/net を通しで操作して撮る: node scripts/lab/net_world_test.mjs W H tag
//   OUT=出力先、CLIPS=かけらの映像のローカルフォルダ（バケットの lab/net/ を置き換える）、BASE=http://localhost:3142
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
import { readFileSync, existsSync } from "fs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]], out = process.env.OUT, CL = process.env.CLIPS, BASE = process.env.BASE || "http://localhost:3142";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: W, height: H } });
const logs = []; p.on("console", (m) => m.type() === "error" && logs.push(m.text().slice(0, 200))); p.on("pageerror", (e) => logs.push("ERR " + e.message));
const CT = { webm: "video/webm", mp4: "video/mp4", jpg: "image/jpeg" };
await p.route("https://storage.googleapis.com/e-mooments-assets/**", async (r) => {
  const u = new URL(r.request().url()), m = u.pathname.match(/lab\/net\/(.+)$/);
  let f = m ? `${CL}/${m[1]}` : null;
  if (!m) { const mm = u.pathname.match(/m\/(\d{3})_\d+\/loop\.(webm|mp4)/); if (mm) { const Wd = JSON.parse(readFileSync("data/net/world.json", "utf8")); const mo = Wd.moments.find((x) => x.no === mm[1]); if (mo) f = `${CL}/c/${mo.people[0]}.webm`; } }
  if (f && existsSync(f)) return r.fulfill({ status: 200, headers: { "Content-Type": CT[f.split(".").pop()] || "application/octet-stream", "Access-Control-Allow-Origin": "*" }, body: readFileSync(f) });
  return r.fulfill({ status: 404, body: "" });
});
const shot = (n) => p.screenshot({ path: `${out}/${tag}_${n}.png` });
const info = () => p.evaluate(() => ({ playing: __net.playing() }));
await p.goto(`${BASE}/lab/net`); await p.waitForFunction(() => window.__net, null, { timeout: 120000 }); await p.waitForTimeout(7000); await shot("0uni");
const click = async (kind, id) => { const [x, y] = await p.evaluate(([k, i]) => __net.screenOf(k, i), [kind, id]); await p.mouse.click(x, y); return [Math.round(x), Math.round(y)]; };
const mk = await p.evaluate(() => fetch("/lab/net/world.json").then((r) => r.json()).then((W) => W.moments.findIndex((m) => m.no === "090")));
console.log("open", await click("m", mk), logs.join("|")); await p.waitForTimeout(6000); await shot("1open"); console.log("open", JSON.stringify(await info()));
const Wd = JSON.parse(readFileSync("data/net/world.json", "utf8")); const mo = Wd.moments[mk];
const deg = (i) => Wd.links.filter((l) => l[0] === i || l[1] === i).length; const pick = mo.people.slice().sort((a, c) => deg(c) - deg(a))[0]; console.log("logs", logs.join("|"));
console.log("focus", pick, Wd.people[pick].state, await click("p", pick)); await p.waitForTimeout(7000); await shot("2focus"); console.log("focus", JSON.stringify(await info()));
const ring = await p.evaluate(() => __net.ring()); const nxt = ring[1] ?? ring[0];
console.log("zap", nxt, Wd.people[nxt]?.state, await click("p", nxt)); await p.waitForTimeout(7000); await shot("3zap");
await p.fill(".nw-in input", "親父"); await p.click(".nw-in button"); await p.waitForTimeout(1500); await shot("4reading");
await p.waitForFunction(() => !document.querySelector(".nw-in button").disabled, null, { timeout: 60000 }); await p.waitForTimeout(6000); await shot("5word"); console.log("word", JSON.stringify(await info()));
const r2 = await p.evaluate(() => __net.ring()); if (r2.length) { await click("p", r2[0]); await p.waitForTimeout(7000); await shot("6fromword"); }
console.log(tag, logs.join("\n") || "no errors"); await b.close();
