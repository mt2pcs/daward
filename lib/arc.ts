import { EMOTIONS, type ArcCut, type Emotion, type Moment } from "./types";

// スペシャル映像の編集エンジン。
// 「類似クリップの列挙」ではなく、感情の弧（序→破→急→頂点→余韻）として組む。
// - テーマ = 投票先モーメントのベクトル × 投票コメントから推定した感情
// - 序: テーマに近く強度の低い静かな瞬間（長回し）
// - 破: 強度が上がっていく（カットが縮む）
// - 急: テーマ×強度が最大の瞬間（最短カット）
// - 頂点: あなたが投票したモーメント（山場頭出し・最長）
// 同一スポーツの連続は避ける。カット長は role ごとに固定（テンポの収縮）。

const FALLBACK_VEC = (m: Moment): number[] => {
  const v = new Array(EMOTIONS.length).fill(0);
  m.emotions.forEach((e, rank) => {
    const i = EMOTIONS.indexOf(e);
    if (i >= 0) v[i] = [1.0, 0.6, 0.35][rank] ?? 0.25;
  });
  return v;
};

const vecOf = (m: Moment) =>
  m.vec && m.vec.length === EMOTIONS.length ? m.vec : FALLBACK_VEC(m);
const intensityOf = (m: Moment) => m.intensity ?? 0.6;

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const CUT_MS: Record<ArcCut["role"], number> = {
  intro: 2600,
  rise: 1700,
  climax: 1250,
  yours: 4200,
};

export function buildArc(
  moments: Moment[],
  votedId: string,
  commentEmotion: Emotion
): ArcCut[] {
  const voted = moments.find((m) => m.id === votedId);
  if (!voted) return [];

  // テーマベクトル: 投票先の感情 65% + コメントの感情 35%
  const theme = vecOf(voted).slice();
  const ci = EMOTIONS.indexOf(commentEmotion);
  if (ci >= 0) theme[ci] = Math.min(1.2, theme[ci] * 0.65 + 0.55);

  const scored = moments
    .filter((m) => m.id !== votedId)
    .map((m) => ({
      m,
      sim: cosine(vecOf(m), theme),
      intensity: intensityOf(m),
    }))
    .filter((c) => c.sim > 0.15) // テーマと無関係な瞬間は混ぜない
    .sort((a, b) => b.sim - a.sim);

  const top = scored.slice(0, 18); // テーマ圏内から編成する

  const used = new Set<string>();
  const pick = (
    pool: typeof top,
    n: number,
    lastSport: { v: string }
  ): Moment[] => {
    const out: Moment[] = [];
    for (const c of pool) {
      if (out.length >= n) break;
      if (used.has(c.m.id)) continue;
      if (c.m.sport === lastSport.v) continue; // 同一スポーツの連続を避ける
      used.add(c.m.id);
      lastSport.v = c.m.sport;
      out.push(c.m);
    }
    // 候補が痩せている時はスポーツ制約を緩めて埋める
    if (out.length < n) {
      for (const c of pool) {
        if (out.length >= n) break;
        if (used.has(c.m.id)) continue;
        used.add(c.m.id);
        lastSport.v = c.m.sport;
        out.push(c.m);
      }
    }
    return out;
  };

  const lastSport = { v: "" };
  // 序: 強度の低い順（テーマ圏内で静かなもの）
  const intro = pick(
    [...top].sort((a, b) => a.intensity - b.intensity),
    2,
    lastSport
  );
  // 破: 強度 中位→高位 へ上げる
  const rise = pick(
    [...top].sort(
      (a, b) => a.intensity + a.sim * 0.2 - (b.intensity + b.sim * 0.2)
    ).reverse().slice(3), // 最上位はクライマックスに残す
    2,
    lastSport
  );
  // 急: テーマ×強度の最大
  const climax = pick(
    [...top].sort((a, b) => b.sim * b.intensity - a.sim * a.intensity),
    1,
    lastSport
  );

  const cut = (m: Moment, role: ArcCut["role"]): ArcCut => ({
    id: m.id,
    role,
    ms: CUT_MS[role],
    startSec: m.peakSec ?? 0,
    youtubeId: m.youtubeId,
    title: m.title,
    event: m.event,
    emotion: m.emotions[0],
  });

  return [
    ...intro.map((m) => cut(m, "intro")),
    ...rise.map((m) => cut(m, "rise")),
    ...climax.map((m) => cut(m, "climax")),
    cut(voted, "yours"),
  ];
}
