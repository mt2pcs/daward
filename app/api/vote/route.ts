import { NextResponse } from "next/server";
import { analyzeEmotion, matchMoments } from "@/lib/emotion";
import { addVote, getMoment, getStore, withStats } from "@/lib/store";
import type { VoteResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { momentId?: string; comment?: string; author?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const moment = body.momentId ? getMoment(body.momentId) : undefined;
  if (!moment) {
    return NextResponse.json({ error: "moment not found" }, { status: 404 });
  }

  const text = (body.comment ?? "").slice(0, 200);
  const author = (body.author ?? "").slice(0, 30);
  const emotion = analyzeEmotion(text, moment.emotions[0]);
  const comment = addVote(moment.id, text, author, emotion);

  const store = getStore();
  const matched = matchMoments(store.moments, store.votes, emotion, moment.id, 3);

  const res: VoteResponse = {
    moment: withStats(moment),
    matched: matched.map(withStats),
    emotion,
    comment,
  };
  return NextResponse.json(res);
}
