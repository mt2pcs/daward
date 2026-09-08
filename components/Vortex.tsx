"use client";

import { useEffect, useRef, useState } from "react";
import type { MomentWithStats } from "@/lib/types";

// 熱狂の渦 — エントランスのモーションロゴ。
// ロゴパレットの7色のストリークと100の瞬間のサムネイルが渦を巻いて中心へ吸い込まれ、
// 「入場する」で渦が外へ弾けて、そのまま感情の宇宙が現れる。
const PALETTE = [
  "#e5322d", "#ff5c8a", "#ff8a3d", "#5ee06a", "#3fa9f5", "#8b5cf6", "#d6ff4a", "#ffb3c1", "#ffffff",
];

interface Streak {
  a: number; // 角度
  r: number; // 半径（0..1、画面短辺比）
  w: number; // 太さ
  c: string;
  v: number; // 半径方向の速度係数
  px: number;
  py: number;
}
interface Thumb {
  a: number;
  r: number;
  img: HTMLImageElement;
  spin: number;
}

export default function Vortex({
  moments,
  onEnter,
}: {
  moments: MomentWithStats[];
  onEnter: () => void; // 渦が弾けきったタイミングで呼ぶ
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [leaving, setLeaving] = useState(false);
  const modeRef = useRef<"swirl" | "burst">("swirl");
  const burstAt = useRef(0);
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;
  const momentsRef = useRef(moments);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const streaks: Streak[] = [];
    for (let i = 0; i < 230; i++) {
      streaks.push({
        a: Math.random() * Math.PI * 2,
        r: 0.15 + Math.random() * 0.75,
        w: 1 + Math.random() * 3.2,
        c: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        v: 0.6 + Math.random() * 0.9,
        px: NaN,
        py: NaN,
      });
    }
    // 100の瞬間のサムネイルも渦に巻き込む（読み込めたものだけ）
    const thumbs: Thumb[] = [];
    const picks = [...momentsRef.current].sort(() => Math.random() - 0.5).slice(0, 26);
    for (const m of picks) {
      const img = new Image();
      img.onload = () =>
        thumbs.push({
          a: Math.random() * Math.PI * 2,
          r: 0.35 + Math.random() * 0.55,
          img,
          spin: Math.random() * Math.PI * 2,
        });
      img.src = `/api/thumb/${m.youtubeId}`;
    }

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.5;
      const burst = modeRef.current === "burst";
      const bt = burst ? (now - burstAt.current) / 1000 : 0;

      // 残像: 黒で薄く塗って軌跡を残す
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = burst ? "rgba(5,5,5,0.35)" : "rgba(5,5,5,0.17)";
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const s of streaks) {
        // 内側ほど速く回る（渦）。バーストでは外へ加速
        const omega = (0.55 + 0.9 / (s.r + 0.12)) * (burst ? 1.6 : 1);
        s.a += omega * dt;
        if (burst) s.r += (0.9 + bt * 2.2) * s.v * dt;
        else {
          s.r -= (0.06 + 0.09 * (1 - s.r)) * s.v * dt;
          if (s.r < 0.035) {
            s.r = 0.85 + Math.random() * 0.12;
            s.a = Math.random() * Math.PI * 2;
            s.px = NaN;
          }
        }
        const x = cx + Math.cos(s.a) * s.r * R;
        const y = cy + Math.sin(s.a) * s.r * R * 0.92;
        if (!Number.isNaN(s.px)) {
          ctx.strokeStyle = s.c;
          ctx.lineWidth = s.w * (0.5 + s.r);
          ctx.globalAlpha = Math.min(1, 0.35 + (1 - s.r) * 0.8);
          ctx.beginPath();
          ctx.moveTo(s.px, s.py);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        s.px = x;
        s.py = y;
      }
      ctx.globalAlpha = 1;

      // サムネイルの渦
      ctx.globalCompositeOperation = "source-over";
      for (const t of thumbs) {
        const omega = 0.45 + 0.7 / (t.r + 0.15);
        t.a += omega * dt * (burst ? 1.6 : 1);
        t.spin += dt * 0.8;
        if (burst) t.r += (0.8 + bt * 2) * dt;
        else {
          t.r -= (0.05 + 0.08 * (1 - t.r)) * dt;
          if (t.r < 0.06) {
            t.r = 0.9;
            t.a = Math.random() * Math.PI * 2;
          }
        }
        const x = cx + Math.cos(t.a) * t.r * R;
        const y = cy + Math.sin(t.a) * t.r * R * 0.92;
        const size = (0.06 + t.r * 0.16) * R;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t.a + Math.PI / 2 + Math.sin(t.spin) * 0.15);
        ctx.globalAlpha = Math.min(0.95, 0.25 + (1 - t.r) * 0.9) * (burst ? Math.max(0, 1 - bt) : 1);
        ctx.drawImage(t.img, -size / 2, (-size * 9) / 32, size, (size * 9) / 16);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      // 中心の核
      ctx.globalCompositeOperation = "lighter";
      const pulse = 0.7 + 0.3 * Math.sin(now * 0.004);
      const coreR = R * (burst ? 0.12 + bt * 1.4 : 0.075) * pulse;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      g.addColorStop(0, burst ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)");
      g.addColorStop(0.3, "rgba(235,255,0,0.3)");
      g.addColorStop(1, "rgba(120,60,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      if (burst && bt > 1.1) {
        cancelAnimationFrame(raf);
        onEnterRef.current();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const enter = () => {
    if (modeRef.current === "burst") return;
    modeRef.current = "burst";
    burstAt.current = performance.now();
    setLeaving(true);
  };

  return (
    <div className={`vortex${leaving ? " leaving" : ""}`}>
      <canvas ref={canvasRef} className="vortex-canvas" />
      <div className="vortex-ui">
        <div className="entry-kicker">DAZN AWARDS 2026 — FAN VOTE</div>
        <h1 className="entry-title">
          É M<em>OO</em>MENTS <em>100</em>
        </h1>
        <p className="entry-copy">
          歓喜も、涙も、鳥肌も。100の瞬間が、熱狂の渦になる。
          <br />
          言葉ひとつで、この宇宙は組み替わる。
        </p>
        <button className="entry-button" onClick={enter}>
          入場する
        </button>
        <div className="entry-note">🔊 サウンドが流れます</div>
      </div>
    </div>
  );
}
