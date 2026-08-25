import MomentsApp from "@/components/MomentsApp";
import { listMoments } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function Home() {
  return <MomentsApp initialMoments={listMoments()} />;
}
