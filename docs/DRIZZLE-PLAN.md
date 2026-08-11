# Drizzle 導入実装プラン

profit-board の DB 操作を Supabase PostgREST 直叩きから、Nitro API ルート + Drizzle ORM によるサーバサイド実行へ全面移行するための実装プランである。事前調査は `drizzle-investigation.html` を参照のこと。

> **調査レポートとの関係:** 調査レポートは「段階導入（プロトタイプ1本で費用対効果を測る）」を推奨していたが、その後の検討で**全面移行**が決定された。本プランはその決定を前提に、移行を安全に進めるためのタスク順序と設計を定める。

---

## 1. 目的と確定方針

### 1.1 確定方針（4点）

| # | 方針 | 内容 |
| --- | --- | --- |
| 1 | 全面移行 | 全 composable の DB I/O を `server/api/` の Nitro ルート経由に変え、そこで Drizzle を使う。クライアントからの PostgREST 直叩きは全廃する |
| 2 | zod スキーマ維持 | `lib/schemas/` は現状のまま維持する。加えてサーバ側のリクエストボディ検証にも再利用する |
| 3 | 認可はサーバ側 | API ルートで JWT 検証 + `m_users` 照合（RLS 関数 `is_app_user()` と同等判定）を行う。DB 接続は RLS を通らない専用接続。既存 RLS ポリシーは PostgREST 防御として残置する |
| 4 | マイグレーションのオーナー不変 | スキーマ変更の唯一の正は `supabase/migrations/*.sql`（Supabase CLI）のまま。Supabase Auth（Google OAuth）も継続使用する |

### 1.2 移行で解消される既知の問題

| 問題 | 現状 | 移行後 |
| --- | --- | --- |
| 部分適用リスク | `savePerformance()` は DELETE→UPDATE→INSERT→upsert の最大 N+4 往復。途中失敗で中途半端な状態になる（コード内コメントで自認済み） | `db.transaction()` で全ロールバック |
| email UNIQUE の順序回避 | `saveMembers()` は「削除を先にしないと一時的に UNIQUE 衝突する」を実行順序だけで回避。途中失敗で削除だけ通る | 同一トランザクション内で実行。途中失敗しても巻き戻る |
| 削除ガードの TOCTOU | 「count で実績有無を確認 → 後で DELETE」の二段構えの間に他ユーザーが実績を入れると FK 違反 | トランザクション内 FK 違反 → 409 が最終防衛。事前 count は UX 用に縮退 |
| 全明細行のブラウザ転送 | dashboard / 年度別 / 月別集計が全行をクライアントへ転送し JS で GROUP BY | SQL 側で GROUP BY し集計済み行だけ返す |
| 手動 JOIN | `t_costs` × `m_users` を `Map` で手動結合 | SQL の JOIN で表現可能になる |

---

## 2. アーキテクチャ全体像

### 2.1 Before / After

```
[Before]
  composable ── useSupabaseClient() ──> PostgREST (RLS) ──> Postgres

[After]
  composable（公開IF不変）
      │ $fetch('/api/**')          ← cookie (sb-<ref>-auth-token) が自動送信される
      ▼
  Nitro API ルート (server/api/**)
      │ requireAppUser(event)      ← JWT検証 + m_users 照合（is_app_user() と同等）
      ▼
  Drizzle (postgres-js) ──> Supavisor (transaction mode :6543) ──> Postgres
```

- Supabase Auth（Google OAuth、cookie セッション）はそのまま。`@nuxtjs/supabase` は **Auth 専用**に縮退する。
- RLS ポリシーと `make db-check-rls` は残す。anon key が漏れて PostgREST を直叩きされた場合の防御層として引き続き機能する。

### 2.2 セッション伝搬が成立する根拠（検証済み）

`ssr: false` の SPA でも `#supabase/server`（`serverSupabaseUser` 等）がそのまま使える。

1. `@nuxtjs/supabase` v2 のデフォルトは `useSsrCookies: true`（本プロジェクトは上書きしていない）
2. このときブラウザ側クライアントは `@supabase/ssr` の `createBrowserClient` で生成され、セッションは localStorage ではなく **cookie**（`sb-<ref>-auth-token`、長い場合は `.0`/`.1` にチャンク分割）に保存される
3. `$fetch('/api/...')` は同一オリジンなので cookie が自動送信され、サーバ側の `createServerClient` が `Cookie` ヘッダからセッションを復元する

