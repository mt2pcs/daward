// 素材シート（data/sheet2026.json）＋文脈（data/context2026.json）＋取り込み済み素材 → data/moments2026.json（投票サイトのデータ）
//   node scripts/build_moments2026.mjs <assetsDir> [assetBase]
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
const [assetsDir, assetBase = "https://storage.googleapis.com/e-mooments-assets/m"] = process.argv.slice(2);
const sheet = JSON.parse(readFileSync("data/sheet2026.json", "utf8"));
const ctx = Object.fromEntries(JSON.parse(readFileSync("data/context2026.json", "utf8")).map((c) => [c.no, c]));
const GROUP = (s) => s.startsWith("0_") ? "W杯" : s.startsWith("1_") ? "サッカー" : s.startsWith("2_") ? "野球" : s.startsWith("3_") ? "バスケ" : s.startsWith("4_") ? "ラグビー" : s.startsWith("5_") ? "ボクシング" : s.startsWith("6_") ? "モータースポーツ" : "その他";
const LABEL = { "0_ワールドカップ": "FIFAワールドカップ", "1_ACL": "ACL", "1_Jリーグ": "Jリーグ", "1_世代別代表": "サッカー世代別代表", "1_女子サッカー": "女子サッカー", "1_海外サッカー": "海外サッカー", "2_センバツ": "センバツ高校野球", "2_プロ野球": "プロ野球", "3_Bリーグ": "Bリーグ", "3_バスケ代表戦": "バスケ日本代表", "3_女子バスケ代表戦": "女子バスケ日本代表", "4_ラグビー日本代表": "ラグビー日本代表", "4_リーグワン": "リーグワン", "5_ボクシング": "ボクシング", "6_モータースポーツ": "モータースポーツ" };
const keys = existsSync(assetsDir) ? readdirSync(assetsDir).filter((d) => /^\d{3}_\d{2}$/.test(d) && existsSync(`${assetsDir}/${d}/meta.json`)) : [];
const seen = new Set(); const out = [];
for (const r of sheet) {
  if (!/^\d{3}$/.test(r.no) || +r.no > 100 || seen.has(r.no)) continue; seen.add(r.no);
  const clips = keys.filter((k) => k.startsWith(r.no + "_")).sort().map((k) => { const meta = JSON.parse(readFileSync(`${assetsDir}/${k}/meta.json`, "utf8")); const hasDetail = existsSync(`${assetsDir}/${k}/detail.ok`); return { key: k, detail: hasDetail ? `${assetBase}/${k}/detail.mp4` : null, loop: `${assetBase}/${k}/loop.mp4`, webm: `${assetBase}/${k}/loop.webm`, poster: `${assetBase}/${k}/poster.webp`, thumb: `${assetBase}/${k}/thumb.jpg`, og: `${assetBase}/${k}/og.jpg`, peakSec: meta.peak_sec, srcDuration: meta.src_duration }; });
  const c = ctx[r.no] || {};
  const m = (r.date || "").match(/^(\d{1,2})\/(\d{1,2})/); const date = m ? `2026.${m[1].padStart(2, "0")}.${m[2].padStart(2, "0")}` : "";
  out.push({ no: r.no, title: (r.titles || [])[0] || r.moment.slice(0, 20), titles: r.titles || [], short: r.short || "", description: r.moment, sport: r.sport, sportLabel: LABEL[r.sport] || r.sport.replace(/^\d_/, ""), group: GROUP(r.sport), date, rights: r.rights || "", emo: r.emo || "", prio: r.prio || "", delivered: r.delivered || "", hasVideo: clips.length > 0, clips,
    context: { people: c.people || [], teams: c.teams || [], competition: c.competition || "", motifs: c.motifs || [], beat: c.beat || "", why: c.why || "", crowd: c.crowd || "" } });
}
writeFileSync("data/moments2026.json", JSON.stringify(out, null, 1));
const g = {}; for (const o of out) g[o.group] = (g[o.group] || 0) + 1;
console.log(`moments ${out.length}, with video ${out.filter((o) => o.hasVideo).length}`, g);
