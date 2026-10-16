import NetWorld from "@/components/lab/NetWorld";
import moments from "@/data/moments2026.json";

export const metadata = { title: "熱狂の神経系 — DAZN 100 MOMENTS", robots: { index: false } };

// 体験の試作: 100の瞬間 → かけら（人×その1秒）にほどける → 押すたびに全体が組み替わる / 言葉で組み替わる
export default function NetLab() {
  const list = (Array.isArray(moments) ? moments : Object.values(moments)) as { no: string; clips?: { webm?: string; loop?: string }[] }[];
  const media = Object.fromEntries(list.map((m) => [m.no, { webm: m.clips?.[0]?.webm, loop: m.clips?.[0]?.loop }]));
  return <NetWorld media={media} />;
}
