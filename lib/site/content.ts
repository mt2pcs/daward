// 情報サイト（DAZN AWARDS 2026・ワイヤー I-00〜I-02）と投票サイトで共有する文言・リンク・公開フラグ。
// 未確定のものはここだけ直せば画面が切り替わるようにしてある。「要確認」はクライアント確認待ち。
import { phase, type Phase } from "@/lib/vote/data";

export { SITE } from "@/lib/site/flags";

// ブランド素材（public/brand/。2026-10-15 支給。webp・背景黒。SVG 版・横組みロゴ・書体は未支給）
export const BRAND = {
  awardsLogo: "/brand/awards2026_logo.webp", // 縦組み（バースト＋DAZN＋DAZN AWARDS 2026）
  awardsMark: "/brand/awards_mark.webp", // バーストのマークのみ（透過）
  momentsH: "/brand/100moments_h.webp", // DAZN 100 MOMENTS 横組み
  momentsStack: "/brand/100moments_stack.webp", // DAZN 100 MOMENTS 3段
};

export const EVENT = {
  dateLabel: "2026.12.21 MON",
  dateLong: "2026年12月21日（月）",
  openTime: null as string | null, // 開場・開演はタイムライン確定後（要確認）
  venue: "TOYOTA ARENA TOKYO",
  address: "東京都江東区青海1-3-1",
  access: ["ゆりかもめ「青海」駅 徒歩4分", "りんかい線「東京テレポート」駅 徒歩5分"],
  mapEmbed: "https://www.google.com/maps?q=TOYOTA+ARENA+TOKYO&output=embed",
  recapNote: "後日、授賞式のリキャップ映像を配信予定です。",
};

// KV の告知映像（未支給）。届いたら URL を入れると炸裂の KV の代わりに映像を流す
export const KV_VIDEO: string | null = null;

// NEWS は新しい順。日付・文言は仮（要確認）
export const NEWS: { date: string; title: string; href?: string }[] = [
  { date: "2026.11.05", title: "一般投票「DAZN 100 MOMENTS」受付開始" },
  { date: "2026.10.30", title: "DAZN AWARDS 2026 開催決定" },
];

export const ABOUT = {
  concept: "スポーツが生み出す「熱狂」を肯定し、心を揺さぶる瞬間の価値を、世界と分かち合う。",
  body: "2026年、スポーツは数えきれない瞬間で私たちの心を震わせた。DAZN AWARDS は、その熱狂を一夜に集め、最も人の心を動かしたモーメントを称える授賞式です。", // 説明会資料の文章をもとに一般向けに調整（要確認）
  trophyImage: "/brand/trophy.jpg" as string | null, // 支給写真は 2025 年のトロフィー（2026 年の写真が届いたら差し替え）
  trophyCaption: "トロフィーは、天岩戸を開いた力の神・天手力男神（アメノタヂカラヲ）がモチーフ。写真は DAZN AWARDS 2025 のトロフィー。", // 要確認
};

// 6つの熱狂部門。photo は 100 MOMENTS の中から部門を代表する1本の番号（山場のポスター 1280px を使う。寄りの画を目視で選んだ）
export const CATEGORIES: { key: string; name: string; en: string; photo: string | null }[] = [
  { key: "wc", name: "ワールドカップ熱狂部門", en: "WORLD CUP", photo: "005" },
  { key: "soccer", name: "サッカー熱狂部門", en: "SOCCER", photo: "031" },
  { key: "baseball", name: "野球熱狂部門", en: "BASEBALL", photo: "061" },
  { key: "rugby", name: "ラグビー熱狂部門", en: "RUGBY", photo: "087" },
  { key: "basketball", name: "バスケ熱狂部門", en: "BASKETBALL", photo: "071" },
  { key: "sixth", name: "第6部門（名称未定）", en: "TBA", photo: null }, // その他競技／協賛企業のどちらか未定（要確認）
];

// ノミネート（12月上旬発表）。published=false の間は「12月上旬発表予定」。winner は受賞発表後に true
export const NOMINEES = {
  published: process.env.NOMINEES_PUBLISHED === "1",
  announce: "12月上旬発表予定",
  list: {} as Record<string, { no?: string; title: string; meta: string; reason: string; winner?: boolean }[]>,
};

// 出演者。public=false の人は名前を出さない（公開可否・解禁日は要確認）
export const CAST: { role: string; name: string; public: boolean }[] = [
  { role: "総合司会", name: "矢部浩之", public: false },
  { role: "MC", name: "野村明弘", public: false },
  { role: "MC", name: "中川絵美里", public: false },
];

export const CAMPAIGN = {
  title: "DAZN AWARDS ご招待キャンペーン",
  headline: "抽選で1,500組3,000名様を特別ご招待！", // 当選数は仮（要確認）
  sub: "DAZN会員様は、Premier席への特別ご招待をプレゼント！",
  entryUrl: null as string | null, // エントリーページ（要確認）
  period: null as string | null, // 応募期間（要確認）
};

// フッター・外部リンク（要確認: 公式アカウントの URL）
export const LINKS = {
  dazn: "https://www.dazn.com/ja-JP",
  sns: [
    { name: "X", href: "https://x.com/DAZN_JPN" },
    { name: "Instagram", href: "https://www.instagram.com/dazn_jpn/" },
  ],
  // 応募規約・プライバシーポリシーは DAZN 公式のページへリンクする想定。正確な URL は未確認なので公式トップへ（要確認）
  terms: "https://www.dazn.com/ja-JP",
  privacy: "https://www.dazn.com/ja-JP",
};

export const FAQ: { q: string; a: string }[] = [
  { q: "投票に会員登録は必要ですか？", a: "不要です。どなたでも投票できます。" },
  { q: "1日に何回投票できますか？", a: "1日1回、1つのモーメントに投票できます。" },
  { q: "投票期間はいつまでですか？", a: "11月上旬から受付を開始します。締切日は決まり次第お知らせします。" },
  { q: "結果はいつ発表されますか？", a: "2026年12月21日の授賞式で発表します。" },
  { q: "DAZNに加入していなくてもモーメントを見られますか？", a: "100 MOMENTS の映像はどなたでもご覧いただけます。フル版の視聴は DAZN 有料会員の方のみです。" },
];

// 時期による表示の切り替え（ワイヤー I-02）。phase は投票サイトと共通
export function sitePhase(): { phase: Phase; nominees: boolean } {
  return { phase: phase(), nominees: NOMINEES.published };
}
