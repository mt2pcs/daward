"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MomentWithStats, VoteResponse } from "@/lib/types";
import { getCrowd } from "@/lib/crowd";
import Mosaic from "./Mosaic";
import DetailOverlay from "./DetailOverlay";
import PresentSequence from "./PresentSequence";
import Tuner, {
  DEFAULT_TUNING,
  loadTuning,
  saveTuning,
  type Tuning,
} from "./Tuner";

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

  // 歓声エンジンは最初のユーザー操作で起動（ブラウザの自動再生制限）。
  // 音量設定に関係なく常に武装しておき（音量はmaster側で反映）、
  // capture段で拾うことでどのUI要素へのクリックでも確実に起動する
  const [soundArmed, setSoundArmed] = useState(false);
  useEffect(() => {
    const kick = () => {
      getCrowd().start();
      setTimeout(
        () => setSoundArmed((prev) => prev || getCrowd().isActive()),
        150
      );
    };
    window.addEventListener("pointerdown", kick, true);
    window.addEventListener("pointerup", kick, true);
    window.addEventListener("click", kick, true);
    window.addEventListener("keydown", kick, true);
    window.addEventListener("touchend", kick, true);
    return () => {
      window.removeEventListener("pointerdown", kick, true);
      window.removeEventListener("pointerup", kick, true);
      window.removeEventListener("click", kick, true);
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
      <Mosaic
        moments={moments}
        pulses={pulses}
        motion={tuning.motion}
        liveCount={tuning.live}
        soundOn={tuning.volume > 0}
        soundLive={soundArmed && tuning.volume > 0}
        onSelect={(m) => setSelectedId(m.id)}
      />

      <header className="hud">
        <div className="hud-brand">
          <div className="hud-kicker">DAZN AWARDS 2026 — FAN VOTE</div>
          <h1>
            É M<em>OO</em>MENTS <em>100</em>
          </h1>
          <div className="hud-hint">
            心を震わせた100の瞬間。気になったモーメントに触れて、投票しよう。
          </div>
        </div>
        <div className="hud-right">
          <div className="hud-total">{totalVotes.toLocaleString()}</div>
          <div className="hud-total-label">TOTAL VOTES</div>
        </div>
      </header>

      <Tuner
        tuning={tuning}
        open={tunerOpen}
        onToggle={() => setTunerOpen((v) => !v)}
        onChange={updateTuning}
      />

      {tuning.volume > 0 && !soundArmed && (
        <div className="sound-hint">🔊 クリックすると歓声が流れます</div>
      )}

      {/* 表示中のビルドを特定するための刻印（「どの版を見ているか」の水掛け論防止） */}
      <div className="rev-tag">rev sound3</div>

      {selected && (
        <DetailOverlay
          moment={selected}
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
