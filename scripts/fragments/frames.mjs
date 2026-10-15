// かけら作りの1段目: world.json の各「1秒」について、その前後2秒を含む5コマ（1秒おき）を映像から切り出す。
// 素材の時刻は1〜2秒ずれるのが普通なので、どのコマが本当にその1秒かは次の段（Gemini が画を見て決める）で選ぶ。
//   node scripts/fragments/frames.mjs <outDir> [並列数]
import { readFileSync, existsSync, mkdirSync } from "fs";
import { execFile } from "child_process";
const OUT = process.argv[2], PAR = +(process.argv[3] || 6);
mkdirSync(OUT, { recursive: true });
const W = JSON.parse(readFileSync("docs/design/world.json", "utf8"));
const M = JSON.parse(readFileSync("data/moments2026.json", "utf8"));
const url = Object.fromEntries(M.map((m) => [m.no, m.clips?.[0]?.detail]));
const sec = (t) => t.split(":").map(Number).reduce((a, b) => a * 60 + b, 0);
const jobs = W.units.map((u, i) => ({ i, u })).filter(({ i }) => !existsSync(`${OUT}/${i}_5.jpg`));
let done = 0, fail = 0;
const run = ({ i, u }) => new Promise((res) => {
  const ss = Math.max(0, sec(u.t) - 2);
  execFile("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(ss), "-i", url[u.no], "-t", "5", "-vf", "fps=1,scale=960:-2", "-q:v", "3", `${OUT}/${i}_%d.jpg`], (e) => { e ? fail++ : done++; if ((done + fail) % 50 === 0) console.log(done, fail); res(); });
});
const q = [...jobs]; await Promise.all(Array.from({ length: PAR }, async () => { while (q.length) await run(q.shift()); }));
console.log("done", done, "fail", fail, "of", jobs.length);
