"use client";
import { useEffect, useState } from "react";
import type { Phase } from "@/lib/vote/data";

// I-00 共通パーツ: ヘッダー（PC は項目を横並び＋右端に投票ボタン、SP はメニュー）と、SP の画面下に追従する投票ボタン（投票期間中のみ）
const NAV: [string, string][] = [["about", "ABOUT"], ["awards", "AWARDS"], ["nominees", "NOMINEES"], ["cast", "CAST"], ["event", "EVENT"], ["campaign", "CAMPAIGN"]];

export default function SiteHeader({ phase, votePath }: { phase: Phase; votePath: string }) {
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(scrollY > window.innerHeight * 0.6);
    on(); addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  useEffect(() => { document.documentElement.style.overflow = menu ? "hidden" : ""; }, [menu]);
  const open = phase === "open";
  return (
    <>
      <header className="is-h">
        <div className="is-wrap">
          <a href="#top" className="is-logo" aria-label="DAZN AWARDS 2026"><img src="/brand/awards_mark.webp" alt="" width={400} height={484} /><span>DAZN AWARDS <b>2026</b></span></a>
          <nav className="is-nav" aria-label="セクション">
            {NAV.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
          </nav>
          {open && <a className="is-btn is-btn-y is-h-vote" href={votePath}>一般投票に参加する</a>}
          <button className="is-burger" aria-label="メニュー" aria-expanded={menu} onClick={() => setMenu(true)}><span /><span /><span /></button>
        </div>
      </header>
      {menu && (
        <div className="is-menu" role="dialog" aria-modal="true">
          <div className="is-menu-top"><span className="is-logo"><img src="/brand/awards_mark.webp" alt="" width={400} height={484} /><span>DAZN AWARDS <b>2026</b></span></span><button className="is-close" aria-label="閉じる" onClick={() => setMenu(false)}>×</button></div>
          <nav>
            {[...NAV, ["faq", "FAQ"] as [string, string]].map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => setMenu(false)}>{label}</a>)}
          </nav>
          {open && <a className="is-btn is-btn-y is-block" href={votePath}>一般投票に参加する</a>}
        </div>
      )}
      {open && <a className={`is-follow${scrolled ? " on" : ""}`} href={votePath}>一般投票に参加する<span aria-hidden>→</span></a>}
    </>
  );
}
