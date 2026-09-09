import MomentsApp from "@/components/MomentsApp";
import { listMoments } from "@/lib/store";

export const dynamic = "force-dynamic";

// 「熱狂の炸裂」版（見せ方のみ違う）。本番は別サービス（VISUAL_MODE=burst）のルートで出すが、検証用にこのルートでも見られる
export default function BurstPage() {
  return <MomentsApp initialMoments={listMoments()} visual="burst" />;
}
