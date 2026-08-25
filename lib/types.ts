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
  emotion: Emotion;
  comment: MomentComment;
}
