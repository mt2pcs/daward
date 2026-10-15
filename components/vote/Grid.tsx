"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { burstAt } from "@/components/vote/Fx";
import { GROUPS } from "@/lib/vote/data";

// V-01 一覧: 競技フィルタ + グリッド（SP2列 / PC5列）。順次読み込み（20件ずつ）
export interface GridItem { no: string; title: string; group: string; sportLabel: string; thumb: string | null; hasVideo: boolean; loop: string | null; webm: string | null }
const PAGE = 20;
export default function Grid({ items, votedNo }: { items: GridItem[]; votedNo: string | null }) {
  const [group, setGroup] = useState<string>("すべて");
  const [shown, setShown] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const list = useMemo(() => (group === "すべて" ? items : items.filter((m) => m.group === group)), [items, group]);
  useEffect(() => { setShown(PAGE); }, [group]);
  // カードはスクロールで順に現れる
  useEffect(() => {
    const g = gridRef.current; if (!g) return;
    const io = new IntersectionObserver((es) => { es.forEach((e) => { if (e.isIntersecting) { const el = e.target as HTMLElement; const k = Number(el.dataset.k || 0); setTimeout(() => el.classList.add("in"), (k % 10) * 60); io.unobserve(el); } }); }, { rootMargin: "80px 0px" });
    g.querySelectorAll<HTMLElement>(".v26-card:not(.in)").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [shown, group]);
  const launch = (e: React.MouseEvent<HTMLAnchorElement>, no: string) => {
    if (e.metaKey || e.ctrlKey || e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget; const r = el.getBoundingClientRect();
    el.classList.add("launch"); burstAt(r.left + r.width / 2, r.top + r.height / 2);
    router.prefetch(`/moments/${no}`);
    setTimeout(() => router.push(`/moments/${no}`), 300);
  };
  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setShown((s) => Math.min(list.length, s + PAGE)); }, { rootMargin: "600px 0px" });
    io.observe(el); return () => io.disconnect();
  }, [list.length]);
  return (
    <>
      <div className="v26-filter"><div className="wrap">
        {GROUPS.map((g) => <button key={g} aria-pressed={group === g} onClick={() => setGroup(g)}>{g}</button>)}
      </div></div>
      <div className="wrap">
        <div className="v26-count">{group === "すべて" ? "ALL 100 MOMENTS" : `${group} · ${list.length} MOMENTS`}</div>
        <div className="v26-grid" ref={gridRef} key={group}>
          {list.slice(0, shown).map((m, k) => (
            <Link key={m.no} href={`/moments/${m.no}`} className="v26-card" data-k={k} onClick={(e) => launch(e, m.no)} onMouseEnter={() => setHover(m.no)} onMouseLeave={() => setHover((h) => (h === m.no ? null : h))}>
              <div className="th">
                {m.thumb ? <img src={m.thumb} alt="" loading="lazy" /> : null}
                {hover === m.no && m.loop && <video muted loop playsInline autoPlay preload="auto"><source src={m.webm || undefined} type="video/webm" /><source src={m.loop} type="video/mp4" /></video>}
                <span className="no">{m.no}</span>
                {!m.hasVideo && <span className="nov">画像のみ</span>}
                {votedNo === m.no && <span className="voted" />}
              </div>
              <div className="sp">{m.sportLabel}</div>
              <div className="ti">{m.title}</div>
            </Link>
          ))}
        </div>
        <div ref={sentinel} className="v26-more">{shown < list.length ? "LOADING…" : `${list.length} MOMENTS`}</div>
      </div>
    </>
  );
}
