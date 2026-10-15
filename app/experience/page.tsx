import ExperienceApp from "@/components/ExperienceApp";
import { MOMENTS, media } from "@/lib/vote/data";

export const dynamic = "force-dynamic";
// 検証用: どのサービスでも本番の体験を開ける
export default function Experience() {
  return <ExperienceApp moments={MOMENTS.map((m) => ({ no: m.no, title: m.title, sportLabel: m.sportLabel, group: m.group, date: m.date, thumb: media(m)?.thumb || null }))} />;
}
