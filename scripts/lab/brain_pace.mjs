// 文字が画面に出ている秒数を、実機の時間（エンジンの時刻）で測る: node scripts/lab/brain_pace.mjs W H tag
//   実時間で動かし、映像の板と熱の言葉はマウスで押す。0.15 秒ごとに、見えている文字の組（名前の打ち込み・熱狂接続中・旅の組）と、
//   旅の組が同じ要素のまま続いているか（途中で作り直されて位置ごと入れ替わっていないか）を記録し、組ごとの出ている秒数を出す。
//   確認環境は描画が遅く、エンジンの時刻は実時間よりゆっくり進む。実機ではエンジンの時刻＝実時間なので、秒数はエンジンの時刻で数える。
//   環境変数: URL、O（撮った画面の置き場）、VID（webm。どの detail.mp4 もこれに差し替える）
import { chromium } from "/home/user/daward/node_modules/playwright-core/index.mjs";
import { readFileSync } from "fs";
const [W, H, tag] = [+process.argv[2], +process.argv[3], process.argv[4]]; const { O, URL, VID } = process.env; const sp = W < 600;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: sp, isMobile: sp }); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
if (VID) { const buf = readFileSync(VID); await p.route(/\/detail\.mp4/, (r) => r.fulfill({ status: 200, contentType: "video/webm", body: buf, headers: { "Access-Control-Allow-Origin": "*" } })); }
const press = async (x, y) => { if (sp) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); };
await p.goto(URL, { timeout: 180000 }); await p.waitForFunction(() => window.__bw && __bw.tiles && document.querySelector(".bw-q"), null, { timeout: 180000 }); await p.waitForTimeout(4000);
const c0 = await p.evaluate(() => __bw.find("亡き兄に捧げた先制弾")); await p.evaluate((c) => __bw.watch(__bw.momOf(c)), c0);
await p.waitForFunction(() => __bw.st().k === "watch" && __bw.st().ready, null, { timeout: 90000 }); await p.waitForTimeout(800);
const bb = await p.locator(".bw-t.hw", { hasText: "亡き兄" }).first().boundingBox(); await press(bb.x + bb.width / 2, bb.y + bb.height / 2);
// 旅の組には初めて見えたときに番号を付け、同じ番号が続く間は同じ要素（作り直されていない）
const sample = () => p.evaluate(() => { const s = __bw.st(), vis = (sel) => { const e = document.querySelector(sel); return e && getComputedStyle(e).opacity !== "0" ? e : null; };
  const pair = vis(".bw-pair"); if (pair && !pair.dataset.n) pair.dataset.n = String((window.__pn = (window.__pn || 0) + 1));
  return { now: __bw.now(), k: s.k, i: s.i, ph: s.ph, slam: vis(".bw-slam")?.querySelector("h2")?.textContent || "", conn: vis(".bw-conn .t")?.textContent || "", pair: pair ? `${pair.dataset.n}:${pair.className.replace("bw-pair ", "")}` : "" }; });
const rows = []; let shots = 0; const t0 = Date.now();
while (Date.now() - t0 < 240000) { const r = await sample(); rows.push(r); if (r.k === "map") break;
  const prev = rows[rows.length - 2]; if (O && prev && (prev.ph !== r.ph || prev.k !== r.k || prev.i !== r.i)) await p.screenshot({ path: `${O}/${tag}_pace_${String(shots++).padStart(2, "0")}_${r.k}${r.i ?? ""}${r.ph || ""}.png` });
  await p.waitForTimeout(150); }
// 組ごとに、出ていたエンジンの秒数をまとめる
const spans = []; const add = (kind, key, now) => { const l = spans[spans.length - 1]; if (l && l.kind === kind && l.key === key) l.end = now; else spans.push({ kind, key, start: now, end: now }); };
for (const r of rows) { if (r.slam) add("名前の打ち込み", r.slam, r.now); if (r.conn) add("熱狂接続", r.conn, r.now); if (r.pair) add("旅の組", r.pair, r.now); }
const pairs = new Map(); spans.filter((x) => x.kind === "旅の組").forEach((x) => { const n = x.key.split(":")[0]; const e = pairs.get(n) || []; e.push(`${x.key.split(":")[1]} ${(x.end - x.start).toFixed(1)}秒`); pairs.set(n, e); });
console.log(spans.filter((x) => x.kind !== "旅の組").map((x) => `${x.kind}「${x.key}」 ${(x.end - x.start).toFixed(1)}秒`).join("\n"));
pairs.forEach((v, n) => console.log(`旅の組${n}（同じ要素のまま）: ${v.join(" → ")}`));
// 状態（場面・接続・飛ぶ・繋がり・流れる）の長さもエンジンの秒で
const st = []; rows.forEach((r) => { const key = `${r.k}${r.i ?? ""}${r.ph || ""}`, l = st[st.length - 1]; if (l && l.key === key) l.end = r.now; else { if (l) l.end = r.now; st.push({ key, start: r.now, end: r.now }); } });
console.log("状態: " + st.map((x) => `${x.key} ${(x.end - x.start).toFixed(1)}`).join(" / "));
console.log(errs.join("\n") || "エラーなし"); await b.close();
