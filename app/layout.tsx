import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "É MOOMENTS 100 | DAZN AWARDS 2026 ファン投票 (Prototype)",
  description:
    "2026年、スポーツが心を震わせた100のモーメント。眺めて、遊んで、いちばん好きな瞬間に投票しよう。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050505",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
