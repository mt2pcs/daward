// CONTEXT GRAPH: 100の瞬間を「人物・チーム・大会・モチーフ・感情・競技」に分解して繋ぎ直したグラフのデータ構築。
// data/context.json は scripts/gen_context.mjs（LLM）で生成。ここは純粋なデータ変換（描画は components/ContextGraph.tsx）。
import { EMOTIONS, type MomentWithStats as Moment } from "./types";
import { EMOTION_COLORS, cosine, vecOf } from "./emotionSpace";

export interface MomentContext {
  id: string;
  people: string[];
  teams: string[];
  competition: string;
  motifs: string[];
  beats: string[];
  why: string;
  crowd: string;
}

export type NodeKind = "moment" | "person" | "team" | "competition" | "motif" | "emotion" | "sport";
export const KIND_LABEL: Record<NodeKind, string> = { moment: "瞬間", person: "人物", team: "チーム", competition: "大会", motif: "モチーフ", emotion: "感情", sport: "競技" };
export const KIND_COLOR: Record<NodeKind, string> = { moment: "#f4f4f2", person: "#3fa9f5", team: "#5ee06a", competition: "#8b5cf6", motif: "#ebff00", emotion: "#ff5c8a", sport: "#ff8a3d" };

export interface GNode {
  id: string;
  kind: NodeKind;
  label: string;
  color: string;
  weight: number; // 大きさの元（瞬間: 票・強度、その他: 次数）
  moment?: Moment;
  ctx?: MomentContext;
  // 物理
  x: number; y: number; vx: number; vy: number; r: number; deg: number; fixed: boolean;
}
export interface GLink { a: number; b: number; kind: NodeKind | "similar"; w: number }

export function buildGraph(moments: Moment[], context: MomentContext[]) {
  const nodes: GNode[] = [];
  const index = new Map<string, number>();
  const links: GLink[] = [];
  const add = (id: string, kind: NodeKind, label: string, color: string, extra?: Partial<GNode>) => {
    const hit = index.get(id);
    if (hit !== undefined) return hit;
    const n: GNode = { id, kind, label, color, weight: 1, x: 0, y: 0, vx: 0, vy: 0, r: 3, deg: 0, fixed: false, ...extra };
    index.set(id, nodes.length);
    nodes.push(n);
    return nodes.length - 1;
  };
  const link = (a: number, b: number, kind: GLink["kind"], w = 1) => { links.push({ a, b, kind, w }); nodes[a].deg++; nodes[b].deg++; };
  const ctxById = new Map(context.map((c) => [c.id, c]));
  const maxVotes = Math.max(1, ...moments.map((m) => m.votes));
  for (const m of moments) {
    const c = ctxById.get(m.id);
    const primary = m.emotions[0];
    const mi = add(`m:${m.id}`, "moment", m.title, EMOTION_COLORS[primary] ?? "#fff", { moment: m, ctx: c, weight: 0.35 + 0.65 * Math.pow(m.votes / maxVotes, 0.6) });
    for (const e of m.emotions.slice(0, 2)) link(mi, add(`e:${e}`, "emotion", e, EMOTION_COLORS[e] ?? KIND_COLOR.emotion), "emotion", 0.6);
    link(mi, add(`s:${m.sport}`, "sport", m.sport, KIND_COLOR.sport), "sport", 0.5);
    if (c) {
      for (const p of c.people) link(mi, add(`p:${p}`, "person", p, KIND_COLOR.person), "person");
      for (const t of c.teams) link(mi, add(`t:${t}`, "team", t, KIND_COLOR.team), "team");
      if (c.competition) link(mi, add(`c:${c.competition}`, "competition", c.competition, KIND_COLOR.competition), "competition", 0.8);
      for (const mo of c.motifs) link(mi, add(`o:${mo}`, "motif", mo, KIND_COLOR.motif), "motif", 0.9);
    }
  }
  // 瞬間どうし: 感情ベクトルの近さ（上位2件）
  const vecs = moments.map((m) => vecOf(m));
  const mIdx = moments.map((m) => index.get(`m:${m.id}`)!);
  for (let i = 0; i < moments.length; i++) {
    const sims = moments.map((_, j) => (i === j ? -1 : cosine(vecs[i], vecs[j])));
    const top = sims.map((s, j) => [s, j] as const).sort((a, b) => b[0] - a[0]).slice(0, 2);
    for (const [s, j] of top) if (s > 0.6 && i < j) link(mIdx[i], mIdx[j], "similar", 0.35);
  }
  for (const n of nodes) if (n.kind !== "moment") n.weight = Math.min(1, 0.15 + Math.sqrt(n.deg) * 0.16);
  return { nodes, links };
}

export const EMOTION_LIST = EMOTIONS;
