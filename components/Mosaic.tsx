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
// モザイクの動きの文法（参照mp4のフレーム解析結果: 約1秒ごとに構図の再編成が
// 起こり、0.7秒前後のなめらかな補間で全タイルが同時に滑走、ほぼ途切れない）:
// - 毎サイクル、少数のタイルが大胆に「主役化」（重み×2〜3）し、他は徐々に戻る
// - 並び順も入れ替わる（隣接スワップ + 時々1枚が別の場所へ流れる）
// - 全タイルが1つのレイアウト変化として一斉に動くので、液体のような一体感が出る
// - ホバー中は新しい再編成を止める（狙ったタイルをクリックできるように）

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

  // 振り付けサイクル: 約1〜2秒ごとに構図を再編成し、CSS側の約0.8秒補間で
  // 全タイルが一斉に滑る。前の補間が終わる頃に次が始まり、壁は止まらない。
  const [order, setOrder] = useState<number[]>([]);
  const [feature, setFeature] = useState<number[]>([]); // 主役化の重み係数
  const countRef = useRef(moments.length);
  countRef.current = moments.length;
  const hoveredRef = useRef<string | null>(null);
  hoveredRef.current = hoveredId;

  useEffect(() => {
    setOrder(Array.from({ length: moments.length }, (_, i) => i));
  }, [moments.length]);

  useEffect(() => {
    if (motion <= 0) return;
    const interval = 3400 - (motion / 100) * 2200; // 100で1.2秒ごと、65で約2秒ごと
    const step = () => {
      if (hoveredRef.current) return; // 狙っている最中は動かさない
      setOrder((prev) => {
        if (prev.length < 4) return prev;
        const next = [...prev];
        const swaps = 2 + Math.floor(Math.random() * 3);
        for (let s = 0; s < swaps; s++) {
          const i = Math.floor(Math.random() * (next.length - 1));
          [next[i], next[i + 1]] = [next[i + 1], next[i]];
        }
        if (Math.random() < 0.5) {
          const from = Math.floor(Math.random() * next.length);
          const to = Math.floor(Math.random() * next.length);
          const [item] = next.splice(from, 1);
          next.splice(to, 0, item);
        }
        return next;
      });
      // 毎サイクル、全体の約12%が新しい主役度を引き直し、残りは1へ戻っていく
      setFeature((prev) =>
        Array.from({ length: countRef.current }, (_, i) => {
          const cur = prev[i] ?? 1;
          if (Math.random() < 0.12) {
            return 0.5 + Math.pow(Math.random(), 1.6) * 2.2; // 0.5〜2.7、たまに大きく
          }
          return cur * 0.8 + 0.2; // 1へ緩やかに回帰
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
      return (0.38 + norm * 1.62) * (feature[idx] ?? 1);
    });
    const laid = computeLayout(orderedWeights, size.w, size.h);
    const byMoment: typeof laid = new Array(moments.length);
    order.forEach((momentIdx, pos) => {
      byMoment[momentIdx] = laid[pos];
    });
    return byMoment;
  }, [moments, maxVotes, size, feature, order]);

  return (
    <div className="mosaic" data-rev="flow2" ref={containerRef}>
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
