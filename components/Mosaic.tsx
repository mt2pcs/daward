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
const LIVE_COUNT = 6; // 投票数上位のタイルだけミュート自動再生（100個のiframeはブラウザが持たないため）
const HOVER_BOOST = 3.1;
const JITTER = 0.09; // 常時ゆらぎの振幅（tapehead的な「生きている」動き）

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
  onSelect,
}: {
  moments: MomentWithStats[];
  onSelect: (m: MomentWithStats) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 2600);
    return () => clearInterval(t);
  }, []);

  const maxVotes = useMemo(
    () => Math.max(1, ...moments.map((m) => m.votes)),
    [moments]
  );

  const liveIds = useMemo(() => {
    return new Set(
      [...moments]
        .sort((a, b) => b.votes - a.votes)
        .slice(0, LIVE_COUNT)
        .map((m) => m.id)
    );
  }, [moments]);

  const rects = useMemo(() => {
    if (size.w === 0 || size.h === 0) return [];
    const weights = moments.map((m) => {
      const norm = Math.pow(m.votes / maxVotes, 0.72);
      let w = 0.38 + norm * 1.62;
      const seed = tileSeed(m.id);
      w *= 1 + Math.sin(tick * 0.9 + seed * Math.PI * 2 * 7) * JITTER;
      if (m.id === hoveredId) w *= HOVER_BOOST;
      return w;
    });
    return computeLayout(weights, size.w, size.h);
  }, [moments, maxVotes, size, hoveredId, tick]);

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
          return (
            <div
              key={m.id}
              className={`tile${hovered ? " hovered" : ""}`}
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
