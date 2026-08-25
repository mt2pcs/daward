import { NextResponse } from "next/server";
import { simulateVote } from "@/lib/store";

export const dynamic = "force-dynamic";

// ライブ投票シミュレーション: 他のファンの投票が今まさに入っている、という
// 熱狂の可視化のためのエンドポイント（プロトタイプ用。本番は実投票のリアルタイム配信）。
export async function POST() {
  return NextResponse.json(simulateVote());
}
