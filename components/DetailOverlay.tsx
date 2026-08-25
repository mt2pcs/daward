"use client";

import { useEffect, useState } from "react";
import { embedUrl } from "@/lib/youtube";
import type {
  MomentComment,
  MomentWithStats,
  VoteResponse,
} from "@/lib/types";

export default function DetailOverlay({
  moment,
  onClose,
  onVoted,
}: {
  moment: MomentWithStats;
  onClose: () => void;
  onVoted: (res: VoteResponse) => void;
}) {
  const [comments, setComments] = useState<MomentComment[] | null>(null);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/moments/${moment.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setComments(d.comments ?? []);
      })
      .catch(() => {
        if (alive) setComments([]);
      });
    return () => {
      alive = false;
    };
  }, [moment.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const vote = async () => {
    setSending(true);
    setError(null);
    try {
      const r = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ momentId: moment.id, comment: text, author }),
      });
      if (!r.ok) throw new Error(`vote failed: ${r.status}`);
      const res: VoteResponse = await r.json();
      onVoted(res);
    } catch {
      setError("投票に失敗しました。もう一度お試しください。");
      setSending(false);
    }
  };

  return (
    <>
      <div
        className="overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="detail">
          <div className="detail-video">
            <div className="player">
              <iframe
                src={embedUrl(moment.youtubeId, { autoplay: true, mute: true })}
                title={moment.title}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>

          <div className="detail-side">
            <div>
              <div className="detail-num">
                MOMENT <em>#{String(moment.index).padStart(3, "0")}</em> / 100
              </div>
              <h2 className="detail-title">{moment.title}</h2>
            </div>

            <div className="detail-meta">
              <span className="chip">{moment.sport}</span>
              <span className="chip">{moment.event}</span>
              <span className="chip">{moment.year}</span>
              {moment.emotions.map((e) => (
                <span key={e} className="chip emotion">
                  {e}
                </span>
              ))}
            </div>

            <p className="detail-desc">{moment.description}</p>

            <div className="detail-votes">
              <strong>🔥 {moment.votes.toLocaleString()}</strong>
              <span>VOTES</span>
            </div>

            <div className="vote-form">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={200}
                placeholder="この瞬間への想いをひとこと（投票と一緒に届きます）"
              />
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                maxLength={30}
                placeholder="ニックネーム（任意）"
              />
              <button className="vote-btn" onClick={vote} disabled={sending}>
                {sending ? "投票中…" : "🔥 この瞬間に投票する"}
              </button>
              {error && <div className="vote-note">{error}</div>}
              <div className="vote-note">
                投票後、あなたのためのスペシャル映像が流れます
              </div>
            </div>

            <div className="comments">
              <h3>この瞬間に寄せられた声</h3>
              {comments === null ? (
                <div className="comments-empty">読み込み中…</div>
              ) : comments.length === 0 ? (
                <div className="comments-empty">
                  まだコメントはありません。最初の声を届けよう。
                </div>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="comment">
                    <p>{c.text}</p>
                    <footer>
                      <span className="tag">#{c.emotion}</span>
                      <span>{c.author}</span>
                    </footer>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      <button className="overlay-close" onClick={onClose} aria-label="閉じる">
        ✕
      </button>
    </>
  );
}
