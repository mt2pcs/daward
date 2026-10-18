// 熱狂の文脈から、100本を探索してダイジェストを編む（合意のロジック③）。
//   POST { seed: 文脈id } … その文脈が強く持つ次元の組で、全文脈と響き合いを計算する
//   POST { q: 言葉 }      … 言葉を同じ8次元に読み替えてから、同じ探索をする
//   POST { ids: [...], seed?|q? } … 並びが決まっている（シェアされたリンク）。一文だけ作り直す
// 返す: { name, seedTitle, items: [{ id, line, dim, s }], scanned, resonated, ms }
//   scanned = 照らし合わせた文脈の数、resonated = 響き合いが閾値を超えた文脈の数（画面で探索の量として見せる実数）
import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import { gcpToken, gcpProjectId, gcpAvailable } from "@/lib/gcpAuth";
import net from "@/data/ctx/net.json";

export const dynamic = "force-dynamic";
type Ctx = { id: number; no: string; title: string; line: string; who: string; t: number; w: number[]; v: string[] };
type Net = { dims: string[]; moments: { no: string; title: string; sport: string; ctx: number[] }[]; ctx: Ctx[] };
const N = net as unknown as Net;
const D = 768;
const sportOf = Object.fromEntries(N.moments.map((m) => [m.no, m.sport]));
const titleOf = Object.fromEntries(N.moments.map((m) => [m.no, m.title]));
let EMB: Float32Array | null = null;
const emb = () => { if (!EMB) { const b = readFileSync(path.join(process.cwd(), "public/ctx/emb.bin")); EMB = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); } return EMB; };
const vecOf = (id: number, d: number) => emb().subarray((id * 9 + d) * D, (id * 9 + d + 1) * D);
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => { let s = 0; for (let k = 0; k < D; k++) s += a[k] * b[k]; return s; };
const stretch = (x: number, lo: number) => Math.max(0, (x - lo) / (1 - lo));
const cache = new Map<string, unknown>();

async function gemini(system: string, user: string, schema: object, model: string): Promise<Record<string, unknown>> {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(`https://aiplatform.googleapis.com/v1/projects/${gcpProjectId()}/locations/global/publishers/google/models/${model}:generateContent`, {
      method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${await gcpToken()}` },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.4, ...(model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}) } }),
    });
    if (!r.ok) throw new Error(`vertex ${r.status}`);
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return JSON.parse((j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join(""));
  } finally { clearTimeout(timer); }
}
const ask = async (s: string, u: string, schema: object) => { try { return await gemini(s, u, schema, "gemini-2.5-flash"); } catch { return await gemini(s, u, schema, "gemini-3.8-flash"); } };
async function embedQ(texts: string[]): Promise<Float32Array[]> {
  const r = await fetch(`https://asia-northeast1-aiplatform.googleapis.com/v1/projects/${gcpProjectId()}/locations/asia-northeast1/publishers/google/models/text-multilingual-embedding-002:predict`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await gcpToken()}` },
    body: JSON.stringify({ instances: texts.map((c) => ({ content: c, task_type: "SEMANTIC_SIMILARITY" })) }) });
  const j = (await r.json()) as { predictions?: { embeddings: { values: number[] } }[] };
  if (!j.predictions) throw new Error("embed failed");
  return j.predictions.map((p) => { const v = Float32Array.from(p.embeddings.values); let n = 0; for (let k = 0; k < v.length; k++) n += v[k] * v[k]; n = Math.sqrt(n); return v.map((x) => x / n); });
}

