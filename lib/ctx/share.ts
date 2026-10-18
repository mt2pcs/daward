// シェアのリンクの中身: base64url(JSON {n: 名前, s: 種の文脈 id か -1, q: 言葉, i: [文脈 id]})
export type Shared = { n: string; s?: number; q?: string; i: number[] };
export function decodeShare(code: string, nCtx: number): Shared | null {
  try { const j = JSON.parse(Buffer.from(code.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Shared;
    if (!Array.isArray(j.i)) return null; j.i = j.i.filter((x) => Number.isInteger(x) && x >= 0 && x < nCtx).slice(0, 10); j.n = String(j.n || "").slice(0, 20);
    if (j.s !== undefined && !(Number.isInteger(j.s) && j.s < nCtx)) j.s = -1; if (j.q) j.q = String(j.q).slice(0, 40); return j.i.length ? j : null; } catch { return null; }
}
