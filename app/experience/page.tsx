import HeatViewer from "@/components/HeatViewer";
import moments from "@/data/moments2026.json";

export const metadata = { title: "熱狂の神経系 — DAZN 100 MOMENTS", description: "100の瞬間を熱狂の文脈に超分解し、響き合う瞬間を探索して自分だけのダイジェストを編む。" };
export const dynamic = "force-dynamic";

// 体験: 空間で1本を選ぶ→観る→熱にほどける→熱を選ぶ→100本を探索→ダイジェスト→シェア（components/HeatViewer.tsx）
// ?no=090 で投票サイトの詳細から「その1本」に飛び込んだ状態で入る
export default function Experience({ searchParams }: { searchParams: { no?: string } }) {
  const list = (Array.isArray(moments) ? moments : Object.values(moments)) as { no: string; clips?: { webm?: string; loop?: string }[] }[];
  const media = Object.fromEntries(list.map((m) => [m.no, { webm: m.clips?.[0]?.webm, loop: m.clips?.[0]?.loop }]));
  return <HeatViewer media={media} startNo={searchParams.no} />;
}
