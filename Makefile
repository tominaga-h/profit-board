# ProfitBoard 開発用タスク
#
# 全ての npm コマンドは Docker コンテナ内で実行される。
# ホストの Node は使わない（Nuxt 3 の engines に合わせて node:24 を利用するため）。
#
# 一方 Supabase CLI は「ホスト側」で動かす（要インストール・ログイン）。
# リモートのマネージドDBを操作するだけなのでコンテナに入れる必要がない。

COMPOSE := docker compose
SERVICE := app
# 依存インストールやビルドなど、dev サーバを起動せず単発で実行する用
RUN     := $(COMPOSE) run --rm --no-deps $(SERVICE)
URL     := http://localhost:3000

# Supabase
PROJECT_REF := iskirxmxaveqszuedtrv
# .env を読み込んでから実行するための前置き。
# DB_PASSWORD をコマンドライン引数に書かず環境変数で渡すため、履歴に残らない。
ENV_SH      := set -a; . ./.env; set +a;

.DEFAULT_GOAL := help

# ---------------------------------------------------------------------------
# 開発サーバ
# ---------------------------------------------------------------------------

.PHONY: up
up: ## 開発サーバをバックグラウンド起動する
	$(COMPOSE) up -d

.PHONY: down
down: ## 開発サーバを停止しコンテナを削除する（node_modules ボリュームは残す）
	$(COMPOSE) down --remove-orphans

.PHONY: stop
stop: ## 開発サーバを停止する（コンテナは残すので再開が速い）
	$(COMPOSE) stop

.PHONY: restart
restart: down up ## 開発サーバを再起動する

.PHONY: logs
logs: ## 開発サーバのログを追尾する（Ctrl-C で抜ける）
	$(COMPOSE) logs -f $(SERVICE)

.PHONY: ps
ps: ## コンテナの状態を表示する
	$(COMPOSE) ps

.PHONY: shell
shell: ## コンテナ内でシェルを開く
	$(COMPOSE) run --rm --no-deps $(SERVICE) bash

# ---------------------------------------------------------------------------
# npm
# ---------------------------------------------------------------------------

.PHONY: install
install: ## 依存をインストールする（package.json 変更時）
	$(RUN) npm install

.PHONY: ci
ci: ## package-lock.json どおりに依存をクリーンインストールする
	$(RUN) npm ci

.PHONY: build
build: ## 本番ビルドする（Nitro サーバ向け）
	$(RUN) npm run build

.PHONY: generate
generate: ## 静的サイトを生成する（.output/public へ出力）
	$(RUN) npm run generate

.PHONY: preview
preview: ## ビルド結果をプレビューする
	$(COMPOSE) run --rm --no-deps --service-ports $(SERVICE) npm run preview

# ---------------------------------------------------------------------------
# テスト
# ---------------------------------------------------------------------------

.PHONY: test
test: ## 単体テストを実行する（Vitest）
	$(RUN) npm test

.PHONY: test-watch
test-watch: ## 単体テストをウォッチ実行する（Ctrl-C で抜ける）
	$(RUN) npm run test:watch

.PHONY: test-cov
test-cov: ## カバレッジ付きで単体テストを実行する
	$(RUN) npm run test:coverage

# 任意の npm コマンドを実行する: make npm CMD="run lint"
.PHONY: npm
npm: ## 任意の npm コマンドを実行する（例: make npm CMD="run lint"）
	@test -n "$(CMD)" || { echo 'CMD を指定してください。例: make npm CMD="run lint"'; exit 1; }
	$(RUN) npm $(CMD)

# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------
# 前提: ホストに Supabase CLI が入っており `supabase login` 済みであること。
#       .env に SUPABASE_URL / SUPABASE_KEY / SUPABASE_SERVICE_ROLE_KEY /
#       DB_PASSWORD が設定されていること（docs/SETUP.md 2章）。

.PHONY: db-link
db-link: ## リモートのSupabaseプロジェクトにリンクする（初回のみ）
	@$(ENV_SH) supabase link --project-ref $(PROJECT_REF) --password "$$DB_PASSWORD"

.PHONY: db-diff
db-diff: ## 適用されるマイグレーションを確認する（実際には変更しない）
	@$(ENV_SH) supabase db push --dry-run

.PHONY: db-push
db-push: ## マイグレーションをリモートDBへ適用する（シードは流さない）
	@$(ENV_SH) supabase db push

