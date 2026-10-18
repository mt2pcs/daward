import BurstWorld from "@/components/BurstWorld";
import moments from "@/data/moments2026.json";

export const metadata = { title: "熱狂の炸裂 — DAZN 100 MOMENTS", robots: { index: false } };
export const dynamic = "force-dynamic";

// 却下（2026-10-18「紙芝居・関連動画のレコメンドと変わらない」）。参考として残す
export default function BurstLab({ searchParams }: { searchParams: { no?: string } }) {
  const list = (Array.isArray(moments) ? moments : Object.values(moments)) as { no: string; clips?: { webm?: string; loop?: string }[] }[];
  const media = Object.fromEntries(list.map((m) => [m.no, { webm: m.clips?.[0]?.webm, loop: m.clips?.[0]?.loop }]));
  return <BurstWorld media={media} startNo={searchParams.no} />;
}
