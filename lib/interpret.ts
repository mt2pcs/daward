import { EMOTIONS, type Emotion, type Moment } from "./types";
import { cosine, textToVector, vecOf } from "./emotionSpace";

// 言葉 → 渦の腕（クラスタ）。
// 固定の分類（感情8種）ではなく、LLMが100本の映像を読んで「その言葉のための腕」を命名・割当する。
//   例:「ベテランの熱量」→ 引退の花道 / 40歳の逆襲 / 背中で語る / 経験が勝った日
// 入力が無いとき（初期状態）も、LLMが映像データ全体から腕を生成する（毎回同じになるようキャッシュ）。
// キー無し/失敗時は感情ベクトルの辞書に落ちる。

export interface Arm {
  name: string; // 腕の名前（4〜10文字）
  color: string; // 表示色
  ids: string[]; // 関連度の高い順
}

export interface Interpretation {
  text: string; // ""=初期状態
  theme: string; // 中央に立てる短い言葉
  primary: Emotion; // フィルムのテーマ用
  vec: number[]; // 8軸（EMOTIONS順、0..1）
  arms: Arm[];
  scores: Record<string, number>; // momentId → 0..1（腕に入らなかったものは無い）
  source: "llm" | "dictionary";
}

// ロゴパレット。腕に順番に割り当てる
export const ARM_COLORS = ["#ff8a3d", "#3fa9f5", "#8b5cf6", "#e5322d", "#5ee06a", "#ff5c8a", "#d6ff4a", "#ff2e63"];

const FALLBACK_NAMES: Record<Emotion, string> = {
  歓喜: "歓喜の爆発",
  涙: "日本中が泣いた夜",
  鳥肌: "一撃の衝撃",
  緊張: "息をのむ土壇場",
  一体感: "声援がつくった勝利",
  別れ: "最後の花道",
  逆転: "ロスタイムの奇跡",
  気迫: "王者の返り討ち",
};

const cache = new Map<string, Interpretation>();
let defaultPending: Promise<Interpretation> | null = null;

export async function interpret(text: string, moments: Moment[]): Promise<Interpretation | null> {
  const key = text.trim();
  if (!key) return defaultArms(moments);
  const hit = cache.get(key);
  if (hit) return hit;
  let out: Interpretation | null = null;
  if (process.env.OPENAI_API_KEY) {
    try {
      out = await interpretLLM(key, moments);
    } catch (e) {
      console.error("interpret llm failed", e);
    }
  }
  if (!out) out = interpretDictionary(key, moments);
  if (out) cache.set(key, out);
  return out;
}

// 初期状態の腕: LLMで一度だけ生成（失敗時は感情ベース）
export function defaultArms(moments: Moment[]): Promise<Interpretation> {
  const hit = cache.get("");
  if (hit) return Promise.resolve(hit);
  if (defaultPending) return defaultPending;
  defaultPending = (async () => {
    let out: Interpretation | null = null;
    if (process.env.OPENAI_API_KEY) {
      try {
        out = await defaultLLM(moments);
      } catch (e) {
        console.error("default arms llm failed", e);
      }
    }
    if (!out) out = defaultDictionary(moments);
    cache.set("", out);
    defaultPending = null;
    return out;
  })();
  return defaultPending;
}

function primaryOf(m: Moment): Emotion {
  return m.emotions[0];
}

export function defaultDictionary(moments: Moment[]): Interpretation {
  const arms: Arm[] = EMOTIONS.map((e, i) => ({
    name: FALLBACK_NAMES[e],
    color: ARM_COLORS[i % ARM_COLORS.length],
    ids: moments.filter((m) => primaryOf(m) === e).map((m) => m.id),
  })).filter((a) => a.ids.length > 0);
  const scores: Record<string, number> = {};
  for (const m of moments) scores[m.id] = m.intensity ?? 0.6;
  const vec = new Array(EMOTIONS.length).fill(0.5);
  return { text: "", theme: "熱狂", primary: "歓喜", vec, arms, scores, source: "dictionary" };
}

export function interpretDictionary(text: string, moments: Moment[]): Interpretation | null {
  const r = textToVector(text);
  if (!r) return null;
  const scores: Record<string, number> = {};
  const scored = moments
    .map((m) => ({ m, s: Math.max(0, Math.min(1, cosine(vecOf(m), r.vec))) }))
    .filter((x) => x.s >= 0.4)
    .sort((a, b) => b.s - a.s)
    .slice(0, 40);
  for (const x of scored) scores[x.m.id] = x.s;
  // 腕: 入力ベクトルで強い感情ごと
  const strong = EMOTIONS.map((e, i) => ({ e, v: r.vec[i] })).filter((x) => x.v >= 0.3).sort((a, b) => b.v - a.v);
  const arms: Arm[] = strong
    .map((x, k) => ({
      name: FALLBACK_NAMES[x.e],
      color: ARM_COLORS[k % ARM_COLORS.length],
      ids: scored.filter((y) => primaryOf(y.m) === x.e).map((y) => y.m.id),
    }))
    .filter((a) => a.ids.length > 0);
  if (arms.length === 0) return null;
  return { text, theme: r.primary, primary: r.primary, vec: r.vec, arms, scores, source: "dictionary" };
}

// ---- LLM ----

function catalogue(moments: Moment[]): string {
  return moments
    .map((m) => `${m.id}|${m.title}|${m.sport}|${m.event}|${m.year}|${m.emotions.join("/")}|${m.description.slice(0, 70)}`)
    .join("\n");
}