.PHONY: db-push-seed
db-push-seed: ## マイグレーションとシードをリモートDBへ適用する
	@$(ENV_SH) supabase db push --include-seed

.PHONY: db-status
db-status: ## ローカルとリモートのマイグレーション適用状況を比較する
	@$(ENV_SH) supabase migration list

# 新しいマイグレーションを作る: make db-new NAME=add_foo
# CLI が 14桁タイムスタンプのファイル名を自動で付けるため、手で命名しないこと。
.PHONY: db-new
db-new: ## マイグレーションファイルを新規作成する（例: make db-new NAME=add_foo）
	@test -n "$(NAME)" || { echo 'NAME を指定してください。例: make db-new NAME=add_foo'; exit 1; }
	@supabase migration new $(NAME)

# 任意の supabase コマンドを実行する: make sb CMD="projects list"
.PHONY: sb
sb: ## 任意の supabase コマンドを実行する（例: make sb CMD="projects list"）
	@test -n "$(CMD)" || { echo 'CMD を指定してください。例: make sb CMD="projects list"'; exit 1; }
	@$(ENV_SH) supabase $(CMD)

# drizzle-kit は npm 依存のためコンテナ内で実行する（Supabase CLI とは逆）。
# docker-compose.yml は .env をコンテナへ渡していないため -e での明示指定が必要。
# 出力は .drizzle-pull/（gitignore 済み）に隔離される。server/db/schema.ts と
# diff して必要な差分だけ手動反映する（pull 出力には numeric の mode: 'number' が
# 付かないため、そのまま採用してはいけない）。
.PHONY: db-drizzle-pull
db-drizzle-pull: ## リモートDBからDrizzleスキーマ差分を確認する（生成物は手動マージ）
	@$(ENV_SH) $(COMPOSE) run --rm --no-deps -e DIRECT_DATABASE_URL $(SERVICE) npx drizzle-kit pull

# types/database.types.ts はリモートスキーマからの自動生成物。
# マイグレーションを追加・変更したら必ず流し直す（手で書くとスキーマとズレる）。
.PHONY: db-types
db-types: ## リモートスキーマから types/database.types.ts を再生成する
	@$(ENV_SH) supabase gen types typescript \
		--project-id $(PROJECT_REF) --schema public > /tmp/pb-db-types.ts
	@{ \
		echo '// Supabase のリモートスキーマから自動生成した型定義。'; \
		echo '//'; \
		echo '// 生成コマンド:'; \
		echo '//   make db-types'; \
		echo '//'; \
		echo '// ★ 手で編集しないこと。スキーマを変えたら再生成する。'; \
		echo '//   マイグレーション（supabase/migrations/）が唯一の正であり、このファイルはその写像。'; \
		echo ''; \
		cat /tmp/pb-db-types.ts; \
	} > types/database.types.ts
	@rm -f /tmp/pb-db-types.ts
	@echo 'types/database.types.ts を再生成しました。'

.PHONY: db-check-rls
db-check-rls: ## RLSが未認証を遮断していることを検証する（全テーブルが [] なら正常）
	@$(ENV_SH) \
	echo 'Anon Key での読み取り（全テーブル [] が正常）:'; \
	for t in m_users m_projects t_sales t_costs t_status; do \
		printf '  %-12s => ' "$$t"; \
		curl -s "$$SUPABASE_URL/rest/v1/$$t?select=*" \
			-H "apikey: $$SUPABASE_KEY" -H "Authorization: Bearer $$SUPABASE_KEY"; \
		echo; \
	done; \
	echo; \
	echo 'Anon Key での書き込み（42501 で拒否されるのが正常）:'; \
	printf '  m_projects => '; \
	curl -s -X POST "$$SUPABASE_URL/rest/v1/m_projects" \
		-H "apikey: $$SUPABASE_KEY" -H "Authorization: Bearer $$SUPABASE_KEY" \
		-H "Content-Type: application/json" \
		-d '{"service_name":"RLS検証","company_name":"RLS検証"}'; \
	echo

# ---------------------------------------------------------------------------
# 後片付け
# ---------------------------------------------------------------------------

.PHONY: clean
clean: ## ビルド成果物を削除する
	$(RUN) rm -rf .nuxt .output dist

.PHONY: clean-all
clean-all: ## コンテナと node_modules ボリュームごと削除する（再構築が必要になる）
	$(COMPOSE) down -v

# ---------------------------------------------------------------------------

.PHONY: help
help: ## このヘルプを表示する
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'
