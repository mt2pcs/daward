// 切り口エンジン（本番）。ユーザーの言葉 → 辞書の値へ写像 → 100の瞬間の分解データで切り口（腕・糸・次の言葉）を組む。
// 想定外の入力の扱いはこのファイルの resolve() に全部ある。画面に出る文字は「辞書の label」「シートの事実」「腕の名前（検査済み）」だけ。
import lexRaw from "@/data/lexicon2026.json";
import decompRaw from "@/data/decomp2026.json";
import momentsRaw from "@/data/moments2026.json";
import { gcpAvailable, gcpProjectId, gcpToken } from "@/lib/gcpAuth";

type Lex = { axes: { id: string; label: string; values: { v: string; syn: string[] }[] }[]; situations: { syn: string[]; to: Record<string, number> }[]; sports: { v: string; syn: string[]; match: string[] }[]; blocked: string[] };
type DV = { v: string; s: number; evidence: string };
type Decomp = { no: string; facts?: { situation: string | null; score: string | null; people: string[]; teams: string[] }; values?: DV[]; error?: string };
type M = { no: string; title: string; sport: string; sportLabel: string; hasVideo: boolean };

const LEX = lexRaw as unknown as Lex;
const DEC = decompRaw as unknown as Record<string, Decomp>;
const MOM = (momentsRaw as unknown as M[]).filter((m) => DEC[m.no] && !DEC[m.no].error);
const AXIS_OF: Record<string, string> = {};
for (const a of LEX.axes) for (const v of a.values) AXIS_OF[v.v] = a.id;
const ALL_VALUES = Object.keys(AXIS_OF);
const VAL: Record<string, Record<string, number>> = {}; // no → value → strength
for (const m of MOM) { VAL[m.no] = {}; for (const x of DEC[m.no].values || []) VAL[m.no][x.v] = x.s; }
// 値の希少さ（IDF）。多くの瞬間が持つ値ほど、糸の根拠として弱い
const DF: Record<string, number> = {};
for (const m of MOM) for (const v of Object.keys(VAL[m.no])) DF[v] = (DF[v] || 0) + 1;
const idf = (v: string) => Math.log(1 + MOM.length / (1 + (DF[v] || 0)));
// 固有名の索引（映像/実況から読んだ人物・チーム＋タイトル）
const NAMES: { name: string; nos: Set<string> }[] = [];
{
  const map = new Map<string, Set<string>>();
  const add = (n: string, no: string) => { const k = n.normalize("NFKC").trim(); if (k.length < 2) return; if (!map.has(k)) map.set(k, new Set()); map.get(k)!.add(no); };
  for (const m of MOM) { const f = DEC[m.no].facts; for (const p of f?.people || []) add(p, m.no); for (const t of f?.teams || []) add(t, m.no); }
  for (const [name, nos] of Array.from(map.entries())) NAMES.push({ name, nos });
}

export type Status = "default" | "matched" | "translated" | "metaphor" | "nearest" | "partial" | "unreadable" | "refused";
export interface Read { values: { v: string; axis: string; w: number; via: string }[]; sports: string[]; names: { name: string; nos: string[] }[] }
export interface CutMoment { no: string; s: number; hits: string[] }
export interface Arm { name: string; nameSource: "llm" | "template" | "editorial"; keys: string[]; moments: CutMoment[] }
export interface Cut { q: string; status: Status; message: string | null; read: Read; arms: Arm[]; threads: { a: string; b: string; shared: string[] }[]; next: string[]; source: string; ms: number }

export const normalize = (t: string) => t.normalize("NFKC").replace(/[\s　]+/g, " ").trim().slice(0, 40);

// ---------- 1. 辞書照合（決定的・速い）
function lexMatch(q: string): Read {
  const vals = new Map<string, { w: number; via: string }>();
  const put = (v: string, w: number, via: string) => { const c = vals.get(v); if (!c || c.w < w) vals.set(v, { w, via }); };
  const lower = q.toLowerCase();
  for (const a of LEX.axes) for (const v of a.values) for (const s of [v.v, ...v.syn]) if (s.length >= 1 && lower.includes(s.toLowerCase())) { put(v.v, 1, s); break; }
  for (const sit of LEX.situations) if (sit.syn.some((s) => q.includes(s))) for (const [v, w] of Object.entries(sit.to)) put(v, w * 0.9, "状況:" + sit.syn.find((s) => q.includes(s)));
  const sports = LEX.sports.filter((sp) => sp.syn.some((s) => lower.includes(s.toLowerCase()))).map((sp) => sp.v);
  const names = NAMES.filter((n) => q.includes(n.name) || (q.length >= 2 && n.name.includes(q))).map((n) => ({ name: n.name, nos: Array.from(n.nos) }));
  return { values: Array.from(vals.entries()).map(([v, x]) => ({ v, axis: AXIS_OF[v], w: x.w, via: x.via })), sports, names };
}

