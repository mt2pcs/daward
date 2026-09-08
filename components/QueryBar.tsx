"use client";

import { useState } from "react";
import type { Interpretation } from "@/lib/interpret";

// 言葉で渦を組み替える入力。体験の核なので常に画面下に居る。
// 「戻る」は無い: 次の言葉を入れれば渦はまた組み替わる。提案の言葉はAIが直前の特集から出す
export default function QueryBar({
  current,
  busy,
  onQuery,
}: {
  current: Interpretation | null; // いま渦を作っている解釈（初期状態は text=""）
  busy: boolean; // 解釈中
  onQuery: (text: string) => Promise<boolean>; // false=解釈できなかった
}) {
  const [text, setText] = useState("");
  const [miss, setMiss] = useState(false);

  const submit = async (t: string) => {
    const v = t.trim();
    if (!v || busy) return;
    setMiss(false);
    setText("");
    const ok = await onQuery(v);
    setMiss(!ok);
  };
  const suggestions = current?.next ?? ["ベテランの熱量", "めちゃくちゃ泣ける", "土壇場の一撃"];

  return (
    <div className={`query-bar${busy ? " busy" : ""}`}>
      <div className="query-chips">
        {current?.text ? (
          <span className="query-now">
            <em>#{current.theme}</em> {current.text}
          </span>
        ) : null}
        {suggestions.map((s) => (
          <button key={s} className="query-chip" onClick={() => submit(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
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
          placeholder={busy ? "渦を読んでいます…" : current?.text ? "次は、どんな熱狂を観たい？" : "いま、どんな熱狂を観たい？"}
          maxLength={60}
          disabled={busy}
        />
        <button className="query-submit" type="submit" disabled={busy}>
          {busy ? "渦が動いています" : "渦を組み替える"}
        </button>
      </form>
      {miss && <div className="query-miss">その言葉に合う瞬間が見つかりませんでした。別の言い方で試してください</div>}
    </div>
  );
}
