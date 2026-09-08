"use client";

import { useState } from "react";
import type { Interpretation } from "@/lib/interpret";

// 言葉で渦を組み替える入力。提案の言葉は入力欄に入るだけで、送信は「渦を組み替える」で行う（押した瞬間から演出が始まる）
export default function QueryBar({
  current,
  busy,
  onQuery,
}: {
  current: Interpretation | null;
  busy: boolean;
  onQuery: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [miss, setMiss] = useState(false);

  const submit = async () => {
    const v = text.trim();
    if (!v || busy) return;
    setMiss(false);
    const ok = await onQuery(v);
    setMiss(!ok);
    if (ok) setText("");
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
          <button key={s} className={`query-chip${text === s ? " picked" : ""}`} onClick={() => { setText(s); setMiss(false); }} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="query-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
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
        <button className="query-submit" type="submit" disabled={busy || !text.trim()}>
          {busy ? "渦が動いています" : "渦を組み替える"}
        </button>
      </form>
      {miss && <div className="query-miss">その言葉に合う瞬間が見つかりませんでした。別の言い方で試してください</div>}
    </div>
  );
}