// ---------- 2. 想定外の入力: LLM で辞書の値へ翻訳（語彙は enum で縛る）。結果は言葉ごとに保存して辞書を育てる
type Translation = { kind: "values" | "metaphor" | "entity_absent" | "not_sports" | "nonsense" | "inappropriate"; values: { v: string; w: number }[]; sports: string[]; reading: string };
const TCACHE = new Map<string, Translation>();
async function vertexJSON(system: string, user: string, schema: object, timeoutMs: number): Promise<any> {
  const token = await gcpToken();
  const model = process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash";
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://aiplatform.googleapis.com/v1/projects/${gcpProjectId()}/locations/global/publishers/google/models/${model}:generateContent`, {
      method: "POST", signal: ctl.signal, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 } }),
    });
    const j = await r.json(); if (!r.ok) throw new Error(`vertex ${r.status} ${JSON.stringify(j).slice(0, 160)}`);
    return JSON.parse((j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join(""));
  } finally { clearTimeout(t); }
}
async function translate(q: string): Promise<Translation | null> {
  if (TCACHE.has(q)) return TCACHE.get(q)!;
  if (!gcpAvailable()) return null;
  const vocab = LEX.axes.map((a) => `${a.label}: ${a.values.map((v) => v.v).join(" / ")}`).join("\n");
  const sys = `スポーツのハイライト100本を、観る人の言葉で組み替えるサービスの入力解釈器です。入力された言葉を、下の語彙の値（最大5つ、重み0.3〜1）に翻訳します。
kind の判定:
- values: スポーツの熱狂として素直に読める
- metaphor: スポーツ以外の言葉・比喩・気分（例: 雨の日→静か・涙、カレー→刺激・豪快）。どう読んだかを reading に
- entity_absent: 実在の選手/チーム/大会の名前だが一覧に無い。その人/チームを特徴づける熱狂に最も近い値を選ぶ
- not_sports: スポーツと無関係で比喩としても読めない
- nonsense: 意味のない文字列
- inappropriate: 誹謗中傷・差別・性的・暴力・私生活・不祥事・賭け・政治
reading は「〜として読みました」の〜に入る短い日本語（12字以内、語彙の言葉を使う）。選手についての断定や評価は書かない。
語彙:
${vocab}
競技: ${LEX.sports.map((s) => s.v).join(" / ")}
一覧にいる人物・チーム: ${NAMES.map((n) => n.name).slice(0, 220).join("、")}`;
  const schema = { type: "OBJECT", properties: { kind: { type: "STRING", enum: ["values", "metaphor", "entity_absent", "not_sports", "nonsense", "inappropriate"] }, values: { type: "ARRAY", items: { type: "OBJECT", properties: { v: { type: "STRING", enum: ALL_VALUES }, w: { type: "NUMBER" } }, required: ["v", "w"] } }, sports: { type: "ARRAY", items: { type: "STRING", enum: LEX.sports.map((s) => s.v) } }, reading: { type: "STRING" } }, required: ["kind", "values", "sports", "reading"] };
  try {
    const r = await vertexJSON(sys, `入力: 「${q}」`, schema, 7000);
    const out: Translation = { kind: r.kind, values: (r.values || []).filter((x: any) => AXIS_OF[x.v]).slice(0, 5).map((x: any) => ({ v: x.v, w: Math.max(0.3, Math.min(1, +x.w || 0.6)) })), sports: (r.sports || []).filter((s: string) => LEX.sports.some((x) => x.v === s)), reading: String(r.reading || "").slice(0, 16) };
    TCACHE.set(q, out); return out;
  } catch (e) { console.error("translate failed", String(e).slice(0, 200)); return null; }
}
// LLM が使えない/落ちた時の最後の網: 文字の2-gram で同義語に近いものを探す
function fuzzy(q: string): Read {
  const grams = (s: string) => { const g = new Set<string>(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
  const gq = grams(q); let best: { v: string; sc: number; s: string } | null = null;
  if (gq.size === 0) return { values: [], sports: [], names: [] };
  for (const a of LEX.axes) for (const v of a.values) for (const s of [v.v, ...v.syn]) { if (s.length < 2) continue; const gs = grams(s); let inter = 0; gs.forEach((g) => { if (gq.has(g)) inter++; }); const sc = inter / Math.min(gq.size, gs.size); if (sc >= 0.5 && (!best || sc > best.sc)) best = { v: v.v, sc, s }; }
  const b = best as { v: string; sc: number; s: string } | null;
  return { values: b ? [{ v: b.v, axis: AXIS_OF[b.v], w: 0.7, via: "近い字:" + b.s }] : [], sports: [], names: [] };
}

// ---------- 3. 採点と腕
const sportOk = (m: M, sports: string[]) => !sports.length || sports.some((sv) => LEX.sports.find((x) => x.v === sv)!.match.some((p) => m.sport.startsWith(p)));
function score(read: Read) {
  const qw: Record<string, number> = {}; for (const x of read.values) qw[x.v] = Math.max(qw[x.v] || 0, x.w);
  const nameNos = new Set(read.names.flatMap((n) => n.nos));
  const out: { m: M; s: number; hits: string[] }[] = [];
  for (const m of MOM) {
    if (!sportOk(m, read.sports)) continue;
    let s = 0; const hits: string[] = [];
    for (const [v, w] of Object.entries(qw)) { const mv = VAL[m.no][v]; if (mv) { s += w * mv; hits.push(v); } }
    if (nameNos.has(m.no)) { s += 1.2; }
    if (!Object.keys(qw).length && !nameNos.size && read.sports.length) s = 0.5 + Math.max(0, ...Object.values(VAL[m.no])) * 0.3; // 競技だけの入力
    if (s > 0) out.push({ m, s, hits });
  }
  out.sort((a, b) => b.s - a.s);
  const top = out[0]?.s || 1;
  return out.filter((x) => x.s >= top * 0.3).slice(0, 36).map((x) => ({ ...x, s: +(x.s / top).toFixed(3) }));
}
const DISCRIM_AXES = new Set(["story", "who", "scene", "play"]);
function buildArms(cands: ReturnType<typeof score>, read: Read): { keys: string[]; moments: CutMoment[] }[] {
  const qv = read.values.slice().sort((a, b) => b.w - a.w).map((x) => x.v);
  // 主となる点いた値で束ねる
  let groups = new Map<string, typeof cands>();
  for (const c of cands) { const k = c.hits.slice().sort((a, b) => (VAL[c.m.no][b] || 0) - (VAL[c.m.no][a] || 0))[0] || "__name"; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(c); }
  // 束が少ない（言葉が1つの値に当たった等）→ いちばん大きい束を、その中で分かれる値（物語・主役・場面・プレー）でさらに割る
  let guard = 0;
  while (groups.size < 3 && guard++ < 3) {
    const [bigKey, big] = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length)[0] || [];
    if (!big || big.length < 4) break;
    const cnt: Record<string, number> = {};
    for (const c of big) for (const v of Object.keys(VAL[c.m.no])) if (DISCRIM_AXES.has(AXIS_OF[v]) && !qv.includes(v) && v !== bigKey) cnt[v] = (cnt[v] || 0) + 1;
    const splitters = Object.entries(cnt).filter(([, n]) => n >= 2 && n <= big.length - 1).sort((a, b) => b[1] * idf(b[0]) - a[1] * idf(a[0])).slice(0, 4).map(([v]) => v);
    if (!splitters.length) break;
    const next = new Map(groups); next.delete(bigKey!);
    const rest: typeof cands = [];
    for (const c of big) { const sp = splitters.find((v) => VAL[c.m.no][v]); if (sp) { const k = `${bigKey}|${sp}`; if (!next.has(k)) next.set(k, []); next.get(k)!.push(c); } else rest.push(c); }
    if (rest.length) next.set(bigKey!, rest);
    groups = next;
  }
  // 1本だけの束は、値を最も共有する束へ寄せる
  const arr = Array.from(groups.entries()).map(([k, list]) => ({ keys: k.split("|").filter((x) => x !== "__name"), list }));
  const small = arr.filter((g) => g.list.length < 2), big2 = arr.filter((g) => g.list.length >= 2);
  for (const g of small) { if (!big2.length) { big2.push(g); continue; } const c = g.list[0]; let best = big2[0], bs = -1; for (const b of big2) { const sc = b.keys.reduce((a, v) => a + (VAL[c.m.no][v] || 0), 0); if (sc > bs) { bs = sc; best = b; } } best.list.push(c); }
  return big2.sort((a, b) => b.list.length - a.list.length).slice(0, 5).map((g) => ({ keys: g.keys, moments: g.list.sort((a, b) => b.s - a.s).map((c) => ({ no: c.m.no, s: c.s, hits: Array.from(new Set([...c.hits, ...g.keys.filter((k) => VAL[c.m.no][k])])) })) }));
}
function threads(arms: { keys: string[]; moments: CutMoment[] }[]) {
  const out: { a: string; b: string; shared: string[]; w: number }[] = [];
  for (let i = 0; i < arms.length; i++) for (let j = i + 1; j < arms.length; j++) for (const a of arms[i].moments.slice(0, 8)) for (const b of arms[j].moments.slice(0, 8)) {
    const sh = Object.keys(VAL[a.no]).filter((v) => VAL[b.no][v] && idf(v) > 0.9);
    if (sh.length >= 2) out.push({ a: a.no, b: b.no, shared: sh.sort((x, y) => idf(y) - idf(x)).slice(0, 2), w: sh.reduce((s, v) => s + idf(v), 0) });
  }
  return out.sort((x, y) => y.w - x.w).slice(0, 12).map(({ a, b, shared }) => ({ a, b, shared }));
}
function nextWords(arms: { moments: CutMoment[] }[], read: Read): string[] {
  const used = new Set(read.values.map((x) => x.v)); const cnt: Record<string, number> = {};
  for (const a of arms) for (const m of a.moments.slice(0, 6)) for (const [v, s] of Object.entries(VAL[m.no])) if (!used.has(v) && ["mood", "story", "who", "feel"].includes(AXIS_OF[v])) cnt[v] = (cnt[v] || 0) + s * idf(v);
  return Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v]) => v);
}