> **`useSsrCookies` を `false` にしてはいけない。** セッションが localStorage に移り、全 API ルートが 401 になる。`nuxt.config.ts` にこの旨のコメントを残すこと。

---

## 3. DB 接続構成（server/utils/db.ts）

### 3.1 ドライバと接続先

| 項目 | 値 | Why not（別案を採らない理由） |
| --- | --- | --- |
| ドライバ | `postgres`（postgres-js）+ `drizzle-orm/postgres-js` | node-postgres より軽量で Drizzle 公式の第一推奨 |
| 接続先 | Supavisor **transaction mode（port 6543）** | Vercel サーバレスは関数インスタンスが並列に立ち上がり direct 接続（5432）では接続数を食い潰す |
| `prepare` | `false` **必須** | transaction mode は prepared statement を使えない。忘れると初回クエリから失敗する |
| `max` | `1` | プーリングは Supavisor に任せる。関数インスタンスごとに 1 接続で十分 |
| `idle_timeout` / `connect_timeout` | 明示する（例: 20 / 10 秒） | サーバレスでの接続リーク防止 |

### 3.2 環境変数

| 変数 | 用途 | 置き場所 |
| --- | --- | --- |
| `NUXT_DATABASE_URL` | ランタイム用接続文字列（pooler :6543） | `.env` / Vercel。`runtimeConfig.databaseUrl` としてサーバ専用に保持する |
| `DIRECT_DATABASE_URL` | drizzle-kit pull 用（session mode :5432） | `.env` のみ。ツール実行時だけ使う |

> **`NUXT_DATABASE_URL` を `runtimeConfig.public` に置いてはいけない。** DB パスワードを含む接続文字列がクライアントバンドルに露出する。anon key と違い、これは公開不可の秘密情報である。

### 3.3 シングルトン管理

```ts
// server/utils/db.ts
export const useDb = (): PostgresJsDatabase<typeof schema> => { /* lazy にモジュールスコープで1回だけ生成 */ }
```

- Nitro の `server/utils/` は auto-import されるため、各ルートから `useDb()` を直接呼べる。

### 3.4 RLS との関係

`postgres` ロールはテーブルオーナーであり、`FORCE ROW LEVEL SECURITY` を使っていないため **RLS はオーナーには適用されない**。「RLS を通らない専用接続」は追加設定なしで成立する。防御はサーバ側の `requireAppUser()`（5章）が担う。

---

## 4. Drizzle スキーマ管理と型戦略

### 4.1 drizzle.config.ts

```ts
export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db',
  dbCredentials: { url: process.env.DIRECT_DATABASE_URL! },
  schemaFilter: ['public'],
})
```

### 4.2 スキーマ生成の運用ルール

1. **初回だけ** `drizzle-kit pull` で `server/db/schema.ts` を生成する
2. 生成直後に numeric 列を手修正する（4.3）
3. **以後は手メンテ**。`pull` はスキーマ変更時の差分検証（drift 検知）にのみ使う

> **`drizzle-kit generate` / `push` / `migrate` は絶対に使わないこと。** マイグレーションのオーナーは `supabase/migrations` である。2系統からスキーマ変更が走ると、どちらの SQL が正か分からなくなる。

スキーマ変更時のフロー:

```bash
make db-new NAME=add_foo   # マイグレーション作成
# SQL を記述
make db-push               # リモートへ適用
make db-types              # database.types.ts 再生成（残存期間中のみ。T9 で退役判断）
make db-drizzle-pull       # pull の差分を見て server/db/schema.ts を手動追随
```

### 4.3 numeric 型の罠（最重要の落とし穴）

`amount` / `unit_price` は `NUMERIC(12,0)`、`work_hours` は `NUMERIC(6,2)` である。PostgREST はこれらを `number` で返していたが、**postgres-js + drizzle-kit pull のデフォルトでは numeric は `string` になる**。そのまま使うと `lib/calc.ts` / `lib/dashboard.ts` の計算と API 型が全て壊れる。

```ts
// server/db/schema.ts — pull 生成後に必ず手修正する
amount: numeric('amount', { precision: 12, scale: 0, mode: 'number' }),
workHours: numeric('work_hours', { precision: 6, scale: 2, mode: 'number' }),
```

> **pull を再実行すると `mode: 'number'` が消える。** これが「pull は差分検証専用、スキーマは手メンテ」とする最大の理由である。

### 4.4 型戦略

