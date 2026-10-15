import Link from "next/link";
import Grid from "@/components/vote/Grid";
import BurstHero from "@/components/vote/BurstHero";
import { MOMENTS, media, phase, VOTE_END, fmtMD } from "@/lib/vote/data";
import { votedToday } from "@/lib/vote/store";

export const dynamic = "force-dynamic";

// V-01 TOP: KV（ロゴ）＋「熱狂の中を回遊する！」＋一覧
export default function MomentsTop() {
  const ph = phase();
  const v = votedToday();
  const items = MOMENTS.map((m) => ({ no: m.no, title: m.title, group: m.group, sportLabel: m.sportLabel, thumb: media(m)?.thumb || null, hasVideo: m.hasVideo }));
  return (
    <main>
      {ph === "closed" && <div className="v26-banner">投票受付は終了しました。結果は <b>12/21 TOYOTA ARENA TOKYO</b> の授賞式で発表 <Link href="/awards#event">授賞式について →</Link></div>}
      {v.voted && ph === "open" && <div className="v26-banner">本日は <b>No.{v.no}</b> に投票済みです。明日また投票できます</div>}
      <section className="v26-kv">
        <BurstHero />
        <div className="in">
          <div className="frame" aria-hidden />
          <h1>DAZN 100 MOMENTS</h1>
          <p className="lead">2026年、心が震えた100の瞬間</p>
          <div className="tiny">{ph === "open" ? `VOTE 1 / DAY · UNTIL ${fmtMD(VOTE_END)} · NO SIGN-UP` : ph === "pre" ? "VOTING OPENS EARLY NOVEMBER" : ph === "closed" ? "VOTING CLOSED · CEREMONY 12/21" : "RESULTS"}</div>
          <Link href="/" className="go">熱狂の中を回遊する！</Link>
          {ph === "result" && <div className="result"><b>受賞モーメント</b><div style={{ marginTop: 6, color: "#9a9aa0", fontSize: 13 }}>12/21 の授賞式で発表された結果をここに掲載します（掲載範囲は確認中）</div></div>}
        </div>
      </section>
      <Grid items={items} votedNo={v.voted ? v.no || null : null} />
    </main>
  );
}
