# profit-board

## AI Instructions

- 勝手にコミットしないこと
- 応答はすべて日本語ですること
- Playwrightで取得したスクリーンショットなどのデータは、必ず `.playwright-mcp` フォルダに保存すること。プロジェクトルートフォルダへの保存は禁止。
- ソースコード内のコメントには **Why not** を書き、コードを見ればわかることは書かないこと。
- 不要に長い冗長コメントはNG。コード内に冗長なコメントを見つけた場合は、適宜修正すること。
- コードのコメントにはプランやタスクのシンボル(「Task 1」や「Spec 4.1」など)を記載しないこと。

## Make Command

- up             開発サーバをバックグラウンド起動する
- down           開発サーバを停止しコンテナを削除する（node_modules ボリュームは残す）
- stop           開発サーバを停止する（コンテナは残すので再開が速い）
- restart        開発サーバを再起動する
- logs           開発サーバのログを追尾する（Ctrl-C で抜ける）
- ps             コンテナの状態を表示する
- shell          コンテナ内でシェルを開く
- install        依存をインストールする（package.json 変更時）
- ci             package-lock.json どおりに依存をクリーンインストールする
- build          本番ビルドする（Nitro サーバ向け）
- generate       静的サイトを生成する（.output/public へ出力）
- preview        ビルド結果をプレビューする
- test           単体テストを実行する（Vitest）
- test-watch     単体テストをウォッチ実行する（Ctrl-C で抜ける）
- test-cov       カバレッジ付きで単体テストを実行する
- npm            任意の npm コマンドを実行する（例: make npm CMD="run lint"）
- db-link        リモートのSupabaseプロジェクトにリンクする（初回のみ）
- db-diff        適用されるマイグレーションを確認する（実際には変更しない）
- db-push        マイグレーションをリモートDBへ適用する（シードは流さない）
- db-push-seed   マイグレーションとシードをリモートDBへ適用する
- db-status      ローカルとリモートのマイグレーション適用状況を比較する
- db-new         マイグレーションファイルを新規作成する（例: make db-new NAME=add_foo）
- sb             任意の supabase コマンドを実行する（例: make sb CMD="projects list"）
- db-types       リモートスキーマから types/database.types.ts を再生成する
- db-check-rls   RLSが未認証を遮断していることを検証する（全テーブルが [] なら正常）
- clean          ビルド成果物を削除する
- clean-all      コンテナと node_modules ボリュームごと削除する（再構築が必要になる）
- help           このヘルプを表示する
