// 「競技を越えて、同じ熱が集まる」の見せ場を、時間を止めて少しずつ進めながら連続で撮り、1枚の一覧にする: node scripts/lab/brain_seq.mjs W H tag scene
//   scene: ext（観始めてからの熱の分解）| rush（熱を選んでから場面まで）| trip（熱狂接続中から旅の2本目まで）
//   環境変数: URL（/lab/brain）、O（置き場）、VID（051 の元映像を webm にしたもの。headless は H.264 を再生できない）、STEP（撮る間隔の秒）、N（枚数）
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
import { readFileSync } from "fs";
import { execFileSync } from "child_process";
const [W, H, tag, scene] = [+process.argv[2], +process.argv[3], process.argv[4], process.argv[5]]; const { O, URL, VID } = process.env; const sp = W < 600;
const STEP = +(process.env.STEP || (scene === "trip" ? 0.5 : scene === "rush" ? 0.15 : 0.25)), CNT = +(process.env.N || (scene === "trip" ? 36 : 18));
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: sp, isMobile: sp }); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
if (VID) { const buf = readFileSync(VID); await p.route(/m\/051_01\/detail\.mp4/, (r) => r.fulfill({ status: 200, contentType: "video/webm", body: buf, headers: { "Access-Control-Allow-Origin": "*" } })); }
const adv = (s) => p.evaluate((s) => __bw.adv(s), s); const wait = (ms) => p.waitForTimeout(ms); const files = [];
const shot = async (n) => { const f = `${O}/${tag}_${scene}_${String(n).padStart(2, "0")}.png`; await p.screenshot({ path: f }); files.push(f); };
await p.goto(URL, { timeout: 180000 }); await p.waitForFunction(() => window.__bw && document.querySelector(".bw-q"), null, { timeout: 180000 }); await wait(2500);
await p.evaluate(() => __bw.manual(true)); await adv(4);
const c = await p.evaluate(() => __bw.find("亡き兄に捧げた先制弾"));
await p.evaluate((c) => __bw.watch(__bw.momOf(c)), c); await wait(3000);
if (scene === "ext") { await adv(0.9); for (let i = 0; i < CNT; i++) { await adv(STEP); await wait(160); await shot(i); } }
else { await adv(5); await wait(1500); await p.evaluate((c) => __bw.heat(c), c);
  if (scene === "rush") { for (let i = 0; i < CNT; i++) { await adv(STEP); await wait(220); await shot(i); } }
  else { await adv(6.5); for (let i = 0; i < CNT; i++) { await adv(STEP); await wait(200); await shot(i); } } }
// 一覧（4列）
const cols = 4, w = sp ? 195 : 320, h = sp ? 422 : 180;
execFileSync("python3", ["-c", `
import sys
from PIL import Image, ImageDraw
fs=sys.argv[1:]; cols=${cols}; w=${w}; h=${h}
W=Image.new('RGB',(cols*w,((len(fs)+cols-1)//cols)*h))
for i,f in enumerate(fs):
  im=Image.open(f).resize((w,h)); W.paste(im,((i%cols)*w,(i//cols)*h)); ImageDraw.Draw(W).text(((i%cols)*w+4,(i//cols)*h+4),str(i),fill=(255,255,0))
W.save('${O}/${tag}_${scene}_grid.png')`, ...files]);
console.log(JSON.stringify(await p.evaluate(() => __bw.st()))); console.log(errs.join("\n") || "エラーなし"); await b.close();
