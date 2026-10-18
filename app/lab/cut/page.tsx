import ExperienceApp from "@/components/ExperienceApp";
import { MOMENTS, media } from "@/lib/vote/data";

export const dynamic = "force-dynamic";
// 旧版の体験（切り口エンジン＋炸裂の腕）。参考として残す
export default function Experience() {
  return <ExperienceApp moments={MOMENTS.map((m) => ({ no: m.no, title: m.title, sportLabel: m.sportLabel, group: m.group, date: m.date, thumb: media(m)?.thumb || null }))} />;
}
