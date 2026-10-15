// クライアント部品からも読む軽いフラグ（データを読み込まない）。文言・リンクは content.ts
export const SITE = {
  name: "DAZN AWARDS 2026",
  tagline: "Where Emotion Becomes One",
  // ドメイン直下が情報サイト TOP（ワイヤー I-01）。投票サイトは /moments
  infoPath: "/",
  votePath: "/moments",
  // 体験（熱狂の中を回遊する・リッチコンテンツ）は最後に作る（2026-10-15 決定）。出来るまで導線を出さない
  experienceReady: false,
  experiencePath: "/experience",
};