// ---------- 4. 腕の名前（言葉の声で。事実を書かせない・人名を入れさせない・長さ検査。落ちたら値の組み合わせ）
const template = (keys: string[]) => (keys.length >= 2 ? `${keys[1]}の${keys[0]}` : keys[0] || "近い熱狂").replace(/・/g, "");
const NCACHE = new Map<string, string[]>();
async function nameArms(q: string, arms: { keys: string[]; moments: CutMoment[] }[]): Promise<{ names: string[]; source: "llm" | "template" }> {
  const tmpl = arms.map((a) => template(a.keys));
  const key = q + "::" + arms.map((a) => a.keys.join("+")).join("/");
  if (NCACHE.has(key)) return { names: NCACHE.get(key)!, source: "llm" };
  if (!gcpAvailable()) return { names: tmpl, source: "template" };
  const sys = `観る人が投げた言葉を受けて、ハイライトの束（腕）に名前を付けます。名前は4〜10文字の日本語。その言葉の気分を受けた、情景が浮かぶ言い回し。
禁止: 人名・チーム名・大会名・数字・事実の断定・「感動」「熱狂」など単語1つの総称・腕どうしの重複。`;
  const user = `言葉: 「${q}」\n` + arms.map((a, i) => `腕${i + 1}: 中身の値=${a.keys.join("×")} / 例=${a.moments.slice(0, 3).map((m) => MOM.find((x) => x.no === m.no)!.title).join("、")}`).join("\n");
  try {
    const r = await vertexJSON(sys, user, { type: "OBJECT", properties: { names: { type: "ARRAY", items: { type: "STRING" } } }, required: ["names"] }, 6000);
    const bad = (n: string) => n.length < 3 || n.length > 12 || /\d/.test(n) || NAMES.some((x) => x.name.length >= 2 && n.includes(x.name));
    const names = arms.map((_, i) => { const n = String(r.names?.[i] || "").trim(); return !n || bad(n) ? tmpl[i] : n; });
    if (new Set(names).size !== names.length) return { names: tmpl, source: "template" };
    NCACHE.set(key, names); return { names, source: "llm" };
  } catch { return { names: tmpl, source: "template" }; }
}

