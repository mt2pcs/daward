"use client";

import { useEffect, useMemo, useState } from "react";
import { thumbUrl } from "@/lib/youtube";
import type { MomentWithStats, VoteResponse } from "@/lib/types";

type Stage = "type" | "clips" | "yours" | "logo";

const CLIP_MS = 1900;
const FALLBACK_TEXT = "スポーツは、心を震わせる。";

export default function PresentSequence({
  data,
  onClose,
}: {
  data: VoteResponse;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>("type");
  const [clipIdx, setClipIdx] = useState(0);
  const [typedCount, setTypedCount] = useState(0);
  const [run, setRun] = useState(0); // 「もう一度再生」用

  const text = useMemo(() => {
    const t = data.comment.text.trim();
    return t.length > 0 ? `“${t}”` : FALLBACK_TEXT;
  }, [data.comment.text]);

  const clips = data.matched;

  // typewriter
  useEffect(() => {
    if (stage !== "type") return;
    if (typedCount >= text.length) {
      const t = setTimeout(
        () => setStage(clips.length > 0 ? "clips" : "yours"),
        1150
      );
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTypedCount((c) => c + 1), 72);
    return () => clearTimeout(t);
  }, [stage, typedCount, text, clips.length]);

  // tempo cuts
  useEffect(() => {
    if (stage !== "clips") return;
    const t = setTimeout(() => {
      if (clipIdx < clips.length - 1) setClipIdx((i) => i + 1);
      else setStage("yours");
    }, CLIP_MS);
    return () => clearTimeout(t);
  }, [stage, clipIdx, clips.length]);

  // your moment → logo
  useEffect(() => {
    if (stage !== "yours") return;
    const t = setTimeout(() => setStage("logo"), 3400);
    return () => clearTimeout(t);
  }, [stage]);

  const replay = () => {
    setStage("type");
    setClipIdx(0);
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
        <div className="present-center">
          <div className="typewriter">
            {text.slice(0, typedCount)}
            <span className="caret" />
          </div>
        </div>
      )}

      {stage === "clips" &&
        clips.map((m, i) => (
          <Clip key={m.id} moment={m} active={i === clipIdx} />
        ))}
      {stage === "clips" && <div className="flash on" key={`f${clipIdx}`} />}

      {stage === "yours" && (
        <div className="present-center" style={{ flexDirection: "column" }}>
          <div className="yours-kicker">YOUR MOMENT</div>
          <div className="yours-frame">
            <FallbackImg moment={data.moment} />
          </div>
          <div className="yours-title">{data.moment.title}</div>
          <div className="yours-sub">
            MOMENT #{String(data.moment.index).padStart(3, "0")} / 100
            に投票しました — #{data.emotion}
          </div>
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

function Clip({
  moment,
  active,
}: {
  moment: MomentWithStats;
  active: boolean;
}) {
  return (
    <div className={`present-clip${active ? " active" : ""}`}>
      <FallbackImg moment={moment} />
      <div className="clip-shade" />
      <div className="clip-label">
        <div className="clip-emotion">{moment.emotions[0]}</div>
        <div className="clip-title">
          {moment.title} — {moment.event}
        </div>
      </div>
    </div>
  );
}

// maxres → hq → mq の順でサムネイルをフォールバック
function FallbackImg({ moment }: { moment: MomentWithStats }) {
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
        // maxresが存在しない場合、YouTubeは120x90のプレースホルダを返すので検出して落とす
        const img = e.currentTarget;
        if (quality === "maxres" && img.naturalWidth <= 120) setQuality("hq");
      }}
    />
  );
}
