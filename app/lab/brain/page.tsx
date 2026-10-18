import BrainWorld from "@/components/BrainWorld";
import moments from "@/data/moments2026.json";

export const metadata = { title: "競技を越えて、同じ熱が集まる — DAZN 100 MOMENTS", description: "今年のハイライトを熱に分け、競技を越えて同じ熱を集めて観る。", robots: { index: false } };

// 競技を越えて、同じ熱が集まる（2026-10-19 の設計の議論で決めた流れ。表現はトラクトグラフィー）
export default function BrainLab() {
  const list = (Array.isArray(moments) ? moments : Object.values(moments)) as { no: string; clips?: { webm?: string; loop?: string; detail?: string }[] }[];
  const media = Object.fromEntries(list.map((m) => [m.no, { webm: m.clips?.[0]?.webm, loop: m.clips?.[0]?.loop, detail: m.clips?.[0]?.detail }]));
  return <BrainWorld media={media} />;
}
