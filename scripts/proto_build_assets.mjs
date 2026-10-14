// 取り込み済み素材 + 文脈データ → assets.json（data URI 埋め込み）。LOOPS="052,075,..." で映像を入れる番号を指定（無指定は番号順に MAXLOOP 本）
import { readFileSync, writeFileSync, existsSync } from "fs";
const [,, assetsDir, ctxPath, out, maxLoopArg] = process.argv; const MAXLOOP = +(maxLoopArg || 14);
const want = process.env.LOOPS ? new Set(process.env.LOOPS.split(",")) : null;
const ctx = JSON.parse(readFileSync(ctxPath, "utf8"));
const b64 = (p, mime) => `data:${mime};base64,${readFileSync(p).toString("base64")}`;
const list = []; let loops = 0;
for (const c of ctx) {
  const dir = `${assetsDir}/${c.no}_01`;
  if (!existsSync(`${dir}/thumb.jpg`)) continue;
  const EXT = process.env.EXT || "mp4"; const hasLoop = existsSync(`${dir}/loop.${EXT}`) && (want ? want.has(c.no) : loops < MAXLOOP);
  if (hasLoop) loops++;
  list.push({ no: c.no, title: c.title, short: c.short, sport: c.sport, emo: c.emo, people: c.people, teams: c.teams, competition: c.competition, motifs: c.motifs, netsu: c.netsu || [], netsuLine: c.netsuLine || "", why: c.why,
    thumb: b64(`${dir}/thumb.jpg`, "image/jpeg"), loop: hasLoop ? b64(`${dir}/loop.${EXT}`, EXT === "webm" ? "video/webm" : "video/mp4") : null });
}
writeFileSync(out, JSON.stringify(list));
console.log(`moments ${list.length}, loops ${loops}, bytes ${readFileSync(out).length}`);
