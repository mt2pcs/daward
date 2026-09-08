import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// YouTubeサムネイルの同一オリジン中継。WebGLテクスチャとして使うには
// クロスオリジン画像が汚染扱いになるため、自前で配信する
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id.replace(/[^A-Za-z0-9_-]/g, "");
  if (!id) return new NextResponse("bad id", { status: 400 });
  for (const name of ["hqdefault", "mqdefault"]) {
    try {
      const r = await fetch(`https://i.ytimg.com/vi/${id}/${name}.jpg`, {
        next: { revalidate: 86400 },
      });
      if (r.ok) {
        const buf = await r.arrayBuffer();
        return new NextResponse(buf, {
          status: 200,
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
          },
        });
      }
    } catch {
      /* 次の候補へ */
    }
  }
  return new NextResponse("not found", { status: 404 });
}
