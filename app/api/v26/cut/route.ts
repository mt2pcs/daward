import { NextResponse } from "next/server";
import { resolve, stats } from "@/lib/cut/engine";

export const dynamic = "force-dynamic";
// POST {q} → 切り口。GET → エンジンの状態
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { q?: string };
  return NextResponse.json(await resolve(String(body.q ?? "")));
}
export async function GET() { return NextResponse.json(stats()); }
