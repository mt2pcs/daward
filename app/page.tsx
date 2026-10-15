import type { Metadata } from "next";
import MomentsApp from "@/components/MomentsApp";
import InfoSite from "@/components/site/InfoSite";
import { listMoments } from "@/lib/store";

export const dynamic = "force-dynamic";

// VISUAL_MODE=burst（本番サービス）のドメイン直下は情報サイト TOP（ワイヤー I-01）。投票サイトは /moments、体験は最後に作る（/experience に退避）。
// 渦版（e-mooments）はプロトタイプのまま残す
export async function generateMetadata(): Promise<Metadata> {
  if (process.env.VISUAL_MODE !== "burst") return {};
  return { title: "DAZN AWARDS 2026 | 2026.12.21 TOYOTA ARENA TOKYO", description: "スポーツが生み出す「熱狂」を肯定し、心を揺さぶる瞬間の価値を、世界と分かち合う。DAZN AWARDS 2026 公式サイト。" };
}
export default function Home() {
  if (process.env.VISUAL_MODE === "burst") return <InfoSite />;
  return <MomentsApp initialMoments={listMoments()} visual="vortex" />;
}
