import { NextResponse } from "next/server";
import { listMoments } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ moments: listMoments() });
}
