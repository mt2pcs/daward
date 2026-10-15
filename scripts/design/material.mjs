// 実験A: 瞬間を「どんな言葉でも読み直せる素材」にする（タグではなく、時刻付きの出来事＋自由な言葉の手触り）
import { createRequire } from "module";
import { writeFileSync, existsSync, readFileSync } from "fs";
const require = createRequire(import.meta.url);
const V = require("/home/user/daward/scripts/vertex.js");
const MM = require("/home/user/daward/data/moments2026.json"); const ALL = Array.isArray(MM) ? MM : MM.moments;
const OUT = process.argv[2]; const NOS = process.argv[3].split(",");
const done = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const SYS = `あなたはスポーツ中継のディレクターです。渡された映像（音声込み）とシートの説明から、この瞬間を「後でどんな言葉で読み直されても根拠を指せる」素材に書き起こします。
- beats: 映像の中で起きたことを時刻つきで6〜12個。誰が何をしたか、表情・しぐさ、観客の音、実況の言葉（聞き取れたら原文）。映像に無いことは書かない。t は映像の先頭からの「分:秒」。
- stakes: この瞬間の前に何が懸かっていたか（スコア・時間帯・経歴・因縁）。シートと映像で分かる範囲だけ。
- aftermath: 直後に何が起きたか。
- textures: この瞬間の手触りを、分類語ではなく自由な言葉で8〜12個。角度を変える（体の感覚・温度・音・速さ・色・時間帯・人生の場面にたとえると何か）。各々どの beat の t に基づくかを付ける。
- 事実と解釈を混ぜない。beats は事実だけ、textures は解釈。`;
const SCHEMA = { type: "OBJECT", properties: {
  beats: { type: "ARRAY", items: { type: "OBJECT", properties: { t: { type: "STRING" }, what: { type: "STRING" } }, required: ["t", "what"] } },
  stakes: { type: "STRING" }, aftermath: { type: "STRING" },
  textures: { type: "ARRAY", items: { type: "OBJECT", properties: { text: { type: "STRING" }, t: { type: "STRING" } }, required: ["text", "t"] } },
}, required: ["beats", "stakes", "aftermath", "textures"] };
await Promise.all(NOS.filter((no) => !done[no]).map(async (no) => {
  const m = ALL.find((x) => x.no === no); const c = m.clips[0];
  const vp = { fileData: { fileUri: c.detail.replace("https://storage.googleapis.com/", "gs://"), mimeType: "video/mp4" } };
  if ((c.srcDuration || 0) > 130) { const st = Math.max(0, Math.min((c.peakSec || 0) - 60, c.srcDuration - 120)); vp.videoMetadata = { startOffset: `${Math.floor(st)}s`, endOffset: `${Math.floor(st + 120)}s` }; }
  const t0 = Date.now();
  try {
    const j = await V.generate(process.env.M || "gemini-3.8-flash", { systemInstruction: { parts: [{ text: SYS }] },
      contents: [{ role: "user", parts: [vp, { text: `No.${no} ${m.title}\n競技: ${m.sportLabel} / ${m.date}\nシートの説明: ${m.description}` }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.4 } });
    done[no] = { no, title: m.title, sport: m.sportLabel, ...JSON.parse(j.candidates[0].content.parts.map((p) => p.text || "").join("")) };
    console.log(no, "ok", Date.now() - t0, "ms");
  } catch (e) { console.log(no, "ERR", String(e).slice(0, 160)); }
}));
writeFileSync(OUT, JSON.stringify(done, null, 1));
