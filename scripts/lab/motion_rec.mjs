// 動きを連続で記録する（CDP screencast）。遅回し（ts）で描かせ、実時間の速さの mp4 に戻す。
//   node scripts/lab/motion_rec.mjs W H tag [ts=0.25]   （OUT=出力先、python http.server 3180 で配信）
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
import { writeFileSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]], TS = +(process.argv[5] || 0.25), out = process.env.OUT;
const dir = `${out}/rec_${tag}`; mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: W, height: H } });
const logs = []; p.on("console", (m) => m.type() === "error" && logs.push(m.text())); p.on("pageerror", (e) => logs.push("ERR " + e.message));
await p.goto(`http://127.0.0.1:3180/index.html?ts=${TS}&dtmax=${0.06 * TS}`);
await p.waitForFunction(() => window.__m, null, { timeout: 60000 });
const cdp = await p.context().newCDPSession(p); const frames = [];
cdp.on("Page.screencastFrame", async (f) => { frames.push({ t: f.metadata.timestamp, d: f.data }); await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}); });
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, everyNthFrame: 1 });
const simWait = (t) => p.waitForFunction((t) => __m.now >= t, t, { timeout: 600000, polling: 100 });
const marks = [];
const mark = async (n) => marks.push([n, await p.evaluate(() => __m.now)]);
await simWait(8.5); await mark("家族");
await p.evaluate(() => __m.choose("家族")); let t0 = await p.evaluate(() => __m.now); await simWait(t0 + 8); await mark("最後");
await p.evaluate(() => __m.choose("最後")); t0 = await p.evaluate(() => __m.now); await simWait(t0 + 10.5); await mark("tap3");
await p.evaluate(() => __m.setHead(3)); t0 = await p.evaluate(() => __m.now); await simWait(t0 + 3.5);
await cdp.send("Page.stopScreencast"); await p.waitForTimeout(300);
const st = await p.evaluate(() => ({ fps: __m.fps, now: __m.now }));
await b.close();
// 実時間に戻す: 記録の経過 × ts
let list = ""; frames.forEach((f, k) => { writeFileSync(`${dir}/${String(k).padStart(5, "0")}.jpg`, Buffer.from(f.d, "base64"));
  const dur = k + 1 < frames.length ? (frames[k + 1].t - f.t) * TS : 0.04; list += `file '${String(k).padStart(5, "0")}.jpg'\nduration ${dur.toFixed(4)}\n`; });
writeFileSync(`${dir}/list.txt`, list);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`, "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", `${out}/rec_${tag}.mp4`]);
console.log(tag, "frames", frames.length, "sim", st.now.toFixed(1), "marks", JSON.stringify(marks), logs.join("\n") || "no errors");
