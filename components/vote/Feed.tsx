"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Phase } from "@/lib/vote/data";

// V-02 詳細: SP は縦スワイプで次々に見られる全画面。PC は前後矢印とキーボード。URL は見ている瞬間に追従
export interface FeedItem { no: string; title: string; short: string; description: string; sportLabel: string; group: string; date: string; competition: string; why: string; crowd: string; beat: string; detail: string | null; loop: string | null; webm: string | null; poster: string | null; thumb: string | null }
interface Props { items: FeedItem[]; start: number; phase: Phase; votedNo: string | null }

const IconShare = () => <svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6" /></svg>;
const IconList = () => <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>;

export default function Feed({ items, start, phase, votedNo }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(start);
  const curRef = useRef(start);
  const [ready, setReady] = useState(false);

  useEffect(() => { const el = root.current; if (!el) return; el.scrollTop = start * el.clientHeight; setReady(true); }, [start]);
  useEffect(() => {
    const el = root.current; if (!el) return;
    const slides = Array.from(el.querySelectorAll<HTMLElement>(".v26-slide"));
    const io = new IntersectionObserver((es) => {
      for (const e of es) { if (e.intersectionRatio < 0.6) continue; const i = Number((e.target as HTMLElement).dataset.i); if (i !== curRef.current) { curRef.current = i; setCur(i); history.replaceState(null, "", `/moments/${items[i].no}`); } }
    }, { root: el, threshold: [0.6] });
    slides.forEach((s) => io.observe(s)); return () => io.disconnect();
  }, [items]);
  useEffect(() => { const el = root.current; if (!el) return; el.querySelectorAll<HTMLVideoElement>("video").forEach((v) => { if (Number(v.dataset.i) === cur) v.play().catch(() => {}); else v.pause(); }); }, [cur, ready]);
  const goTo = useCallback((n: number) => { const el = root.current; if (!el) return; n = Math.max(0, Math.min(items.length - 1, n)); el.scrollTo({ top: n * el.clientHeight, behavior: "smooth" }); }, [items.length]);
  const go = useCallback((d: number) => goTo(curRef.current + d), [goTo]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (["ArrowRight", "ArrowDown"].includes(e.key)) { e.preventDefault(); go(1); } if (["ArrowLeft", "ArrowUp"].includes(e.key)) { e.preventDefault(); go(-1); } }; addEventListener("keydown", onKey); return () => removeEventListener("keydown", onKey); }, [go]);

  const share = async (m: FeedItem) => {
    const url = `${location.origin}/moments/${m.no}`; const text = `No.${m.no} ${m.title} | DAZN 100 MOMENTS #DAZNAWARDS2026 #DAZN100MOMENTS`;
    if (navigator.share) { try { await navigator.share({ title: text, url }); return; } catch {} }
    open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank");
  };

  return (
    <div className="v26-feed" ref={root}>
      {items.map((m, i) => {
        const near = Math.abs(i - cur) <= 1;
        const same = items.map((x, j) => ({ x, j })).filter(({ x }) => x.group === m.group);
        const next = items[i + 1];
        return (
          <section className="v26-slide" key={m.no} data-i={i}>
            {near && m.poster && <div className="bg" style={{ backgroundImage: `url(${m.poster})` }} />}
            <div className="rays" />
            <div className="col">
              <div className="media">
                {m.detail && near ? (
                  <video data-i={i} controls muted playsInline preload={i === cur ? "auto" : "metadata"} poster={m.poster || undefined} src={m.detail} />
                ) : m.loop && near ? (
                  <>
                    <video data-i={i} muted loop playsInline preload={i === cur ? "auto" : "metadata"} poster={m.poster || undefined}>
                      <source src={m.webm || undefined} type="video/webm" /><source src={m.loop} type="video/mp4" />
                    </video>
                    <span className="tag">DIGEST · フル映像は準備中</span>
                  </>
                ) : m.poster ? <img src={near ? m.poster : undefined} alt="" /> : <div className="noimg">映像は準備中です</div>}
              </div>
              <div className="txt">
                <div className="no">{m.no}</div>
                <div className="chips"><span>{m.sportLabel}</span>{m.date && <span className="num">{m.date}</span>}{m.competition && m.competition !== m.sportLabel && <span>{m.competition}</span>}</div>
                <h2>{m.title}</h2>
                <p className="desc">{m.beat || m.short || m.description}</p>
                {m.why && <div className="why"><small>WHY IT MOVES US</small><p>{m.why}</p></div>}
                {m.crowd && <div className="crowd"><b>場内</b>{m.crowd}</div>}
                <div className="acts">
                  {phase === "open" && votedNo === m.no && <span className="v26-vote done">本日は投票済みです</span>}
                  {phase === "open" && votedNo && votedNo !== m.no && <span className="v26-vote off">本日は投票済み（No.{votedNo}）</span>}
                  {phase === "open" && !votedNo && <Link href={`/moments/${m.no}/vote`} className="v26-vote">このモーメントに投票</Link>}
                  {phase === "pre" && <span className="v26-vote off">投票は11月上旬に開始</span>}
                  {phase === "closed" && <Link href="/awards#event" className="v26-vote off">投票受付終了・授賞式は12/21</Link>}
                  {phase === "result" && <span className="v26-vote off">結果発表中</span>}
                  <button className="v26-icon" onClick={() => share(m)} aria-label="シェア"><IconShare />SHARE</button>
                  <Link href="/moments" className="v26-icon" aria-label="一覧へ"><IconList />一覧</Link>
                </div>
                <a className="dazn" href="https://www.dazn.com/" target="_blank" rel="noreferrer">DAZN フル版を視聴する（有料会員のみ）</a>
                {next && (
                  <button className="nexthint" onClick={() => go(1)}>
                    {next.thumb && <img src={near ? next.thumb : undefined} alt="" />}
                    <span><small>NEXT ↓</small>No.{next.no} {next.title}</span>
                  </button>
                )}
              </div>
              <div className="nav"><button aria-label="前のモーメント" onClick={() => go(-1)}>←</button><button aria-label="次のモーメント" onClick={() => go(1)}>→</button></div>
              {same.length > 1 && (
                <div className="strip"><h3>同じ競技のモーメント</h3><div className="row">
                  {same.slice(0, 14).map(({ x, j }) => <button key={x.no} className={j === i ? "cur" : ""} onClick={() => goTo(j)}>{x.thumb ? <img src={near ? x.thumb : undefined} alt="" /> : <div style={{ width: 150, aspectRatio: "16/9", background: "#141416" }} />}<span>No.{x.no}</span></button>)}
                </div></div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
