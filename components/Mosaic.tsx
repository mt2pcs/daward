"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { computeLayout } from "@/lib/layout";
import { embedUrl, thumbUrl } from "@/lib/youtube";
import type { MomentWithStats } from "@/lib/types";

const GAP = 3;
// モザイクの動きの文法:
// - タイルの「中身」は常に動く（ライブ映像 + Ken Burns）
// - 配置は「呼吸」する: motion設定に応じた間隔で重みがごくわずかに揺れ、
//   数秒かけたゆっくりした補間で夢のように動く（毎秒バラバラ動く jitter とは別物）
// - 投票が入った瞬間はそのタイルが脈打ち、少しだけ育つ

function tileSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

export default function Mosaic({
  moments,
  pulses,
  motion,
  liveCount,
  onSelect,
}: {
  moments: MomentWithStats[];
  pulses: Record<string, number>;
  motion: number; // 0..100
  liveCount: number;
  onSelect: (m: MomentWithStats) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxVotes = useMemo(
    () => Math.max(1, ...moments.map((m) => m.votes)),
    [moments]
  );

  const liveIds = useMemo(() => {
    return new Set(
      [...moments]
        .sort((a, b) => b.votes - a.votes)
        .slice(0, liveCount)
        .map((m) => m.id)
    );
  }, [moments, liveCount]);

  // 呼吸: motionに応じた間隔で、タイルごとの重み係数がランダムウォークする
  const [drift, setDrift] = useState<number[]>([]);
  const countRef = useRef(moments.length);
  countRef.current = moments.length;
  useEffect(() => {
    if (motion <= 0) {
      setDrift([]);
      return;
    }
    const amp = (motion / 100) * 0.1;
    const interval = 26000 - (motion / 100) * 16000; // 100で約10秒、55で約17秒ごと
    const step = () =>
      setDrift((prev) =>
        Array.from({ length: countRef.current }, (_, i) => {
          const cur = prev[i] ?? 1;
          const next = cur * (1 + (Math.random() - 0.5) * 2 * amp);
          return Math.min(1.14, Math.max(0.86, next));
        })
      );
    step();
    const t = setInterval(step, interval);
    return () => clearInterval(t);
  }, [motion]);

  const rects = useMemo(() => {
    if (size.w === 0 || size.h === 0) return [];
    const weights = moments.map((m, i) => {
      const norm = Math.pow(m.votes / maxVotes, 0.72);
      return (0.38 + norm * 1.62) * (drift[i] ?? 1);
    });
    return computeLayout(weights, size.w, size.h);
  }, [moments, maxVotes, size, drift]);

  return (
    <div className="mosaic" ref={containerRef}>
      {rects.length > 0 &&
        moments.map((m, i) => {
          const r = rects[i];
          const hovered = m.id === hoveredId;
          const big = r.w > 190 && r.h > 120;
          const showTitle = hovered || big;
          const showNum = hovered || (r.w > 128 && r.h > 82);
          const showVotes = hovered || (r.w > 108 && r.h > 72);
          const live = liveIds.has(m.id);
          const seed = tileSeed(m.id);
          const pulse = pulses[m.id];
          return (
            <div
              key={m.id}
              className={`tile${hovered ? " hovered" : ""}${pulse ? " pulse" : ""}`}
              style={{
                left: r.x + GAP / 2,
                top: r.y + GAP / 2,
                width: Math.max(0, r.w - GAP),
                height: Math.max(0, r.h - GAP),
              }}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") setHoveredId(m.id);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse")
                  setHoveredId((v) => (v === m.id ? null : v));
              }}
              onClick={() => onSelect(m)}
            >
              <div className="tile-media">
                <TileImage moment={m} seed={seed} />
                {live && (
                  <iframe
                    src={embedUrl(m.youtubeId, {
                      autoplay: true,
                      mute: true,
                      loop: true,
                      controls: false,
                    })}
                    title={m.title}
                    tabIndex={-1}
                    aria-hidden
                  />
                )}
              </div>
              <div className="tile-shade" />
              {showVotes && (
                <div className="tile-votes">🔥 {m.votes.toLocaleString()}</div>
              )}
              {pulse && (
                <div className="vote-pop" key={pulse}>
                  +1 🔥
                </div>
              )}
              <div className="tile-info">
                {showNum && (
                  <div className="tile-num">
                    MOMENT <em>#{String(m.index).padStart(3, "0")}</em> / 100
                  </div>
                )}
                {showTitle && <div className="tile-title">{m.title}</div>}
              </div>
            </div>
          );
        })}
    </div>
  );
}

function TileImage({
  moment,
  seed,
}: {
  moment: MomentWithStats;
  seed: number;
}) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="tile-fallback">
        {moment.sport}｜{moment.title}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbUrl(moment.youtubeId, "mq")}
      alt={moment.title}
      loading="lazy"
      draggable={false}
      onError={() => setBroken(true)}
      style={{
        animationDuration: `${11 + seed * 9}s`,
        animationDelay: `${-seed * 12}s`,
      }}
    />
  );
}
