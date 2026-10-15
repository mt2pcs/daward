"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Phase } from "@/lib/vote/data";

// V-02 詳細: SP は縦スワイプで次々に見られる全画面。PC は前後矢印とキーボード。URL は見ている瞬間に追従
export interface FeedItem { no: string; title: string; short: string; description: string; sportLabel: string; group: string; date: string; competition: string; detail: string | null; loop: string | null; webm: string | null; poster: string | null; thumb: string | null }
interface Props { items: FeedItem[]; start: number; phase: Phase; votedNo: string | null }

export default function Feed({ items, start, phase, votedNo }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(start);
  const curRef = useRef(start);
  const [ready, setReady] = useState(false);

  // 最初の位置へ（スクロール位置で開始の瞬間を出す）
  useEffect(() => {
    const el = root.current; if (!el) return;
    el.scrollTop = start * el.clientHeight; setReady(true);
  }, [start]);

  // どの瞬間が見えているか → URL と再生を追従
  useEffect(() => {
    const el = root.current; if (!el) return;
    const slides = Array.from(el.querySelectorAll<HTMLElement>(".v26-slide"));
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        if (e.intersectionRatio < 0.6) continue;
        const i = Number((e.target as HTMLElement).dataset.i);
        if (i !== curRef.current) { curRef.current = i; setCur(i); history.replaceState(null, "", `/moments/${items[i].no}`); }
      }
    }, { root: el, threshold: [0.6] });
    slides.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [items]);

  // 見えている瞬間だけ再生（前後1枚は読み込み）
  useEffect(() => {
    const el = root.current; if (!el) return;
    el.querySelectorAll<HTMLVideoElement>("video").forEach((v) => {
      const i = Number(v.dataset.i);
      if (i === cur) { v.play().catch(() => {}); } else { v.pause(); }
    });
  }, [cur, ready]);

  const go = useCallback((d: number) => {
    const el = root.current; if (!el) return;
    const n = Math.max(0, Math.min(items.length - 1, curRef.current + d));
    el.scrollTo({ top: n * el.clientHeight, behavior: "smooth" });
  }, [items.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); go(1); } if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); go(-1); } };
    addEventListener("keydown", onKey); return () => removeEventListener("keydown", onKey);
  }, [go]);

  const share = async (m: FeedItem) => {
    const url = `${location.origin}/moments/${m.no}`;
    const text = `No.${m.no} ${m.title} | DAZN 100 MOMENTS #DAZNAWARDS2026 #DAZN100MOMENTS`;
    if (navigator.share) { try { await navigator.share({ title: text, url }); return; } catch {} }
    open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank");
  };

  return (
    <div className="v26-feed" ref={root}>
      {items.map((m, i) => {
        const near = Math.abs(i - cur) <= 1;
        const same = items.filter((x) => x.group === m.group && x.no !== m.no).slice(0, 8);
        return (
          <section className="v26-slide" key={m.no} data-i={i}>
            <div className="media">
              {m.detail && near ? (
                <video data-i={i} controls muted playsInline preload={i === cur ? "auto" : "metadata"} poster={m.poster || undefined} src={m.detail} />
              ) : m.loop && near ? (
                <>
                  <video data-i={i} muted loop playsInline preload={i === cur ? "auto" : "metadata"} poster={m.poster || undefined}>
                    <source src={m.webm || undefined} type="video/webm" />
                    <source src={m.loop} type="video/mp4" />
                  </video>
                  <span className="tag">DIGEST · フル映像は準備中</span>
                </>
              ) : m.poster ? <img src={near ? m.poster : undefined} alt="" /> : <div className="noimg">映像は準備中です</div>}
              <div className="nav"><button aria-label="前のモーメント" onClick={() => go(-1)}>←</button><button aria-label="次のモーメント" onClick={() => go(1)}>→</button></div>
            </div>
            <div className="shade" />
            {i < items.length - 1 && (
              <button className="nexthint" onClick={() => go(1)}>
                {items[i + 1].thumb && <img src={near ? items[i + 1].thumb! : undefined} alt="" />}
                <span><small>↓ 次のモーメント</small>No.{items[i + 1].no} {items[i + 1].title}</span>
              </button>
            )}
            <div className="info">
              <div className="grow">
              <div className="meta"><b>No.{m.no}</b><span>{m.sportLabel}</span>{m.date && <span>{m.date}</span>}</div>
              <h2>{m.title}</h2>
              <p className="desc">{m.description !== m.title ? m.description : m.short}</p>
              {m.short && m.description !== m.short && <p className="desc" style={{ marginTop: 4, color: "#aaa" }}>{m.short}</p>}
              {m.competition && <div className="rel">関連：{m.competition}</div>}
              </div>
              <div className="acts">
                {phase === "open" && votedNo === m.no && <span className="v26-vote done">本日は投票済みです</span>}
                {phase === "open" && votedNo && votedNo !== m.no && <span className="v26-vote off">本日は投票済み（No.{votedNo}）</span>}
                {phase === "open" && !votedNo && <Link href={`/moments/${m.no}/vote`} className="v26-vote">このモーメントに投票</Link>}
                {phase === "pre" && <span className="v26-vote off">投票は11月上旬に開始</span>}
                {phase === "closed" && <Link href="/awards#event" className="v26-vote off">投票受付終了・授賞式は12/21</Link>}
                {phase === "result" && <span className="v26-vote off">結果発表中</span>}
                <button className="v26-icon" onClick={() => share(m)} aria-label="シェア">SHARE</button>
                <Link href="/moments" className="v26-icon" aria-label="一覧へ">一覧</Link>
              </div>
              <a className="dazn" href="https://www.dazn.com/" target="_blank" rel="noreferrer">DAZN フル版を視聴する（有料会員のみ）</a>
              {same.length > 0 && (
                <div className="same"><h3>同じ競技のモーメント</h3><div className="row">
                  {same.map((x) => <a key={x.no} href={`/moments/${x.no}`}>{x.thumb ? <img src={x.thumb} alt="" loading="lazy" /> : <div style={{ width: 120, aspectRatio: "16/9", background: "#161618" }} />}<span>No.{x.no} {x.title}</span></a>)}
                </div></div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
