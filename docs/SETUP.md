# ProfitBoard セットアップ手順

このドキュメントは、ProfitBoard の開発環境を新規に構築するための手順書である。

> 補足: Google OAuth の設定（7章）は Task 3、Vercel へのデプロイ（8章）は Task 16 で追記する。

---

## 1. 前提

| 必要なもの | 用途 | 備考 |
| --- | --- | --- |
| Docker | 開発サーバの実行環境 | Node.js はコンテナ内で動くのでホストへのインストールは不要 |
| make | 開発コマンドの入口 | `make help` で一覧を表示 |
| Supabase CLI | マイグレーションの適用 | v2.78.1 で動作確認済み |
| Supabase プロジェクト | DB / 認証 | project ref: `iskirxmxaveqszuedtrv` |

Supabase CLI へのログインが済んでいることを確認する。

```bash
make sb CMD="projects list"
```

---

## 2. 環境変数

`.env.example` をコピーして `.env` を作り、値を埋める。

```bash
cp .env.example .env
```

各変数の入手先は Supabase ダッシュボードの以下の場所。

| 変数 | 用途 | 入手場所 |
| --- | --- | --- |
| `SUPABASE_URL` | クライアントからの接続先 | Settings > API > Project URL |
| `SUPABASE_KEY` | Anon Key。公開前提で、RLS により保護される | Settings > API > anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | 管理操作用。**RLS を迂回する** | Settings > API > service_role |
| `DB_PASSWORD` | CLI から DB へ接続する際のパスワード | Settings > Database |

> **`SUPABASE_SERVICE_ROLE_KEY` の取り扱い**
> このキーは RLS を完全にバイパスする。クライアント（ブラウザ）に渡してはならず、
> Vercel の環境変数にも設定しない。ローカルでの検証・管理作業にのみ使う。

`.env` は `.gitignore` 済みでコミットされない。`.env.example` のみがリポジトリに含まれる。

---

## 3. データベースのセットアップ

### 3.1 マイグレーションファイルの構成

```
supabase/
  config.toml                                # supabase init が生成
  migrations/
    20260809120000_init_schema.sql           # 5テーブル + updated_at トリガ + インデックス
    20260809120100_rls_policies.sql          # is_app_user() + RLS 有効化 + ポリシー20本
  seed.sql                                   # 初期管理者1名
```

**ファイル名は `<14桁タイムスタンプ>_<名前>.sql` である必要がある。** Supabase CLI はこの
プレフィックスをマイグレーションの `version` として扱い、適用済みかどうかを判定する。
`0001_schema.sql` のような連番形式は認識されない。新しいマイグレーションを追加するときは
`supabase migration new <名前>` を使えば命名は自動で正しくなる。

### 3.2 適用手順

Makefile に用意したコマンドを使う。いずれも内部で `.env` を読み込むため、
パスワードをコマンドラインに書く必要はない（履歴にも残らない）。

```bash
make db-link        # リモートプロジェクトへリンク（初回のみ）
make db-diff        # 何が適用されるかを事前確認（実際には変更しない）
make db-push-seed   # マイグレーションとシードを適用
```

> **初回は `make db-push-seed` を使うこと（`make db-push` ではない）。**
> `supabase db push` は既定では `seed.sql` を適用しない（既定で適用されるのは
> ローカルの `supabase db reset` のみ）。シードなしで適用するとテーブルはできるのに
> 管理者が登録されず、Task 3 のログインで全アカウントが弾かれる。原因が分かりにくいので注意。
> 2回目以降のスキーマ変更では、シードを流し直す必要がなければ `make db-push` でよい。

適用結果の確認:

```bash
make db-status      # ローカルとリモートの適用状況を比較
```

### 3.2.1 Supabase 関連の make コマンド

