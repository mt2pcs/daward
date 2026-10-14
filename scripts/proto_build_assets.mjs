// 取り込み済み素材 + 文脈データ → assets.json（data URI 埋め込み）。ループ映像は番号順に MAXLOOP 本まで
import { readFileSync, writeFileSync, existsSync } from "fs";
const [,, assetsDir, ctxPath, out, maxLoopArg] = process.argv; const MAXLOOP = +(maxLoopArg || 14);
const ctx = JSON.parse(readFileSync(ctxPath, "utf8"));
const b64 = (p, mime) => `data:${mime};base64,${readFileSync(p).toString("base64")}`;
const list = []; let loops = 0;
for (const c of ctx) {
  const dir = `${assetsDir}/${c.no}_01`;
  if (!existsSync(`${dir}/thumb.jpg`)) continue;
  const hasLoop = existsSync(`${dir}/loop.mp4`) && loops < MAXLOOP;
  if (hasLoop) loops++;
  list.push({ no: c.no, title: c.title, short: c.short, sport: c.sport, people: c.people, teams: c.teams, competition: c.competition, motifs: c.motifs, why: c.why, crowd: c.crowd,
    thumb: b64(`${dir}/thumb.jpg`, "image/jpeg"), loop: hasLoop ? b64(`${dir}/loop.mp4`, "video/mp4") : null });
}
writeFileSync(out, JSON.stringify(list));
console.log(`moments ${list.length}, loops ${loops}, bytes ${readFileSync(out).length}`);
