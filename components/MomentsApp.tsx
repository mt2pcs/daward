"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MomentWithStats, VoteResponse } from "@/lib/types";
import { getCrowd } from "@/lib/crowd";
import Mosaic from "./Mosaic";
import DetailOverlay from "./DetailOverlay";
import PresentSequence from "./PresentSequence";

export default function MomentsApp({
  initialMoments,
}: {
  initialMoments: MomentWithStats[];
}) {
  const [moments, setMoments] = useState(initialMoments);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [present, setPresent] = useState<VoteResponse | null>(null);
  const [pulses, setPulses] = useState<Record<string, number>>({});
  const [soundOn, setSoundOn] = useState(true);
  const activityRef = useRef(0);

  const totalVotes = useMemo(
    () => moments.reduce((s, m) => s + m.votes, 0),
    [moments]
  );

  const selected = moments.find((m) => m.id === selectedId) ?? null;

  // 歓声エンジンは最初のユーザー操作で起動（ブラウザの自動再生制限）
  useEffect(() => {
    const kick = () => {
      getCrowd().start();
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
    };
    window.addEventListener("pointerdown", kick);
    window.addEventListener("keydown", kick);
    return () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
    };
  }, []);

  useEffect(() => {
    getCrowd().setMuted(!soundOn);
  }, [soundOn]);

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
    // 投票の熱量 → ざわめきの大きさ
    activityRef.current = Math.min(8, activityRef.current + 1);
    getCrowd().setIntensity(activityRef.current / 8);
  }, []);

  // 熱量はゆっくり冷める
  useEffect(() => {
    const t = setInterval(() => {
      activityRef.current *= 0.85;
      getCrowd().setIntensity(activityRef.current / 8);
    }, 2500);
    return () => clearInterval(t);
  }, []);

  // ライブ投票シミュレーション: 他のファンの投票が流れ込み、
  // タイルが脈打ち、歓声が湧き、風景（タイルサイズ）が育っていく
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
            getCrowd().swell(0.18 + Math.random() * 0.2);
          }
        } catch {
          // ネットワーク断は無視して次のtickへ
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
          <button
            className="sound-toggle"
            onClick={() => {
              getCrowd().start();
              setSoundOn((v) => !v);
            }}
            aria-label="歓声のオン/オフ"
          >
            {soundOn ? "🔊 歓声 ON" : "🔇 歓声 OFF"}
          </button>
        </div>
      </header>

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
