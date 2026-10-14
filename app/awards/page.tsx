import Link from "next/link";
import "../moments/vote.css";
import { phase } from "@/lib/vote/data";

export const dynamic = "force-dynamic";

// 情報サイト（I-00〜I-02）の骨格。時期で4段階（公開→ノミネート発表→投票締切→受賞発表）に切り替える。本文は確定情報待ちのプレースホルダ
const SECTIONS: [string, string][] = [["news", "NEWS"], ["about", "ABOUT"], ["awards", "AWARDS"], ["how", "選考方法"], ["nominees", "NOMINEES"], ["cast", "CAST"], ["event", "EVENT"], ["campaign", "CAMPAIGN"], ["faq", "FAQ"], ["terms", "応募規約"]];
export default function Awards() {
  const ph = phase();
  const stage = ph === "pre" ? "公開（11月上旬）" : ph === "open" ? "ノミネート発表（12月上旬）／投票受付中" : ph === "closed" ? "投票締切後" : "受賞発表（12/21）";
  return (
    <div className="v26">
      <header className="v26-h"><div className="wrap"><Link href="/awards" className="v26-logo"><i /><span>DAZN AWARDS 2026</span></Link><nav className="v26-nav"><Link className="txt" href="/moments">100 MOMENTS 投票へ</Link></nav></div></header>
      <main className="wrap" style={{ padding: "28px 16px 60px" }}>
        <div className="v26-banner" style={{ border: "1px solid var(--line)", borderRadius: 8 }}>情報サイト骨格　表示段階：<b>{stage}</b></div>
        <section className="v26-kv"><div className="wrap"><div className="mark" /><h1>DAZN AWARDS 2026</h1><p className="lead"><b>スポーツが生み出す「熱狂」を肯定し、心を揺さぶる瞬間の価値を、世界と分かち合う</b>12/21 TOYOTA ARENA TOKYO</p><Link href="/moments" className="go">100 MOMENTS に投票する</Link></div></section>
        {SECTIONS.map(([id, name]) => (
          <section key={id} id={id} style={{ padding: "28px 0", borderBottom: "1px solid var(--line)" }}>
            <h2 style={{ font: "700 22px/1 Oswald, sans-serif", letterSpacing: ".1em" }}>{name}</h2>
            <p style={{ marginTop: 10, color: "#9a9aa0", fontSize: 13, lineHeight: 1.7 }}>
              {id === "awards" && "6部門＋THE DAZN AWARD。熱狂部門は 100 MOMENTS の一般投票で決定。"}
              {id === "how" && "100 MOMENTS → FELLOWS による選考、および一般投票。"}
              {id === "nominees" && (ph === "pre" ? "12月上旬に発表" : "部門タブでノミネートを掲載（データ提供待ち）")}
              {id === "event" && "2026年12月21日（月）TOYOTA ARENA TOKYO"}
              {id === "campaign" && "1,500組3,000名様をご招待。#DAZNAWARDS2026 でのシェアで応募。"}
              {!["awards", "how", "nominees", "event", "campaign"].includes(id) && "確定情報の提供後に掲載（簡易CMSまたはシート同期で更新）"}
            </p>
          </section>
        ))}
      </main>
    </div>
  );
}
