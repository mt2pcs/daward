// コンテキストマップ（2026・本番100本）のグラフデータ。中心は「熱狂の文脈」（観る人が熱くなる理由を下から束ねたもの）。
// data/contextmap2026.json は scripts/contextmap/map_all.mjs で生成（理由 → 文脈 → 割り当て → つながりの一文 → 事実の点検）。
export interface CMReason { id: string; no: string; title: string; sport: string; context: string; t: string; seen: string; why: string; strength: number }
export interface CMData {
  vocab: { id: string; name: string; definition: string }[];
  member: Record<string, { id: string; no: string; fit: number }[]>;
  links: Record<string, { a: string; b: string; line: string }[]>;
  check: Record<string, Record<string, string[]>>;
  items: CMReason[];
}
export interface CMMoment { no: string; title: string; sport: string; group: string; thumb: string | null }
export type CMKind = "moment" | "context" | "sport";
export const CM_LABEL: Record<CMKind, string> = { moment: "瞬間", context: "熱狂の文脈", sport: "競技" };
export const CM_COLOR: Record<CMKind, string> = { moment: "#f4f4f2", context: "#ebff00", sport: "#ff8a3d" };
export interface CMNode {
  id: string; kind: CMKind; label: string; color: string; weight: number;
  moment?: CMMoment; context?: CMData["vocab"][number];
  x: number; y: number; vx: number; vy: number; deg: number; fixed: boolean;
}
export interface CMLink { a: number; b: number; kind: "in" | "pair" | "sport"; w: number; reason?: CMReason; line?: string; ctx?: string }

export function buildContextMap(moments: CMMoment[], d: CMData) {
  const nodes: CMNode[] = [], links: CMLink[] = [], index = new Map<string, number>();
  const add = (id: string, kind: CMKind, label: string, extra: Partial<CMNode> = {}) => {
    const hit = index.get(id); if (hit !== undefined) return hit;
    nodes.push({ id, kind, label, color: CM_COLOR[kind], weight: 0.5, x: 0, y: 0, vx: 0, vy: 0, deg: 0, fixed: false, ...extra });
    index.set(id, nodes.length - 1); return nodes.length - 1;
  };
  const link = (l: CMLink) => { links.push(l); nodes[l.a].deg++; nodes[l.b].deg++; };
  const byId = new Map(d.items.map((x) => [x.id, x]));
  for (const m of moments) add(`m:${m.no}`, "moment", m.title, { moment: m });
  for (const c of d.vocab) {
    const ms = d.member[c.id] || []; if (!ms.length) continue;
    const ci = add(`c:${c.id}`, "context", c.name, { context: c });
    for (const m of ms) { const mi = index.get(`m:${m.no}`); if (mi === undefined) continue; link({ a: mi, b: ci, kind: "in", w: 0.5 + 0.5 * m.fit, reason: byId.get(m.id), ctx: c.id }); }
    for (const l of d.links[c.id] || []) { const A = byId.get(l.a), B = byId.get(l.b); if (!A || !B) continue; const a = index.get(`m:${A.no}`), b = index.get(`m:${B.no}`); if (a === undefined || b === undefined) continue; link({ a, b, kind: "pair", w: 0.35, line: l.line, ctx: c.id }); }
  }
  // 配置のばね: 各瞬間のいちばん強い文脈だけ強く、ほかは弱く（全部同じ強さだと文脈が中心に寄り集まって読めない）
  const ins = new Map<number, CMLink[]>();
  for (const l of links) if (l.kind === "in") { if (!ins.has(l.a)) ins.set(l.a, []); ins.get(l.a)!.push(l); }
  for (const arr of Array.from(ins.values())) { arr.sort((p, q) => q.w - p.w); arr.forEach((l, k) => { l.w = k === 0 ? 1 : 0.22; }); }
  for (const m of moments) { const mi = index.get(`m:${m.no}`)!; link({ a: mi, b: add(`s:${m.sport}`, "sport", m.sport), kind: "sport", w: 0.25 }); }
  for (const n of nodes) n.weight = n.kind === "moment" ? 0.35 + Math.min(0.65, n.deg * 0.07) : Math.min(1, 0.2 + Math.sqrt(n.deg) * 0.16);
  return { nodes, links };
}
