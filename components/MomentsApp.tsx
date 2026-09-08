"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Emotion, MomentWithStats, VoteResponse } from "@/lib/types";
import { getCrowd } from "@/lib/crowd";
import { textToVector } from "@/lib/emotionSpace";
import Galaxy, { type GalaxyQuery } from "./Galaxy";
import QueryBar from "./QueryBar";
import Vortex from "./Vortex";
import DetailOverlay from "./DetailOverlay";
import PresentSequence from "./PresentSequence";
import Tuner, {
  DEFAULT_TUNING,
  loadTuning,
  saveTuning,
  type Tuning,
} from "./Tuner";

// 体験の骨格:
//   熱狂の渦（エントランス）→ 感情の宇宙（8つの星団に100の瞬間）
//   → 言葉で宇宙を組み替える → 瞬間に触れて投票 → あなたの言葉から編んだフィルム
export default function MomentsApp({
  initialMoments,
}: {
  initialMoments: MomentWithStats[];
}) {
  const [moments, setMoments] = useState(initialMoments);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [present, setPresent] = useState<VoteResponse | null>(null);
  const [pulses, setPulses] = useState<Record<string, number>>({});
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

  // エントランス（熱狂の渦）: 「入場する」の1クリックが音の解錠を兼ねる
  const [entered, setEntered] = useState(false);
  const [vortexDone, setVortexDone] = useState(false);
  const enter = useCallback(() => {
    getCrowd().start();
    setEntered(true); // 渦が弾け始めた時点で宇宙のリビールを開始
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
  }, [tuning.volume]);

  const updateTuning = useCallback((t: Tuning) => {
    setTuning(t);
    saveTuning(t);
    if (t.volume > 0) getCrowd().start();
  }, []);

  // 言葉で宇宙を組み替える
  const [query, setQuery] = useState<(GalaxyQuery & { text: string; primary: Emotion }) | null>(null);
  const [themeFlash, setThemeFlash] = useState<{ e: Emotion; key: number } | null>(null);
  const applyQuery = useCallback((text: string) => {
    const r = textToVector(text);
    if (!r) return false;
    setQuery({ vec: r.vec, label: text, text, primary: r.primary });
    setThemeFlash({ e: r.primary, key: Date.now() });
    getCrowd().swell(0.6);
    return true;
  }, []);
  const resetQuery = useCallback(() => setQuery(null), []);

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
      setPresent(res);
    },
    [registerPulse]
  );

  return (
    <div className="stage">
      <Galaxy
        moments={moments}
        pulses={pulses}
        query={query}
        active={entered}
        soundOn={tuning.volume > 0}
        onSelect={(m) => setSelectedId(m.id)}
      />

      {themeFlash && (
        <div className="galaxy-theme" key={themeFlash.key}>
          {themeFlash.e}
        </div>
      )}

      <header className="hud">
        <div className="hud-brand">
          <div className="hud-kicker">DAZN AWARDS 2026 — FAN VOTE</div>
          <h1>
            É M<em>OO</em>MENTS <em>100</em>
          </h1>
          <div className="hud-hint">
            感情でつながる100の瞬間。言葉で組み替え、心が動いた瞬間に投票しよう。
          </div>
        </div>
        <div className="hud-right">
          <div className="hud-total">{totalVotes.toLocaleString()}</div>
          <div className="hud-total-label">TOTAL VOTES</div>
        </div>
      </header>

      {vortexDone && (
        <QueryBar
          active={query?.text ?? null}
          theme={query?.primary ?? null}
          onQuery={applyQuery}
          onReset={resetQuery}
        />
      )}

      <Tuner
        tuning={tuning}
        open={tunerOpen}
        onToggle={() => setTunerOpen((v) => !v)}
        onChange={updateTuning}
      />

      {!vortexDone && (
        <Vortex
          moments={moments}
          onEnter={() => setVortexDone(true)}
        />
      )}
      {/* 「入場する」押下を渦のバースト開始と同時に受け取る */}
      {!entered && !vortexDone && (
        <EnterWatcher onEnter={enter} />
      )}

      {/* 表示中のビルドを特定するための刻印（「どの版を見ているか」の水掛け論防止） */}
      <div className="rev-tag">rev galaxy1</div>

      {selected && (
        <DetailOverlay
          moment={selected}
          query={query?.text}
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

// Vortex内の「入場する」クリックを捕捉して、渦のバーストと同時に宇宙のリビールを始める
function EnterWatcher({ onEnter }: { onEnter: () => void }) {
  useEffect(() => {
    const h = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest(".entry-button")) onEnter();
    };
    document.addEventListener("click", h, true);
    return () => document.removeEventListener("click", h, true);
  }, [onEnter]);
  return null;
}
