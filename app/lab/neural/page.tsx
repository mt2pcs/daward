import NeuralWorld from "@/components/NeuralWorld";
import moments from "@/data/moments2026.json";

export const metadata = { title: "熱狂の神経系 — DAZN 100 MOMENTS", description: "100の瞬間を熱狂の文脈に超分解し、響き合う瞬間を探索して自分だけのダイジェストを編む。" };
export const dynamic = "force-dynamic";

// 熱狂の神経系（2026-10-19「体験になっていない」で表は HeatViewer に。参考として残す）
// ?no=090 で投票サイトの詳細から「その1本」に飛び込んだ状態で入る
export default function NeuralLab({ searchParams }: { searchParams: { no?: string } }) {
  const list = (Array.isArray(moments) ? moments : Object.values(moments)) as { no: string; clips?: { webm?: string; loop?: string }[] }[];
  const media = Object.fromEntries(list.map((m) => [m.no, { webm: m.clips?.[0]?.webm, loop: m.clips?.[0]?.loop }]));
  return <NeuralWorld media={media} startNo={searchParams.no} />;
}
