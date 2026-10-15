// UIリファレンス画像を生成する（Vertex AI Gemini image）。  node scripts/gen_image.mjs out.png 16:9 prompt.txt [ref.jpg ...]
import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
const { image } = createRequire(import.meta.url)("./vertex.js");
const [out, aspect, promptFile, ...refFiles] = process.argv.slice(2);
const refs = refFiles.map((f) => ({ mime: f.endsWith(".png") ? "image/png" : "image/jpeg", data: readFileSync(f).toString("base64") }));
if (!out || !aspect || !promptFile) { console.error("usage: gen_image.mjs out.png <aspect e.g. 16:9|9:16|1:1> prompt.txt"); process.exit(1); }
const buf = await image(readFileSync(promptFile, "utf8"), aspect, { imageSize: process.env.IMAGE_SIZE || "2K", refs });
writeFileSync(out, buf);
console.log("saved", out, buf.length, "bytes");
