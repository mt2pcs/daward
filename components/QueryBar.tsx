"use client";

import { useState } from "react";
import type { Emotion } from "@/lib/types";

// 言葉で宇宙を組み替える入力。体験の核なので常に画面下に居る
const SUGGESTIONS = [
  "めちゃくちゃ泣ける",
  "鳥肌が止まらない",
  "最後まで諦めない",
  "日本中がひとつになった",
  "最後の花道",
];

export default function QueryBar({
  active,
  theme,
  onQuery,
  onReset,
}: {
  active: string | null; // 適用中の言葉
  theme: Emotion | null;
  onQuery: (text: string) => boolean; // false=解釈できなかった
  onReset: () => void;
}) {
  const [text, setText] = useState("");
  const [miss, setMiss] = useState(false);

  const submit = (t: string) => {
    const v = t.trim();
    if (!v) return;
    const ok = onQuery(v);
    setMiss(!ok);
    if (ok) setText("");
  };

  return (
    <div className="query-bar">
      {active ? (
        <div className="query-active">
          <span className="query-theme">#{theme}</span>
          <span className="query-text">“{active}”</span>
          <button className="query-reset" onClick={onReset}>
            地図に戻る
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
        />
        <button className="query-submit" type="submit">
          組み替える
        </button>
      </form>
      {miss && (
        <div className="query-miss">その言葉の感情はまだ読み取れませんでした。別の言い方で試してください</div>
      )}
    </div>
  );
}
