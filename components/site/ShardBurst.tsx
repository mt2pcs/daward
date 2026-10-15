"use client";
import { useEffect, useRef } from "react";

// 支給ロゴ（DAZN AWARDS 2026）の文法で描く炸裂。ロゴの破片は「細い線」ではなく、DAZN フレームから放射する直線の「面」（くさび・平行四辺形）で、
// 半透明のため重なると濃くなる。色はロゴの画素から採った。ロゴ自身の破片の外側から画面の端まで、ロゴの炸裂が続いているように描く。
// 動き: 読み込み時に中心から面が伸び（0.9秒、少しずつずらす）、その後はごく小さく呼吸する。スクロールで外へ開きながら薄くなる。
export const LOGO_COLORS = ["#ff3366", "#ff8866", "#922a88", "#ff1a26", "#ff0020", "#ccdd66", "#4de6ff", "#dd8820", "#66ccff", "#900030", "#dff257", "#ff3355", "#3f7a5c", "#ffee55"];

type Anchor = { sel: string; x: number; y: number; core: number; avoid?: { sel: string } };
type Shard = { a: number; off: number; wi: number; wo: number; r0: number; len: number; col: string; al: number; delay: number; ph: number };

export default function ShardBurst({ anchor, count = 1, colors = LOGO_COLORS }: { anchor: Anchor; count?: number; colors?: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext("2d")!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, DPR = 1, raf = 0, shards: Shard[] = [];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const build = () => {
      const n = Math.round((W < 700 ? 54 : 84) * count);
      shards = Array.from({ length: n }, (_, i) => {
        const wide = Math.random() < 0.28;
        const wo = rnd(wide ? 0.045 : 0.014, wide ? 0.1 : 0.04);
        return { a: (i / n) * Math.PI * 2 + rnd(-0.06, 0.06), off: rnd(-0.03, 0.03), wi: wo * rnd(0, 0.45), wo, r0: rnd(0, 0.18), len: rnd(0.35, 1.05), col: colors[(Math.random() * colors.length) | 0], al: rnd(0.78, 0.95), delay: rnd(0, 0.45), ph: rnd(0, 6.28) };
      });
    };
    const resize = () => { DPR = Math.min(2, devicePixelRatio || 1); W = c.clientWidth; H = c.clientHeight; c.width = W * DPR; c.height = H * DPR; build(); };
    resize(); addEventListener("resize", resize);
    const t0 = performance.now();
    const ease = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t = Math.max(0, (now - t0) / 1000);
      const rc = c.getBoundingClientRect();
      if (rc.bottom < 0 || rc.top > innerHeight) return; // 画面外では描かない
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
      let cx = W / 2, cy = H / 2, core = Math.min(W, H) * 0.2, avoidTop = Infinity;
      const el = document.querySelector(anchor.sel);
      if (el) { const r = el.getBoundingClientRect(); cx = r.left - rc.left + r.width * anchor.x; cy = r.top - rc.top + r.height * anchor.y; core = r.width * anchor.core; }
      if (anchor.avoid) { const av = document.querySelector(anchor.avoid.sel); if (av) avoidTop = av.getBoundingClientRect().bottom - rc.top; }
      const S = Math.hypot(W, H) * 0.75;
      const scroll = Math.min(1, Math.max(0, -rc.top / Math.max(1, rc.height)));
      const spread = 1 + scroll * 0.5, fade = 1 - scroll * 0.85;
      for (const s of shards) {
        const k = reduce ? 1 : ease((t - s.delay) / 0.9);
        if (k <= 0) continue;
        const breathe = reduce ? 1 : 1 + 0.035 * Math.sin(t * 0.55 + s.ph);
        const ca = Math.cos(s.a), sa = Math.sin(s.a), nx = -sa, ny = ca;
        // 下向き（ワードマーク・文字・ボタンの帯）へ向かう破片は、その帯の下端より外から始める（文字に重ねない）
        let r0 = core * (1 + s.r0) * spread;
        if (sa > 0.55 && isFinite(avoidTop)) r0 = Math.max(r0, (avoidTop - cy) / sa + 40);
        const r1 = r0 + s.len * S * k * breathe * spread;
        const o = s.off * S, wi = s.wi * S * 0.5, wo = s.wo * S * 0.5 * (0.6 + 0.4 * k);
        ctx.globalAlpha = s.al * fade;
        ctx.fillStyle = s.col;
        ctx.beginPath();
        ctx.moveTo(cx + ca * r0 + nx * (o - wi), cy + sa * r0 + ny * (o - wi));
        ctx.lineTo(cx + ca * r1 + nx * (o - wo), cy + sa * r1 + ny * (o - wo));
        ctx.lineTo(cx + ca * r1 + nx * (o + wo), cy + sa * r1 + ny * (o + wo));
        ctx.lineTo(cx + ca * r0 + nx * (o + wi), cy + sa * r0 + ny * (o + wi));
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); };
  }, [anchor, count, colors]);
  return <canvas ref={ref} className="is-shards" aria-hidden />;
}
