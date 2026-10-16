// 動きを1コマずつ決定的に撮る（1/30秒ずつ進めて撮影）→ 実時間の mp4。
//   node scripts/lab/motion_frames.mjs W H tag "0:intro|8.5:家族|16.5:最後|27:tap3|30.5:end"   （OUT=出力先、http.server 3180）
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
import { mkdirSync } from "fs";
import { execFileSync } from "child_process";
const [W, H, tag, plan] = [+process.argv[2], +process.argv[3], process.argv[4], process.argv[5]], out = process.env.OUT, FPS = +(process.env.FPS || 30);
const dir = `${out}/fr_${tag}`; mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: W, height: H } });
const logs = []; p.on("console", (m) => m.type() === "error" && logs.push(m.text())); p.on("pageerror", (e) => logs.push("ERR " + e.message));
await p.goto(`http://127.0.0.1:3180/index.html?manual=1`);
await p.waitForFunction(() => window.__ready, null, { timeout: 60000 });
const steps = plan.split("|").map((x) => { const [t, a] = x.split(":"); return { t: +t, a }; });
const end = steps.find((x) => x.a === "end").t; let k = 0;
for (let f = 0; f * (1 / FPS) <= end; f++) {
  const t = f / FPS;
  for (const s of steps) if (!s.done && t >= s.t) { s.done = true;
    if (s.a.startsWith("tap")) await p.evaluate((j) => __m.setHead(j), +s.a.slice(3));
    else if (s.a !== "intro" && s.a !== "end") await p.evaluate((w) => __m.choose(w), s.a); }
  await p.evaluate((d) => __m.tick(d), 1 / FPS);
  await p.screenshot({ path: `${dir}/${String(k++).padStart(5, "0")}.jpg`, type: "jpeg", quality: 82 });
}
await b.close();
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${dir}/%05d.jpg`, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", `${out}/fr_${tag}.mp4`]);
console.log(tag, "frames", k, logs.join("\n") || "no errors");
