import MomentsApp from "@/components/MomentsApp";
import { listMoments } from "@/lib/store";

export const dynamic = "force-dynamic";

// VISUAL_MODE=burst のサービス（別URL）は「熱狂の炸裂」の見せ方で同じアプリを出す
export default function Home() {
  return <MomentsApp initialMoments={listMoments()} visual={process.env.VISUAL_MODE === "burst" ? "burst" : "vortex"} />;
}
