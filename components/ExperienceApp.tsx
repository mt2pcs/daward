"use client";
// 熱狂の炸裂（本番の体験）。炸裂の空間（VortexSpace・入口・音）はそのまま使い、中身を 2026年の100本と切り口エンジン（/api/v26/cut）に差し替える。
// リファレンス: docs/ref/exp_pc_cut.jpg（通常） / exp_sp_cut.jpg（縦） / exp_pc_reading.jpg（組み替え） / exp_pc_focus_layout.jpg（フォーカスの構図）
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MomentWithStats } from "@/lib/types";
import type { Interpretation } from "@/lib/interpret";
import { getCrowd } from "@/lib/crowd";
import { sfx } from "@/lib/sfx";
import VortexSpace, { type Phase, type Thread, type TourState, type VortexApi } from "./VortexSpace";
import Entrance from "./Entrance";

export interface ExpMoment { no: string; title: string; sportLabel: string; group: string; date: string; thumb: string | null }
interface CutMoment { no: string; s: number; hits: string[] }
interface Cut {
  q: string; status: string; message: string | null; source: string; ms: number;
  read: { values: { v: string; axis: string; w: number; via: string }[]; sports: string[]; names: { name: string; nos: string[] }[] };
  arms: { name: string; nameSource: string; keys: string[]; moments: CutMoment[] }[];
  threads: Thread[]; next: string[];
}
// ロゴのパレット（黄・マゼンタ・青・白・橙）
const COLORS = ["#ebff00", "#ff2d9b", "#2f6bff", "#ffffff", "#ff8a3d"];
const SHORT: Record<string, string> = { "引退・最後": "引退", "記録・偉業": "記録", "王者の証明": "王者", "優勝の瞬間": "優勝", "満員の熱狂": "大歓声", "静寂から爆発": "静寂", "涙の場面": "涙", "海外の日本人": "海外組", "投手の快投": "快投" };
const short = (v: string) => SHORT[v] || v;

const toMoment = (m: ExpMoment, i: number, heat: number): MomentWithStats => ({
  id: m.no, index: i + 1, youtubeId: "", title: m.title, sport: m.sportLabel, event: m.sportLabel, year: 2026,
  description: "", emotions: ["歓喜"], votes: Math.round(20 + heat * 80), commentCount: 0, thumbUrl: m.thumb || undefined,
});
const toArms = (c: Cut): Interpretation => ({
  text: c.status === "default" ? "" : c.q, theme: c.q.slice(0, 4), primary: "歓喜", vec: new Array(8).fill(0.5),
  arms: c.arms.map((a, i) => ({ name: a.name, color: COLORS[i % COLORS.length], ids: a.moments.map((m) => m.no) })),
  scores: Object.fromEntries(c.arms.flatMap((a) => a.moments.map((m) => [m.no, m.s]))), next: c.next, source: "llm",
});
// 入力欄の上の一行: どの言葉で読んだか、いくつの切り口・瞬間・競技になったか
function readLine(c: Cut, momentsByNo: Map<string, ExpMoment>): string {
  const nos = new Set(c.arms.flatMap((a) => a.moments.map((m) => m.no)));
  const sports = new Set(Array.from(nos).map((n) => momentsByNo.get(n)?.group).filter(Boolean));
  const tail = `${c.arms.length}つの切り口・${nos.size}の瞬間・${sports.size}競技`;
  if (c.status === "default") return `100の瞬間 — ${tail}`;
  if (c.message) return `${c.message} — ${tail}`;
  const vals = c.read.values.filter((x) => x.via !== "近い熱狂").sort((a, b) => b.w - a.w).slice(0, 3).map((x) => `〈${short(x.v)}〉`);
  const names = c.read.names.slice(0, 1).map((x) => `〈${x.name}〉`);
  const by = [...names, ...vals].slice(0, 3).join("");
  return `${by || `「${c.q}」`}で読みました — ${tail}`;
}

