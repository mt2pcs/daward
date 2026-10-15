import { readFileSync, writeFileSync, existsSync } from "fs";
const S = process.argv[2];
const M = JSON.parse(readFileSync("data/moments2026.json", "utf8")); const A = Array.isArray(M) ? M : M.moments;
const R = JSON.parse(readFileSync(S + "/../mock_reads.json", "utf8"));
const b64 = (p) => readFileSync(p).toString("base64");
const moments = A.map((m) => ({ no: m.no, title: m.title, sport: m.sportLabel, thumb: existsSync(`${S}/thumbs/${m.no}.jpg`) ? "data:image/jpeg;base64," + b64(`${S}/thumbs/${m.no}.jpg`) : null }));
const media = {};
const words = Object.entries(R).map(([w, r]) => {
  const arms = r.arms.map((a) => ({ name: a.name, items: a.nos.filter((no) => r.picked[no]).map((no) => { const j = r.judge.find((x) => x.no === no); const k = `${no}_${j.t.replace(":", "-")}`; if (!media[k]) media[k] = { mp4: "data:video/mp4;base64," + b64(`${S}/media/${k}.mp4`), webm: "data:video/webm;base64," + b64(`${S}/media/${k}.webm`), poster: "data:image/jpeg;base64," + b64(`${S}/media/${k}.jpg`) }; return { no, t: j.t, line: j.line, media: k }; }) })).filter((a) => a.items.length);
  return { word: w, feeling: r.lens.feeling, arms, threads: r.threads.filter((x) => r.picked[x.a] && r.picked[x.b]) };
});
const tpl = readFileSync(S + "/template.html", "utf8");
const out = tpl.replace("__DATA__", JSON.stringify({ moments, words, media }));
writeFileSync(S + "/burst_mock.html", out);
console.log("size", (out.length / 1e6).toFixed(2), "MB", "media", Object.keys(media).length);
