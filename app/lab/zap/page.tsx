import ZapLoop from "@/components/lab/ZapLoop";
import { MOMENTS, media } from "@/lib/vote/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "ZAP LAB — DAZN 100 MOMENTS", robots: { index: false } };

// 検証用: ザッピングの1ループ（docs/design/zap/loop1_script.md）。?demo=1 で台本どおりに自動で進む。
export default function ZapLab() {
  return <ZapLoop moments={MOMENTS.map((m) => ({ no: m.no, title: m.title, thumb: media(m)?.thumb || null }))} />;
}
