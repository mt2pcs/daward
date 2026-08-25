"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { computeLayout, type LayoutRect } from "@/lib/layout";
import { embedUrl, thumbUrl } from "@/lib/youtube";
import type { MomentWithStats } from "@/lib/types";

const GAP = 3;
const TAU = 0.16; // 追従の時定数（秒）。小さいほど機敏
// モザイクの動きの文法（確定仕様）:
// - 動きの駆動源はカーソルのみ。静止時は完全静止
// - 補間は「各矩形をバラバラに動かす」のではなく「重みを毎フレーム滑らかに
//   追従させ、その都度レイアウト全体を敷き詰め直す」。したがって
//   どの瞬間を切り出しても隙間・重なりのない完全なモザイクのまま境界だけが滑る
// - タイルの基礎サイズは投票数。並び順は固定

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
  motion: number; // 0..100 カーソル反応の強さ
  liveCount: number;
  onSelect: (m: MomentWithStats) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tileEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const sizeRef = useRef({ w: 0, h: 0 });
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const motionRef = useRef(motion);
  motionRef.current = motion;

  const maxVotes = useMemo(
    () => Math.max(1, ...moments.map((m) => m.votes)),
    [moments]
  );

  const baseWeights = useMemo(
    () =>
      moments.map((m) => {
        const norm = Math.pow(m.votes / maxVotes, 0.72);
        return 0.38 + norm * 1.62;
      }),
    [moments, maxVotes]
  );
  const baseWeightsRef = useRef(baseWeights);
  baseWeightsRef.current = baseWeights;

  const idsRef = useRef<string[]>([]);
  idsRef.current = moments.map((m) => m.id);

  // アニメーションの内部状態（Reactを介さず毎フレーム更新）
  const curWeights = useRef<number[]>([]);
  const curRects = useRef<LayoutRect[]>([]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      sizeRef.current = { w: el.clientWidth, h: el.clientHeight };
    });
    ro.observe(el);
    sizeRef.current = { w: el.clientWidth, h: el.clientHeight };
    return () => ro.disconnect();
  }, []);

  // 毎フレーム: 目標重み（投票 × カーソル近接ブースト）へ現在重みを指数追従させ、
  // レイアウト全体を敷き詰め直してDOMへ直接反映する
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { w, h } = sizeRef.current;
      const base = baseWeightsRef.current;
      const n = base.length;
      if (w === 0 || h === 0 || n === 0) return;

      if (curWeights.current.length !== n) {
        curWeights.current = base.slice();
      }

      const cursor = cursorRef.current;
      const strength = 1.5 + (motionRef.current / 100) * 4.5;
      const sigma = Math.max(80, w * 0.065);
      const prevRects = curRects.current;

      const k = 1 - Math.exp(-dt / TAU);
      let maxDelta = 0;
      for (let i = 0; i < n; i++) {
        let target = base[i];
        if (cursor && motionRef.current > 0 && prevRects.length === n) {
          const r = prevRects[i];
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
          target *= boost;
        }
        const cur = curWeights.current[i];
        const next = cur + (target - cur) * k;
        curWeights.current[i] = next;
        maxDelta = Math.max(maxDelta, Math.abs(next - cur) / cur);
      }

      // 収束していてカーソルも無ければ描画を省略（完全静止）
      if (maxDelta < 0.0004 && prevRects.length === n && !cursor) return;

      const rects = computeLayout(curWeights.current, w, h);
      curRects.current = rects;
      const ids = idsRef.current;
      for (let i = 0; i < n; i++) {
        const el = tileEls.current.get(ids[i]);
        if (!el) continue;
        const r = rects[i];
        el.style.left = `${r.x + GAP / 2}px`;
        el.style.top = `${r.y + GAP / 2}px`;
        el.style.width = `${Math.max(0, r.w - GAP)}px`;
        el.style.height = `${Math.max(0, r.h - GAP)}px`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onPointerMove = (e: React.PointerEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    cursorRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerLeave = () => {
    cursorRef.current = null;
  };

  const liveIds = useMemo(() => {
    return new Set(
      [...moments]
        .sort((a, b) => b.votes - a.votes)
        .slice(0, liveCount)
        .map((m) => m.id)
    );
  }, [moments, liveCount]);

  return (
    <div
      className="mosaic"
      data-rev="seamless1"
      ref={containerRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {moments.map((m) => {
        const hovered = m.id === hoveredId;
        const live = liveIds.has(m.id);
        const seed = tileSeed(m.id);
        const pulse = pulses[m.id];
        return (
          <div
            key={m.id}
            ref={(el) => {
              if (el) tileEls.current.set(m.id, el);
              else tileEls.current.delete(m.id);
            }}
            className={`tile${hovered ? " hovered" : ""}${pulse ? " pulse" : ""}`}
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
            <div className="tile-votes">🔥 {m.votes.toLocaleString()}</div>
            {pulse && (
              <div className="vote-pop" key={pulse}>
                +1 🔥
              </div>
            )}
            <div className="tile-info">
              <div className="tile-num">
                MOMENT <em>#{String(m.index).padStart(3, "0")}</em> / 100
              </div>
              <div className="tile-title">{m.title}</div>
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
