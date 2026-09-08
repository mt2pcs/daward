import type { Metadata } from "next";
import ContextGraph from "@/components/ContextGraph";
import { listMoments } from "@/lib/store";
import context from "@/data/context.json";
import type { MomentContext } from "@/lib/contextGraph";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "CONTEXT GRAPH | É MOOMENTS 100" };

export default function GraphPage() {
  return <ContextGraph moments={listMoments()} context={context as MomentContext[]} />;
}
