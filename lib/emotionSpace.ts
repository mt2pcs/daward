import { EMOTIONS, type Emotion, type Moment } from "./types";

// 感情の宇宙の座標系。
// - 8つの感情がそれぞれ星団（クラスタ）を持ち、ロゴパレットの色を纏う
// - 各モーメントは感情ベクトルの重心に浮かぶ（単一感情は星団の核、複合感情は星団の間）
// - 言葉で組み替えるモードでは、入力ベクトルとの類似度で中心へ集まる

export type Vec3 = [number, number, number];

export const EMOTION_COLORS: Record<Emotion, string> = {
  歓喜: "#ff8a3d",
  涙: "#3fa9f5",
  鳥肌: "#8b5cf6",
  緊張: "#e5322d",
  一体感: "#5ee06a",
  別れ: "#ff5c8a",
  逆転: "#d6ff4a",
  気迫: "#ff2e63",
};

export const CLUSTER_RADIUS = 62;

// 8つの星団中心: 環状に配置し、上下に交互にずらす（どの角度から見ても重なりにくい）
export function clusterCenters(): Vec3[] {
  const n = EMOTIONS.length;
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2 + 0.35;
    const y = (i % 2 === 0 ? 1 : -1) * 16 + (i % 4 < 2 ? 4 : -4);
    out.push([
      Math.cos(th) * CLUSTER_RADIUS,
      y,
      Math.sin(th) * CLUSTER_RADIUS,
    ]);
  }
  return out;
}

export function vecOf(m: Moment): number[] {
  if (m.vec && m.vec.length === EMOTIONS.length) return m.vec;
  const v = new Array(EMOTIONS.length).fill(0);
  m.emotions.forEach((e, rank) => {
    const i = EMOTIONS.indexOf(e);
    if (i >= 0) v[i] = [1.0, 0.6, 0.35][rank] ?? 0.25;
  });
  return v;
}

export function cosine(a: number[], b: number[]): number {
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

// 決定論的な擬似乱数（IDから）
function seeded(id: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

// 感情の地図上の位置: 主感情の星団を基点に、副感情の方へ少しだけ流れる。
// 単一感情の瞬間は星団の核に、複合感情の瞬間は星団の間に浮かぶ
export function mapPosition(m: Moment, centers: Vec3[]): Vec3 {
  const v = vecOf(m);
  let pi = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > v[pi]) pi = i;
  const base = centers[pi];
  const p: Vec3 = [base[0], base[1], base[2]];
  for (let i = 0; i < centers.length; i++) {
    if (i === pi || v[i] <= 0) continue;
    // 副感情の重み（主感情比）× 0.4 だけその星団へ寄る
    const t = (v[i] / (v[pi] || 1)) * 0.4;
    p[0] += (centers[i][0] - base[0]) * t;
    p[1] += (centers[i][1] - base[1]) * t;
    p[2] += (centers[i][2] - base[2]) * t;
  }
  const rnd = seeded(m.id);
  const spread = 9 + rnd() * 13;
  const th = rnd() * Math.PI * 2;
  const ph = Math.acos(2 * rnd() - 1);
  p[0] += Math.sin(ph) * Math.cos(th) * spread;
  p[1] += Math.cos(ph) * spread * 0.55;
  p[2] += Math.sin(ph) * Math.sin(th) * spread;
  return p;
}

// 言葉で組み替えたときの位置: 似ているほど中心の塊へ、遠いものは外周へ
export function queryPosition(mapPos: Vec3, sim: number, id: string): Vec3 {
  const len = Math.hypot(mapPos[0], mapPos[1], mapPos[2]) || 1;
  const dir: Vec3 = [mapPos[0] / len, mapPos[1] / len, mapPos[2] / len];
  const s = Math.max(0, Math.min(1, sim));
  const rnd = seeded(id + "q");
  const r = 6 + Math.pow(1 - s, 1.7) * 105 + rnd() * 4;
  return [dir[0] * r, dir[1] * r * 0.7, dir[2] * r];
}

// 言葉→感情ベクトル（プロトタイプは辞書。本番はClaude APIで推定）
export const QUERY_KEYWORDS: Record<Emotion, string[]> = {
  歓喜: ["嬉し", "うれし", "最高", "やった", "歓喜", "喜", "笑顔", "ハッピー", "優勝", "サイコー", "たまらん", "幸せ", "勝っ", "勝利", "祝"],
  涙: ["泣", "涙", "感動", "号泣", "うるっ", "じーん", "ジーン", "切な", "ぐっと", "グッと", "泣け", "エモ"],
  鳥肌: ["鳥肌", "すご", "凄", "衝撃", "信じられ", "えぐ", "エグ", "やば", "ヤバ", "震え", "神", "圧倒", "凄まじ", "スーパープレー"],
  緊張: ["緊張", "ドキドキ", "ハラハラ", "手に汗", "祈", "息をのむ", "心臓", "接戦", "ギリギリ", "土壇場", "延長"],
  一体感: ["みんな", "一体", "会場", "スタジアム", "声援", "応援", "一緒", "仲間", "チーム", "全員", "国民", "日本中", "熱狂", "盛り上が"],
  別れ: ["ありがとう", "引退", "お疲れ", "さよなら", "ラスト", "最後", "惜しま", "旅立", "別れ", "見納め"],
  逆転: ["逆転", "諦め", "あきらめ", "不屈", "粘り", "執念", "奇跡", "どんでん", "劇的", "巻き返", "追い上げ", "サヨナラ"],
  気迫: ["気迫", "魂", "本気", "全力", "闘志", "かっこ", "カッコ", "痺れ", "しびれ", "漢", "強", "根性", "ガッツ", "熱"],
};

export function textToVector(text: string): { vec: number[]; primary: Emotion } | null {
  const v = new Array(EMOTIONS.length).fill(0);
  let any = false;
  EMOTIONS.forEach((e, i) => {
    let score = 0;
    for (const kw of QUERY_KEYWORDS[e]) {
      let idx = text.indexOf(kw);
      while (idx !== -1) {
        score += 1;
        idx = text.indexOf(kw, idx + kw.length);
      }
    }
    // 強調語で増幅（「めちゃくちゃ泣ける」「本当に」など）
    if (score > 0 && /めちゃ|マジ|本当に|超|最高に|死ぬほど|やばいくらい/.test(text)) score += 0.6;
    if (score > 0) any = true;
    v[i] = score;
  });
  if (!any) return null;
  const max = Math.max(...v);
  const vec = v.map((x) => x / max);
  const primary = EMOTIONS[vec.indexOf(1)];
  return { vec, primary };
}
