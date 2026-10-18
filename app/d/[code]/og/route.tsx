// シェアのカード画像（1200×630）: ダイジェストの名前と、集まった瞬間のコマ。日本語の字は Google Fonts から使う字だけ取る
import { ImageResponse } from "next/og";
import net from "@/data/ctx/net.json";
import { decodeShare } from "@/lib/ctx/share";

export const dynamic = "force-dynamic";
const BASE = "https://storage.googleapis.com/e-mooments-assets";
const N = net as unknown as { ctx: { id: number; title: string; no: string }[]; moments: { no: string; sport: string }[] };
async function font(text: string) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@900&text=${encodeURIComponent(text)}`)).text();
  const url = css.match(/src: url\((.+?)\) format/)?.[1]; if (!url) throw new Error("font"); return (await fetch(url)).arrayBuffer();
}
export async function GET(_: Request, { params }: { params: { code: string } }) {
  const d = decodeShare(params.code, N.ctx.length);
  const ids = (d?.i || []).filter((x) => N.ctx[x]).slice(0, 6), name = String(d?.n || "熱狂ダイジェスト").slice(0, 16);
  const seed = d && d.s !== undefined && d.s >= 0 ? N.ctx[d.s]?.title : d?.q || "";
  const sub = `${d?.i.length || ids.length}本の瞬間が「${seed}」で繋がった`, brand = "DAZN 100 MOMENTS 熱狂ダイジェスト";
  let fonts: { name: string; data: ArrayBuffer; weight: 900 }[] = [];
  try { fonts = [{ name: "N", data: await font(name + sub + brand), weight: 900 }]; } catch { /* 字が無くても絵は出す */ }
  return new ImageResponse(
    <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", background: "#000", color: "#fff", fontFamily: "N" }}>
      <div style={{ display: "flex", flexWrap: "wrap", width: 1200, height: 390 }}>
        {ids.map((id) => <img key={id} src={`${BASE}/ctx/c/${id}.jpg`} width={400} height={195} style={{ objectFit: "cover", width: 400, height: 195 }} />)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", padding: "26px 48px" }}>
        <div style={{ fontSize: 22, color: "#ffff00", letterSpacing: 2 }}>{brand}</div>
        <div style={{ fontSize: 76, lineHeight: 1.1, marginTop: 6 }}>{name}</div>
        <div style={{ fontSize: 26, color: "rgba(255,255,255,.8)", marginTop: 8 }}>{sub}</div>
      </div>
    </div>, { width: 1200, height: 630, fonts });
}
