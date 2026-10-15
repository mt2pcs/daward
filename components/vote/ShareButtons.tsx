"use client";
export default function ShareButtons({ no, title }: { no: string; title: string }) {
  // シェア文（ワイヤー P12・案）: モーメント名を自動で入れる
  const text = `私が2026年いちばん心を震わせたのは「${title}」！\nあなたの1票は？\n#DAZNAWARDS2026 #DAZN100MOMENTS`;
  const url = () => `${location.origin}/moments/${no}`;
  const x = () => open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url())}`, "_blank");
  const other = async () => { if (navigator.share) { try { await navigator.share({ title: text, url: url() }); } catch {} } else { await navigator.clipboard?.writeText(`${text} ${url()}`); alert("リンクをコピーしました"); } };
  return (<><button className="x" onClick={x}>𝕏 でシェア</button><button className="other" onClick={other}>ほかのSNS・リンクをコピー</button></>);
}
