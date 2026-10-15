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
export interface Read { values: { v: string; axis: string; w: number; via: string }[]; sports: string[]; names: { name: string; nos: string[] }[]; coverage?: number }
export interface CutMoment { no: string; s: number; hits: string[] }
export interface Arm { name: string; nameSource: "llm" | "template" | "editorial"; keys: string[]; moments: CutMoment[] }
export interface Cut { q: string; status: Status; message: string | null; read: Read; arms: Arm[]; threads: { a: string; b: string; shared: string[] }[]; next: string[]; source: string; ms: number }

export const normalize = (t: string) => t.normalize("NFKC").replace(/[\s　]+/g, " ").trim().slice(0, 40);

// ---------- 1. 辞書照合（決定的・速い）
function lexMatch(q: string): Read {
  const vals = new Map<string, { w: number; via: string }>();
  const put = (v: string, w: number, via: string) => { const c = vals.get(v); if (!c || c.w < w) vals.set(v, { w, via }); };
  const lower = q.toLowerCase();
  const covered = new Array(q.length).fill(false);
  // 英字だけの短い語（CL, HR, KO, 3P…）は単語の区切りでだけ当てる（「clutch」に CL が当たった）
  const find = (s: string): number => { const t = s.toLowerCase(); if (/^[a-z0-9]{1,4}$/i.test(s)) { const m = new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`, "i").exec(lower); return m ? m.index + m[1].length : -1; } return lower.indexOf(t); };
  const mark = (s: string) => { const i = find(s); if (i >= 0) for (let k = i; k < i + s.length; k++) covered[k] = true; return i >= 0; };
  for (const a of LEX.axes) for (const v of a.values) for (const s of [v.v, ...v.syn].sort((x, y) => y.length - x.length)) if (s.length >= 1 && mark(s)) { put(v.v, 1, s); break; }
  for (const sit of LEX.situations) { const hit = sit.syn.find((s) => mark(s)); if (hit) for (const [v, w] of Object.entries(sit.to)) put(v, w * 0.9, "状況:" + hit); }
  const sports = LEX.sports.filter((sp) => sp.syn.some((s) => mark(s))).map((sp) => sp.v);
  const names = NAMES.filter((n) => mark(n.name) || (q.length >= 2 && n.name.includes(q) && mark(q))).map((n) => ({ name: n.name, nos: Array.from(n.nos) }));
  // タイトルにも人名が入っている（映像から読めなかった場合の補完）
  if (names.length) { const extra = MOM.filter((m) => names.some((n) => m.title.includes(n.name)) && !names.some((n) => n.nos.includes(m.no))).map((m) => m.no); if (extra.length) names.push({ name: names[0].name, nos: extra }); }
  else if (q.length >= 2) { const byTitle = MOM.filter((m) => m.title.includes(q)).map((m) => m.no); if (byTitle.length) { names.push({ name: q, nos: byTitle }); mark(q); } }
  // 読めた文字の割合（助詞・記号・「やつ」「したい」などは数えない）
  const filler = /[のがをにでとはもやへ、。！？!?\s・「」『』ー〜]|やつ|したい|みたい|見たい|観たい|ような|ください|下さい|めちゃくちゃ|めっちゃ|すごい|とにかく|ほしい/g;
  let content = 0, hitc = 0; const fill = new Array(q.length).fill(false); let m: RegExpExecArray | null; filler.lastIndex = 0;
  while ((m = filler.exec(q))) for (let k = m.index; k < m.index + m[0].length; k++) fill[k] = true;
  for (let k = 0; k < q.length; k++) if (!fill[k]) { content++; if (covered[k]) hitc++; }
  return { values: Array.from(vals.entries()).map(([v, x]) => ({ v, axis: AXIS_OF[v], w: x.w, via: x.via })), sports, names, coverage: content ? hitc / content : 1 };
}

// ---------- 2. 想定外の入力: LLM で辞書の値へ翻訳（語彙は enum で縛る）。結果は言葉ごとに保存して辞書を育てる
type Translation = { kind: "values" | "metaphor" | "entity_absent" | "not_sports" | "nonsense" | "inappropriate"; values: { v: string; w: number }[]; sports: string[]; reading: string };
const TCACHE = new Map<string, Translation>();
// 応答時間の実測（2026-10-15）: gemini-3.8-flash は考えない設定でも3〜5秒、gemini-2.5-flash（thinkingBudget 0）は0.7〜0.9秒
const FAST_MODEL = process.env.CUT_MODEL || "gemini-2.5-flash";
async function vertexJSON(system: string, user: string, schema: object, timeoutMs: number, model = FAST_MODEL): Promise<any> {
  const token = await gcpToken();
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://aiplatform.googleapis.com/v1/projects/${gcpProjectId()}/locations/global/publishers/google/models/${model}:generateContent`, {
      method: "POST", signal: ctl.signal, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2, ...(model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}) } }),
    });
    const j = await r.json(); if (!r.ok) throw new Error(`vertex ${r.status} ${JSON.stringify(j).slice(0, 160)}`);
    return JSON.parse((j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join(""));
  } finally { clearTimeout(t); }
}
// 事前に読んでおいた「想定される入力」（scripts/gen_inputs2026.mjs）。実行時はまずここを引く
import preRaw from "@/data/translations2026.json";
for (const [k, v] of Object.entries(preRaw as unknown as Record<string, Translation>)) TCACHE.set(normalize(k), v);
// 実行時の LLM は 429（共有枠不足）や遅延が起きる前提で、代替モデルへ順に逃がす
const CHAIN = (process.env.CUT_MODEL_CHAIN || "gemini-2.5-flash,gemini-3.5-flash-lite,gemini-3.8-flash").split(",");
async function vertexChain(system: string, user: string, schema: object, perCallMs: number): Promise<any> {
  let last: unknown = null;
  for (const model of CHAIN) { try { return await vertexJSON(system, user, schema, perCallMs, model); } catch (e) { last = e; } }
  throw last;
}
// 事前翻訳表は「やつ」「したい」「みたい」などの言い回しを外した形でも引く（「えぐいやつ」→「えぐい」）
const TAIL = /(なやつ|のやつ|やつ|が見たい|を見たい|が観たい|を観たい|見たい|観たい|したい|みたい|な感じ|系|もの|もん|シーン|瞬間)$/;
export async function translate(q: string): Promise<Translation | null> {
  if (TCACHE.has(q)) return TCACHE.get(q)!;
  const stripped = q.replace(TAIL, "").trim();
  if (stripped && stripped !== q && TCACHE.has(stripped)) return TCACHE.get(stripped)!;
  if (!gcpAvailable()) return null;
  const vocab = LEX.axes.map((a) => `${a.label}: ${a.values.map((v) => v.v).join(" / ")}`).join("\n");
  const sys = `スポーツのハイライト100本を、観る人の言葉で組み替えるサービスの入力解釈器です。入力された言葉を、下の語彙の値（最大5つ、重み0.3〜1）に翻訳します。
kind の判定:
- values: スポーツの熱狂として読める。英語（clutch, goosebumps）・絵文字（😭🔥）・スラング（えぐい、やばい）・方言も意味を読んでここへ
- metaphor: スポーツ以外の言葉・比喩・気分（例: 雨の日→泣ける・静寂から爆発、カレー→豪快・スカッと）。どう読んだかを reading に
- entity_absent: 実在の選手・チーム・大会・競技の名前（例: 大谷翔平、羽生結弦、カーリング、相撲）。その人/競技を特徴づける熱狂に最も近い値を選ぶ
- not_sports: どう読んでも熱狂の気分や情景にならない（住所、商品の型番など）
- nonsense: 意味のない文字列（あああ、asdf）
- inappropriate: 誹謗中傷・差別・性的・暴力・私生活・不祥事・賭け・政治
迷ったら values か metaphor にする（読めないと返すより、読んで返すほうが体験として良い）。
reading は名詞句だけ（8字以内、例:「静かな涙」「逆転の衝撃」）。「として読みました」は付けない。選手についての断定や評価は書かない。
語彙:
${vocab}
競技: ${LEX.sports.map((s) => s.v).join(" / ")}`;
  const schema = { type: "OBJECT", properties: { kind: { type: "STRING", enum: ["values", "metaphor", "entity_absent", "not_sports", "nonsense", "inappropriate"] }, values: { type: "ARRAY", items: { type: "OBJECT", properties: { v: { type: "STRING", enum: ALL_VALUES }, w: { type: "NUMBER" } }, required: ["v", "w"] } }, sports: { type: "ARRAY", items: { type: "STRING", enum: LEX.sports.map((s) => s.v) } }, reading: { type: "STRING" } }, required: ["kind", "values", "sports", "reading"] };
  try {
    const r = await vertexChain(sys, `入力: 「${q}」`, schema, 3000);
    const out: Translation = { kind: r.kind, values: (r.values || []).filter((x: any) => AXIS_OF[x.v]).slice(0, 5).map((x: any) => ({ v: x.v, w: Math.max(0.3, Math.min(1, +x.w || 0.6)) })), sports: (r.sports || []).filter((s: string) => LEX.sports.some((x) => x.v === s)), reading: String(r.reading || "").replace(/として読みました。?$|と読みました。?$/, "").slice(0, 12) };
    TCACHE.set(q, out); return out;
  } catch (e) { console.error("translate failed", String(e).slice(0, 200)); return null; }
}
// LLM が使えない/落ちた時の最後の網: 文字の2-gram で同義語に近いものを探す
function fuzzy(q: string): Read {
  const grams = (s: string) => { const g = new Set<string>(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
  const gq = grams(q); let best: { v: string; sc: number; s: string } | null = null;
  if (gq.size === 0) return { values: [], sports: [], names: [] };
  for (const a of LEX.axes) for (const v of a.values) for (const s of [v.v, ...v.syn]) { if (s.length < 2) continue; const gs = grams(s); let inter = 0; gs.forEach((g) => { if (gq.has(g)) inter++; }); const sc = inter / Math.min(gq.size, gs.size); if (inter >= 2 && sc >= 0.67 && (!best || sc > best.sc)) best = { v: v.v, sc, s }; }
  const b = best as { v: string; sc: number; s: string } | null;
  return { values: b ? [{ v: b.v, axis: AXIS_OF[b.v], w: 0.7, via: "近い字:" + b.s }] : [], sports: [], names: [] };
}

// ---------- 3. 採点と腕
const sportOk = (m: M, sports: string[]) => !sports.length || sports.some((sv) => LEX.sports.find((x) => x.v === sv)!.match.some((p) => m.sport.startsWith(p)));
function anchorOf(read: Read): string | null {
  const explicit = read.values.filter((x) => x.w >= 0.95 && x.via !== "既定");
  if (new Set(explicit.map((x) => x.axis)).size < 2) return null;
  return explicit.slice().sort((a, b) => idf(b.v) - idf(a.v))[0].v;
}
function score(read: Read, useAnchor = true) {
  const qw: Record<string, number> = {}; for (const x of read.values) qw[x.v] = Math.max(qw[x.v] || 0, x.w);
  const nameNos = new Set(read.names.flatMap((n) => n.nos));
  const anchor = useAnchor ? anchorOf(read) : null;
  const out: { m: M; s: number; hits: string[] }[] = [];
  for (const m of MOM) {
    if (!sportOk(m, read.sports)) continue;
    if (anchor && !VAL[m.no][anchor] && !nameNos.has(m.no)) continue;
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
const SPLIT_W: Record<string, number> = { story: 1, who: 0.9, play: 0.7, scene: 0.5, feel: 0.4 };
function buildArms(cands: ReturnType<typeof score>, read: Read): { keys: string[]; byName?: boolean; moments: CutMoment[] }[] {
  const qv = read.values.slice().sort((a, b) => b.w - a.w).map((x) => x.v);
  // 主となる点いた値で束ねる
  let groups = new Map<string, typeof cands>();
  const nameNos = new Set(read.names.flatMap((n) => n.nos));
  for (const c of cands) { if (nameNos.has(c.m.no)) { if (!groups.has("__name")) groups.set("__name", []); groups.get("__name")!.push(c); continue; } const k = c.hits.slice().sort((a, b) => (VAL[c.m.no][b] || 0) - (VAL[c.m.no][a] || 0))[0] || "__name"; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(c); }
  // 束が少ない（言葉が1つの値に当たった等）→ いちばん大きい束を、その中で分かれる値（物語・主役・場面・プレー）でさらに割る
  let guard = 0; const tried = new Set<string>();
  while (guard++ < 6) {
    const [bigKey, big] = Array.from(groups.entries()).filter(([k]) => !tried.has(k)).sort((a, b) => b[1].length - a[1].length)[0] || [];
    if (!big || big.length < 4) break;
    if (groups.size >= 3 && big.length <= 10) break; // 束が3つ以上あり、最大でも10本以下なら十分
    tried.add(bigKey!);
    const cnt: Record<string, number> = {};
    for (const c of big) for (const v of Object.keys(VAL[c.m.no])) if (SPLIT_W[AXIS_OF[v]] && !qv.includes(v) && v !== bigKey) cnt[v] = (cnt[v] || 0) + 1;
    const splitters = Object.entries(cnt).filter(([, n]) => n >= 2 && n <= big.length * 0.7).sort((a, b) => b[1] * idf(b[0]) * SPLIT_W[AXIS_OF[b[0]]] - a[1] * idf(a[0]) * SPLIT_W[AXIS_OF[a[0]]]).slice(0, 4).map(([v]) => v);
    if (!splitters.length) break;
    const next = new Map(groups); next.delete(bigKey!);
    const rest: typeof cands = [];
    for (const c of big) { const sp = splitters.find((v) => VAL[c.m.no][v]); if (sp) { const k = `${bigKey}|${sp}`; if (!next.has(k)) next.set(k, []); next.get(k)!.push(c); } else rest.push(c); }
    if (rest.length) next.set(bigKey!, rest);
    groups = next;
  }
  // 1本だけの束は、値を最も共有する束へ寄せる
  const arr = Array.from(groups.entries()).map(([k, list]) => ({ keys: k.split("|").filter((x) => x !== "__name"), byName: k === "__name", list }));
  const small = arr.filter((g) => g.list.length < 2 && !g.byName), big2 = arr.filter((g) => g.list.length >= 2 || g.byName);
  for (const g of small) { if (!big2.length) { big2.push(g); continue; } const c = g.list[0]; let best = big2[0], bs = -1; for (const b of big2) { const sc = b.keys.reduce((a, v) => a + (VAL[c.m.no][v] || 0), 0); if (sc > bs) { bs = sc; best = b; } } best.list.push(c); }
  return big2.sort((a, b) => (b.byName ? 99 : 0) + b.list.length - ((a.byName ? 99 : 0) + a.list.length)).slice(0, 5).map((g) => ({ keys: g.keys, byName: g.byName, moments: g.list.sort((a, b) => b.s - a.s).map((c) => ({ no: c.m.no, s: c.s, hits: Array.from(new Set([...c.hits, ...g.keys.filter((k) => VAL[c.m.no][k])])) })) }));
}
function threads(arms: { keys: string[]; moments: CutMoment[] }[]) {
  const out: { a: string; b: string; shared: string[]; w: number }[] = [];
  for (let i = 0; i < arms.length; i++) for (let j = i + 1; j < arms.length; j++) for (const a of arms[i].moments.slice(0, 8)) for (const b of arms[j].moments.slice(0, 8)) {
    const sh = Object.keys(VAL[a.no]).filter((v) => VAL[b.no][v] && AXIS_OF[v] !== "mood" && idf(v) > 0.9);
    const deep = sh.filter((v) => ["story", "who", "scene", "feel"].includes(AXIS_OF[v]));
    if (deep.length >= 1 && sh.length >= 2) out.push({ a: a.no, b: b.no, shared: [...deep, ...sh.filter((v) => !deep.includes(v))].slice(0, 2), w: sh.reduce((s, v) => s + idf(v), 0) + deep.length });
  }
  return out.sort((x, y) => y.w - x.w).slice(0, 12).map(({ a, b, shared }) => ({ a, b, shared }));
}
function nextWords(arms: { moments: CutMoment[] }[], read: Read): string[] {
  const used = new Set(read.values.map((x) => x.v)); const cnt: Record<string, number> = {};
  for (const a of arms) for (const m of a.moments.slice(0, 6)) for (const [v, s] of Object.entries(VAL[m.no])) if (!used.has(v) && ["mood", "story", "who", "feel"].includes(AXIS_OF[v])) cnt[v] = (cnt[v] || 0) + s * idf(v);
  return Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v]) => v);
}

// ---------- 4. 腕の名前（言葉の声で。事実を書かせない・人名を入れさせない・長さ検査。落ちたら値の組み合わせ）
// 値ラベルの短い言い方（テンプレと、名前の検査に使う）
const SHORT: Record<string, string> = { "引退・最後": "引退", "記録・偉業": "記録", "王者の証明": "王者", "優勝の瞬間": "優勝", "満員の熱狂": "大歓声", "静寂から爆発": "静寂", "涙の場面": "涙", "海外の日本人": "海外組", "投手の快投": "快投" };
const short = (v: string) => SHORT[v] || v;
const template = (keys: string[]) => (keys.length >= 2 ? `${short(keys[0])} × ${short(keys[1])}` : short(keys[0] || "近い熱狂"));
// 名前が中身を言っているか: 腕の値のラベル・短縮・同義語のどれかを含む
const SYN_OF: Record<string, string[]> = {}; for (const a of LEX.axes) for (const v of a.values) SYN_OF[v.v] = [v.v, short(v.v), ...v.syn].filter((x) => x.length >= 2 || /[一-龥]/.test(x));
const grounded = (name: string, keys: string[]) => keys.some((k) => (SYN_OF[k] || [k]).some((w) => name.includes(w)));
const POETIC = /夜空|閃光|希望|予感|胎動|風|雨|虹|月|光|輝|軌跡|華|舞|囁|煌|彩|響|宿命|運命|物語|ドラマ|伝説|奇跡|魂|鼓動|旋律|咆哮|頂|翼|星|空|夢/;
const NCACHE = new Map<string, string[]>();
async function nameArms(q: string, arms: { keys: string[]; byName?: boolean; moments: CutMoment[] }[], person = ""): Promise<{ names: string[]; source: "llm" | "template" }> {
  // 人名で束ねた腕は、その名前そのもの（入力文をそのまま見出しにすると長文がラベルになる）
  const tmpl = arms.map((a) => (a.byName ? person || q : template(a.keys)));
  const key = q + "::" + arms.map((a) => a.keys.join("+")).join("/");
  if (NCACHE.has(key)) return { names: NCACHE.get(key)!, source: "llm" };
  if (!gcpAvailable()) return { names: tmpl, source: "template" };
  const sys = `スポーツ誌の見出しを付ける編集者です。観る人が投げた言葉で組んだハイライトの束（腕）に、短い見出しを付けます。
- 見出しは中身を言う。各腕の「中身の値」の言葉（またはその言い換え）を必ず含める。例: 中身=ベテラン×引退 →「ベテラン、最後の打席」「引退の日の一振り」
- 4〜8文字（炸裂の帯に一目で読める長さ）。読点で二つに分けない。スポーツ新聞・実況が使う、具体的で強い言葉。投げた言葉の口調は受けてよい。
- 禁止: 詩的・抽象的な比喩（空・光・風・雨・夢・奇跡・魂・物語・運命 など）、人名・チーム名・大会名・数字、腕どうしの重複。`;
  const user = (q ? `言葉: 「${q}」\n` : "（言葉には触れず、中身だけで見出しを付ける）\n") + arms.map((a, i) => `腕${i + 1}: 中身の値=${a.keys.join("×")} / 例=${a.moments.slice(0, 3).map((m) => MOM.find((x) => x.no === m.no)!.title).join("、")}`).join("\n");
  try {
    const r = await vertexChain(sys, user, { type: "OBJECT", properties: { names: { type: "ARRAY", items: { type: "STRING" } } }, required: ["names"] }, 3000);
    const bad = (n: string, keys: string[]) => n.length < 3 || n.length > 11 || /\d/.test(n) || POETIC.test(n) || !grounded(n, keys) || NAMES.some((x) => x.name.length >= 2 && n.includes(x.name));
    const names = arms.map((a, i) => { if (a.byName) return tmpl[i]; const n = String(r.names?.[i] || "").trim(); return !n || bad(n, a.keys) ? tmpl[i] : n; });
    if (new Set(names).size !== names.length) return { names: tmpl, source: "template" };
    NCACHE.set(key, names); return { names, source: "llm" };
  } catch { return { names: tmpl, source: "template" }; }
}

// ---------- 5. 入口: 想定外の入力を含む全ての分岐
const DEFAULT_Q = "__default";
const CCACHE = new Map<string, Cut>();
// 事前計算した切り口（scripts/precompute_cuts.mjs）。分解・辞書を変えたら作り直す
import cutsRaw from "@/data/cuts2026.json";
for (const [k, v] of Object.entries(cutsRaw as unknown as Record<string, Cut>)) CCACHE.set(normalize(k), { ...v, source: v.source + "+pre" });
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
  // (c) 読めない・足りない・一部しか読めていない（長文・口語）→ LLM で辞書へ翻訳して足す
  if (cands.length < MIN_MOMENTS || (read.coverage ?? 1) < 0.6) {
    const tr = await translate(q);
    if (tr) {
      source = "lexicon+llm";
      if (tr.kind === "inappropriate") return { ...(await defaultCut()), q, status: "refused", message: "この言葉では組み替えられません。別の言葉で投げてみてください。", ms: Date.now() - t0 };
      if (tr.kind === "nonsense" || tr.kind === "not_sports" || !tr.values.length) {
        if (!read.values.length && !read.names.length) return { ...(await defaultCut()), q, status: "unreadable", message: `「${q}」はうまく読めませんでした。たとえば…`, ms: Date.now() - t0 };
      } else {
        const lowCov = (read.coverage ?? 1) < 0.6;
        const merged = new Map(read.values.filter((x) => !(lowCov && x.via.startsWith("状況:"))).map((x) => [x.v, x]));
        for (const x of tr.values) if (!merged.has(x.v)) merged.set(x.v, { v: x.v, axis: AXIS_OF[x.v], w: x.w * 0.9, via: "読み" });
        read = { values: Array.from(merged.values()), sports: Array.from(new Set([...read.sports, ...tr.sports])), names: read.names };
        const absent = tr.kind === "entity_absent" && !read.names.length; // 人名が一覧に当たっていれば「いない」扱いにしない
        status = tr.kind === "metaphor" ? "metaphor" : absent ? "nearest" : "translated";
        message = tr.kind === "metaphor" ? `「${q}」を〈${tr.reading || read.values.slice(0, 2).map((x) => x.v).join("・")}〉として読みました` : absent ? `「${q}」は100の瞬間に含まれていません。近い熱狂で組みました` : null;
      }
    } else if (!read.values.length && !read.names.length && !read.sports.length) {
      // (d) LLM が使えない/落ちた → 字の近さで最後の網
      read = fuzzy(q); source = "fuzzy"; status = "partial";
      if (!read.values.length) return { ...(await defaultCut()), q, status: "unreadable", message: `「${q}」はうまく読めませんでした。たとえば…`, ms: Date.now() - t0 };
      message = `「${q}」を〈${read.values[0].v}〉に近い言葉として読みました`;
    } else status = "partial";
    cands = score(read);
  }
  // (e) 軸足で絞って少ない → 軸足を外す。まだ少ない → 競技の絞り込みを外して広げる
  if (cands.length < MIN_MOMENTS && anchorOf(read)) { const loose = score(read, false); if (loose.length > cands.length) cands = loose; }
  if (cands.length < MIN_MOMENTS && read.sports.length && read.values.length) {
    const inSport = cands;
    const wide = score({ ...read, sports: [] }).filter((c) => !inSport.some((x) => x.m.no === c.m.no));
    if (wide.length) { cands = [...inSport.map((c) => ({ ...c, s: Math.min(1, c.s + 0.5) })), ...wide]; message = (message ? message + "。" : "") + `${read.sports.join("・")}の外にも広げました`; }
  }
  if (!cands.length) return { ...(await defaultCut()), q, status: "unreadable", message: `「${q}」に当てはまる瞬間が見つかりませんでした。たとえば…`, ms: Date.now() - t0 };
  // (f) それでも少ない → 見つかった瞬間に特徴的な値（希少な順に3つ）を足して、近い熱狂まで広げる
  if (cands.length < MIN_MOMENTS) {
    const used = new Set(read.values.map((x) => x.v)); const cnt: Record<string, number> = {};
    for (const c of cands) for (const [v, sv] of Object.entries(VAL[c.m.no])) if (!used.has(v) && AXIS_OF[v] !== "mood") cnt[v] = (cnt[v] || 0) + sv * idf(v);
    const extra = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v]) => ({ v, axis: AXIS_OF[v], w: 0.5, via: "近い熱狂" }));
    if (extra.length) {
      // 広げた分は人名の加点を外して別に採点する（人名の瞬間の点が高すぎて足切りで全部落ちた）
      const near = score({ values: [...read.values.filter((x) => x.via !== "既定"), ...extra], sports: [], names: [] }, false).filter((c) => !cands.some((x) => x.m.no === c.m.no)).slice(0, 18).map((c) => ({ ...c, s: c.s * 0.8 }));
      cands = [...cands, ...near];
      read = { ...read, values: [...read.values, ...extra] };
    }
  }
  const armsRaw = buildArms(cands, read);
  const nm = await nameArms(status === "nearest" ? "" : q, armsRaw, read.names[0]?.name || "");
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
