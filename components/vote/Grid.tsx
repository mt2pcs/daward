"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { GROUPS } from "@/lib/vote/data";

// V-01 一覧: 競技フィルタ + グリッド（SP2列 / PC5列）。順次読み込み（20件ずつ）
export interface GridItem { no: string; title: string; group: string; sportLabel: string; thumb: string | null; hasVideo: boolean }
const PAGE = 20;
export default function Grid({ items, votedNo }: { items: GridItem[]; votedNo: string | null }) {
  const [group, setGroup] = useState<string>("すべて");
  const [shown, setShown] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);
  const list = useMemo(() => (group === "すべて" ? items : items.filter((m) => m.group === group)), [items, group]);
  useEffect(() => { setShown(PAGE); }, [group]);
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
        <div className="v26-grid">
          {list.slice(0, shown).map((m) => (
            <Link key={m.no} href={`/moments/${m.no}`} className="v26-card">
              <div className="th">
                {m.thumb ? <img src={m.thumb} alt="" loading="lazy" /> : null}
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
