// Vertex AI Gemini の薄いクライアント（テキスト JSON と画像）。認証は gcp_auth.js（サービスアカウント）。
const { getToken, projectId } = require('./gcp_auth.js');
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3.8-flash';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
async function generate(model, body, loc = 'global') {
  const token = await getToken();
  const url = `https://${loc === 'global' ? '' : loc + '-'}aiplatform.googleapis.com/v1/projects/${projectId()}/locations/${loc}/publishers/google/models/${model}:generateContent`;
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(`vertex ${model}: ${r.status} ${(j.error && j.error.message) || JSON.stringify(j).slice(0, 200)}`);
  return j;
}
// system + user → JSON オブジェクト
async function json(system, user, opts = {}) {
  const j = await generate(opts.model || TEXT_MODEL, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: Array.isArray(user) ? user : [{ text: user }] }], // user は文字列か parts の配列（画像を渡すとき）
    generationConfig: { responseMimeType: 'application/json', temperature: opts.temperature ?? 0.7, ...(opts.schema ? { responseSchema: opts.schema } : {}), ...(opts.thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget: opts.thinkingBudget } } : {}) },
  });
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  return JSON.parse(text);
}
// prompt → PNG Buffer（opts.refs: [{mime, data(base64)}] で参照画像を渡せる）
async function image(prompt, aspectRatio = '16:9', opts = {}) {
  const j = await generate(opts.model || IMAGE_MODEL, {
    contents: [{ role: 'user', parts: [...(opts.refs || []).map((r) => ({ inlineData: { mimeType: r.mime, data: r.data } })), { text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio, ...(opts.imageSize ? { imageSize: opts.imageSize } : {}) } },
  });
  const p = (j.candidates?.[0]?.content?.parts || []).find((x) => x.inlineData);
  if (!p) throw new Error('vertex image: no image in response');
  return Buffer.from(p.inlineData.data, 'base64');
}
module.exports = { generate, json, image, TEXT_MODEL, IMAGE_MODEL };
