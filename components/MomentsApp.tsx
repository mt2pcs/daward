"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MomentWithStats, VoteResponse } from "@/lib/types";
import { getCrowd } from "@/lib/crowd";
import { sfx } from "@/lib/sfx";
import { defaultDictionary, type Interpretation } from "@/lib/interpret";
import VortexSpace, { type Phase, type TourState, type VortexApi } from "./VortexSpace";
import Entrance from "./Entrance";
import QueryBar from "./QueryBar";
import DetailOverlay from "./DetailOverlay";
import PresentSequence from "./PresentSequence";
import Tuner, {
  DEFAULT_TUNING,
  loadTuning,
  saveTuning,
  type Tuning,
} from "./Tuner";

// 体験の骨格:
//   熱狂の渦（100本のサムネイルが捻れて渦になる）→ 入場で渦の中へ
//   → 100の映像カードが渦を公転（腕はAIが命名）→ 言葉で渦が組み替わる（AIが腕を作り直す）
//   → カードに触れて投票 → あなたの言葉から編んだフィルム
export default function MomentsApp({
  initialMoments,
}: {
  initialMoments: MomentWithStats[];
}) {
  const [moments, setMoments] = useState(initialMoments);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [present, setPresent] = useState<VoteResponse | null>(null);
  const [pulses, setPulses] = useState<Record<string, number>>({});
  const [hoverTitle, setHoverTitle] = useState<string | null>(null);
  const [tour, setTour] = useState<TourState | null>(null);
  const [viewDirty, setViewDirty] = useState(false);
  const vortexApi = useRef<VortexApi | null>(null);
  const [tuning, setTuning] = useState<Tuning>(DEFAULT_TUNING);
  const [tunerOpen, setTunerOpen] = useState(false);
  const activityRef = useRef(0);

  useEffect(() => {
    setTuning(loadTuning());
  }, []);

  const totalVotes = useMemo(
    () => moments.reduce((s, m) => s + m.votes, 0),
    [moments]
  );
  const selected = moments.find((m) => m.id === selectedId) ?? null;

  // エントランス: 「入場する」の1クリックが音の解錠を兼ねる
  const [phase, setPhase] = useState<Phase>("entry");
  const [leaving, setLeaving] = useState(false);
  const enter = useCallback(() => {
    getCrowd().start();
    sfx.start();
    setLeaving(true);
    setPhase("space");
  }, []);

  // 保険: どの操作でも歓声エンジンを起動できるようにする
  useEffect(() => {
    const kick = () => getCrowd().start();
    window.addEventListener("pointerdown", kick, true);
    window.addEventListener("keydown", kick, true);
    window.addEventListener("touchend", kick, true);
    return () => {
      window.removeEventListener("pointerdown", kick, true);
      window.removeEventListener("keydown", kick, true);
      window.removeEventListener("touchend", kick, true);
    };
  }, []);

  useEffect(() => {
    getCrowd().setVolume(tuning.volume / 100);
    sfx.setVolume(tuning.volume / 100);
  }, [tuning.volume]);

  const updateTuning = useCallback((t: Tuning) => {
    setTuning(t);
    saveTuning(t);
    if (t.volume > 0) getCrowd().start();
  }, []);

  // 渦の腕: 初期状態はAIが映像データから生成（届くまでは感情ベースの暫定）
  const [baseArms, setBaseArms] = useState<Interpretation>(() => defaultDictionary(initialMoments));
  useEffect(() => {
    let alive = true;
    fetch("/api/arms")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Interpretation | null) => {
        if (alive && d && d.arms?.length) setBaseArms(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 言葉で渦を組み替える（LLMが腕を作り直す）
  const [query, setQuery] = useState<Interpretation | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const applyQuery = useCallback(async (text: string) => {
    setPending(text); // 押した瞬間から渦が動き出す（解釈中の演出）
    try {
      const r = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) return false;
      const d: Interpretation = await r.json();
      if (!d.arms?.length) return false;
      setQuery(d);
      getCrowd().swell(0.7);
      return true;
    } catch {
      return false;
    } finally {
      setPending(null);
    }
  }, []);
  const arms = query ?? baseArms;

  const registerPulse = useCallback((momentId: string) => {
    const now = Date.now();
    setPulses((p) => ({ ...p, [momentId]: now }));
    setTimeout(() => {
      setPulses((p) => {
        if (p[momentId] !== now) return p;
        const next = { ...p };
        delete next[momentId];
        return next;
      });
    }, 1500);
    activityRef.current = Math.min(8, activityRef.current + 1);
    getCrowd().setIntensity(activityRef.current / 8);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      activityRef.current *= 0.85;
      getCrowd().setIntensity(activityRef.current / 8);
    }, 2500);
    return () => clearInterval(t);
  }, []);

  // ライブ投票シミュレーション（本番はリアルタイム配信に差し替え）
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!alive) return;
      if (!document.hidden && !present) {
        try {
          const r = await fetch("/api/pulse", { method: "POST" });
          const d: { momentId: string; votes: number } = await r.json();
          if (alive) {
            setMoments((prev) =>
              prev.map((m) =>
                m.id === d.momentId ? { ...m, votes: d.votes } : m
              )
            );
            registerPulse(d.momentId);
            getCrowd().swell(0.15 + Math.random() * 0.2);
          }
        } catch {
          /* ネットワーク断は次のtickへ */
        }
      }
      timer = setTimeout(tick, 1800 + Math.random() * 3200);
    };
    timer = setTimeout(tick, 1500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [registerPulse, present]);

  const handleVoted = useCallback(
    (res: VoteResponse) => {
      setMoments((prev) =>
        prev.map((m) => (m.id === res.moment.id ? res.moment : m))
      );
      setSelectedId(null);
      registerPulse(res.moment.id);
      getCrowd().swell(1); // 自分の一票が一番大きな歓声を生む
      sfx.hit();
      setPresent(res);
    },
    [registerPulse]
  );

  return (
    <div className="stage">
      <VortexSpace
        moments={moments}
        arms={arms}
        pendingText={pending}
        pulses={pulses}
        phase={phase}
        focusId={selectedId}
        soundOn={tuning.volume > 0}
        onSelect={(m) => setSelectedId(m.id)}
        onHover={(m) => setHoverTitle(m ? `${m.title} ・ 🔥${m.votes.toLocaleString()}` : null)}
        onTour={setTour}
        onViewDirty={setViewDirty}
        api={vortexApi}
      />
      {hoverTitle && !selected && !tour && <div className="vs-hover">{hoverTitle}</div>}

      {/* 腕のツアー: ラベルをタップすると、その腕の映像を順に見せる */}
      {tour && !selected && (
        <>
          <button className="tour-side left" onClick={() => vortexApi.current?.tourPrev()} aria-label="前へ">‹</button>
          <button className="tour-side right" onClick={() => vortexApi.current?.tourNext()} aria-label="次へ">›</button>
          <div className="tour" style={{ ["--c" as string]: tour.color }}>
            <div className="tour-arm"><span>{tour.armName}</span></div>
            <div className="tour-count">{String(tour.index + 1).padStart(2, "0")} <em>/ {tour.total}</em></div>
            <div className="tour-title">{tour.moment.title}</div>
            <div className="tour-meta">{tour.moment.event} ・ {tour.moment.year}</div>
            <div className="tour-actions">
              <button className="tour-vote" onClick={() => setSelectedId(tour.moment.id)}>🔥 {tour.moment.votes.toLocaleString()} ｜ この瞬間を観て投票</button>
              <button className="tour-close" onClick={() => vortexApi.current?.endTour()}>ツアーを終える</button>
            </div>
          </div>
        </>
      )}
      {viewDirty && !tour && !selected && phase === "space" && (
        <button className="view-reset" onClick={() => vortexApi.current?.resetView()}>⟲ 視点を戻す</button>
      )}

      <header className={`hud${phase === "entry" ? " hidden-hud" : ""}`}>
        <div className="hud-brand">
          <div className="hud-kicker">DAZN AWARDS 2026 — FAN VOTE</div>
          <h1>
            É M<em>OO</em>MENTS <em>100</em>
          </h1>
          <div className="hud-hint">
            100の瞬間が渦を巻く。言葉で渦を組み替え、心が動いた瞬間に投票しよう。
          </div>
        </div>
        <div className="hud-right">
          <div className="hud-total">{totalVotes.toLocaleString()}</div>
          <div className="hud-total-label">TOTAL VOTES</div>
        </div>
      </header>

      {phase === "space" && (
        <QueryBar current={query ?? baseArms} busy={pending !== null} onQuery={applyQuery} />
      )}

      <Tuner
        tuning={tuning}
        open={tunerOpen}
        onToggle={() => setTunerOpen((v) => !v)}
        onChange={updateTuning}
      />

      {phase === "entry" || leaving ? <Entrance leaving={leaving} onEnter={enter} /> : null}

      {/* 表示中のビルドを特定するための刻印（「どの版を見ているか」の水掛け論防止） */}
      <div className="rev-tag">rev vortex4h</div>

      {selected && (
        <DetailOverlay
          moment={selected}
          query={query?.text}
          queryVec={query?.vec}
          queryPrimary={query?.primary}
          onClose={() => setSelectedId(null)}
          onVoted={handleVoted}
        />
      )}

      {present && (
        <PresentSequence data={present} onClose={() => setPresent(null)} />
      )}
    </div>
  );
}
