"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Phase } from "@/lib/vote/data";
import { SITE } from "@/lib/site/flags";

// V-00 共通パーツ: ロゴ / ？（投票ルール） / ≡（メニュー） / PC は投票期間を常時表示
export default function Header({ phase, voteEnd }: { phase: Phase; voteEnd: string }) {
  const [rules, setRules] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    // 初回アクセス時に一度だけルールを自動表示（ワイヤー V-00 注記2）
    try { if (!localStorage.getItem("d100_rules_seen")) { setRules(true); localStorage.setItem("d100_rules_seen", "1"); } } catch {}
  }, []);
  return (
    <>
      <header className="v26-h">
        <div className="wrap">
          <Link href="/moments" className="v26-logo" aria-label="DAZN 100 MOMENTS"><i /><span>DAZN <em>100</em> MOMENTS</span></Link>
          <nav className="v26-nav">
            <span className="period">{phase === "open" ? `投票期間：〜${voteEnd}` : phase === "pre" ? "投票は11月上旬開始" : phase === "closed" ? "投票受付終了" : "結果発表"}</span>
            <a className="txt" href="#" onClick={(e) => { e.preventDefault(); setRules(true); }}>投票ルール</a>
            <a className="txt" href="/">AWARDSについて</a>
            <button className="sp" aria-label="投票ルール" onClick={() => setRules(true)}>？</button>
            <button className="sp" aria-label="メニュー" onClick={() => setMenu(true)}>≡</button>
          </nav>
        </div>
      </header>
      {rules && (
        <div className="v26-modal" role="dialog" aria-modal="true" onClick={() => setRules(false)}>
          <div className="box" onClick={(e) => e.stopPropagation()}>
            <h2>投票ルール</h2>
            <ul>
              <li>対象：DAZN 100 MOMENTS（全競技）</li>
              <li>1回の投票で選べるのは1つ</li>
              <li>投票は1日1回まで</li>
              <li>投票期間：11月上旬〜{voteEnd}（締切日は変更になる場合があります）</li>
              <li>結果は12/21の授賞式で発表</li>
              <li>会員登録は不要</li>
            </ul>
            <div className="links"><a href="/#faq">FAQ</a><a href="/#terms">応募規約（情報サイト）</a></div>
            <button className="close" onClick={() => setRules(false)}>閉じる</button>
          </div>
        </div>
      )}
      {menu && (
        <div className="v26-modal v26-menu" role="dialog" aria-modal="true" onClick={() => setMenu(false)}>
          <div className="box" onClick={(e) => e.stopPropagation()}>
            <a href="/">DAZN AWARDSについて</a>
            <a href="/#campaign">ご招待キャンペーン</a>
            <a href="/#faq">FAQ</a>
            {SITE.experienceReady && <a href={SITE.experiencePath}>熱狂の中を回遊する</a>}
            <button className="close" onClick={() => setMenu(false)}>閉じる</button>
          </div>
        </div>
      )}
    </>
  );
}
