import raw from "@/data/moments2026.json";

// 投票サイト「DAZN 100 MOMENTS」のデータ層。元データは素材シート（data/sheet2026.json）＋文脈（data/context2026.json）＋取り込み済み素材。
export interface Clip { key: string; detail: string | null; loop: string; webm: string; poster: string; thumb: string; og: string; peakSec: number; srcDuration: number }
export interface Moment2026 {
  no: string; title: string; titles: string[]; short: string; description: string;
  sport: string; sportLabel: string; group: string; date: string; rights: string; emo: string; prio: string; delivered: string;
  hasVideo: boolean; clips: Clip[];
  context: { people: string[]; teams: string[]; competition: string; motifs: string[]; beat: string; why: string; crowd: string };
}
export const MOMENTS: Moment2026[] = raw as Moment2026[];
export const GROUPS = ["すべて", "W杯", "サッカー", "野球", "バスケ", "ラグビー", "ボクシング", "モータースポーツ", "その他"] as const;
export const byNo = (no: string) => MOMENTS.find((m) => m.no === no);
export const indexOf = (no: string) => MOMENTS.findIndex((m) => m.no === no);
export const media = (m: Moment2026) => m.clips[0] || null;

// 投票の時期（I/V 共通）。環境変数で固定でき、無ければ日付で決める。
export type Phase = "pre" | "open" | "closed" | "result";
export const VOTE_START = process.env.VOTE_START || "2026-11-05";
export const VOTE_END = process.env.VOTE_END || "2026-12-14"; // 未定。締切日はクライアント確定待ち
export const RESULT_DATE = "2026-12-21";
export function phase(now = new Date()): Phase {
  const f = process.env.VOTE_PHASE as Phase | undefined;
  if (f === "pre" || f === "open" || f === "closed" || f === "result") return f;
  const jst = new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (jst >= RESULT_DATE) return "result";
  if (jst > VOTE_END) return "closed";
  if (jst < VOTE_START) return "pre";
  return "open";
}
export const fmtMD = (iso: string) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;
