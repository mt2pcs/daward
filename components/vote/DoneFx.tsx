"use client";
import { useEffect } from "react";
import { burstAt } from "@/components/vote/Fx";
// 投票完了: 到着した瞬間にサムネの中心から炸裂
export default function DoneFx() {
  useEffect(() => { const t = setTimeout(() => { const r = document.querySelector(".v26-page .thumb")?.getBoundingClientRect(); burstAt(r ? r.left + r.width / 2 : innerWidth / 2, r ? r.top + r.height / 2 : innerHeight / 3, { strong: true }); }, 120); return () => clearTimeout(t); }, []);
  return null;
}
