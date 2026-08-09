# ProfitBoard 開発用タスク
#
# 全ての npm コマンドは Docker コンテナ内で実行される。
# ホストの Node は使わない（Nuxt 3 の engines に合わせて node:24 を利用するため）。

COMPOSE := docker compose
SERVICE := app
# 依存インストールやビルドなど、dev サーバを起動せず単発で実行する用
RUN     := $(COMPOSE) run --rm --no-deps $(SERVICE)
URL     := http://localhost:3000

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

# 任意の npm コマンドを実行する: make npm CMD="run lint"
.PHONY: npm
npm: ## 任意の npm コマンドを実行する（例: make npm CMD="run lint"）
	@test -n "$(CMD)" || { echo 'CMD を指定してください。例: make npm CMD="run lint"'; exit 1; }
	$(RUN) npm $(CMD)

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
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