- API レスポンス DTO は `InferSelectModel<typeof mUsers>` 等から導出する。`$fetch` はルートハンドラの戻り型を推論するため、クライアント側の型定義追加は最小で済む
- `timestamptz` は JSON 経由で ISO 文字列になるため、既存クライアント型（`created_at: string`）と互換
- `types/database.types.ts` は移行完了までクライアント側の参照が残る。全参照が消えた時点で削除候補（T9）

### 4.5 追加依存

| パッケージ | 区分 |
| --- | --- |
| `drizzle-orm`, `postgres` | dependencies |
| `drizzle-kit` | devDependencies |

### 4.6 Makefile 追加ターゲット

```makefile
db-drizzle-pull: ## リモートDBからDrizzleスキーマ差分を確認する（生成物は手動マージ）
	@$(ENV_SH) $(COMPOSE) run --rm --no-deps -e DIRECT_DATABASE_URL $(SERVICE) npx drizzle-kit pull
```

> `docker-compose.yml` はコンテナへ `.env` を渡していないため、`-e` での明示指定が必要。

---

## 5. 認証・認可のサーバ実装（server/utils/auth.ts）

### 5.1 requireAppUser

```ts
export const requireAppUser = async (event: H3Event): Promise<AppUser> => {
  // 1) serverSupabaseUser(event) を try/catch。失敗・email クレームなしは 401
  // 2) トップレベル email クレームで m_users を照合（is_app_user() と同一判定）
  // 3) 未登録は 403。登録済みなら m_users 行を返す
}
```

- 全 `/api/**` ルートの先頭で必ず呼ぶ
- 結果を `event.context.appUser` にキャッシュし、同一リクエスト内の二重照合を避ける
- `serverSupabaseUser` は内部でエラー時に statusCode 未指定の `createError`（=500）を投げるため、try/catch で 401 に丸める

> **`user_metadata.email` を使ってはいけない。** `updateUser()` でユーザー自身が改竄できる。トップレベル `email` クレームを使う理由は RLS の `is_app_user()` および `useAppUser` と同一である。

### 5.2 updated_by のサーバ導出（セキュリティ改善）

現状 `t_status.updated_by` はクライアントから渡る引数で、改竄可能である。移行後は **`requireAppUser` の結果（`family_name` + `first_name`）からサーバ側で導出**し、クライアントからは受け取らない。

### 5.3 useAppUser の置換

`useAppUser.resolve()` の `m_users` 直叩きは `GET /api/me` へ置き換える。fail-closed（エラー時 UNREGISTERED 扱い）の挙動は維持する。

---

## 6. API ルート設計

### 6.1 エンドポイント一覧

composable の公開インターフェースを変えない粒度で「1画面操作 = 1エンドポイント」とする。

| Method | Path | Req → Res | 置換対象 |
| --- | --- | --- | --- |
| GET | `/api/me` | → `AppUser`（未登録 403） | `useAppUser.resolve` |
| GET | `/api/members` | → `Member[]`（id 昇順） | `useMembers.fetchMembers` |
| PUT | `/api/members` | `{ drafts, deletedIds }` → `{ ok }` | `useMembers.saveMembers`（Tx化） |
| GET | `/api/members/:id/has-costs` | → `{ hasRecords }` | `useMembers.hasCostRecords` |
| GET | `/api/projects` | → `Project[]` | `useProjects.fetchProjects` |
| PUT | `/api/projects` | `{ drafts, deletedIds }` → `{ ok }` | `useProjects.saveProjects`（Tx化） |
| GET | `/api/projects/:id/has-performance` | → `{ hasRecords }`（EXISTS 3表を1SQL） | `useProjects.hasPerformanceRecords` |
| GET | `/api/projects/:id/years` | → `ProjectYearSummary[]` | `useProjectYears.fetchYears` |
| GET | `/api/projects/:id/months?fiscalYear=` | → `ProjectMonthSummary[]` | `useProjectMonths`（`[month].vue` の隣月判定もこの結果を再利用） |
| GET | `/api/fiscal-years` | → `FiscalYear[]` | `useFiscalYears` |
| POST | `/api/fiscal-years` | `{ year }` → `{ ok }`（重複 409） | `useProjectYears.addYear` |
| GET | `/api/performance?fiscalYear=&month=&projectId=` | → `{ sales, costs, status }` | `usePerformance.fetchPerformance` |
| PUT | `/api/performance` | フォーム全状態 + scope → `{ ok }` | `usePerformance.savePerformance`（Tx化） |
| GET | `/api/dashboard?fiscalYear=` | → `DashboardData` | `useDashboard.fetchDashboard` |

