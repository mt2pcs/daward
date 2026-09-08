import { NextResponse } from "next/server";
import { defaultArms } from "@/lib/interpret";
import { listMoments } from "@/lib/store";

export const dynamic = "force-dynamic";

// 初期状態の渦の腕（LLMが映像データから生成。初回のみ生成し以後キャッシュ）
export async function GET() {
  const r = await defaultArms(listMoments());
  return NextResponse.json(r);
}
