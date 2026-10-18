import BurstWorld from "@/components/BurstWorld";
import moments from "@/data/moments2026.json";

export const metadata = { title: "熱狂の炸裂 — DAZN 100 MOMENTS", robots: { index: false } };
export const dynamic = "force-dynamic";

// 体験: 炸裂の空間の内側を前進し、瞬間がかけら（人×その1秒）に割れ、押したかけらが新しい消失点になって組み替わる。
// ?no=090 で投票サイトの詳細から「その1本」を開いた状態で入る。旧版（切り口エンジン）は /lab/cut
export default function Experience({ searchParams }: { searchParams: { no?: string } }) {
  const list = (Array.isArray(moments) ? moments : Object.values(moments)) as { no: string; clips?: { webm?: string; loop?: string }[] }[];
  const media = Object.fromEntries(list.map((m) => [m.no, { webm: m.clips?.[0]?.webm, loop: m.clips?.[0]?.loop }]));
  return <BurstWorld media={media} startNo={searchParams.no} />;
}