### 6.2 エラー契約

Postgres エラーコードを構造化して返し、既存 composable の日本語メッセージ分岐を維持する。

```ts
// サーバ側
throw createError({ statusCode: 409, data: { pgCode: '23505' } })

// クライアント側（既存の error.code === '23505' 分岐を置換）
if (error.data?.pgCode === '23505') { /* 既存の日本語メッセージ */ }
```

| Postgres コード | HTTP | 既存の分岐箇所 |
| --- | --- | --- |
| `23505`（UNIQUE 違反） | 409 | email 重複、年度重複 |
| `23503`（FK 違反） | 409 | 実績が存在するメンバー/プロジェクトの削除 |
| 認証なし | 401 | （新設） |
| 未登録ユーザー | 403 | （新設） |
| zod 検証失敗 | 400 | （新設。フォーム側 safeParse が第一防衛のため通常到達しない） |

### 6.3 composable 側の変更方針

`useSupabaseClient()` 呼び出しを `$fetch` に差し替えるだけとし、**戻り値契約（`form` / `status` / `errorMessage` / FetchStatus 遷移）は不変**にする。これによりページ・コンポーネント層は無変更で済む。

---

## 7. トランザクション設計

### 7.1 savePerformance（最重要）

- クライアントは「望ましい最終状態」（sales 行・costs 行・managementAmount・remark）を送る
- サーバがトランザクション内で現在行を SELECT し、**差分計算 → DELETE → UPDATE → INSERT → `t_status` を `onConflictDoUpdate`**（`target: [fiscalYear, month, projectId]`）
- サーバ側で差分計算する理由: クライアント snapshot 起点の差分より TOCTOU 窓が狭く、「触った行だけ UPDATE して `updated_at` を無駄に動かさない」現行方針も維持できる
- 差分計算ロジックは `server/utils/performanceDiff.ts` 等の**純関数に切り出し、Vitest の対象にする**（実装より先にテストを書く）

### 7.2 saveMembers

- DELETE → UPDATE → INSERT の順序は**トランザクション内でも維持する**。email の付け替えは同一 Tx 内でも UNIQUE 制約に即時評価される（deferrable 制約ではない）ため、順序依存自体は消えない
- 変わるのは失敗時の挙動: 途中失敗で「削除だけ通る」ことがなくなり、全ロールバックされる
- 23505 / 23503 はロールバック後に 409 へマップ

> **UPDATE は現行どおり「1行 = 1文」のループを維持し、複数行を1つの UPDATE 文にまとめないこと。** UNIQUE 制約は文単位で評価されるため、バルク UPDATE 化すると文の実行途中で一時的な email 重複が発生し得る（1行1文なら発生しない）。

既知の制約: 既存メンバー同士の email 入れ替え（A⇄B の交換）は1行1文でも失敗する。これは現行実装にも存在する制約で、移行によって悪化はしない。本質的に解消するなら `UNIQUE ... DEFERRABLE INITIALLY DEFERRED` への制約再作成（Supabase CLI マイグレーション）が正攻法だが、現時点で要件がないため対応しない。

### 7.3 saveProjects

- saveMembers と同構造。「`m_projects` に UNIQUE がないので順序に必然性はない、useMembers と揃えただけ」という既存コメントの知見はサーバ側コードに移植する

### 7.4 既存コメントの更新

「部分適用になるので失敗時は必ず再取得」系のコメントは「Tx なので全ロールバックされる。失敗時の再取得は画面表示の更新として維持」に書き換える。

---

## 8. JOIN / 集計の SQL 化

### 8.1 方針: SQL で GROUP BY、畳み込みは既存純関数を再利用

`lib/dashboard.ts` の `buildDashboardData` は「行の amount を合計する」純関数であり、**SQL 側で GROUP BY 済みの行（sum 済み）を入力しても結果は変わらない**（和の和は和）。よって:

| 対象 | SQL 側 | 再利用する既存コード |
| --- | --- | --- |
| dashboard | `SELECT fiscal_year, month, project_id, SUM(amount) ... GROUP BY` を t_sales / t_costs × 2年度分 | `buildDashboardData` とそのテストを無変更でサーバから import |
| 年度別（years） | `GROUP BY fiscal_year` + 実績有無 | `groupByYear` 相当を縮退 |
| 月別（months） | `GROUP BY month` | `groupByMonth` 相当を縮退 |
| 削除ガード | 3本の count を `EXISTS` ×3 の 1 クエリへ | — |

