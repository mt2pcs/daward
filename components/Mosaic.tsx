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
// モザイクの動きの文法（参照mp4の再現）:
// - 配置そのものが常時なめらかに組み変わり続ける: 数秒ごとに並び順が
//   入れ替わり（隣接スワップ + 時々1枚が画面を横断）、すべて数秒がかりの
//   緩やかな補間で滑る。画面のどこかが常に流れている状態が標準
// - タイルの「中身」も常に動く（ライブ映像 + Ken Burns）
// - 投票が入った瞬間はそのタイルが脈打ち、育つ

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

  // 振り付けサイクル: 並び順の組み替え（隣接スワップ + 横断移動）と
  // 重みのゆらぎを同時に進める。補間はCSS側で数秒かけて滑る。
  const [order, setOrder] = useState<number[]>([]);
  const [drift, setDrift] = useState<number[]>([]);
  const countRef = useRef(moments.length);
  countRef.current = moments.length;

  useEffect(() => {
    setOrder(Array.from({ length: moments.length }, (_, i) => i));
  }, [moments.length]);

  useEffect(() => {
    if (motion <= 0) return;
    const interval = 12000 - (motion / 100) * 8000; // 100で4秒ごと、60で約7秒ごと
    const amp = 0.05 + (motion / 100) * 0.08;
    const step = () => {
      setOrder((prev) => {
        if (prev.length < 4) return prev;
        const next = [...prev];
        const swaps = Math.max(1, Math.round((motion / 100) * 5));
        for (let s = 0; s < swaps; s++) {
          const i = Math.floor(Math.random() * (next.length - 1));
          [next[i], next[i + 1]] = [next[i + 1], next[i]];
        }
        // 時々1枚が別の場所へ流れていく（画面を横断する大きな動き）
        if (Math.random() < 0.65) {
          const from = Math.floor(Math.random() * next.length);
          const to = Math.floor(Math.random() * next.length);
          const [item] = next.splice(from, 1);
          next.splice(to, 0, item);
        }
        return next;
      });
      setDrift((prev) =>
        Array.from({ length: countRef.current }, (_, i) => {
          const cur = prev[i] ?? 1;
          const next = cur * (1 + (Math.random() - 0.5) * 2 * amp);
          return Math.min(1.15, Math.max(0.85, next));
        })
      );
    };
    const t = setInterval(step, interval);
    return () => clearInterval(t);
  }, [motion]);

  const rects = useMemo(() => {
    if (size.w === 0 || size.h === 0 || order.length !== moments.length)
      return [];
    const orderedWeights = order.map((idx) => {
      const m = moments[idx];
      const norm = Math.pow(m.votes / maxVotes, 0.72);
      return (0.38 + norm * 1.62) * (drift[idx] ?? 1);
    });
    const laid = computeLayout(orderedWeights, size.w, size.h);
    // 表示順（moments順）に並べ直す
    const byMoment: typeof laid = new Array(moments.length);
    order.forEach((momentIdx, pos) => {
      byMoment[momentIdx] = laid[pos];
    });
    return byMoment;
  }, [moments, maxVotes, size, drift, order]);

  return (
    <div className="mosaic" data-rev="flow1" ref={containerRef}>
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
