export const EMOTIONS = [
  "歓喜",
  "涙",
  "鳥肌",
  "緊張",
  "一体感",
  "別れ",
  "逆転",
  "気迫",
] as const;

export type Emotion = (typeof EMOTIONS)[number];

export interface Moment {
  id: string; // "M001" .. "M100"
  index: number; // 1..100
  youtubeId: string;
  title: string;
  sport: string;
  event: string;
  year: number;
  description: string;
  emotions: Emotion[]; // first = primary
  vec?: number[]; // 8軸の感情ベクトル（EMOTIONS順、0..1）
  intensity?: number; // 感情の強度（静謐0.2〜爆発1.0）
  peakSec?: number; // 山場の頭出し秒（0=冒頭から）
}

// スペシャル映像の1カット。role が感情の弧の中での役割
export interface ArcCut {
  id: string;
  role: "intro" | "rise" | "climax" | "yours";
  ms: number;
  startSec: number;
  youtubeId: string;
  title: string;
  event: string;
  emotion: Emotion; // 表示用の主感情
}

export interface MomentComment {
  id: string;
  momentId: string;
  text: string;
  author: string;
  emotion: Emotion;
  createdAt: string;
}

export interface MomentWithStats extends Moment {
  votes: number;
  commentCount: number;
}

export interface VoteResponse {
  moment: MomentWithStats;
  matched: MomentWithStats[];
  cuts: ArcCut[]; // 感情の弧として編集されたカット表（頂点=投票先を含む）
  emotion: Emotion;
  comment: MomentComment;
}
