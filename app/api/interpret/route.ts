import { NextResponse } from "next/server";
import { interpret } from "@/lib/interpret";
import { listMoments } from "@/lib/store";

export const dynamic = "force-dynamic";

// 言葉で宇宙を組み替える: {text} → 解釈（主感情・ベクトル・各瞬間の関連度）
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = (body.text ?? "").trim().slice(0, 120);
  if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });
  const r = await interpret(text, listMoments());
  if (!r) return NextResponse.json({ error: "no-match" }, { status: 422 });
  return NextResponse.json(r);
}