| コマンド | 用途 |
| --- | --- |
| `make db-link` | リモートプロジェクトへリンクする（初回のみ） |
| `make db-diff` | 適用されるマイグレーションを確認する（変更しない） |
| `make db-push` | マイグレーションを適用する（シードなし） |
| `make db-push-seed` | マイグレーションとシードを適用する |
| `make db-status` | ローカルとリモートの適用状況を比較する |
| `make db-new NAME=xxx` | マイグレーションファイルを新規作成する |
| `make db-check-rls` | RLS が未認証を遮断していることを検証する |
| `make sb CMD="..."` | 任意の supabase コマンドを実行する |

新しいマイグレーションを追加するときは `make db-new NAME=add_foo` を使う。
ファイル名の 14桁タイムスタンプが自動で付くため、手で命名して形式を誤る心配がない。

### 3.3 接続がうまくいかない場合

```bash
# プーラーを経由せず直接接続する
set -a; source .env; set +a
supabase link --project-ref iskirxmxaveqszuedtrv --password "$DB_PASSWORD" --skip-pooler

# DNS 解決（IPv6 など）に問題がある場合
make sb CMD="db push --dns-resolver https"
```

それでも接続できない場合は、`supabase/migrations/` の SQL を Supabase ダッシュボードの
SQL Editor に順番に貼り付けて実行してもよい（各ファイルは自己完結している）。その場合は
適用済みとして履歴を合わせる:

```bash
make sb CMD="migration repair --status applied 20260809120000"
make sb CMD="migration repair --status applied 20260809120100"
```

---

## 4. 初期管理者ユーザーの登録（SPEC 7章）

ProfitBoard は「`m_users` に登録されたメールアドレスの Google アカウント」しかログインできない。
そのため**アプリを初めて使う前に、管理者を1名 DB へ直接登録しておく必要がある**。

### 4.1 シードによる自動登録

`supabase/seed.sql` に初期管理者が定義済みで、`supabase db push --include-seed` で登録される。

| 項目 | 値 |
| --- | --- |
| 姓・名 | 冨永 隼人 |
| メールアドレス | `tominaga_h@mad2007.co.jp` |
| 単価 | 60,000 |

このシードは `ON CONFLICT (email) DO NOTHING` で書かれているため、何度実行しても安全で、
アプリの `/members/edit` から編集した内容を上書きすることもない。

### 4.2 別のユーザーを管理者にする場合

Supabase ダッシュボードの SQL Editor で以下を実行する。

```sql
INSERT INTO public.m_users (family_name, first_name, email, unit_price)
VALUES ('姓', '名', 'user@example.com', 60000)
ON CONFLICT (email) DO NOTHING;
```

> **メールアドレスは Google アカウントのものと完全に一致させること。**
> 大文字小文字の違いや別名（エイリアス）では照合されずログインできない。

2人目以降のメンバーは、管理者がログインしたあとアプリの `/members/edit` 画面から
登録できる（Task 6 以降）。

### 4.3 `m_users` に登録がないとどうなるか

- Google 認証自体は通るが、アプリ側でメールを照合して即サインアウトされる（SPEC 3.1）
- 仮にセッションが残っても、RLS により全テーブルが 0 件になり何も表示されない

つまり **`m_users` から行を削除することは、そのユーザーのアクセスを即座に遮断すること**を意味する。

---

## 5. RLS（Row Level Security）の仕組み

SPEC 3.2 の要件「認証済みかつ `m_users` に存在するメールのユーザーのみ許可」を、
DB レベルで強制している。アプリ側の実装ミスがあってもデータは保護される。

### 5.1 構成

- 5テーブルすべてで RLS を有効化
- 各テーブルに SELECT / INSERT / UPDATE / DELETE の4ポリシー（計20本）
- 判定は `public.is_app_user()` に集約

```sql
-- ログイン中ユーザーのメールが m_users に存在するかを返す
SELECT public.is_app_user();
```

### 5.2 なぜヘルパー関数が必要か

「`m_users` に存在するメールのみ許可」というポリシーを `m_users` 自身に直接書くと、
`m_users` の参照がポリシーを起動し、その中の参照がまたポリシーを起動して無限再帰する
（`42P17: infinite recursion detected in policy`）。

