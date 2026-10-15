import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ConfirmForm from "@/components/vote/ConfirmForm";
import { byNo, media, phase } from "@/lib/vote/data";
import { votedToday } from "@/lib/vote/store";

export const dynamic = "force-dynamic";

export default function VoteConfirm({ params }: { params: { no: string } }) {
  const m = byNo(params.no); if (!m) notFound();
  if (phase() !== "open") redirect(`/moments/${m.no}`);
  const v = votedToday();
  const th = media(m)?.thumb;
  return (
    <main className="v26-page">
      <h1>{v.voted ? "本日は投票済みです" : "このモーメントに投票しますか？"}</h1>
      <div className="thumb">{th && <img src={th} alt="" />}<span className="no">{m.no}</span></div>
      <div className="cap"><small>No.{m.no}　{m.sportLabel}</small>{m.title}</div>
      {v.voted ? (
        <>
          <p className="note">本日は No.{v.no} に投票済みです。明日また投票できます。</p>
          <div className="row"><Link className="ghost" href="/moments">ほかのモーメントを見る</Link></div>
        </>
      ) : <ConfirmForm no={m.no} />}
    </main>
  );
}
