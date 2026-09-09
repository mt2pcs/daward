"use client";

// エントランスの文字とボタン。渦（流体の目）は VortexSpace が3D空間の奥に描き、入場でその目へ飛び込む。
// ボタンは渦の中心に置く（渦へ入る、という動作そのもの）
export default function Entrance({ leaving, onEnter, visual = "vortex" }: { leaving: boolean; onEnter: () => void; visual?: "vortex" | "burst" }) {
  const burst = visual === "burst";
  return (
    <div className={`entrance${leaving ? " leaving" : ""}`}>
      <div className="entrance-brand">
        <div className="entry-kicker">DAZN AWARDS 2026 — FAN VOTE</div>
        <h1 className="entry-title">
          É M<em>OO</em>MENTS <em>100</em>
        </h1>
        <p className="entry-copy">{burst ? "100の瞬間が、熱狂の炸裂になる。" : "100の瞬間が、熱狂の渦になる。"}</p>
      </div>
      <div className="entrance-center">
        <button className="entry-button" onClick={onEnter}>
          {burst ? "中心へ飛び込む" : "渦に入る"}
        </button>
      </div>
      {/* ボタンは渦の目（画面中央）に正確に乗せる。注記とリンクは別枠でその下に置く */}
      <div className="entrance-sub">
        <div className="entry-note">🔊 サウンドが流れます</div>
        <a className="entry-graph-link" href="/graph">CONTEXT GRAPH ↗ <small>裏側の仕組みを見る</small></a>
      </div>
    </div>
  );
}
