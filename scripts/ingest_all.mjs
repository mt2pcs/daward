// 素材シート（moments100.json）の Dropbox リンクを全件取り込む。1本ずつ DL → ingest_moment.sh → 元mp4削除（ディスク節約）。
//   node scripts/ingest_all.mjs brief/moments100.json brief/titles.json outdir   (SKIP_DETAIL=1 で 720p 詳細版を省く)
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { dirname } from "path";
import { fileURLToPath } from "url";
const here = dirname(fileURLToPath(import.meta.url));
const [inp, titlesPath, outRoot] = process.argv.slice(2);
const rows = JSON.parse(readFileSync(inp, "utf8"));
const titles = titlesPath && existsSync(titlesPath) ? new Map(JSON.parse(readFileSync(titlesPath, "utf8")).map((r) => [String(r.no), r.titles?.[0] || ""])) : new Map();
mkdirSync(outRoot, { recursive: true });
const manifestPath = `${outRoot}/manifest.json`;
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
const seen = new Set();
for (const r of rows) {
  const no = String(r.no);
  if (!r.links || seen.has(no)) continue; // 100番の重複行は最初だけ
  seen.add(no);
  const urls = [...String(r.links).matchAll(/https:\/\/www\.dropbox\.com\/\S+/g)].map((m) => m[0].replace(/dl=0/, "dl=1"));
  if (!urls.length) continue;
  manifest[no] = manifest[no] || { clips: [] };
  for (let k = 0; k < urls.length; k++) {
    const key = `${no}_${String(k + 1).padStart(2, "0")}`;
    const out = `${outRoot}/${key}`;
    if (existsSync(`${out}/meta.json`)) { console.log(`skip ${key}`); continue; }
    const tmp = `${outRoot}/_dl_${key}.mp4`;
    const t0 = Date.now();
    try {
      execFileSync("curl", ["-sS", "-L", "--max-time", "900", "-o", tmp, urls[k]], { stdio: "inherit" });
      execFileSync(`${here}/ingest_moment.sh`, [no, tmp, out, "", titles.get(no) || ""], { stdio: "pipe", env: { ...process.env } });
      const meta = JSON.parse(readFileSync(`${out}/meta.json`, "utf8"));
      manifest[no].clips[k] = { key, ...meta, url: urls[k] };
      console.log(`ok ${key} ${(meta.src_duration | 0)}s peak=${meta.peak_sec} ${((Date.now() - t0) / 1000) | 0}s`);
    } catch (e) {
      manifest[no].clips[k] = { key, error: String(e.message || e).slice(0, 200) };
      console.log(`FAIL ${key} ${String(e.message || e).slice(0, 160)}`);
    } finally {
      rmSync(tmp, { force: true });
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
    }
  }
}
console.log("done");
