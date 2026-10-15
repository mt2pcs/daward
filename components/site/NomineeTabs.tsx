"use client";
import { useState } from "react";

// I-01 ③ NOMINEES: 部門タブで切り替え。発表前は枠だけ（COMING SOON）、発表後はモーメント名／競技・日付／選出理由、受賞後はグランプリ表示
type Nominee = { no?: string; title: string; meta: string; reason: string; winner?: boolean; thumb?: string | null };
export default function NomineeTabs({ cats, list, published, announce, winners }: {
  cats: { key: string; name: string }[]; list: Record<string, Nominee[]>; published: boolean; announce: string; winners: boolean;
}) {
  const [cur, setCur] = useState(cats[0].key);
  const slots = cur === "wc" ? 5 : 3; // W杯部門は5件、その他は3件（仮）
  const items = list[cur] || [];
  return (
    <div className="is-tabs">
      <div className="is-tablist" role="tablist">
        {cats.map((c) => (
          <button key={c.key} role="tab" aria-selected={cur === c.key} onClick={() => setCur(c.key)}>{c.name.replace("熱狂部門", "").replace("（名称未定）", "")}</button>
        ))}
      </div>
      <div className={`is-noms n${slots}`} role="tabpanel">
        {Array.from({ length: slots }, (_, i) => {
          const n = published ? items[i] : undefined;
          return n ? (
            <article key={i} className={`is-nom${winners && n.winner ? " win" : ""}`}>
              <div className="ph" style={n.thumb ? { backgroundImage: `url(${n.thumb})` } : undefined}>{winners && n.winner && <span className="gp">GRAND PRIX</span>}</div>
              <h4>{n.title}</h4><p className="meta">{n.meta}</p><p className="why">{n.reason}</p>
            </article>
          ) : (
            <article key={i} className="is-nom soon"><div className="ph"><span>{String(i + 1).padStart(2, "0")}</span></div><h4>COMING SOON</h4><p className="meta">{announce}</p></article>
          );
        })}
      </div>
    </div>
  );
}
