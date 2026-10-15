import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Feed from "@/components/vote/Feed";
import { MOMENTS, byNo, indexOf, media, phase } from "@/lib/vote/data";
import { votedToday } from "@/lib/vote/store";

export const dynamic = "force-dynamic";

// モーメント単体の URL と OGP（シェアから来た人はこの画面に着地）
export function generateMetadata({ params }: { params: { no: string } }): Metadata {
  const m = byNo(params.no); if (!m) return {};
  const og = media(m)?.og;
  const title = `No.${m.no} ${m.title} | DAZN 100 MOMENTS`;
  return { title, description: m.short || m.description, openGraph: { title, description: m.short || m.description, images: og ? [{ url: og, width: 1200, height: 630 }] : [] }, twitter: { card: "summary_large_image", title, images: og ? [og] : [] } };
}

export default function MomentDetail({ params }: { params: { no: string } }) {
  const i = indexOf(params.no); if (i < 0) notFound();
  const v = votedToday();
  const items = MOMENTS.map((m) => { const c = media(m); return { no: m.no, title: m.title, short: m.short, description: m.description, sportLabel: m.sportLabel, group: m.group, date: m.date, competition: m.context.competition, detail: c?.detail || null, loop: c?.loop || null, webm: c?.webm || null, poster: c?.poster || null, thumb: c?.thumb || null }; });
  return <main><Feed items={items} start={i} phase={phase()} votedNo={v.voted ? v.no || null : null} /></main>;
}
