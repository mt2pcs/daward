"use client";
export default function ShareButtons({ no, title }: { no: string; title: string }) {
  const text = `No.${no} ${title} に投票しました！ #DAZNAWARDS2026 #DAZN100MOMENTS`;
  const url = () => `${location.origin}/moments/${no}`;
  const x = () => open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url())}`, "_blank");
  const other = async () => { if (navigator.share) { try { await navigator.share({ title: text, url: url() }); } catch {} } else { await navigator.clipboard?.writeText(`${text} ${url()}`); alert("リンクをコピーしました"); } };
  return (<><button className="x" onClick={x}>𝕏 でシェア</button><button className="other" onClick={other}>ほかのSNS・リンクをコピー</button></>);
}
