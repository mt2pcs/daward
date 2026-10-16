// 言葉 → その言葉に答えるかけら（人×その1秒）を選び、この言葉のためだけの塊の名前を付ける。
// 照合は埋め込み（言葉＋言葉を映像の場面に言い換えたもの）で候補を拾い、AI が本当に答えているものだけ選ぶ。
import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import { gcpToken, gcpProjectId, gcpAvailable } from "@/lib/gcpAuth";
import world from "@/data/net/world.json";

export const dynamic = "force-dynamic";
type W = { moments: { no: string; sport: string }[]; people: { i: number; no: string; name: string; state: string; event: string; el: [string, number][] }[] };
const Wd = world as unknown as W;
const sportOf = Object.fromEntries(Wd.moments.map((m) => [m.no, m.sport]));
let EMB: Float32Array | null = null;
const emb = () => { if (!EMB) { const b = readFileSync(path.join(process.cwd(), "public/lab/net/emb.bin")); EMB = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); } return EMB; };
const cache = new Map<string, unknown>();

async function gemini(system: string, user: string, schema: object, model: string): Promise<Record<string, unknown>> {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(`https://aiplatform.googleapis.com/v1/projects/${gcpProjectId()}/locations/global/publishers/google/models/${model}:generateContent`, {
      method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${await gcpToken()}` },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.3, ...(model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}) } }),
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
    body: JSON.stringify({ instances: texts.map((c) => ({ content: c, task_type: "RETRIEVAL_QUERY" })) }) });
  const j = (await r.json()) as { predictions?: { embeddings: { values: number[] } }[] };
  if (!j.predictions) throw new Error("embed failed");
  return j.predictions.map((p) => { const v = Float32Array.from(p.embeddings.values); let n = 0; for (let k = 0; k < v.length; k++) n += v[k] * v[k]; n = Math.sqrt(n); return v.map((x) => x / n); });
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const q = String(((await req.json().catch(() => ({}))) as { q?: string }).q || "").trim().slice(0, 60);
  if (!q) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (cache.has(q)) return NextResponse.json({ ...(cache.get(q) as object), cached: true });
  if (!gcpAvailable()) return NextResponse.json({ error: "no llm" }, { status: 503 });
  // 1) 言葉を、映像の中で目に入る具体的な場面に言い換える（並行して言葉そのものも埋め込む）
  const scenesP = ask("観る人がスポーツ映像を観るときの言葉を、映像の中で目に見える具体的な人の様子に言い換えます。分類語や抽象語は使わない。各20字前後で4つ。人・家族・気持ち・状況の言葉はスポーツの中の人の様子として読む（ok=true）。ok=false は差別・暴力・性的などの不適切な言葉と、意味をなさない文字列のときだけ。",
    `言葉: 「${q}」`, { type: "OBJECT", properties: { ok: { type: "BOOLEAN" }, scenes: { type: "ARRAY", items: { type: "STRING" } } }, required: ["ok", "scenes"] }).catch(() => ({ ok: true, scenes: [] }));
  const [qv] = await embedQ([q]); const sc = (await scenesP) as { ok?: boolean; scenes?: string[] };
  if (sc.ok === false) { const out = { q, unreadable: true }; cache.set(q, out); return NextResponse.json(out); }
  const sv = sc.scenes?.length ? await embedQ(sc.scenes.slice(0, 4)) : [];
  const E = emb(), D = 768, vs = [qv, ...sv];
  const scored = Wd.people.map((p) => { let s = -1; for (const v of vs) { let d = 0; for (let k = 0; k < D; k++) d += v[k] * E[p.i * D + k]; s = Math.max(s, d); } return { i: p.i, s }; }).sort((a, b) => b.s - a.s);
  const cand = scored.slice(0, 36);
  // 2) 本当にこの言葉に答えているものだけを選び、この塊にしか当てはまらない名前を付ける
  const lines = cand.map((c) => { const p = Wd.people[c.i]; return `[${c.i}] ${sportOf[p.no]}｜${p.name}：${p.state}（${p.el.map((x) => x[0]).join("、")}）`; }).join("\n");
  let picks: { i: number; line: string }[] = [], name = q;
  try {
    const r = (await ask(`観る人が「${q}」という言葉を投げました。候補のかけら（ある人のその1秒）から、この言葉に本当に答えているものを6〜12個選びます。
- 違う競技を混ぜる。同じ瞬間（同じ人）ばかりにしない。言葉と関係が薄いものは入れない。
- 各かけらに、この言葉の側から見たその1秒を8〜16字で（例「最後に背中で語る」）。映っていないことは書かない。
- 選んだ塊全体に4〜10字の名前。この言葉とこの組にしか当てはまらない具体的な言い方。総称だけの名前（闘志・感動・ドラマ・熱い瞬間・歓喜）・比喩・英語・人名は不可。選んだかけらに共通して映っている具体（所作・関係・場面）を入れる。`, lines,
      { type: "OBJECT", properties: { name: { type: "STRING" }, picks: { type: "ARRAY", items: { type: "OBJECT", properties: { i: { type: "INTEGER" }, line: { type: "STRING" } }, required: ["i", "line"] } } }, required: ["name", "picks"] })) as { name?: string; picks?: { i: number; line: string }[] };
    const ok = new Set(cand.map((c) => c.i));
    picks = (r.picks || []).filter((x) => ok.has(x.i)).slice(0, 12); if (r.name && r.name.length <= 14) name = r.name;
  } catch { /* 下で埋める */ }
  if (picks.length < 4) picks = cand.slice(0, 10).map((c) => ({ i: c.i, line: "" }));
  const out = { q, name, picks, ms: Date.now() - t0 };
  cache.set(q, out); return NextResponse.json(out);
}
