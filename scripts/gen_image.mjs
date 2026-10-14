// gpt-image-2 でUIリファレンス画像を生成する（CLAUDE.md の制作プロセス用）。scratchpad は消えるのでリポジトリに置く。
//   NODE_USE_ENV_PROXY=1 node scripts/gen_image.mjs out.png 1536x1024 prompt.txt
import { readFileSync, writeFileSync } from "fs";
const [out, size, promptFile] = process.argv.slice(2);
const key = process.env.OPENAI_API_KEY;
if (!key || !out || !size || !promptFile) { console.error("usage: gen_image.mjs out.png WxH prompt.txt (needs OPENAI_API_KEY)"); process.exit(1); }
const prompt = readFileSync(promptFile, "utf8");
const res = await fetch("https://api.openai.com/v1/images/generations", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
  body: JSON.stringify({ model: process.env.IMAGE_MODEL || "gpt-image-2", prompt, size, n: 1, quality: process.env.IMAGE_QUALITY || "high" }),
});
if (!res.ok) { console.error("error", res.status, (await res.text()).slice(0, 500)); process.exit(1); }
const j = await res.json();
const b64 = j.data?.[0]?.b64_json;
if (!b64) { console.error("no image in response", JSON.stringify(j).slice(0, 300)); process.exit(1); }
writeFileSync(out, Buffer.from(b64, "base64"));
console.log("saved", out, JSON.stringify(j.usage || {}));
