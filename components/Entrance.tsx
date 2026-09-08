"use client";

// エントランスの文字とボタン。背景の渦は VortexSpace が描く（入場でそのまま宇宙になる）
export default function Entrance({ leaving, onEnter }: { leaving: boolean; onEnter: () => void }) {
  return (
    <div className={`entrance${leaving ? " leaving" : ""}`}>
      <div className="entrance-ui">
        <div className="entry-kicker">DAZN AWARDS 2026 — FAN VOTE</div>
        <h1 className="entry-title">
          É M<em>OO</em>MENTS <em>100</em>
        </h1>
        <p className="entry-copy">100の瞬間が、熱狂の渦になる。</p>
        <button className="entry-button" onClick={onEnter}>
          入場する
        </button>
        <div className="entry-note">🔊 サウンドが流れます</div>
      </div>
    </div>
  );
}