type Seed = { whole: ArrayLike<number>; dims: (ArrayLike<number> | null)[]; w: number[]; label: string; line: string; no?: string };
// 全文脈と照らし合わせる。次元ごとの寄与のうち最大のものを、その響き合いの次元とする
function scan(seed: Seed) {
  const out: { id: number; s: number; dim: number }[] = [];
  for (const c of N.ctx) {
    if (seed.no && c.no === seed.no) continue;
    let s = 0.4 * stretch(dot(seed.whole, vecOf(c.id, 0)), 0.6), dim = -1, best = 0;
    for (let d = 0; d < 8; d++) { const a = seed.w[d], b = c.w[d], v = seed.dims[d]; if (!a || !b || !v) continue;
      const x = a * b * stretch(dot(v, vecOf(c.id, d + 1)), 0.55); s += x; if (x > best) { best = x; dim = d; } }
    out.push({ id: c.id, s, dim });
  }
  return out.sort((a, b) => b.s - a.s);
}
const BAD_NAME = /(物語|軌跡|熱狂|瞬間|記憶|戦い|ドラマ)$|熱き/;
const ITEM = { type: "OBJECT", properties: { id: { type: "INTEGER" }, line: { type: "STRING" } }, required: ["id", "line"] };

export async function POST(req: Request) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as { seed?: number; q?: string; ids?: number[] };
  const q = String(body.q || "").trim().slice(0, 40), seedId = Number.isInteger(body.seed) ? (body.seed as number) : -1;
  if (seedId < 0 && !q) return NextResponse.json({ error: "empty" }, { status: 400 });
  const key = JSON.stringify([seedId, q, body.ids || null]);
  if (cache.has(key)) return NextResponse.json({ ...(cache.get(key) as object), cached: true });
  if (!gcpAvailable()) return NextResponse.json({ error: "no llm" }, { status: 503 });

  let seed: Seed;
  if (seedId >= 0) {
    const c = N.ctx[seedId]; if (!c) return NextResponse.json({ error: "no ctx" }, { status: 404 });
    seed = { whole: vecOf(c.id, 0), dims: c.w.map((w, d) => (w ? vecOf(c.id, d + 1) : null)), w: c.w, label: c.title, line: c.line, no: c.no };
  } else {
    // 言葉を熱の構造（8次元）に読み替える
    const r = (await ask(`観る人がスポーツの熱狂を探す言葉を投げました。その言葉が求めている熱を、次の8つの次元で読みます。各次元は v（具体的な言い方 6〜20字、当てはまらなければ空）と w（0〜1、強く効く次元は多くて3つ）。
次元: ${N.dims.join(" / ")}
ok=false は差別・暴力・性的などの不適切な言葉と、意味をなさない文字列のときだけ。人・家族・気持ち・状況の言葉はスポーツの中の熱として読む。line はその言葉が求める熱を25〜40字で。`,
      `言葉: 「${q}」`, { type: "OBJECT", properties: { ok: { type: "BOOLEAN" }, line: { type: "STRING" }, dims: { type: "ARRAY", items: { type: "OBJECT", properties: { v: { type: "STRING" }, w: { type: "NUMBER" } }, required: ["v", "w"] } } }, required: ["ok", "line", "dims"] })
      .catch(() => ({ ok: true, line: q, dims: [] }))) as { ok?: boolean; line?: string; dims?: { v: string; w: number }[] };
    if (r.ok === false) { const out = { unreadable: true }; cache.set(key, out); return NextResponse.json(out); }
    const dims = Array.from({ length: 8 }, (_, d) => r.dims?.[d] || { v: "", w: 0 });
    const texts = [`${q}。${r.line || ""}`, ...dims.map((x, d) => (x.v ? `${N.dims[d]}: ${x.v}` : "")).filter(Boolean)];
    const V = await embedQ(texts); let k = 1;
    seed = { whole: V[0], dims: dims.map((x) => (x.v ? V[k++] : null)), w: dims.map((x) => (x.v ? Math.max(0, Math.min(1, +x.w || 0)) : 0)), label: q, line: r.line || q };
  }
  const all = scan(seed), resonated = all.filter((x) => x.s >= (all[0]?.s || 0) * 0.55).length;
  // 1本の瞬間から1つ（いちばん響いた文脈）。上位 20 本を候補に
  const seen = new Set<string>(), cand: typeof all = [];
  for (const x of all) { const no = N.ctx[x.id].no; if (seen.has(no)) continue; seen.add(no); cand.push(x); if (cand.length >= 20) break; }
  let picked = body.ids?.length ? body.ids.filter((id) => N.ctx[id]).map((id) => all.find((x) => x.id === id) || { id, s: 0, dim: -1 }) : cand.slice(0, 8);
  let name = seed.label, lines: Record<number, string> = {};
  const desc = (x: { id: number }) => { const c = N.ctx[x.id]; return `[${c.id}] ${sportOf[c.no]}｜${titleOf[c.no]}｜「${c.title}」${c.line}`; };
  try {
    const r = (await ask(`観る人が「${seed.label}」（${seed.line}）という熱狂の文脈を選び、100の瞬間からこの熱と響き合う瞬間を集めました。これを1本のダイジェストに編みます。
${body.ids?.length ? "- 並びは与えられた順のまま。" : "- 候補から、この熱と本当に響き合うものを6〜8個選び、観て胸が熱くなる順（静かに始まり、最後に一番熱いもの）に並べる。違う競技を混ぜる。"}
- 各瞬間に、選んだ熱の側から見た一文（18〜32字）。候補の「」の名前をそのまま書かない（名前と違う言い方で、その瞬間の事実とこの熱がどう響くかを書く）。「〜も同じ」のような比較の言い方はしない。
- ダイジェストに名前（5〜12字）。スポーツ紙の見出しや、ファンが口にする言い方で。この熱とこの組にしか当てはまらない言い方。総称（感動・歓喜・ドラマ・執念・熱い瞬間）だけ・英語・比喩の飾りは不可。「熱狂」「瞬間」「物語」「軌跡」「記憶」「戦い」「ドラマ」で終わる名前、「〜の熱き〜」のような飾った言い方も不可（例: 良い「背中で泣く男たち」「家族が見ていた一打」「負けて泣いた夜」、悪い「父がくれた熱狂」「敗者の熱き涙の物語」「格下が見せた熱狂の軌跡」）。`,
      (body.ids?.length ? picked : cand).map(desc).join("\n"),
      { type: "OBJECT", properties: { name: { type: "STRING" }, items: { type: "ARRAY", items: ITEM } }, required: ["name", "items"] })) as { name?: string; items?: { id: number; line: string }[] };
    if (!body.ids?.length) { const ok = new Map(cand.map((x) => [x.id, x])); const sel = (r.items || []).filter((x) => ok.has(x.id)).slice(0, 8); if (sel.length >= 4) picked = sel.map((x) => ok.get(x.id)!); }
    lines = Object.fromEntries((r.items || []).map((x) => [x.id, x.line]));
    if (r.name && r.name.length <= 16 && !BAD_NAME.test(r.name)) name = r.name;
    else if (r.name) { const r2 = (await ask("スポーツのダイジェストの名前を、スポーツ紙の見出しのような5〜12字の言い方に直します。「物語」「軌跡」「熱狂」「瞬間」「記憶」「戦い」「ドラマ」で終わらない、飾らない言い方で。", `名前: 「${r.name}」 熱: 「${seed.label}」`, { type: "OBJECT", properties: { name: { type: "STRING" } }, required: ["name"] }).catch(() => ({}))) as { name?: string }; if (r2.name && r2.name.length <= 16 && !BAD_NAME.test(r2.name)) name = r2.name; }
  } catch { /* 名前と一文が無くても並びは返す */ }
  const out = { name, seedTitle: seed.label, seedLine: seed.line, items: picked.map((x) => ({ id: x.id, line: lines[x.id] || N.ctx[x.id].line, dim: x.dim, s: +x.s.toFixed(3) })),
    scanned: N.ctx.length, resonated, ms: Date.now() - t0 };
  cache.set(key, out); return NextResponse.json(out);
}
