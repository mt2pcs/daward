import type { Metadata } from "next";
import "./vote.css";
import Header from "@/components/vote/Header";
import { phase, VOTE_END, fmtMD } from "@/lib/vote/data";

export const metadata: Metadata = {
  title: "DAZN 100 MOMENTS | DAZN AWARDS 2026",
  description: "2026年、心が震えた100の瞬間。あなたが一番心を震わせたモーメントに投票しよう。",
};
export const dynamic = "force-dynamic";

export default function MomentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="v26">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Noto+Sans+JP:wght@400;700;900&display=swap" />
      <Header phase={phase()} voteEnd={fmtMD(VOTE_END)} />
      {children}
    </div>
  );
}
