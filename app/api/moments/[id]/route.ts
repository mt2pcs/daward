import { NextResponse } from "next/server";
import { getComments, getMoment, withStats } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const moment = getMoment(params.id);
  if (!moment) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({
    moment: withStats(moment),
    comments: getComments(moment.id),
  });
}