export default function ExperienceApp({ moments: raw }: { moments: ExpMoment[] }) {
  const byNo = useMemo(() => new Map(raw.map((m) => [m.no, m])), [raw]);
  const [heat, setHeat] = useState<Record<string, number>>({});
  const moments = useMemo(() => raw.map((m, i) => toMoment(m, i, heat[m.no] || 0)), [raw, heat]);
  const [phase, setPhase] = useState<Phase>("entry");
  const [leaving, setLeaving] = useState(false);
  const [cut, setCut] = useState<Cut | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null); // 読めなかった・弾いた時の一言（腕は変えない）
  const [reveal, setReveal] = useState<{ q: string; line: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [tour, setTour] = useState<TourState | null>(null);
  const [viewDirty, setViewDirty] = useState(false);
  const [text, setText] = useState("");
  const api = useRef<VortexApi | null>(null);

  // 既定の切り口と熱（票数そのものではなく相対値）
  useEffect(() => {
    fetch("/api/v26/cut", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: "" }) }).then((r) => r.json()).then(setCut).catch(() => {});
    fetch("/api/v26/state").then((r) => r.json()).then((d) => setHeat(d.heat || {})).catch(() => {});
  }, []);

  const enter = useCallback(() => { getCrowd().start(); sfx.start(); setLeaving(true); setPhase("space"); }, []);
  useEffect(() => {
    const kick = () => getCrowd().start();
    window.addEventListener("pointerdown", kick, true);
    return () => window.removeEventListener("pointerdown", kick, true);
  }, []);

  const throwWord = useCallback(async (q: string) => {
    const v = q.trim(); if (!v || pending) return;
    setNote(null); setSelected(null); setPending(v);
    const t0 = performance.now();
    try {
      const r: Cut = await (await fetch("/api/v26/cut", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: v }) })).json();
      // 吸い込みの演出は最低 1.2 秒見せる（即答でも「組み替わった」と分かるように）
      const wait = Math.max(0, 1200 - (performance.now() - t0));
      await new Promise((res) => setTimeout(res, wait));
      if (r.status === "unreadable" || r.status === "refused") { setNote(r.message); return; }
      setCut(r); setText("");
      setReveal({ q: v, line: r.status === "metaphor" || r.status === "nearest" ? (r.message || "") : readLine(r, byNo).split(" — ")[0] });
      setTimeout(() => setReveal(null), 2600);
      getCrowd().swell(0.7);
    } catch { setNote("いま組み替えられませんでした。もう一度投げてください"); }
    finally { setPending(null); }
  }, [pending, byNo]);

  const arms = useMemo(() => (cut ? toArms(cut) : null), [cut]);
  const hitsOf = useCallback((no: string) => cut?.arms.flatMap((a) => a.moments.filter((m) => m.no === no).map((m) => ({ arm: a.name, hits: m.hits })))[0] || null, [cut]);
  const focusNo = selected || hover;
  const focus = focusNo ? byNo.get(focusNo) : null;
  const focusHits = focusNo ? hitsOf(focusNo) : null;
  const line = cut ? readLine(cut, byNo) : "";

  return (
    <div className="stage exp">
      <VortexSpace
        visual="burst" moments={moments} arms={arms} pendingText={pending} pulses={{}} phase={phase} focusId={selected}
        soundOn threads={cut?.threads.slice(0, 8)}
        onSelect={(m) => { setSelected(m.id); sfx.whoosh?.(); }}
        onHover={(m) => setHover(m ? m.id : null)}
        onTour={setTour} onViewDirty={setViewDirty} api={api}
      />
      {phase === "space" && (
        <header className="exp-head">
          <a href="/moments" className="exp-logo"><i />DAZN <em>100</em> MOMENTS</a>
          <a href="/moments" className="exp-back">一覧へ</a>
        </header>
      )}
      {/* 組み替えの瞬間: 投げた言葉と、どう読んだか */}
      {reveal && (
        <div className="exp-reveal" key={reveal.q}>
          <div className="q">「{reveal.q}」</div>
          {reveal.line && <div className="line"><span>{reveal.line}</span></div>}
        </div>
      )}
      {/* フォーカス: この瞬間がこの切り口に入った理由（辞書の言葉だけ）と、観る */}
      {phase === "space" && focus && !tour && !reveal && (
        <div className={`exp-focus${selected ? " pinned" : ""}`}>
          {focusHits && <div className="arm">{focusHits.arm}</div>}
          <div className="row"><span className="no">{focus.no}</span><span className="ti">{focus.title}</span></div>
          <div className="chips"><span>{focus.sportLabel}</span>{focus.date && <span>{focus.date}</span>}</div>
          {focusHits && focusHits.hits.length > 0 && <div className="why">{focusHits.hits.slice(0, 4).map((h) => <b key={h}>〈{short(h)}〉</b>)}</div>}
          {selected && <div className="acts"><a className="go" href={`/moments/${focus.no}`}>この瞬間を観る</a><button onClick={() => setSelected(null)}>閉じる</button></div>}
        </div>
      )}
      {tour && (
        <div className="exp-tour">
          <button onClick={() => api.current?.tourPrev()} aria-label="前へ">‹</button>
          <div><b>{tour.armName}</b> {tour.index + 1}/{tour.total} — {tour.moment.title}</div>
          <a href={`/moments/${tour.moment.id}`}>観る</a>
          <button onClick={() => api.current?.tourNext()} aria-label="次へ">›</button>
          <button className="end" onClick={() => api.current?.endTour()}>終える</button>
        </div>
      )}
      {viewDirty && !tour && !selected && phase === "space" && <button className="view-reset" onClick={() => api.current?.resetView()}>⟲ 視点を戻す</button>}
      {/* 言葉を投げる */}
      {phase === "space" && (
        <div className={`exp-bar${pending ? " busy" : ""}`}>
          <div className="read">{note ? <span className="note">{note}</span> : pending ? `「${pending}」を読んでいます…` : line}</div>
          <form onSubmit={(e) => { e.preventDefault(); throwWord(text); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={cut && cut.status !== "default" ? "次は、どんな熱狂を観たい？" : "いま、どんな熱狂を観たい？"} maxLength={40} disabled={!!pending} />
            <button type="submit" disabled={!!pending || !text.trim()}>{pending ? "組み替え中" : "炸裂を組み替える"}</button>
          </form>
          <div className="next">{(cut?.next?.length ? cut.next : ["ベテランの熱量", "めちゃくちゃ泣ける", "仕事帰りにスカッと"]).map((w) => <button key={w} type="button" onClick={() => setText(w)} disabled={!!pending}>{w}</button>)}</div>
        </div>
      )}
      {phase === "entry" || leaving ? <Entrance leaving={leaving} onEnter={enter} visual="burst" /> : null}
      <div className="rev-tag">rev cut1</div>
    </div>
  );
}