// ---------- 5. 入口: 想定外の入力を含む全ての分岐
const DEFAULT_Q = "__default";
const CCACHE = new Map<string, Cut>();
const MIN_MOMENTS = 6;
export async function resolve(raw: string): Promise<Cut> {
  const t0 = Date.now();
  const q = normalize(raw || "");
  const done = (c: Omit<Cut, "ms" | "q">): Cut => ({ q, ...c, ms: Date.now() - t0 });
  if (!q) return { ...(await defaultCut()), q, ms: Date.now() - t0 };
  if (CCACHE.has(q)) return { ...CCACHE.get(q)!, ms: Date.now() - t0 };
  // (a) 弾く
  if (LEX.blocked.some((b) => q.toLowerCase().includes(b.toLowerCase()))) return { ...(await defaultCut()), q, status: "refused", message: "この言葉では組み替えられません。別の言葉で投げてみてください。", ms: Date.now() - t0 };
  // (b) 辞書で読む
  let read = lexMatch(q); let status: Status = "matched"; let message: string | null = null; let source = "lexicon";
  let cands = score(read);
  // (c) 読めない・足りない → LLM で辞書へ翻訳
  if (cands.length < MIN_MOMENTS) {
    const tr = await translate(q);
    if (tr) {
      source = "lexicon+llm";
      if (tr.kind === "inappropriate") return { ...(await defaultCut()), q, status: "refused", message: "この言葉では組み替えられません。別の言葉で投げてみてください。", ms: Date.now() - t0 };
      if (tr.kind === "nonsense" || tr.kind === "not_sports" || !tr.values.length) {
        if (!read.values.length && !read.names.length) return { ...(await defaultCut()), q, status: "unreadable", message: `「${q}」はうまく読めませんでした。たとえば…`, ms: Date.now() - t0 };
      } else {
        const merged = new Map(read.values.map((x) => [x.v, x]));
        for (const x of tr.values) if (!merged.has(x.v)) merged.set(x.v, { v: x.v, axis: AXIS_OF[x.v], w: x.w * 0.9, via: "読み" });
        read = { values: Array.from(merged.values()), sports: Array.from(new Set([...read.sports, ...tr.sports])), names: read.names };
        status = tr.kind === "metaphor" ? "metaphor" : tr.kind === "entity_absent" ? "nearest" : "translated";
        message = tr.kind === "metaphor" ? `「${q}」を〈${tr.reading || read.values.slice(0, 2).map((x) => x.v).join("・")}〉として読みました` : tr.kind === "entity_absent" ? `「${q}」は100の瞬間にいません。近い熱狂で組みました` : null;
      }
    } else if (!read.values.length && !read.names.length && !read.sports.length) {
      // (d) LLM が使えない/落ちた → 字の近さで最後の網
      read = fuzzy(q); source = "fuzzy"; status = "partial";
      if (!read.values.length) return { ...(await defaultCut()), q, status: "unreadable", message: `「${q}」はうまく読めませんでした。たとえば…`, ms: Date.now() - t0 };
      message = `「${q}」を〈${read.values[0].v}〉に近い言葉として読みました`;
    } else status = "partial";
    cands = score(read);
  }
  // (e) まだ少ない → 競技の絞り込みを外して広げる
  if (cands.length < MIN_MOMENTS && read.sports.length && read.values.length) { const wide = score({ ...read, sports: [] }); if (wide.length > cands.length) { cands = wide; message = (message ? message + "。" : "") + `${read.sports.join("・")}の外にも広げました`; } }
  if (!cands.length) return { ...(await defaultCut()), q, status: "unreadable", message: `「${q}」に当てはまる瞬間が見つかりませんでした。たとえば…`, ms: Date.now() - t0 };
  const armsRaw = buildArms(cands, read);
  const nm = await nameArms(q, armsRaw);
  const cut = done({ status, message, read, source, arms: armsRaw.map((a, i) => ({ name: nm.names[i], nameSource: nm.source, ...a })), threads: threads(armsRaw), next: nextWords(armsRaw, read) });
  CCACHE.set(q, cut);
  return cut;
}
// 言葉を投げる前の既定の切り口（編集部が承認する前提。今は物語の軸で組む）
let DEF: Cut | null = null;
async function defaultCut(): Promise<Cut> {
  if (DEF) return DEF;
  const read: Read = { values: ["土壇場", "引退・最後", "番狂わせ", "新星", "悲願"].map((v) => ({ v, axis: AXIS_OF[v], w: 1, via: "既定" })), sports: [], names: [] };
  const armsRaw = buildArms(score(read), read);
  DEF = { q: "", status: "default", message: null, read, source: "editorial", arms: armsRaw.map((a) => ({ name: template(a.keys), nameSource: "editorial", ...a })), threads: threads(armsRaw), next: ["ベテランの熱量", "めちゃくちゃ泣ける", "仕事帰りにスカッと"], ms: 0 };
  return DEF;
}
export const stats = () => ({ moments: MOM.length, values: ALL_VALUES.length, names: NAMES.length, translations: TCACHE.size, cuts: CCACHE.size });
