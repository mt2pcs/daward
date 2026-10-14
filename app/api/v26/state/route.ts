import { NextResponse } from "next/server";
import { phase, VOTE_END, fmtMD } from "@/lib/vote/data";
import { heat, votedToday } from "@/lib/vote/store";

export const dynamic = "force-dynamic";

// 画面の状態（投票の時期・本日投票済み）と、体験側の熱（相対値のみ）。
export async function GET() {
  const v = votedToday();
  return NextResponse.json({ phase: phase(), votedToday: v.voted, votedNo: v.no || null, voteEnd: fmtMD(VOTE_END), heat: heat() });
}
