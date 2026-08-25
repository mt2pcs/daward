"use client";

import { useCallback, useMemo, useState } from "react";
import type { MomentWithStats, VoteResponse } from "@/lib/types";
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

  const totalVotes = useMemo(
    () => moments.reduce((s, m) => s + m.votes, 0),
    [moments]
  );

  const selected = moments.find((m) => m.id === selectedId) ?? null;

  const handleVoted = useCallback((res: VoteResponse) => {
    setMoments((prev) =>
      prev.map((m) => (m.id === res.moment.id ? res.moment : m))
    );
    setSelectedId(null);
    setPresent(res);
  }, []);

  return (
    <div className="stage">
      <Mosaic moments={moments} onSelect={(m) => setSelectedId(m.id)} />

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
