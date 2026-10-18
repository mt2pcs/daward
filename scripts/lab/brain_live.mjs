// 「競技を越えて、同じ熱が集まる」を実時間で、実際に押す操作で通し、決まった間隔で実寸の画面を撮る: node scripts/lab/brain_live.mjs W H tag
//   時間は止めない（使う人と同じ）。映像の板・熱の言葉・画面・ボタンは、すべてマウス（スマホ幅はタップ）で押す。
//   環境変数: URL（/lab/brain）、O（置き場）、VID（webm。headless は H.264 を再生できないので、どの映像の detail.mp4 もこれに差し替える）
//   撮った画面は O/<tag>_<番号>_<場面>.png。各場面の状態・エンジンの時刻・音の数を O/<tag>_log.txt に書く
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
import { readFileSync, writeFileSync } from "fs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]]; const { O, URL, VID } = process.env; const sp = W < 600;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: sp, isMobile: sp }); const errs = [], log = [];
p.on("pageerror", (e) => errs.push((e.stack || e.message).split("\n").slice(0, 3).join(" | "))); p.on("console", (m) => m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text()) && errs.push(m.text()));
if (VID) { const buf = readFileSync(VID); await p.route(/\/detail\.mp4/, (r) => r.fulfill({ status: 200, contentType: "video/webm", body: buf, headers: { "Access-Control-Allow-Origin": "*" } })); }
let n = 0; const t0 = Date.now();
const st = () => p.evaluate(() => { const s = __bw.st(), m = __bw.media(); return { k: s.k, i: s.i, ph: s.ph, ready: s.ready, now: +__bw.now().toFixed(1), snd: m.audible, play: m.playing }; });
const shot = async (name) => { const f = `${tag}_${String(n++).padStart(3, "0")}_${name}`; await p.screenshot({ path: `${O}/${f}.png` }); log.push(`${f} t=${((Date.now() - t0) / 1000).toFixed(1)} ${JSON.stringify(await st())}`); };
// 間隔を決めて撮り続ける
const film = async (name, sec, every) => { const end = Date.now() + sec * 1000; let k = 0; while (Date.now() < end) { const a = Date.now(); await shot(`${name}${k++}`); const r = every * 1000 - (Date.now() - a); if (r > 0) await p.waitForTimeout(r); } };
const press = async (x, y) => { if (sp) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); };
const pressEl = async (sel, text) => { const loc = text ? p.locator(sel, { hasText: text }).first() : p.locator(sel).first(); const bb = await loc.boundingBox(); if (!bb) { log.push(`押せない: ${sel} ${text || ""}`); return false; } await press(bb.x + bb.width / 2, bb.y + bb.height / 2); return true; };
const until = async (pred, sec) => { const end = Date.now() + sec * 1000; while (Date.now() < end) { if (pred(await st())) return true; await p.waitForTimeout(200); } return false; };

await p.goto(URL, { timeout: 180000 }); await p.waitForFunction(() => window.__bw && __bw.tiles && document.querySelector(".bw-q"), null, { timeout: 180000 });
await film("top", 6, 1.5);
// 映像の板を押す（画面の中央に近く、こちらを向いているもの）
const tl = (await p.evaluate(() => __bw.tiles())).filter((t) => t.face > 0.5 && t.op > 0.6 && t.x > W * 0.25 && t.x < W * 0.85 && t.y > H * 0.25 && t.y < H * 0.8).sort((a, b) => Math.hypot(a.x - W * 0.55, a.y - H * 0.5) - Math.hypot(b.x - W * 0.55, b.y - H * 0.5));
log.push(`押す板: ${JSON.stringify(tl[0])}`); await press(tl[0].x, tl[0].y);
await film("watch", 9, 0.5);
// 熱の言葉を押す（2つ目）
await until((s) => s.k === "watch" && s.ready, 15); await shot("ready");
const words = await p.evaluate(() => Array.from(document.querySelectorAll(".bw-t.hw")).filter((e) => e.style.opacity !== "0").map((e) => e.textContent)); log.push(`熱の言葉: ${words.join(" / ")}`);
await pressEl(".bw-t.hw", words[1]);
await film("heat", 12, 0.35);
await film("conn", 8, 0.6);
// 旅: 1本目と2本目を通しで
await film("trip", 40, 0.7);
// 流れている間に押して次へ、繋がりの間に押して流す
await until((s) => s.k === "trip" && s.ph === "link", 20); await shot("linkpress"); await pressEl(".bw-stop"); await p.waitForTimeout(600); await shot("afterpress");
await until((s) => s.k === "trip" && s.ph === "fly", 10); await pressEl(".bw-stop .skip"); await film("map", 6, 1);
await pressEl(".bw-map .pill"); await p.waitForTimeout(800); await shot("share"); await pressEl(".bw-share .x"); await p.waitForTimeout(500);
await pressEl(".bw-close"); await film("back", 8, 1);
// 別の熱
await until((s) => s.k === "watch" && s.ready, 15); const w2 = await p.evaluate(() => Array.from(document.querySelectorAll(".bw-t.hw")).filter((e) => e.style.opacity !== "0").map((e) => e.textContent)); await pressEl(".bw-t.hw", w2[w2.length - 1]);
await film("heat2", 6, 0.6);
await until((s) => s.k === "trip" && s.i >= 0 && s.ph === "play", 40); await shot("play2"); await pressEl(".bw-close"); await film("backplay", 4, 1);
await pressEl(".bw-close"); await film("free", 3, 1);
// 熱狂を探す
await p.locator(".bw-q input").click(); await p.keyboard.type("ベテランの意地"); await shot("typed"); await pressEl(".bw-q button");
await film("search", 14, 0.8);
await until((s) => s.k === "trip" && s.ph === "link", 30); await shot("slink"); await until((s) => s.k === "trip" && s.ph === "play", 10); await p.waitForTimeout(800); await shot("splay");
await pressEl(".bw-stop .skip"); await film("smap", 4, 1);
writeFileSync(`${O}/${tag}_log.txt`, log.join("\n") + "\n" + (errs.join("\n") || "エラーなし"));
console.log(`${n}枚`, errs.length ? errs.slice(0, 5).join("\n") : "エラーなし"); await b.close();
