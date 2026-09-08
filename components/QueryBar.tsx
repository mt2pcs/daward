"use client";

import { useState } from "react";
import type { Interpretation } from "@/lib/interpret";

// 言葉で渦を組み替える入力。体験の核なので常に画面下に居る
const SUGGESTIONS = ["ベテランの熱量", "めちゃくちゃ泣ける", "日本中が沸いた夜", "土壇場の一撃", "若き才能の覚醒"];

export default function QueryBar({
  active,
  busy,
  onQuery,
  onReset,
}: {
  active: Interpretation | null; // 適用中の言葉（初期状態は null）
  busy: boolean; // 解釈中
  onQuery: (text: string) => Promise<boolean>; // false=解釈できなかった
  onReset: () => void;
}) {
  const [text, setText] = useState("");
  const [miss, setMiss] = useState(false);

  const submit = async (t: string) => {
    const v = t.trim();
    if (!v || busy) return;
    setMiss(false);
    const ok = await onQuery(v);
    setMiss(!ok);
    if (ok) setText("");
  };

  return (
    <div className={`query-bar${busy ? " busy" : ""}`}>
      {active ? (
        <div className="query-active">
          <span className="query-theme">#{active.theme}</span>
          <span className="query-text">“{active.text}”</span>
          <button className="query-reset" onClick={onReset}>
            元の渦に戻る
          </button>
        </div>
      ) : (
        <div className="query-chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="query-chip" onClick={() => submit(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="query-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <input
          className="query-input"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setMiss(false);
          }}
          placeholder="いま、どんな熱狂を観たい？"
          maxLength={60}
          disabled={busy}
        />
        <button className="query-submit" type="submit" disabled={busy}>
          {busy ? "渦を読んでいます…" : "渦を組み替える"}
        </button>
      </form>
      {miss && <div className="query-miss">その言葉に合う瞬間が見つかりませんでした。別の言い方で試してください</div>}
    </div>
  );
}