`is_app_user()` は `SECURITY DEFINER` で定義してあり関数所有者の権限で実行されるため
RLS を迂回でき、この再帰を断ち切れる。あわせて `SET search_path = ''` を指定して
search_path 汚染による権限昇格を防いでいる。

### 5.3 実装上の注意（変更する場合）

- **メールは必ず JWT のトップレベル `email` クレームから取る。**
  `user_metadata` 内のメールは `updateUser()` でユーザー自身が書き換えられるため、
  認可判断に使うと任意のメールを名乗れる権限昇格の脆弱性になる。
- ポリシーでは `(SELECT public.is_app_user())` のようにサブクエリで包む。
  行ごとの再評価を避けるための Supabase 公式の性能パターン。
- ポリシーには `TO authenticated` を付ける。未認証では評価自体が走らなくなる。

---

## 6. RLS の検証

**未認証（Anon Key）で全テーブルが 0 件になること**を確認する。

```bash
make db-check-rls
```

期待する出力:

```
Anon Key での読み取り（全テーブル [] が正常）:
  m_users      => []
  m_projects   => []
  t_sales      => []
  t_costs      => []
  t_status     => []

Anon Key での書き込み（42501 で拒否されるのが正常）:
  m_projects => {"code":"42501", ... "new row violates row-level security policy ..."}
```

読み取りはエラーではなく**空配列が返るのが正しい**
（RLS 有効かつ該当ポリシーなしは「該当行なし」として表現される）。
管理者を登録済みの `m_users` すら `[]` になることが、RLS が機能している証拠になる。

一方、書き込みは**明示的に 42501 エラーになる**（挿入しようとした行が
WITH CHECK を通らないため）。ここで成功が返るならポリシーに穴がある。

> **検証には必ず `SUPABASE_KEY`（Anon Key）を使うこと。**
> `SUPABASE_SERVICE_ROLE_KEY` は RLS をバイパスするため、これで検証すると
> RLS が壊れていても気づけない。`make db-check-rls` は Anon Key を使う。

---

## 7. Google OAuth の設定

> **TODO: Task 3 で記述する。**
> Supabase Auth の Google プロバイダ設定、Google Cloud のクライアント ID / シークレット、
> リダイレクト URL（localhost と本番の両方）の登録手順を書く。

---

## 8. Vercel へのデプロイ

> **TODO: Task 16 で記述する（SPEC 7章）。**
> GitHub 連携、環境変数（`SUPABASE_URL` / `SUPABASE_KEY`）の設定手順を書く。

---

## 9. ローカル開発サーバの起動

```bash
make install   # 依存インストール（初回のみ）
make up        # 開発サーバ起動 → http://localhost:3000
```

主なコマンドは `make help` で一覧できる。停止は `make down`。

---

## 付録: トラブルシューティング

| 症状 | 原因と対処 |
| --- | --- |
| `db push` が接続エラーになる | プーラー/IPv6 の問題。`--skip-pooler` や `--dns-resolver https` を試す。最終手段は SQL Editor での手動実行（3.3参照） |
| ログインしても全画面が空 | `m_users` に自分のメールが登録されているか確認（4.2参照） |
| `permission denied for function is_app_user` | `authenticated` ロールへの EXECUTE 権限が失われている。`20260809120100_rls_policies.sql` の GRANT 文を再適用する |
| `infinite recursion detected in policy` | `is_app_user()` の `SECURITY DEFINER` が外れている（5.2参照） |
| Anon Key で全データが読める | **重大**。RLS が無効になっている。`make db-check-rls` で再現し、`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` を確認する |
| シードが反映されない | `make db-push`（シードなし）を使っている。`make db-push-seed` を使う（3.2参照） |
| `.env: No such file or directory` | `make db-*` は `.env` を読み込む。`cp .env.example .env` して値を埋める（2章参照） |
