"use client";

import { useEffect, useMemo, useState } from "react";
import { getCrowd } from "@/lib/crowd";
import { embedUrl, thumbUrl } from "@/lib/youtube";
import type { ArcCut, MomentWithStats, VoteResponse } from "@/lib/types";

// スペシャル映像 = 「あなたの言葉から編んだ1本のフィルム」。
// 見る人に伝えるべき物語は3つ:
//   1) あなたの言葉を読んだ（タイプライター → 感情の一文字が立ち上がる）
//   2) 同じ感情を100の瞬間から集めた（カットが流れる間、テーマと進行が見え続ける）
//   3) だから最後はあなたの瞬間（一拍置いて宣言 → 頂点 → エンドカード）
// 画面はPC/スマホ共通のストーリー型1カラム（映像は16:9帯・クロップ無し）。
type Step =
  | { kind: "theme"; ms: number }
  | { kind: "cut"; ms: number; cut: ArcCut; nth: number }
  | { kind: "bridge"; ms: number }
  | { kind: "endcard"; ms: number };

type Stage = "type" | "film" | "logo";

const FALLBACK_TEXT = "スポーツは、心を震わせる。";
const SWELL: Record<ArcCut["role"], number> = {
  intro: 0.3,
  rise: 0.55,
  climax: 0.85,
  yours: 1.0,
};

