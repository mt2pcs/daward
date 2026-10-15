"use client";
import { useEffect, useRef } from "react";

// KV: DAZN のフレームから直線の破片が放射する（ロゴのモチーフ）。Canvas 2D、軽量。破片はゆっくり外へ流れて生まれ変わる
const PAL = ["#ebff00", "#ffffff", "#ff2d9b", "#2f6bff", "#ebff00", "#ffffff", "#ff8a3d"];
export default function BurstHero({ density = 1 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext("2d")!;
    let W = 0, H = 0, DPR = 1, raf = 0;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    type S = { a: number; r: number; len: number; w: number; col: string; v: number; thin: boolean };
    let shards: S[] = [];
    const mk = (init: boolean): S => { const a = Math.random() * Math.PI * 2; const thin = Math.random() < 0.55; return { a, r: init ? Math.random() * 0.9 : 0, len: 0.18 + Math.random() * 0.7, w: thin ? 0.7 + Math.random() * 1 : 2 + Math.random() * 6, col: PAL[(Math.random() * PAL.length) | 0], v: 0.015 + Math.random() * 0.04, thin }; };
    const resize = () => { DPR = Math.min(2, devicePixelRatio || 1); W = c.clientWidth; H = c.clientHeight; c.width = W * DPR; c.height = H * DPR; const n = Math.round(Math.max(W < 700 ? 320 : 520, Math.min(900, (W * H) / 1200)) * density); shards = Array.from({ length: n }, () => mk(true)); };
    resize(); addEventListener("resize", resize);
    let last = performance.now();
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H * 0.5 - (W < 700 ? H * 0.12 : H * 0.1), R = Math.hypot(W, H) * 0.62, core = Math.min(W, H) * 0.125;
      for (const s of shards) {
        if (!reduce) { s.r += dt * s.v; if (s.r > 1.1) Object.assign(s, mk(false)); }
        const r0 = core + s.r * R, r1 = r0 + s.len * R * (0.35 + s.r);
        const ca = Math.cos(s.a), sa = Math.sin(s.a);
        const fade = Math.min(1, s.r / 0.05 + 0.3) * Math.max(0, 1 - (s.r - 0.7) / 0.4);
        ctx.globalAlpha = fade * (s.thin ? 0.9 : 0.75);
        ctx.strokeStyle = s.col; ctx.lineWidth = s.thin ? s.w : s.w * (0.4 + s.r); ctx.lineCap = "butt";
        ctx.beginPath(); ctx.moveTo(cx + ca * r0, cy + sa * r0); ctx.lineTo(cx + ca * r1, cy + sa * r1); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); };
  }, [density]);
  return <canvas ref={ref} className="v26-burst" aria-hidden />;
}
