import { cookies, headers } from "next/headers";
import { createHash, randomUUID } from "crypto";

// 投票ストア（1日1回・端末ベース）。本番は Firestore に差し替える前提で、書き込み面を1か所に閉じる。
// 直接の票数は公開しない。可視化用には「熱」（相対値）だけを出す。
const votes = new Map<string, number>();            // no → 票数（非公開）
const log: { no: string; day: string; dev: string; at: number }[] = [];

export const DEVICE_COOKIE = "d100_device";
export const DAY_COOKIE = "d100_voted";

export function jstDay(now = new Date()) { return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
export function deviceId(): string {
  const c = cookies().get(DEVICE_COOKIE)?.value;
  if (c) return c;
  const ua = headers().get("user-agent") || "";
  return "tmp-" + createHash("sha1").update(ua + randomUUID()).digest("hex").slice(0, 16);
}
export function votedToday(): { voted: boolean; no?: string } {
  const c = cookies().get(DAY_COOKIE)?.value; // "YYYY-MM-DD:no"
  if (!c) return { voted: false };
  const [day, no] = c.split(":");
  return day === jstDay() ? { voted: true, no } : { voted: false };
}
export function castVote(no: string, dev: string): { ok: true } | { ok: false; reason: "already" } {
  const day = jstDay();
  if (log.some((l) => l.dev === dev && l.day === day)) return { ok: false, reason: "already" };
  votes.set(no, (votes.get(no) || 0) + 1);
  log.push({ no, day, dev, at: Date.now() });
  return { ok: true };
}
// 熱: 票数そのものではなく 0..1 の相対値（最多を1）。体験側のヒートマップ用。
export function heat(): Record<string, number> {
  const out: Record<string, number> = {};
  let max = 1;
  votes.forEach((v) => { if (v > max) max = v; });
  votes.forEach((v, no) => { out[no] = +(v / max).toFixed(3); });
  return out;
}
export const totalVotes = () => log.length;
