import MomentsApp from "@/components/MomentsApp";
import ExperienceApp from "@/components/ExperienceApp";
import { listMoments } from "@/lib/store";
import { MOMENTS, media } from "@/lib/vote/data";

export const dynamic = "force-dynamic";

// VISUAL_MODE=burst のサービスは本番の体験（2026年の100本＋切り口エンジン）。渦版（e-mooments）はプロトタイプのまま残す
export default function Home() {
  if (process.env.VISUAL_MODE === "burst") {
    return <ExperienceApp moments={MOMENTS.map((m) => ({ no: m.no, title: m.title, sportLabel: m.sportLabel, group: m.group, date: m.date, thumb: media(m)?.thumb || null }))} />;
  }
  return <MomentsApp initialMoments={listMoments()} visual="vortex" />;
}
