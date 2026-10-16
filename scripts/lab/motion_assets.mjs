// 動きの試作（分解→抽出→再構築）の素材を作る
//   node scripts/lab/motion_assets.mjs <framesDir(frames1.mjsの出力)> <outDir>
// out/sheet0..2.jpg … 683の1秒を192×108で16×16に詰めた画像（層の番号＝world.json の units の番号）
// out/hi/<i>.jpg … 言葉で抜き出す1秒の480×270
// out/v/<i>.webm, .mp4 … 抜き出す1秒から5秒の映像（音つき）
// out/data.js … 試作に埋め込むデータ
import { readFileSync, mkdirSync, copyFileSync, existsSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
const [F, OUT] = process.argv.slice(2);
for (const d of ["", "/hi", "/v"]) mkdirSync(OUT + d, { recursive: true });
const W = JSON.parse(readFileSync("docs/design/world.json", "utf8"));
const M = JSON.parse(readFileSync("data/moments2026.json", "utf8"));
const WORDS = JSON.parse(readFileSync("docs/design/zap/motion/words.json", "utf8"));
const url = Object.fromEntries(M.map((m) => [m.no, m.clips?.[0]?.detail]));
const sec = (t) => t.split(":").map(Number).reduce((a, b) => a * 60 + b, 0);
const N = W.units.length, PER = 256;
for (let s = 0; s * PER < N; s++) {
  const ids = []; for (let i = s * PER; i < Math.min(N, (s + 1) * PER); i++) ids.push(i);
  const py = `from PIL import Image\nim=Image.new("RGB",(16*192,16*108))\n` +
    ids.map((i, k) => `im.paste(Image.open("${F}/${i}.jpg").resize((192,108),Image.LANCZOS),(${(k % 16) * 192},${Math.floor(k / 16) * 108}))`).join("\n") +
    `\nim.save("${OUT}/sheet${s}.jpg",quality=82)`;
  execFileSync("python3", ["-I", "-c", py]);
}
const pick = [...new Set(Object.values(WORDS).flat())];
for (const i of pick) {
  copyFileSync(`${F}/${i}.jpg`, `${OUT}/hi/${i}.jpg`);
  const u = W.units[i], ss = String(Math.max(0, sec(u.t)));
  for (const [ext, args] of [["webm", ["-c:v", "libvpx-vp9", "-b:v", "700k", "-deadline", "realtime", "-cpu-used", "8", "-c:a", "libopus", "-b:a", "64k"]],
                             ["mp4", ["-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "80k", "-movflags", "+faststart"]]]) {
    const o = `${OUT}/v/${i}.${ext}`; if (existsSync(o)) continue;
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", ss, "-i", url[u.no], "-t", "5", "-vf", "scale=640:360", ...args, o]);
  }
  console.log("clip", i);
}
const vids = {}; W.units.forEach((u, i) => { (vids[u.no] = vids[u.no] || { no: u.no, title: u.title, sport: u.sport, units: [] }).units.push({ i, t: u.t }); });
const data = { videos: Object.values(vids), words: WORDS, units: W.units.map((u) => ({ no: u.no, t: u.t })) };
writeFileSync(`${OUT}/data.js`, "window.DATA=" + JSON.stringify(data) + ";\n");
console.log("videos", data.videos.length, "units", N, "picked", pick.length);
