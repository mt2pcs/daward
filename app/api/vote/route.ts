import { NextResponse } from "next/server";
import { buildArc } from "@/lib/arc";
import { analyzeEmotion, matchMoments } from "@/lib/emotion";
import { textToVector } from "@/lib/emotionSpace";
import { addVote, getMoment, getStore, withStats } from "@/lib/store";
import { EMOTIONS, type Emotion, type VoteResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: {
    momentId?: string;
    comment?: string;
    author?: string;
    query?: string;
    queryVec?: number[]; // /api/interpret の結果（LLM解釈）をそのまま受け取る
    queryPrimary?: string;
  };
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
  const query = (body.query ?? "").slice(0, 60);
  const q =
    Array.isArray(body.queryVec) && body.queryVec.length === EMOTIONS.length && (EMOTIONS as readonly string[]).includes(body.queryPrimary ?? "")
      ? { vec: body.queryVec.map((x) => Math.max(0, Math.min(1, Number(x) || 0))), primary: body.queryPrimary as Emotion }
      : query
        ? textToVector(query)
        : null;
  // 感情の解釈: コメント → 言葉（宇宙の組み替え）→ 投票先の主感情 の順に頼る
  const emotion = analyzeEmotion(text, q?.primary ?? moment.emotions[0]);
  const comment = addVote(moment.id, text, author, emotion);

  const store = getStore();
  const matched = matchMoments(store.moments, store.votes, emotion, moment.id, 3);
  const cuts = buildArc(store.moments, moment.id, emotion, q?.vec ?? null);

  const res: VoteResponse = {
    moment: withStats(moment),
    matched: matched.map(withStats),
    cuts,
    emotion,
    comment,
    query: query || undefined,
  };
  return NextResponse.json(res);
}
