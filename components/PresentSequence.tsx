"use client";

import { useEffect, useMemo, useState } from "react";
import { getCrowd } from "@/lib/crowd";
import { embedUrl, thumbUrl } from "@/lib/youtube";
import type { ArcCut, MomentWithStats, VoteResponse } from "@/lib/types";

// スペシャル映像: 感情の弧（序→破→急→頂点→余韻）で編集されたカット表を再生する。
// - カットはサムネイルではなく実映像（ミュート自動再生、山場秒があれば頭出し）
// - 次カットの映像は裏でマウントして先回しし、切替の淀みを消す
// - 歓声エンジンを弧に同期（序は遠く、頂点で最大）
type Stage = "type" | "arc" | "afterglow" | "logo";

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
  const [cutIdx, setCutIdx] = useState(0);
  const [typedCount, setTypedCount] = useState(0);
  const [run, setRun] = useState(0); // 「もう一度再生」用

  const text = useMemo(() => {
    const t = data.comment.text.trim();
    return t.length > 0 ? `“${t}”` : FALLBACK_TEXT;
  }, [data.comment.text]);

  // カット表（旧レスポンス互換: cuts が無ければ matched から擬似的に組む）
  const cuts = useMemo<ArcCut[]>(() => {
    if (data.cuts && data.cuts.length > 0) return data.cuts;
    const fallback: ArcCut[] = data.matched.map((m) => ({
      id: m.id,
      role: "rise",
      ms: 1800,
      startSec: 0,
      youtubeId: m.youtubeId,
      title: m.title,
      event: m.event,
      emotion: m.emotions[0],
    }));
    fallback.push({
      id: data.moment.id,
      role: "yours",
      ms: 4200,
      startSec: 0,
      youtubeId: data.moment.youtubeId,
      title: data.moment.title,
      event: data.moment.event,
      emotion: data.moment.emotions[0],
    });
    return fallback;
  }, [data]);

  // typewriter
  useEffect(() => {
    if (stage !== "type") return;
    if (typedCount >= text.length) {
      const t = setTimeout(() => setStage("arc"), 1100);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTypedCount((c) => c + 1), 72);
    return () => clearTimeout(t);
  }, [stage, typedCount, text]);

  // 弧の再生: role ごとのカット長で進み、歓声を同期させる
  useEffect(() => {
    if (stage !== "arc") return;
    const cut = cuts[cutIdx];
    if (!cut) {
      setStage("afterglow");
      return;
    }
    getCrowd().swell(SWELL[cut.role]);
    const t = setTimeout(() => {
      if (cutIdx < cuts.length - 1) setCutIdx((i) => i + 1);
      else setStage("afterglow");
    }, cut.ms);
    return () => clearTimeout(t);
  }, [stage, cutIdx, cuts]);

  // 余韻: 黒の中にコメントがもう一度浮かび、ロゴへ
  useEffect(() => {
    if (stage !== "afterglow") return;
    const t = setTimeout(() => setStage("logo"), 2600);
    return () => clearTimeout(t);
  }, [stage]);

  const replay = () => {
    setStage("type");
    setCutIdx(0);
    setTypedCount(0);
    setRun((r) => r + 1);
  };

  return (
    <div className="present" key={run}>
      {stage !== "logo" && (
        <button className="present-skip" onClick={() => setStage("logo")}>
          SKIP →
        </button>
      )}

      {stage === "type" && (
        <>
          {/* タイプライターの裏で最初のカットを先回し再生（弧の開始で読み込みを見せない） */}
          {cuts.slice(0, 2).map((c, i) => (
            <ArcClip key={`pre-${c.id}-${i}`} cut={c} active={false} preload />
          ))}
          <div className="present-center type-layer">
            <div className="typewriter">
              {text.slice(0, typedCount)}
              <span className="caret" />
            </div>
          </div>
        </>
      )}

      {stage === "arc" && (
        <>
          {cuts.map((c, i) => (
            <ArcClip
              key={`${c.id}-${i}`}
              cut={c}
              active={i === cutIdx}
              preload={i === cutIdx + 1 || i === cutIdx + 2}
            />
          ))}
          {/* カット切替の瞬き */}
          <div className="flash on" key={`f${cutIdx}`} />
          <div className="arc-theme">#{data.emotion}</div>
        </>
      )}

      {stage === "afterglow" && (
        <div className="present-center">
          <div className="afterglow-text">{text}</div>
        </div>
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

function ArcClip({
  cut,
  active,
  preload,
}: {
  cut: ArcCut;
  active: boolean;
  preload: boolean;
}) {
  // 表示中と次以降のカットだけマウント（次カットは裏で再生を先回し）
  if (!active && !preload) return null;
  const yours = cut.role === "yours";
  return (
    <div
      className={`arc-cut role-${cut.role}${active ? " active" : ""}`}
      aria-hidden={!active}
    >
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
      <div className="clip-shade" />
      {yours ? (
        <div className="yours-overlay">
          <div className="yours-kicker">YOUR MOMENT</div>
          <div className="yours-title">{cut.title}</div>
          <div className="yours-sub">
            {cut.event} — #{cut.emotion}
          </div>
        </div>
      ) : (
        <div className="clip-label">
          <div className="clip-emotion">{cut.emotion}</div>
          <div className="clip-title">
            {cut.title} — {cut.event}
          </div>
        </div>
      )}
    </div>
  );
}

// iframeの読み込み中に黒画面を見せないための下敷き
function PosterImg({ youtubeId, title }: { youtubeId: string; title: string }) {
  const [quality, setQuality] = useState<"hq" | "mq">("hq");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="arc-poster"
      src={thumbUrl(youtubeId, quality)}
      alt={title}
      draggable={false}
      onError={() => setQuality("mq")}
    />
  );
}

// 旧UIで使用（詳細画面等から参照される可能性があるため残置）
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
