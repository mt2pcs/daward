import type { Metadata } from "next";
import InfoSite from "@/components/site/InfoSite";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "DAZN AWARDS 2026 | 2026.12.21 TOYOTA ARENA TOKYO" };

// 情報サイト（ワイヤー I-00〜I-02）。本番はドメイン直下（/）と同じもの。既存リンク（/awards#…）のために残す
export default function Awards() { return <InfoSite />; }
