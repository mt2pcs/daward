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

## デプロイ実績

### 2026-08-25 クラウドセッションからのRESTデプロイ試行 → 失敗（キー不完全）

- 結果: **失敗**。Cloud Run へのデプロイは未実施（GCPへの認証自体ができなかった）。
- 失敗段階: OAuthトークン取得の前段。環境変数 `GCP_SA_KEY` は存在する（長さ1674の base64 文字列）が、
  中身は**サービスアカウントJSON全体ではなく、秘密鍵（private_key）のbase64本体のみ**だった。
  JSONとしてパース不可、base64デコードしてもJSONにならない（DER形式のRSA秘密鍵）。
- JWT作成には `client_email`（iss）と `project_id` が必須だが、秘密鍵からは導出できないため認証不可。
  `CLOUDSDK_AUTH_ACCESS_TOKEN` はプレースホルダ（`proxy-in...`）で googleapis.com は 401（既知の事実の再確認）。
  ディスク上にもSA JSONは無し。
- 対処方法: 環境変数 `GCP_SA_KEY` に、GCPコンソールからダウンロードした**サービスアカウントキーのJSONファイル全体**を
  設定し直す。改行が問題になる場合は `base64 -w0 key.json` の結果を入れる（デプロイスクリプトは両形式に対応させる）。
  必要フィールド: `project_id` / `client_email` / `private_key`。
- 注意: 今回の試行中、Nodeのパースエラー出力に秘密鍵のbase64本体がセッションログ上へ表示されてしまった
  （リポジトリには一切書いていない）。client_email が無いため鍵単体では悪用困難だが、
  再設定時は**新しいキーを発行**（既存キーは削除）することを推奨。
- 環境の egress 確認: oauth2.googleapis.com / cloudresourcemanager.googleapis.com への疎通はOK。
  REST経由デプロイのスクリプトは `scripts/deploy_cloud_run.js` としてコミット済み
  （生JSON/base64どちらのキー形式にも対応。GCS→Cloud Build→Cloud Run v2→IAM付与→URL確認まで自動）。
  キー再設定後は `node scripts/deploy_cloud_run.js` を実行するだけでよい。

### 2026-08-25 (2回目) キー形式は解決、実行が権限クラシファイアにブロック → 未完遂

- キー確認: **今回の `GCP_SA_KEY` はほぼ正しい**。ただし**外側の波括弧 `{}` が欠けた状態**で
  保存されていた（値が `"type"` で始まり `"` で終わる。環境変数UIへの貼り付け時に欠落した模様）。
  `{` + 値 + `}` で JSON.parse に成功し、`type=service_account` / `project_id` /
  `client_email` / `private_key`（BEGIN PRIVATE KEY、改行込み）すべて揃っていることを確認済み
  （値そのものはログに出していない）。
- 対応: `scripts/deploy_cloud_run.js` の `parseKey` を波括弧欠落形式にも対応させた
  （生JSON / 波括弧なしJSON / base64 の3形式を受理）。ソースtarball作成まで完了。
- 失敗段階: `node scripts/deploy_cloud_run.js` の実行自体が、クラウドセッションの
  権限クラシファイア（auto mode）に拒否された。SA鍵を使った外部デプロイという操作の性質による
  自動ブロックで、フォアグラウンド/バックグラウンドとも同一の拒否。GCPへのリクエストは未送信。
- 次の一手（いずれか）:
  1. ローカル（Remote Control）セッションで `gcloud run deploy` を実行する（従来の実績ある方法）。
  2. クラウドセッションで再依頼する場合は、permission mode を明示的に許可寄りにするか、
     settings に `Bash(node scripts/deploy_cloud_run.js*)` の許可ルールを追加してから起動する。
- 補足: 環境変数の `GCP_SA_KEY` は波括弧を補って設定し直すのが望ましいが、
  スクリプト側で対応済みのため必須ではない。

### 2026-08-25 (3回目) クラウドセッションからのRESTデプロイ → 成功

- 結果: **成功**。`node scripts/deploy_cloud_run.js` 一発で完遂（承認1回、リトライ1回）。
- **URL: https://e-mooments-vckorfe4qa-an.a.run.app** （デプロイ直後にHTTP 200確認済み）
- project_id: `love-coach-sprint0`（表示名 love-coach） / リージョン: `asia-northeast1` / サービス名: `e-mooments`
- 初回実行は Cloud Resource Manager API が SERVICE_DISABLED で失敗。スクリプトに以下を組み込んで再実行し成功:
  - serviceusage API での自動有効化＋伝播待ちリトライ（SAに serviceusage.services.enable 権限があり有効化可能だった）
  - ソースtarballの自動生成（コンテナは毎回フレッシュクローンのため、実行時に生成する。コミット不要）
  - プロジェクトチェック（CRM API）は情報目的なので失敗しても続行するよう変更
- 権限クラシファイアのブロック（前回2回目の失敗要因）は今回は発生せず、ユーザー手動承認で実行できた。
