import type { Metadata } from "next";
import { headers } from "next/headers";
import HeatViewer from "@/components/HeatViewer";
import moments from "@/data/moments2026.json";
import net from "@/data/ctx/net.json";
import { decodeShare } from "@/lib/ctx/share";

export const dynamic = "force-dynamic";
// シェアされた熱狂ダイジェスト。開くと神経系の空間でそのダイジェストの旅が始まる。code = base64url(JSON {n: 名前, s: 種の文脈 id か -1, q: 言葉, i: [文脈 id]})
const N = net as unknown as { ctx: { id: number; title: string }[] };
const decode = (code: string) => decodeShare(code, N.ctx.length);
export function generateMetadata({ params }: { params: { code: string } }): Metadata {
  // OGP の絵は絶対 URL にする（Cloud Run の中では localhost:8080 に見える）
  const h = headers(), host = h.get("x-forwarded-host") || h.get("host"), proto = h.get("x-forwarded-proto") || "https";
  const metadataBase = host ? new URL(`${proto}://${host}`) : undefined;
  const d = decode(params.code), title = d ? `熱狂ダイジェスト「${d.n}」 — DAZN 100 MOMENTS` : "DAZN 100 MOMENTS";
  const desc = d ? `${d.i.length}本の瞬間が「${d.s !== undefined && d.s >= 0 ? N.ctx[d.s]?.title : d.q}」で繋がった。100の瞬間の熱狂の神経系を旅する。` : "100の瞬間の熱狂の神経系を旅する。";
  return { metadataBase, title, description: desc, openGraph: { title, description: desc, images: [`/d/${params.code}/og`] }, twitter: { card: "summary_large_image", title, description: desc, images: [`/d/${params.code}/og`] } };
}
export default function SharedDigest({ params }: { params: { code: string } }) {
  const list = (Array.isArray(moments) ? moments : Object.values(moments)) as { no: string; clips?: { webm?: string; loop?: string }[] }[];
  const media = Object.fromEntries(list.map((m) => [m.no, { webm: m.clips?.[0]?.webm, loop: m.clips?.[0]?.loop }]));
  return <HeatViewer media={media} shared={decode(params.code) || undefined} />;
}
