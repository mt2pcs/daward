import type { Metadata } from "next";
import ContextMap2026 from "@/components/ContextMap2026";
import { MOMENTS, media } from "@/lib/vote/data";
import data from "@/data/contextmap2026.json";
import type { CMData } from "@/lib/contextMap2026";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "CONTEXT MAP | DAZN 100 MOMENTS" };

// 本番100本のコンテキストマップ（熱狂の文脈でつないだ地図）。旧 2025 仮データの CONTEXT GRAPH（components/ContextGraph.tsx）は未使用で残置
export default function GraphPage() {
  const moments = MOMENTS.map((m) => ({ no: m.no, title: m.title, sport: m.sportLabel, group: m.group, thumb: media(m)?.thumb || null }));
  return <ContextMap2026 moments={moments} data={data as unknown as CMData} />;
}
