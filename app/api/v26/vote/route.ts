import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { byNo, phase } from "@/lib/vote/data";
import { castVote, deviceId, DEVICE_COOKIE, DAY_COOKIE, jstDay, votedToday } from "@/lib/vote/store";

export const dynamic = "force-dynamic";

// POST { no, agree: true } → 1日1回の投票。Cookie（端末ID＋当日投票済み）で判定。
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const no = String(body.no || "");
  if (!body.agree) return NextResponse.json({ ok: false, error: "agree" }, { status: 400 });
  if (!byNo(no)) return NextResponse.json({ ok: false, error: "no" }, { status: 404 });
  if (phase() !== "open") return NextResponse.json({ ok: false, error: "closed", phase: phase() }, { status: 403 });
  if (votedToday().voted) return NextResponse.json({ ok: false, error: "already" }, { status: 409 });
  const dev = deviceId();
  const r = castVote(no, dev);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 409 });
  const res = NextResponse.json({ ok: true, no, day: jstDay() });
  const exp = 60 * 60 * 24 * 90;
  res.cookies.set(DEVICE_COOKIE, dev, { maxAge: exp, path: "/", sameSite: "lax", httpOnly: true });
  res.cookies.set(DAY_COOKIE, `${jstDay()}:${no}`, { maxAge: 60 * 60 * 36, path: "/", sameSite: "lax", httpOnly: true });
  void cookies;
  return res;
}
