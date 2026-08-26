"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildLayoutTree,
  layoutFromTree,
  type LayoutNode,
  type LayoutRect,
} from "@/lib/layout";
import { embedUrl, thumbUrl } from "@/lib/youtube";
import { getCrowd } from "@/lib/crowd";
import type { MomentWithStats } from "@/lib/types";

const GAP = 3;
// モザイクの動きの文法（リファレンスmp4の全フレーム解析で確定。詳細はCLAUDE.md）:
// - 各タイルは「フォーカス熱量」e∈[0,1]を持つ。カーソルが乗っている間 τ_GROW で e→1、
//   それ以外は τ_DECAY で e→0。weight = base × (1 + G·e²)
// - e²のおかげで立ち上がりは緩く、中盤速く、終盤は指数減速——計測した速度プロファイルと同形
// - 成長はほぼ全面まで届く規模（G≈60）。前の焦点はゆっくり冷めるので航跡が波として残る
// - 駆動はカーソルの位置。静止ホバー中も飽和まで成長し、飽和すると完全静止
// - 補間は「重みを毎フレーム更新して全体を敷き詰め直す」方式。どの瞬間も隙間ゼロ
// 立ち上がり・戻りが遅いと「もたつき」に感じる。成長は速く、縮小もキビキビ
// （航跡は残るが引きずらない）
const TAU_GROW = 0.75;
const TAU_DECAY = 1.1;

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
  soundOn,
  soundLive,
  onSelect,
}: {
  moments: MomentWithStats[];
  pulses: Record<string, number>;
  motion: number; // 0..100 カーソル反応の強さ
  liveCount: number;
  soundOn: boolean; // 歓声の立体音響（音量>0で有効）
  soundLive: boolean; // 歓声が実際に鳴れる状態（起動済み）→ リング表示に使う
  onSelect: (m: MomentWithStats) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tileEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const innerEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // タッチ端末（スマホ）: なぞり追従の代わりにタップでフォーカスが移る
  const [isCoarse, setIsCoarse] = useState(false);
  const isCoarseRef = useRef(false);
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    setIsCoarse(coarse);
    isCoarseRef.current = coarse;
  }, []);
  const focusedIdxRef = useRef<number | null>(null);
  const forceDraw = useRef(true);

  const sizeRef = useRef({ w: 0, h: 0 });
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  // スクロール対応: カーソルは画面座標で覚え、毎フレーム scrollTop を足して
  // キャンバス座標に変換する（スクロール中もフォーカスがずれない）
  const lastClientRef = useRef<{ x: number; y: number } | null>(null);
  const motionRef = useRef(motion);
  motionRef.current = motion;
  const momentsRef = useRef(moments);
  momentsRef.current = moments;
  const maxVotesRef = useRef(1);
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  const liveCountRef = useRef(liveCount);
  liveCountRef.current = liveCount;
  const visibleIdsRef = useRef<Set<string>>(new Set());
  const liveSetRef = useRef<Set<string>>(new Set());
  const liveRefreshAt = useRef(0);

  const maxVotes = useMemo(
    () => Math.max(1, ...moments.map((m) => m.votes)),
    [moments]
  );
  maxVotesRef.current = maxVotes;

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
  const energies = useRef<number[]>([]);
  const curWeights = useRef<number[]>([]);
  const drawnWeights = useRef<number[]>([]);
  const mouseFocusRef = useRef<number | null>(null);
  const curRects = useRef<LayoutRect[]>([]);
  // 分割構造はサイズ変更時に一度だけ固定（投票やフォーカスでは作り直さない）
  const treeRef = useRef<LayoutNode | null>(null);
  // GPU描画の基準: タイルの実寸（width/height）は「アンカー配置」で一度だけ決め、
  // 毎フレームはtransform（GPU合成のみ、再レイアウトなし）で目標矩形へ変形する
  const anchorRects = useRef<LayoutRect[]>([]);
  const anchorKey = useRef("");

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

      if (energies.current.length !== n) {
        energies.current = new Array(n).fill(0);
      }

      // カーソルの画面座標をキャンバス座標へ（スクロール位置を毎フレーム反映）
      const stage = containerRef.current?.parentElement;
      const lastClient = lastClientRef.current;
      if (lastClient && stage) {
        cursorRef.current = {
          x: lastClient.x,
          y: lastClient.y + stage.scrollTop,
        };
      } else if (!lastClient) {
        cursorRef.current = null;
      }

      const cursor = cursorRef.current;
      // 成長の上限は「キャンバス比」ではなく「見えている画面の約8割」を基準にする。
      // K = 育ちきったタイルに与える重みの絶対量（面積比A ≒ K/(S+K) から逆算）
      const viewH = stage ? stage.clientHeight : h;
      let S = 0;
      for (let i = 0; i < n; i++) S += base[i];
      const A = Math.min(
        0.6,
        Math.max(0.05, 0.82 * (viewH / h) * (motionRef.current / 65))
      );
      const K = (A * S) / (1 - A);
      const G = motionRef.current > 0 ? 1 : 0; // 0でモーション無効
      // フォーカス判定（粘着式）: いまフォーカス中のタイルの現在矩形に
      // カーソルが入っている限りフォーカスを維持する。成長で境界が動いても
      // 焦点が隣へ滑り落ちて発振しない。外れたときだけ現在矩形で取り直す
      const hitRects = curRects.current.length === n ? curRects.current : null;
      let focusedIdx = focusedIdxRef.current; // タップフォーカス（スマホ）
      if (cursor && hitRects && G > 0) {
        const inside = (r: LayoutRect) =>
          cursor.x >= r.x &&
          cursor.x < r.x + r.w &&
          cursor.y >= r.y &&
          cursor.y < r.y + r.h;
        const held = mouseFocusRef.current;
        if (held !== null && hitRects[held] && inside(hitRects[held])) {
          focusedIdx = held;
        } else {
          focusedIdx = null;
          for (let i = 0; i < n; i++) {
            if (inside(hitRects[i])) {
              focusedIdx = i;
              break;
            }
          }
        }
        mouseFocusRef.current = focusedIdx;
      }

      const kGrow = 1 - Math.exp(-dt / TAU_GROW);
      const kDecay = 1 - Math.exp(-dt / TAU_DECAY);
      for (let i = 0; i < n; i++) {
        const e = energies.current[i];
        const target = i === focusedIdx ? 1 : 0;
        let next = e + (target - e) * (target > e ? kGrow : kDecay);
        // 端に十分近づいたら吸着させ、指数のしっぽを有限時間で終わらせる
        if (target > e) {
          if (target - next < 0.0005) next = target;
        } else if (next < 0.004) next = 0;
        energies.current[i] = next;
        curWeights.current[i] = base[i] + K * next * next;
      }

      // 立体音響: フォーカス中のモーメントの歓声（音量=投票数×成長度、定位=画面上の位置）
      const crowd = getCrowd();
      if (soundOnRef.current) {
        if (focusedIdx !== null && hitRects) {
          const r = hitRects[focusedIdx];
          const m = momentsRef.current[focusedIdx];
          if (r && m) {
            const e = energies.current[focusedIdx];
            const level =
              Math.pow(m.votes / maxVotesRef.current, 0.7) * (0.3 + 0.7 * e);
            const pan = Math.max(-0.85, Math.min(0.85, ((r.x + r.w / 2) / w) * 2 - 1));
            crowd.setFocus({ key: m.id, level, pan });
          }
        } else {
          crowd.setFocus(null);
        }
      }

      const ids = idsRef.current;

      // ライブ再生の選抜: 見えているタイルを大きい順に liveCount 枚（フォーカス中は必ず含む）。
      // スクロールで顔ぶれが変わるので0.7秒ごとに見直す
      if (!isCoarseRef.current && now - liveRefreshAt.current > 700) {
        liveRefreshAt.current = now;
        const rectsNow = curRects.current;
        if (rectsNow.length === n) {
          const cand: { id: string; area: number }[] = [];
          for (let i = 0; i < n; i++) {
            if (!visibleIdsRef.current.has(ids[i])) continue;
            const r = rectsNow[i];
            cand.push({ id: ids[i], area: i === focusedIdx ? Infinity : r.w * r.h });
          }
          cand.sort((a, b) => b.area - a.area);
          const next = new Set(cand.slice(0, liveCountRef.current).map((c) => c.id));
          const prev = liveSetRef.current;
          let changed = next.size !== prev.size;
          if (!changed) {
            next.forEach((id) => {
              if (!prev.has(id)) changed = true;
            });
          }
          if (changed) {
            liveSetRef.current = next;
            setLiveSet(next);
          }
        }
      }

      // アンカーの張り直し（画面サイズ・タイル数が変わった時だけ。通常は走らない）
      const key = `${w}x${h}:${n}`;
      if (anchorKey.current !== key) {
        anchorKey.current = key;
        treeRef.current = buildLayoutTree(base, w, h);
        const baseRects = layoutFromTree(treeRef.current, base, w, h);
        anchorRects.current = baseRects;
        forceDraw.current = true;
        for (let i = 0; i < n; i++) {
          const el = tileEls.current.get(ids[i]);
          if (!el) continue;
          const a = baseRects[i];
          el.style.width = `${Math.max(1, a.w - GAP)}px`;
          el.style.height = `${Math.max(1, a.h - GAP)}px`;
        }
      }

      // 描画省略は「最後に描いた重み」との差で判定する（完全静止の実現）。
      // 毎フレームの変化量で判定すると、減衰のしっぽで基準に戻り切る前に凍結する
      const drawn = drawnWeights.current;
      let needDraw = forceDraw.current || drawn.length !== n;
      if (!needDraw) {
        for (let i = 0; i < n; i++) {
          if (Math.abs(curWeights.current[i] - drawn[i]) / drawn[i] > 0.0015) {
            needDraw = true;
            break;
          }
        }
      }
      if (!needDraw) return;
      forceDraw.current = false;
      drawnWeights.current = curWeights.current.slice();

      const rects = layoutFromTree(treeRef.current!, curWeights.current, w, h);
      curRects.current = rects;
      const anchors = anchorRects.current;
      // 実寸の張り直し（拡大ボケ防止）は再レイアウトを伴うため、
      // 1フレームに最もズレの大きい2枚まで（残りはtransformのままで見た目は正しい）
      let reanchorBudget = 2;
      for (let i = 0; i < n; i++) {
        const el = tileEls.current.get(ids[i]);
        const inner = innerEls.current.get(ids[i]);
        if (!el || !inner || !anchors[i]) continue;
        const r = rects[i];
        let a = anchors[i];
        let sx = Math.max(0.01, (r.w - GAP) / Math.max(1, a.w - GAP));
        let sy = Math.max(0.01, (r.h - GAP) / Math.max(1, a.h - GAP));
        if (
          reanchorBudget > 0 &&
          (sx > 2.8 || sy > 2.8 || sx < 0.36 || sy < 0.36)
        ) {
          reanchorBudget--;
          a = { x: r.x, y: r.y, w: r.w, h: r.h };
          anchors[i] = a;
          el.style.width = `${Math.max(1, r.w - GAP)}px`;
          el.style.height = `${Math.max(1, r.h - GAP)}px`;
          sx = 1;
          sy = 1;
        }
        // 外側: GPU合成のみの変形で目標矩形へ。内側: 逆変形で映像の歪みを打ち消す
        el.style.transform = `translate3d(${r.x + GAP / 2}px, ${r.y + GAP / 2}px, 0) scale(${sx}, ${sy})`;
        const m = Math.max(sx, sy);
        inner.style.transform = `scale(${m / sx}, ${m / sy})`;
        // ラベルの出し分け: 現在の実寸に応じたクラスを毎描画で上書き
        // （ReactのclassName再描画で消されても次のフレームで復元される）
        const tier =
          r.w > 190 && r.h > 120 ? 3 : r.w > 128 && r.h > 82 ? 2 : r.w > 108 && r.h > 72 ? 1 : 0;
        el.classList.toggle("sz-votes", tier >= 1);
        el.classList.toggle("sz-num", tier >= 2);
        el.classList.toggle("sz-big", tier >= 3);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return; // タッチはタップ駆動（スクロールと衝突させない）
    lastClientRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    lastClientRef.current = null;
    cursorRef.current = null;
    focusedIdxRef.current = null;
    mouseFocusRef.current = null;
  };

  // タップ操作（スマホ）: 1回目=そのタイルが育つ / 育ったタイルをもう一度=詳細へ
  const handleTileClick = (m: MomentWithStats, i: number, e: React.MouseEvent) => {
    getCrowd().start(); // どのクリックでも歓声エンジンを起動（自動再生制限の解除）
    if (!isCoarse) {
      onSelect(m);
      return;
    }
    if (focusedIdxRef.current === i) {
      focusedIdxRef.current = null;
      setHoveredId(null);
      onSelect(m);
      return;
    }
    focusedIdxRef.current = i;
    setHoveredId(m.id);
  };

  // ライブ再生は「いま画面に見えているタイルのうち大きいものから liveCount 枚」。
  // どこへスクロールしても画面の主役級タイルでは常に映像が動いている
  const [liveSet, setLiveSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    const stage = containerRef.current?.parentElement;
    if (!stage) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const id = (en.target as HTMLElement).dataset.mid;
          if (!id) continue;
          if (en.isIntersecting) visibleIdsRef.current.add(id);
          else visibleIdsRef.current.delete(id);
        }
      },
      { root: stage, rootMargin: "150px 0px" }
    );
    tileEls.current.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [moments.length]);

  return (
    <div
      className="mosaic"
      data-rev="dynamic1"
      ref={containerRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {moments.map((m, i) => {
        const hovered = m.id === hoveredId;
        const live = !isCoarse && liveSet.has(m.id); // スマホは自動再生不可のため埋め込み無し
        const seed = tileSeed(m.id);
        const pulse = pulses[m.id];
        return (
          <div
            key={m.id}
            ref={(el) => {
              if (el) tileEls.current.set(m.id, el);
              else tileEls.current.delete(m.id);
            }}
            data-mid={m.id}
            className={`tile${hovered ? " hovered" : ""}${
              hovered && soundLive ? " sonic" : ""
            }${pulse ? " pulse" : ""}`}
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse") setHoveredId(m.id);
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse")
                setHoveredId((v) => (v === m.id ? null : v));
            }}
            onClick={(e) => handleTileClick(m, i, e)}
          >
            <div
              className="tile-inner"
              ref={(el) => {
                if (el) innerEls.current.set(m.id, el);
                else innerEls.current.delete(m.id);
              }}
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
