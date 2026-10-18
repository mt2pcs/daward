import BrainWorld from "@/components/BrainWorld";
import moments from "@/data/moments2026.json";

export const metadata = { title: "熱狂の脳 — DAZN 100 MOMENTS", description: "今年のハイライトを熱に分け、8つの見方で読み、競技をまたいで繋いだ熱狂の脳。", robots: { index: false } };

// 熱狂の脳（2026-10-19 合意: トラクトグラフィーの表現で、文脈の多次元分解と意味の接続を全部見せる）
export default function BrainLab() {
  const list = (Array.isArray(moments) ? moments : Object.values(moments)) as { no: string; clips?: { webm?: string; loop?: string }[] }[];
  const media = Object.fromEntries(list.map((m) => [m.no, { webm: m.clips?.[0]?.webm, loop: m.clips?.[0]?.loop }]));
  return <BrainWorld media={media} />;
}
