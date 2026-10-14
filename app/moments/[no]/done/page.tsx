import Link from "next/link";
import { notFound } from "next/navigation";
import ShareButtons from "@/components/vote/ShareButtons";
import { byNo, media } from "@/lib/vote/data";

export const dynamic = "force-dynamic";

// V-04 投票完了: シェア → ご招待キャンペーン応募へ
export default function VoteDone({ params }: { params: { no: string } }) {
  const m = byNo(params.no); if (!m) notFound();
  const th = media(m)?.thumb;
  return (
    <main className="v26-page">
      <h1>投票ありがとうございました！</h1>
      <p className="note" style={{ textAlign: "left", marginTop: 6 }}>投票したモーメント</p>
      <div className="thumb">{th && <img src={th} alt="" />}</div>
      <div className="cap"><small>No.{m.no}　{m.sportLabel}</small>{m.title}</div>
      <p className="note">明日また投票できます</p>
      <div className="share">
        <h2>#DAZNAWARDS2026 でシェアして<br />ご招待キャンペーンに応募</h2>
        <ShareButtons no={m.no} title={m.title} />
        <a className="terms" href="/awards#terms">応募規約を見る</a>
        <a className="campaign" href="/awards#campaign">DAZN AWARDS ご招待キャンペーン →</a>
      </div>
      <div className="row"><Link className="ghost" href="/moments">ほかのモーメントを見る</Link><Link className="ghost" href="/awards">DAZN AWARDSについて</Link></div>
    </main>
  );
}