async function chatJSON(system: string, user: string): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { choices: { message: { content: string } }[] };
    return JSON.parse(j.choices[0].message.content) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

interface RawArm {
  name?: string;
  picks?: { id: string; s?: number }[];
}

function toArms(raw: unknown, moments: Moment[], maxTotal: number): { arms: Arm[]; scores: Record<string, number> } | null {
  if (!Array.isArray(raw)) return null;
  const ids = new Set(moments.map((m) => m.id));
  const used = new Set<string>();
  const scores: Record<string, number> = {};
  const arms: Arm[] = [];
  let total = 0;
  for (const a of raw as RawArm[]) {
    if (!a || typeof a.name !== "string" || !Array.isArray(a.picks)) continue;
    const list: string[] = [];
    for (const p of a.picks) {
      if (!p || !ids.has(p.id) || used.has(p.id)) continue;
      if (total >= maxTotal) break;
      used.add(p.id);
      list.push(p.id);
      scores[p.id] = Math.max(0.05, Math.min(1, Number(p.s ?? 0.7) || 0.7));
      total++;
    }
    if (list.length > 0) arms.push({ name: a.name.slice(0, 12), color: ARM_COLORS[arms.length % ARM_COLORS.length], ids: list });
  }
  return arms.length > 0 ? { arms, scores } : null;
}

async function interpretLLM(text: string, moments: Moment[]): Promise<Interpretation | null> {
  const sys = `あなたはスポーツ映像アーカイブのキュレーターであり、コピーライターです。
ユーザーが入力した言葉（観たい熱狂の気分・テーマ・競技・選手・年代など何でも）に対して、100本のハイライト映像から
「その言葉のための特集」を組みます。特集は3〜5本の"腕"（テーマ）に分かれ、それぞれに映像を割り当てます。
- 腕の名前は、その言葉を受けた、見た人が思わず観たくなる短い日本語（4〜10文字。例:「引退の花道」「40歳の逆襲」「背中で語る」）。
  ありきたりなカテゴリ名（「感動」「逆転劇」など単語1つ）は避け、具体的で情景が浮かぶ言葉にする。
- 各腕には関連度の高い順に映像を入れる。全体で最大36本。関連の薄い映像は入れない（入力が狭ければ少なくてよい）。
- 感情の言葉には感情で、競技や選手や年代の言葉にはその内容で、両方ならその両方で判断する。
出力はJSONのみ:
{"theme":"<入力を象徴する1〜4文字の日本語>","primary":"<8感情のうち最も近いもの: 歓喜,涙,鳥肌,緊張,一体感,別れ,逆転,気迫>",
 "vec":[8つの0..1（順に 歓喜,涙,鳥肌,緊張,一体感,別れ,逆転,気迫）],
 "arms":[{"name":"...","picks":[{"id":"M001","s":0.95},...]},...]}`;
  const user = `入力: "${text}"\n\n映像一覧（id|タイトル|競技|大会|年|感情|説明）:\n${catalogue(moments)}`;
  const parsed = await chatJSON(sys, user);
  const primary = (EMOTIONS as readonly string[]).includes(String(parsed.primary)) ? (parsed.primary as Emotion) : null;
  const vecRaw = parsed.vec;
  const vec = Array.isArray(vecRaw) && vecRaw.length === EMOTIONS.length
    ? vecRaw.map((x) => Math.max(0, Math.min(1, Number(x) || 0)))
    : null;
  const armsRes = toArms(parsed.arms, moments, 36);
  if (!primary || !vec || !armsRes) return null;
  const theme = String(parsed.theme || primary).slice(0, 4);
  return { text, theme, primary, vec, arms: armsRes.arms, scores: armsRes.scores, source: "llm" };
}

async function defaultLLM(moments: Moment[]): Promise<Interpretation | null> {
  const sys = `あなたはスポーツ映像アーカイブのキュレーターであり、コピーライターです。
100本のハイライト映像すべてを、6つの"腕"（テーマ）に分けてください。これは「熱狂の渦」というファン投票サイトの初期画面で、
渦の6本の腕それぞれに名前が付きます。
- 腕の名前は、テレビの特集タイトルのように具体的で情景が浮かぶ短い日本語（4〜10文字。例:「最後の花道」「ロスタイムの奇跡」「日本中が泣いた夜」「王者の返り討ち」）。
  「歓喜」「感動」のような感情の単語1つや、競技名だけの名前は禁止。
- 100本すべてをどれか1つの腕に入れる（重複なし）。各腕の中は熱狂度の高い順に並べ、s は 0.3〜1.0 の熱狂度。
出力はJSONのみ:
{"arms":[{"name":"...","picks":[{"id":"M001","s":0.9},...]},...]}`;
  const user = `映像一覧（id|タイトル|競技|大会|年|感情|説明）:\n${catalogue(moments)}`;
  const parsed = await chatJSON(sys, user);
  const armsRes = toArms(parsed.arms, moments, 100);
  if (!armsRes) return null;
  // 入り損ねた映像は最後の腕へ
  const used = new Set(armsRes.arms.flatMap((a) => a.ids));
  for (const m of moments) {
    if (!used.has(m.id)) {
      armsRes.arms[armsRes.arms.length - 1].ids.push(m.id);
      armsRes.scores[m.id] = 0.4;
    }
  }
  const vec = new Array(EMOTIONS.length).fill(0.5);
  return { text: "", theme: "熱狂", primary: "歓喜", vec, arms: armsRes.arms, scores: armsRes.scores, source: "llm" };
}
