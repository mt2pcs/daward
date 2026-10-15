"use client";
import { useEffect, useRef } from "react";

// 画面全体の演出レイヤー: どこからでも burstAt(x,y) で「直線の破片が炸裂する」閃光を出す（遷移・投票・到着で使う）
declare global { interface Window { __v26burst?: (x: number, y: number, opts?: { strong?: boolean }) => void } }
export function burstAt(x: number, y: number, opts?: { strong?: boolean }) { window.__v26burst?.(x, y, opts); }

export default function Fx() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current!;
    window.__v26burst = (x, y, opts) => {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const el = document.createElement("div");
      el.className = "v26-fx" + (opts?.strong ? " strong" : "");
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      el.innerHTML = '<i class="rays"></i><i class="ring"></i><i class="flash"></i>';
      host.appendChild(el);
      setTimeout(() => el.remove(), 900);
    };
    return () => { delete window.__v26burst; };
  }, []);
  return <div ref={ref} className="v26-fx-host" aria-hidden />;
}
