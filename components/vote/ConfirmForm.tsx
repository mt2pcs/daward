"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { burstAt } from "@/components/vote/Fx";

// V-03 投票確認: ルール同意 → 投票する（1ステップ）
export default function ConfirmForm({ no }: { no: string }) {
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const submit = async () => {
    setBusy(true); setErr("");
    const r = await fetch("/api/v26/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ no, agree }) });
    const j = await r.json().catch(() => ({}));
    if (j.ok) { const b = document.querySelector(".v26-page .primary")?.getBoundingClientRect(); if (b) burstAt(b.left + b.width / 2, b.top + b.height / 2, { strong: true }); setTimeout(() => { router.push(`/moments/${no}/done`); router.refresh(); }, 420); return; }
    setBusy(false);
    setErr(j.error === "already" ? "本日はすでに投票済みです。明日また投票できます。" : j.error === "closed" ? "投票受付は終了しています。" : "投票できませんでした。時間をおいてお試しください。");
  };
  return (
    <>
      <label><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>投票ルール・規約に同意する（1日1回、1つのモーメントに投票できます）</span></label>
      {err && <div className="err">{err}</div>}
      <div className="row">
        <button className="primary" disabled={!agree || busy} onClick={submit}>{busy ? "送信中…" : "投票する"}</button>
        <a className="ghost" href={`/moments/${no}`}>キャンセル</a>
      </div>
    </>
  );
}
