// 選ばれた「その一秒」が実映像と合っているかを確かめ、合う秒に直す（素材の時刻は AI 由来で1〜3秒ずれることがある）。
// 各採用について t−2〜t+2 秒の5枚を切り出し、Gemini に「seen の一文が映っているのはどれか（無ければ -1）」を選ばせる。
// 結果を round*.json の各 member に tv（確かめた秒）/ vok（合う物があったか）として書き戻し、フレームを <dir>/<no>_<mmss>.jpg に置く。
//   NODE_USE_ENV_PROXY=1 node scripts/design/verify_frames.mjs docs/design/reading/round3.json <dir>
import { createRequire } from "module";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";
const require = createRequire(import.meta.url);
const V = require("../vertex.js");
const [inp, dir] = process.argv.slice(2);
const D = JSON.parse(readFileSync(inp, "utf8"));
const MM = JSON.parse(readFileSync("data/moments2026.json", "utf8")); const MOM = Array.isArray(MM) ? MM : MM.moments;
mkdirSync(dir, { recursive: true });
const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
const grab = (url, sec, o) => { if (!existsSync(o)) execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", String(sec), "-i", url, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "6", o]); return o; };
const jobs = [];
for (const r of Object.values(D.result)) for (const b of r.bundles || []) for (const j of b.members) {
  if (!j.t) continue; const c = MOM.find((m) => m.no === j.no)?.clips?.[0]; if (!c?.detail) continue;
  const [m, s] = j.t.padStart(5, "0").split(":").map(Number); jobs.push({ j, url: c.detail, sec: m * 60 + s, dur: Math.floor(c.srcDuration || 9999) });
}
// 同じ（瞬間, 秒, 一文）は1回だけ確かめる
const memo = new Map(); let i = 0, ok = 0, moved = 0, none = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (i < jobs.length) {
    const { j, url, sec, dur } = jobs[i++]; const key = `${j.no}|${sec}|${j.seen}`;
    if (!memo.has(key)) memo.set(key, (async () => {
      const secs = [-2, -1, 0, 1, 2].map((d) => sec + d).filter((x) => x >= 0 && x < dur);
      const files = secs.map((x) => { try { return grab(url, x, `${dir}/${j.no}_${mmss(x).replace(":", "")}.jpg`); } catch { return null; } });
      const parts = [{ text: `次の一文が映っている画像の番号を1つ選ぶ。どれにも映っていなければ -1。\n一文: ${j.seen}` }];
      secs.forEach((x, k) => { if (files[k]) { parts.push({ text: `画像${k}` }); parts.push({ inlineData: { mimeType: "image/jpeg", data: readFileSync(files[k]).toString("base64") } }); } });
      for (let a = 0; ; a++) {
        try { const r = await V.json("スポーツ中継の静止画を見て、説明に合う画像を選ぶ。人物の動作・表情・場所が合っているかで判断する。", parts, { model: a >= 2 ? "gemini-3.8-flash" : "gemini-2.5-flash", ...(a >= 2 ? {} : { thinkingBudget: 0 }), temperature: 0, schema: { type: "OBJECT", properties: { pick: { type: "INTEGER" } }, required: ["pick"] } });
          return r.pick >= 0 && secs[r.pick] !== undefined ? mmss(secs[r.pick]) : null; }
        catch (e) { if (a >= 5) return undefined; await new Promise((res) => setTimeout(res, 3000 * (a + 1))); }
      }
    })());
    const tv = await memo.get(key);
    if (tv === undefined) continue;
    j.vok = !!tv; j.tv = tv || j.t.padStart(5, "0");
    if (tv) { ok++; if (tv !== j.t.padStart(5, "0")) moved++; } else none++;
  }
}));
writeFileSync(inp, JSON.stringify(D, null, 1));
console.log(`確かめた ${jobs.length} / 合う秒があった ${ok}（うち秒を直した ${moved}）/ どれにも映っていない ${none}`);
