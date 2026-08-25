# daward — É MOOMENTS 100 (DAZN AWARDS 2026 ファン投票プロトタイプ)

Next.js 14 (App Router, TS)。詳細は README.md を参照。

## デプロイに関する重要な記録（毎回ハマるポイント）

**Cloud Run へのデプロイはセッションの種類で可否が決まる：**

- **クラウドセッション（claude.ai/code のWebやデスクトップから起動する Anthropic クラウド実行環境）には GCP 認証が無い。**
  `CLOUDSDK_AUTH_ACCESS_TOKEN` 等の環境変数が見えてもプレースホルダ（`proxy-in...`）であり、
  googleapis.com へのリクエストは 401 になる。`dl.google.com` は egress policy で遮断されて
  いるため gcloud CLI のインストールも不可。→ **クラウドセッションからは直接デプロイできない。**
- **Remote Control（ユーザーのPC上で動くローカルセッション）は、ローカルの gcloud 認証を
  使えるためデプロイ可能。** 過去のCloud Run関連作業はすべてこちらで実施している
  （例: 2026-08-24 セッション「AI活用理論の検証とCloud Runアプリ開発」）。

**したがってデプロイ依頼が来たら：**

1. ローカル（Remote Control）セッションなら、そのまま実行:
   ```bash
   gcloud run deploy e-mooments --source . --region asia-northeast1 --allow-unauthenticated
   ```
2. クラウドセッションなら、接続中のローカルセッションへ依頼を転送する
   （claude-code-remote MCP の create_trigger + fire_trigger で persistent_session_id 宛に送る）。
   ローカルセッションが無ければ、ユーザーにローカルでの実行を依頼する。
3. クラウドセッションから直接デプロイできるようにしたい場合は、環境設定に
   GCPサービスアカウントキー（roles: run.admin, cloudbuild.builds.editor,
   iam.serviceAccountUser, storage.admin）を環境変数として追加する。
   googleapis.com 自体は疎通可能なので、キーさえあれば REST API 経由でデプロイできる。

## アプリの構成メモ

- `data/moments.json` — 100本の実在YouTubeハイライト + 感情パラメータ（8種、先頭が主感情）
- `lib/layout.ts` — 投票数でタイルサイズが変わる重み付きBSPモザイク
- `lib/emotion.ts` — コメントからの辞書ベース感情推定（本番はClaude API差し替え想定）
- `lib/store.ts` — インメモリ投票ストア（本番は Firestore 差し替え想定）
- 映像素材は現状YouTube代用。本番mp4化は `lib/youtube.ts` の差し替えで対応

## セッション共通の運用ルール（ユーザーからの恒常指示・2026-08-25追記）

- 「後で確認する」と言うときは、必ず send_later 等で実際にスケジュールする。できない場合は「できない」と言う。
- 進捗が止まっているときは、止まっていると正直に報告する。楽観的な推測で埋めない。
- 自分から出力を観測できない場所（他セッションへの依頼転送など）を「完了見込み」として扱わない。頼りにする場合は結果をこのリポジトリへのプッシュ等、観測可能な形で受け取る設計にする。
- GCPプロジェクトは1つに集約する。新設しない。名前の変更は「表示名」で行う（プロジェクトIDは変更不可だがURL等にはほぼ露出しない）。
- ユーザーに同じ説明・同じ指摘を繰り返させない。判明した事実・決定はその都度このファイルに追記する。
- クラウドセッションにはclaude.ai（チャット）側のメモリや過去チャットの記憶は届かない。横断ルールはこのCLAUDE.mdと、環境のSetup script（ユーザーレベルCLAUDE.mdの生成）に置く。