> **トレードオフ:** 「JS 集計をそのままサーバへ持ち込む」案（転送量削減のみ、ロジックリスクゼロ）と「完全 SQL 化」案がある。本プランは折衷（GROUP BY + 純関数再利用）を採る。既存テスト資産を活かしつつ転送・メモリも最小化できるためである。

### 8.2 buildCostDrafts の手動 JOIN

`t_costs` × `m_users` の Map 結合は、members 一覧をクライアントが既に保持しているため初期移行では現行ロジックを維持する。必要になったら `LEFT JOIN m_users` で JOIN 済みレスポンスを返す選択肢を残す。

---

## 9. zod スキーマの再利用

`lib/schemas/*` は zod と `rowErrors.ts` にしか依存せず Nuxt ランタイム非依存のため、サーバから import できる（`~` エイリアスは Nitro でも解決される）。

リクエストスキーマは既存行スキーマの合成として新設する:

```ts
// lib/schemas/api.ts（クライアント・サーバ共有）
export const membersSavePayloadSchema = z.object({
  drafts: z.array(memberRowSchema.extend({ id: z.number().int().positive().nullable() })),
  deletedIds: z.array(z.number().int().positive()),
})
```

ルート側は h3 標準の `readValidatedBody(event, schema.safeParse)` を使う（失敗時は自動で 400）。フォーム側の safeParse の使い方は一切変えない。

GET のクエリパラメータ（`fiscalYear` / `month` / `projectId` 等）も `getValidatedQuery(event, schema.safeParse)` で検証する。期間絞り込みの必須化を型と実行時の両方で強制し、絞り込みなしの全件集計がサーバレス関数のタイムアウトを踏む事態を防ぐ。

---

## 10. デプロイ上の重大な注意

> **`make generate`（静的サイト生成）は本移行後に使用禁止となる。** `nuxt generate` は静的出力のみで Nitro API ルートが一切含まれない。デプロイすると全 API が 404 になる。

- `nuxt build` + Vercel preset（`VERCEL` 環境で自動選択）へ一本化する。`ssr: false` のまま build しても「SPA シェルの静的配信 + serverless API」の `.output` になる
- Makefile の `generate` ターゲットは削除する（または「build を使え」と表示して exit 1 するガードに変える）
- Vercel 環境変数: 既存の `SUPABASE_URL` / `SUPABASE_KEY` に **`NUXT_DATABASE_URL` を追加**。`SUPABASE_SERVICE_ROLE_KEY` は引き続き設定しない
- `docs/SETUP.md` 8章（Vercel デプロイ、現在 TODO）を本章の内容で執筆する

---

## 11. 実装タスク分割

全面移行だが、一括ビッグバンではなくリソース単位で安全に進める。各タスクは「`make test` 通過（`typeCheck: true` により型検査込み）+ 画面手動確認」を完了条件とする。

| Task | 内容 | 検証方法 |
| --- | --- | --- |
| T1 | **インフラ**: 事前確認として Supabase の JWT Signing Keys（非対称鍵）への切替状態を確認し、未切替なら切り替える（レガシー HS256 のままだと全 API に Auth サーバ照会のレイテンシが乗る）。依存追加、`server/utils/db.ts`、`drizzle.config.ts`、初回 pull + numeric 手修正、`server/utils/auth.ts`、`GET /api/me` | `/api/me` が 200 / 401 / 403 を返す。`make test` 無影響 |
| T2 | **パイロット（fiscal-years）**: GET/POST + `useFiscalYears` / `useProjectYears.addYear` 差し替え。23505→409 契約の確立 | 年度追加の手動確認。重複追加で既存の日本語メッセージが出る |
| T3 | **members**（Tx 初適用 + has-costs） | email 付け替えシナリオ、FK 違反シナリオ |
| T4 | **projects**（Tx + EXISTS 削除ガード） | T3 と同様 |
| T5 | **performance**（最重要 Tx。差分純関数のユニットテストを先に書く） | `make test`（diff 関数）、保存→再取得の一致、途中失敗でロールバック確認 |
| T6 | **集計 3 本**（dashboard / years / months） | 移行前後で同一データに対する表示値が一致すること（`buildDashboardData` 再利用でテストも継続） |
| T7 | **useAppUser / middleware**: resolve を `/api/me` へ | ログイン / 未登録 / ログアウトの遷移確認 |
| T8 | **PostgREST 依存除去**: `useSupabaseClient` の DB 用途を grep でゼロ確認（Auth 用途のみ残す） | `grep -r "\.from(" composables/ pages/` が 0 件。`make db-check-rls` で RLS 残置確認 |
| T9 | **クリーンアップ**: `database.types.ts` 退役判断、Makefile 整理（`generate` 削除・`db-drizzle-pull` 追加）、SETUP.md 8章執筆、`.env.example` 更新 | `make build` 成功、ドキュメントレビュー |

