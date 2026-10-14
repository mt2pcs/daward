// UIリファレンス画像を生成する（Vertex AI Gemini image）。  node scripts/gen_image.mjs out.png 16:9 prompt.txt
import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
const { image } = createRequire(import.meta.url)("./vertex.js");
const [out, aspect, promptFile] = process.argv.slice(2);
if (!out || !aspect || !promptFile) { console.error("usage: gen_image.mjs out.png <aspect e.g. 16:9|9:16|1:1> prompt.txt"); process.exit(1); }
const buf = await image(readFileSync(promptFile, "utf8"), aspect, { imageSize: process.env.IMAGE_SIZE || "2K" });
writeFileSync(out, buf);
console.log("saved", out, buf.length, "bytes");
