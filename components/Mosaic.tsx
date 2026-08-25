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
// モザイクの動きの文法（確定仕様）:
// - 動きの駆動源はカーソルのみ。カーソルに近いタイルほど重みが連続的に増え、
//   レイアウトを再計算して0.5秒の補間で追従する。カーソルが動けば「膨らみ」が
//   ついて動き、止まれば配置も止まる。自律的な組み替え・シャッフルはしない
// - タイルの基礎サイズは投票数。投票が入ると滑らかに育つ
// - 並び順は固定（タイルの近所関係は保たれる）

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

  // カーソル位置（レイアウト再計算は約70ms間隔にスロットル）
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const cursorRaw = useRef<{ x: number; y: number } | null>(null);
  const lastApply = useRef(0);
  const trailing = useRef<number | null>(null);

  const onPointerMove = (e: React.PointerEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    cursorRaw.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    const now = performance.now();
    const since = now - lastApply.current;
    if (since > 70) {
      lastApply.current = now;
      setCursor(cursorRaw.current);
    } else if (trailing.current === null) {
      // 末尾イベントも必ず反映する（カーソルが止まった最終位置に追従しきる）
      trailing.current = window.setTimeout(() => {
        trailing.current = null;
        lastApply.current = performance.now();
        setCursor(cursorRaw.current);
      }, 80 - since);
    }
  };
  const onPointerLeave = () => {
    cursorRaw.current = null;
    if (trailing.current !== null) {
      clearTimeout(trailing.current);
      trailing.current = null;
    }
    setCursor(null);
  };

  const baseWeights = useMemo(
    () =>
      moments.map((m) => {
        const norm = Math.pow(m.votes / maxVotes, 0.72);
        return 0.38 + norm * 1.62;
      }),
    [moments, maxVotes]
  );

  // 投票数のみの基準レイアウト。各タイルの「定位置の中心」を距離計算の錨にする
  const baseRects = useMemo(() => {
    if (size.w === 0 || size.h === 0) return [];
    return computeLayout(baseWeights, size.w, size.h);
  }, [baseWeights, size]);

  const rects = useMemo(() => {
    if (baseRects.length === 0) return [];
    if (!cursor || motion <= 0) return baseRects;
    // カーソルに近いタイルほど重みが増える（連続関数なので追従が滑らか）。
    // 焦点は狭く鋭く: 直下のタイルが主役級に育ち、隣接だけが少し連られる
    const strength = 1.5 + (motion / 100) * 4.5;
    const sigma = Math.max(80, size.w * 0.065);
    const weights = baseWeights.map((w, i) => {
      const r = baseRects[i];
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const d2 = (cx - cursor.x) ** 2 + (cy - cursor.y) ** 2;
      let boost = 1 + strength * Math.exp(-d2 / (2 * sigma * sigma));
      const contains =
        cursor.x >= r.x &&
        cursor.x <= r.x + r.w &&
        cursor.y >= r.y &&
        cursor.y <= r.y + r.h;
      if (contains) boost = Math.max(boost, 1 + strength);
      return w * boost;
    });
    return computeLayout(weights, size.w, size.h);
  }, [baseRects, baseWeights, cursor, motion, size]);

  return (
    <div
      className="mosaic"
      data-rev="cursor1"
      ref={containerRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
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