export default function PresentSequence({
  data,
  onClose,
}: {
  data: VoteResponse;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>("type");
  const [stepIdx, setStepIdx] = useState(0);
  const [typedCount, setTypedCount] = useState(0);
  const [run, setRun] = useState(0); // 「もう一度再生」用

  const text = useMemo(() => {
    const t = data.comment.text.trim();
    return t.length > 0 ? `“${t}”` : FALLBACK_TEXT;
  }, [data.comment.text]);

  const cuts = useMemo<ArcCut[]>(
    () => (data.cuts && data.cuts.length > 0 ? data.cuts : []),
    [data]
  );

  // フィルムのタイムライン: テーマ宣言 → カット群 → 一拍 → あなたの瞬間 → エンドカード
  const steps = useMemo<Step[]>(() => {
    const s: Step[] = [{ kind: "theme", ms: 2400 }];
    let nth = 0;
    for (const c of cuts) {
      if (c.role === "yours") s.push({ kind: "bridge", ms: 1100 });
      s.push({ kind: "cut", ms: c.ms, cut: c, nth: nth++ });
    }
    s.push({ kind: "endcard", ms: 3200 });
    return s;
  }, [cuts]);

  // typewriter
  useEffect(() => {
    if (stage !== "type") return;
    if (typedCount >= text.length) {
      const t = setTimeout(() => setStage("film"), 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTypedCount((c) => c + 1), 72);
    return () => clearTimeout(t);
  }, [stage, typedCount, text]);

  // フィルム進行
  useEffect(() => {
    if (stage !== "film") return;
    const step = steps[stepIdx];
    if (!step) {
      setStage("logo");
      return;
    }
    if (step.kind === "cut") getCrowd().swell(SWELL[step.cut.role]);
    const t = setTimeout(() => {
      if (stepIdx < steps.length - 1) setStepIdx((i) => i + 1);
      else setStage("logo");
    }, step.ms);
    return () => clearTimeout(t);
  }, [stage, stepIdx, steps]);

  const replay = () => {
    setStage("type");
    setStepIdx(0);
    setTypedCount(0);
    setRun((r) => r + 1);
  };

  const step = steps[stepIdx];
  const cutSteps = steps.filter((s): s is Extract<Step, { kind: "cut" }> => s.kind === "cut");
  const activeNth = step?.kind === "cut" ? step.nth : null;

  return (
    <div className="present" key={run}>
      {stage !== "logo" && (
        <button className="present-skip" onClick={() => setStage("logo")}>
          SKIP →
        </button>
      )}

      {stage === "type" && (
        <>
          {/* タイプライターの裏で最初のカットを先回し再生（読み込みを見せない） */}
          {cuts.slice(0, 2).map((c, i) => (
            <StoryCut key={`pre-${c.id}-${i}`} cut={c} active={false} preload />
          ))}
          <div className="present-center">
            <div className="typewriter">
              {text.slice(0, typedCount)}
              <span className="caret" />
            </div>
          </div>
        </>
      )}

      {stage === "film" && step && (
        <>
          {/* カットは常にマウントし、進行に合わせて表示。次カットは裏で先回し */}
          {cutSteps.map((s) => (
            <StoryCut
              key={`${s.cut.id}-${s.nth}`}
              cut={s.cut}
              active={activeNth === s.nth}
              preload={activeNth !== null && s.nth > activeNth && s.nth <= activeNth + 2}
            />
          ))}

          {step.kind === "theme" && (
            <div className="present-center film-card">
              <div className="theme-kanji">{data.emotion}</div>
              <div className="film-copy">
                その言葉と同じ震えを、100の瞬間から。
              </div>
            </div>
          )}

          {step.kind === "bridge" && (
            <div className="present-center film-card">
              <div className="film-copy bridge-copy">
                そして、あなたの選んだ瞬間。
              </div>
            </div>
          )}

          {step.kind === "endcard" && (
            <div className="present-center film-card">
              <div className="endcard">
                <div className="endcard-kanji">{data.emotion}</div>
                <div className="endcard-comment">{text}</div>
                <div className="endcard-title">
                  MOMENT #{String(data.moment.index).padStart(3, "0")}{" "}
                  {data.moment.title}
                </div>
                <div className="endcard-sub">
                  あなたの一票と言葉から編まれた、あなただけのフィルム
                </div>
              </div>
            </div>
          )}

          {(step.kind === "cut" || step.kind === "bridge") && (
            <>
              <div className="film-theme">#{data.emotion}</div>
              <div className="film-progress">
                {cutSteps.map((s) => (
                  <span
                    key={s.nth}
                    className={`film-dot${
                      activeNth !== null && s.nth <= activeNth ? " on" : ""
                    }${s.cut.role === "yours" ? " yours" : ""}`}
                  />
                ))}
              </div>
            </>
          )}
          {step.kind === "cut" && <div className="flash on" key={`f${stepIdx}`} />}
        </>
      )}

      {stage === "logo" && (
        <div className="present-center" style={{ flexDirection: "column" }}>
          <div className="dazn-logo">
            <div className="dazn-mark">
              <span>DA</span>
              <span>ZN</span>
            </div>
            <div className="dazn-tagline">
              DAZN AWARDS 2026
              <br />É M<em>OO</em>MENTS
            </div>
            <div className="present-actions">
              <button onClick={replay}>もう一度再生</button>
              <button className="primary" onClick={onClose}>
                モザイクに戻る
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ストーリー型1カラムの1カット: 感情（上）/ 16:9映像帯・クロップ無し（中央）/ タイトル（下）
function StoryCut({
  cut,
  active,
  preload,
}: {
  cut: ArcCut;
  active: boolean;
  preload: boolean;
}) {
  if (!active && !preload) return null;
  const yours = cut.role === "yours";
  return (
    <div
      className={`story-cut role-${cut.role}${active ? " active" : ""}`}
      aria-hidden={!active}
    >
      <div className="story-emotion">{yours ? "YOUR MOMENT" : cut.emotion}</div>
      <div className={`story-band${yours ? " yours" : ""}`}>
        <PosterImg youtubeId={cut.youtubeId} title={cut.title} />
        <iframe
          src={embedUrl(cut.youtubeId, {
            autoplay: true,
            mute: true,
            controls: false,
            start: cut.startSec,
          })}
          title={cut.title}
          tabIndex={-1}
          aria-hidden
        />
      </div>
      <div className="story-title">{cut.title}</div>
      <div className="story-event">{cut.event}</div>
    </div>
  );
}

// iframeの読み込み中に黒画面を見せないための下敷き
function PosterImg({ youtubeId, title }: { youtubeId: string; title: string }) {
  const [quality, setQuality] = useState<"hq" | "mq">("hq");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="story-poster"
      src={thumbUrl(youtubeId, quality)}
      alt={title}
      draggable={false}
      onError={() => setQuality("mq")}
    />
  );
}

// 旧UIから参照される可能性があるため残置
export function FallbackImg({ moment }: { moment: MomentWithStats }) {
  const [quality, setQuality] = useState<"maxres" | "hq" | "mq">("maxres");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbUrl(moment.youtubeId, quality)}
      alt={moment.title}
      draggable={false}
      onError={() => {
        setQuality((q) => (q === "maxres" ? "hq" : "mq"));
      }}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (quality === "maxres" && img.naturalWidth <= 120) setQuality("hq");
      }}
    />
  );
}