---

## 12. リスクと対処

| リスク | 対処 |
| --- | --- |
| numeric → string 問題（4.3） | pull 生成物は手メンテ運用。`mode: 'number'` の消失は `db-drizzle-pull` の差分レビューで検知 |
| 型の二重管理（`database.types.ts` vs `schema.ts`） | 「唯一の正は `supabase/migrations`、両者はその写像」と位置づける。T9 で `database.types.ts` を退役判断 |
| スキーマ更新漏れ（pull 手動マージの形骸化） | `drizzle-kit check` は generate 系ワークフロー専用で pull 運用には使えず、`mode: 'number'` の手修正がある以上 pull 出力との機械 diff は常に差分が出るため CI の単純 diff も組めない。対処はプロセス側: スキーマ変更フロー（4.2）を手順として固定し、`typeCheck: true` のビルド型検査を「`schema.ts` の更新漏れが API 型の不整合として検出される」防衛線と位置づける |
| `useSsrCookies` 依存 | `false` にすると全 API が 401。`nuxt.config.ts` にコメントで固定を明記 |
| `getClaims` のネットワークコスト | レガシー HS256 だと毎リクエスト Auth サーバ照会になる。T1 の事前タスクとして JWT Signing Keys（非対称鍵）へ切り替える（JWKS ローカル検証になり往復が消える） |
| Supavisor 接続枯渇 | `max: 1` + transaction mode。`prepare: false` を忘れると初回から失敗する |
| ローカル開発の疎通 | dev コンテナからリモート Supavisor への接続が前提。`docker-compose.yml` に環境変数の受け渡し追記が必要 |
| テスト戦略 | 差分計算・集計を純関数化して Vitest 継続。ルートハンドラは薄く保つ。将来は `@nuxt/test-utils` の Nitro テスト導入余地あり |

---

## 13. 付録

### 13.1 環境変数（新旧対照）

| 変数 | 現状 | 移行後 |
| --- | --- | --- |
| `SUPABASE_URL` | 使用中 | 継続（Auth 用） |
| `SUPABASE_KEY` | 使用中（anon） | 継続（Auth 用） |
| `SUPABASE_SERVICE_ROLE_KEY` | ローカル管理作業のみ | 変更なし（Vercel には置かない） |
| `DB_PASSWORD` | Supabase CLI 用 | 継続 |
| `NUXT_DATABASE_URL` | — | **新設**（ランタイム、pooler :6543。Vercel にも設定） |
| `DIRECT_DATABASE_URL` | — | **新設**（drizzle-kit 用、:5432。ローカルのみ） |

### 13.2 コマンドチートシート（移行後）

```bash
make db-new NAME=add_foo   # マイグレーション作成（オーナーは Supabase CLI のまま）
make db-push               # リモート適用
make db-drizzle-pull       # Drizzle スキーマの drift 確認（生成物は手動マージ）
make build                 # 本番ビルド（generate は廃止）
make db-check-rls          # RLS 残置の検証（継続）
```

### 13.3 新設ファイル一覧

| パス | 役割 |
| --- | --- |
| `drizzle.config.ts` | drizzle-kit 設定（pull 専用） |
| `server/db/schema.ts` | Drizzle スキーマ（初回 pull → 以後手メンテ） |
| `server/utils/db.ts` | postgres-js + Drizzle のシングルトン |
| `server/utils/auth.ts` | `requireAppUser`（JWT + m_users 照合） |
| `server/utils/performanceDiff.ts` | savePerformance の差分計算（純関数・テスト対象） |
| `server/api/**` | 6.1 のエンドポイント群 |
| `lib/schemas/api.ts` | リクエストボディ用 zod スキーマ（既存行スキーマの合成） |
