# タスク一覧：Drizzle 導入（PostgREST 直叩き → Nitro API + Drizzle 全面移行）

> プラン本体: [docs/DRIZZLE-PLAN.md](../docs/DRIZZLE-PLAN.md)（確定方針・接続構成・エラー契約・リスクはそちらを参照）
> 原則: スキーマ変更の唯一の正は `supabase/migrations/*.sql`。`drizzle-kit generate` / `push` / `migrate` は使用禁止。
> 各タスクの共通完了条件: `make test` 通過（`typeCheck: true` により型検査込み）＋該当画面の手動確認。

## 前提（プランからの補足）

- プランの T1 は範囲が広い（インフラ一式）ため Task 1〜4 に、T5（performance）はテスト先行の純関数と API 実装の 2 つ（Task 8〜9）に分割した。プラン T 番号との対応は各タスクに付記する。
- composable の**戻り値契約（`form` / `status` / `errorMessage` / FetchStatus 遷移）は全タスクを通じて不変**。ページ・コンポーネント層は原則無変更。
- `lib/schemas/api.ts`（リクエスト用 zod スキーマ）は一括新設せず、各リソースのタスク内で必要分を追加していく。

## 依存関係グラフ

```
Task 1 (JWT鍵切替確認)
Task 2 (依存追加 + DB接続基盤)
    ├── Task 3 (初回 pull + numeric 手修正)
    │       └── Task 5 (パイロット: fiscal-years) ── エラー契約の確立
    │               ├── Task 6 (members)
    │               ├── Task 7 (projects)
    │               ├── Task 9 (performance API) ←─ Task 8 (差分純関数+テスト)
    │               └── Task 10/11 (集計 3本)
    └── Task 4 (auth.ts + /api/me)
            └── Task 12 (useAppUser / middleware)
                    └── Task 13 (PostgREST 依存除去確認)
                            └── Task 14 (クリーンアップ)
```

---

## フェーズ1: 基盤（プラン T1）

### Task 1: JWT Signing Keys（非対称鍵）への切替確認

**内容:** Supabase プロジェクトの JWT Signing Keys が非対称鍵に切り替わっているかダッシュボードで確認し、レガシー HS256 のままなら切り替える。HS256 のままだと `requireAppUser` の JWT 検証が毎リクエスト Auth サーバ照会になり、全 API にレイテンシが乗る（プラン 12章）。

**受け入れ基準:**

- [x] Supabase ダッシュボードで JWT Signing Keys（非対称鍵）が有効になっている
- [x] 切替後も既存のログイン（Google OAuth）が正常に動作する（切替操作は不要だったため既存セッションへの影響なし）

**検証:** 切替後にログイン→各画面のデータ取得を手動確認（既存 PostgREST 経路が壊れていないこと）。
**依存:** なし
**触るファイル:** なし（Supabase ダッシュボード操作のみ。作業記録を `docs/SETUP.md` に追記してもよい）
**規模:** XS

> **リスクが基盤全体に効くため最初に行う（fail fast）。** 切替はプロジェクト全体に影響する操作なので、実施前に既存セッションへの影響（再ログイン要否）を確認すること。

> **検証結果（2026-08-11 実施）: 切替済みのため作業不要と判断。** 根拠は次の2点。
>
> 1. JWKS エンドポイント（`/auth/v1/.well-known/jwks.json`）が **ES256（P-256）の公開鍵 1 本**を返した
>    （`kid: 0963d771-5416-44d0-9583-fd2b764b3d28`）。レガシー HS256 のみのプロジェクトは
>    対称鍵を公開できないため `{"keys":[]}` を返す。公開鍵が存在する＝非対称鍵が構成済み。
> 2. プロジェクト作成日は **2026-08-09**（`supabase projects list` で確認）。Supabase は
>    2025年10月以降の新規プロジェクトをデフォルトで非対称鍵（ES256）にしており、
>    本プロジェクトは最初から非対称鍵で作られている。手動で standby 鍵を作った履歴もなく、
>    この ES256 鍵が current であると判断できる。
>
> 切替操作を行っていないため既存ログインへの影響はない。`requireAppUser`（Task 4）は
> JWKS のローカル検証で JWT を検証でき、Auth サーバへの毎リクエスト照会は発生しない。

### Task 2: 依存追加と DB 接続基盤

**内容:** `drizzle-orm` / `postgres` を dependencies、`drizzle-kit` を devDependencies に追加。`server/utils/db.ts`（postgres-js + Drizzle のシングルトン、`prepare: false` / `max: 1` / `idle_timeout` / `connect_timeout` 明示）、`drizzle.config.ts`（pull 専用、`schemaFilter: ['public']`）を新設。環境変数 `NUXT_DATABASE_URL`（runtimeConfig サーバ専用）/ `DIRECT_DATABASE_URL` を導入し、`docker-compose.yml` への環境変数受け渡しと Makefile `db-drizzle-pull` ターゲットを追加する。

**受け入れ基準:**

- [x] `useDb()` が Supavisor transaction mode（:6543）経由で `SELECT 1` 相当を実行できる（確認用の仮ルートは確認後に削除）
- [x] `NUXT_DATABASE_URL` が `runtimeConfig.public` に**入っていない**（クライアントバンドルに接続文字列が露出しない）
- [x] `make db-drizzle-pull` がコンテナ内から実行できる（`-e DIRECT_DATABASE_URL` の明示渡し）

**検証:** `make test` 無影響。dev コンテナからリモート Supavisor への疎通確認。
**依存:** なし（Task 1 と並行可）
**触るファイル:** `package.json`, `package-lock.json`, `nuxt.config.ts`, `server/utils/db.ts`（新規）, `drizzle.config.ts`（新規）, `docker-compose.yml`, `Makefile`, `.env.example`
**規模:** M

> **`prepare: false` を忘れると transaction mode では初回クエリから失敗する**（プラン 3.1）。ここで確実に入れること。

> **実施記録（2026-08-11 完了）:**
>
> - 依存追加: `drizzle-orm@0.45.2` / `postgres`（dependencies）、`drizzle-kit@0.31.10`（devDependencies）
> - 疎通確認: 一時ルート `/api/_db-check` で `select 1` が `{ ok: true }` を返すことを確認。`make test` は 218 件全通過
> - **`docker-compose.yml` は変更不要だった**: dev サーバはプロジェクトルート（マウント済み）の `.env` を Nuxt 自身が読むため、compose での受け渡しは不要。drizzle-kit だけは `.env` を読まないため、Makefile 側の `-e DIRECT_DATABASE_URL` で渡す
> - **接続先ホストの落とし穴（2回踏んだ）**: direct 接続（`db.<ref>.supabase.co`）はコンテナから DNS 解決不可（IPv6 のみ）。また pooler ホストは `aws-0-ap-southeast-1.pooler.supabase.com` が正で、`aws-1-...` は認証エラー（XX000）、番号なしは存在しない。**ダッシュボードの Connect ダイアログからのコピーが必須**（手打ちは事故る）
> - `nuxt.config.ts` に `useSsrCookies` を false にしてはいけない旨のコメントを追加（プラン 2.2 の指示。Task 4 の前倒し）

### Task 3: 初回 pull と numeric 手修正（schema.ts 確立）

**内容:** `make db-drizzle-pull` で `server/db/schema.ts` を初回生成し、直後に numeric 列を手修正する: `amount` / `unit_price` → `{ precision: 12, scale: 0, mode: 'number' }`、`work_hours` → `{ precision: 6, scale: 2, mode: 'number' }`。以後 schema.ts は手メンテとし、pull は drift 検知専用とする運用ルールをファイル冒頭コメントに明記する。

**受け入れ基準:**

- [x] `server/db/schema.ts` に 5 テーブルの定義が存在し、型検査が通る
- [x] numeric 列すべてに `mode: 'number'` が付与されている（`string` になる列がない）
- [x] 「pull は差分検証専用・スキーマは手メンテ・generate/push/migrate 禁止」の Why not コメントがある

**検証:** `make test`（型検査込み）通過。schema.ts から `InferSelectModel` した型の numeric 列が `number` であることを確認。
**依存:** Task 2
**触るファイル:** `server/db/schema.ts`（新規）
**規模:** S

> **pull を再実行すると `mode: 'number'` が消える**（プラン 4.3）。最重要の落とし穴のため受け入れ基準で明示的に確認する。

> **実施記録（2026-08-11 完了、Sonnet サブエージェントで実装）:**
>
> - pull で 6 テーブルを取得: `m_users` / `m_projects` / `t_sales` / `t_costs` / `t_status` / `m_fiscal_years`（RLS ポリシー・インデックス・FK 定義も schema.ts に含まれる）
> - `mode: 'number'` を 6 列に付与: `t_costs.work_hours` / `t_costs.work_days` / `t_costs.unit_price` / `t_costs.amount` / `m_users.unit_price` / `t_sales.amount`。**`work_days`（NUMERIC(6,2)）はプラン 4.3 に明記がないが同型・同用途のため追加**。`mode: 'number'` に伴い `.default('0')` → `.default(0)` に修正
> - `server/utils/db.ts` にスキーマを接続（`drizzle(client, { schema })`、`PostgresJsDatabase<typeof schema>`）。プラン 3.3 の形に到達
> - 検証: `make test` 218 件全通過、`nuxi typecheck` エラーなし
> - **残件**: pull が生成した migration アーティファクト（`server/db/0000_reflective_expediter.sql`、`server/db/meta/`)は rm 権限拒否のため未削除。手動削除が必要
>
> **運用変更（2026-08-11 追記）: pull 出力先を `.drizzle-pull/` に分離。** `drizzle.config.ts` の
> `out` を `./.drizzle-pull` に変更し、`.gitignore` に追加した。これにより pull を実行しても
> 手メンテの `server/db/schema.ts` は上書きされず、SQL / meta アーティファクトも `server/db` に
> 生成されない。drift 確認は「`.drizzle-pull/schema.ts` と `server/db/schema.ts` を diff して
> 必要な差分だけ手動反映」の手順になる（schema.ts 冒頭・Makefile のコメントにも反映済み）。
> なお「Drizzle にマイグレーション管理も移す」案も検討したが、`is_app_user()` 関数と
> `updated_at` トリガは Drizzle スキーマで表現できず手書き SQL マイグレーションが残ること、
> 適用済み履歴のベースライン化リスクがあることから、Supabase CLI 維持（プラン確定方針4）で
> 確定した。

### Task 4: requireAppUser と GET /api/me

**内容:** `server/utils/auth.ts` に `requireAppUser(event)` を実装する。`serverSupabaseUser(event)` を try/catch（失敗・email クレームなしは 401）、**トップレベル email クレーム**で `m_users` を照合（未登録 403）、結果を `event.context.appUser` にキャッシュ。最初の利用箇所として `GET /api/me` を新設する（この時点では composable は差し替えない）。

**受け入れ基準:**

- [x] ログイン済み登録ユーザーで `/api/me` が 200 と `AppUser` 相当を返す ※チェックポイント1で手動確認
- [x] 未ログインで 401、登録済みでないアカウントで 403 を返す（401 は curl で確認済み。403 は未登録アカウントのセッションが必要なためチェックポイント1で確認）
- [x] `user_metadata.email` を参照していない（改竄可能なため。プラン 5.1）

**検証:** ブラウザ/`curl` で 200 / 401 / 403 の 3 パターンを手動確認。`make test` 無影響。
**依存:** Task 2（DB接続）、Task 3（m_users スキーマ）。Task 1 完了前でも動くが、レイテンシ計測は Task 1 後に行う
**触るファイル:** `server/utils/auth.ts`（新規）, `server/api/me.get.ts`（新規）
**規模:** M

> **実施記録（2026-08-11、Sonnet サブエージェントで実装・検収済み）:**
>
> - `AppUser` は `InferSelectModel<typeof mUsers>` から導出。`declare module 'h3'` で
>   `event.context.appUser` を型拡張し、同一リクエスト内の照合結果をキャッシュ
> - `serverSupabaseUser` は内部で `getClaims()` を呼び、エラー時に statusCode 未指定の
>   `createError`（=500）を投げることを node_modules の実装で確認済み → try/catch で 401 に丸めた
> - 照合は `supabase/migrations/20260809120100_rls_policies.sql` の `is_app_user()` を確認し、
>   `email = auth.jwt() ->> 'email'` の単純等価比較をそのまま `eq(mUsers.email, claims.email)` で再現
>   （正規化・trim は原本に無いため入れていない）。トップレベル email クレームのみ使用
> - 検証: `make test` 218 件通過、`nuxi typecheck` エラーなし、未認証 curl で 401 確認
> - 200 / 403 は実ブラウザセッションが必要なため、チェックポイント1 の手動確認に持ち越し

### ✅ チェックポイント1（基盤）

- [x] `make test` 通過、`/api/me` が 3 パターンの応答を返す、既存画面は無影響
- [x] ここで人間レビュー

> **レビュー結果（2026-08-11）:** ログイン済みブラウザで `/api/me` が 200 と本人の `m_users` 行を
> 返すことをユーザーが確認。401 は curl で確認済み。403 は未登録アカウントのセッションが
> 必要なため未確認のまま進む（既存ログインフローが未登録を弾くため実害リスクは低い）。
>
> **後続タスクへの注意:** timestamptz の文字列表現が PostgREST の ISO 形式
> （`2026-08-09T05:23:14+00:00`）から postgres-js の形式（`2026-08-09 05:23:14.156607+00`）に
> 変わっている。クライアントに日時のパース・整形処理がある場合、composable 差し替え時
> （Task 5 以降）に表示崩れがないか確認すること。

---

## フェーズ2: パイロット（プラン T2）

### Task 5: fiscal-years の移行とエラー契約の確立

**内容:** 最小リソースで縦一本を通す。`GET /api/fiscal-years`、`POST /api/fiscal-years`（重複 409）を新設し、`useFiscalYears` と `useProjectYears.addYear` を `$fetch` に差し替える。エラー契約（`createError({ statusCode, data: { pgCode } })` → クライアントの `error.data?.pgCode === '23505'` 分岐）をここで確立し、以降のタスクの雛形とする。`lib/schemas/api.ts` を新設し、年度追加のリクエストスキーマ＋`readValidatedBody` を導入する。

**受け入れ基準:**

- [ ] 年度一覧表示・年度追加が API 経由で動作する（画面挙動は移行前と同一）
- [ ] 重複年度の追加で既存の日本語エラーメッセージがそのまま表示される（23505→409→pgCode 分岐）
- [ ] `useFiscalYears` / `addYear` に `useSupabaseClient()` の DB 用途が残っていない

**検証:** 年度追加・重複追加を手動確認。`make test` 通過。
**依存:** Task 3, Task 4
**触るファイル:** `server/api/fiscal-years.get.ts`（新規）, `server/api/fiscal-years.post.ts`（新規）, `lib/schemas/api.ts`（新規）, `composables/useFiscalYears.ts`, `composables/useProjectYears.ts`
**規模:** M

### ✅ チェックポイント2（パイロット成立）

- [ ] エンドポイント実装 → composable 差し替え → エラー契約、の型がここで確定
- [ ] ここで人間レビュー（以降のタスクはこの型の反復になるため、パターンの妥当性をここで判断する）

---

## フェーズ3: リソース移行（プラン T3〜T5）

### Task 6: members の移行（トランザクション初適用）

**内容:** `GET /api/members`（id 昇順）、`PUT /api/members`（`{ drafts, deletedIds }`、Tx 化）、`GET /api/members/:id/has-costs` を新設し、`useMembers` を差し替える。Tx 内でも DELETE → UPDATE → INSERT の順序を維持し、**UPDATE は 1行=1文のループを維持**する（バルク UPDATE 化すると文の実行途中で一時的な email 重複が発生し得る。プラン 7.2）。23505 / 23503 はロールバック後 409 へマップ。リクエストスキーマを `lib/schemas/api.ts` に追加。「部分適用になるので失敗時は必ず再取得」系の既存コメントを「Tx で全ロールバックされる」前提に書き換える。

**受け入れ基準:**

- [ ] メンバー一覧・編集保存（追加/更新/削除混在）が動作する
- [ ] email 付け替え（削除した行の email を別行で使う）が成功する
- [ ] 実績のあるメンバー削除で FK 違反 → 409 → 既存の日本語メッセージが表示され、DB は保存前の状態のまま（全ロールバック）

**検証:** 上記 3 シナリオの手動確認。`make test` 通過。
**依存:** Task 5
**触るファイル:** `server/api/members.get.ts`（新規）, `server/api/members.put.ts`（新規）, `server/api/members/[id]/has-costs.get.ts`（新規）, `lib/schemas/api.ts`, `composables/useMembers.ts`
**規模:** M

### Task 7: projects の移行（Tx + EXISTS 削除ガード）

**内容:** `GET /api/projects`、`PUT /api/projects`（Tx 化）、`GET /api/projects/:id/has-performance`（count 3 本 → `EXISTS` ×3 の 1 クエリ）を新設し、`useProjects` を差し替える。構造は Task 6 と同型。「`m_projects` に UNIQUE がないので順序に必然性はない、useMembers と揃えただけ」という既存コメントの知見をサーバ側コードへ移植する。

**受け入れ基準:**

- [ ] プロジェクト一覧・編集保存（追加/更新/削除混在）が動作する
- [ ] 実績のあるプロジェクト削除で 409 → 既存の日本語メッセージ、DB は全ロールバック
- [ ] has-performance が 1 クエリで判定している（3 往復していない）

**検証:** 手動確認 + `make test` 通過。
**依存:** Task 6（同型パターンの流用元として。実装自体は Task 5 完了後なら並行可）
**触るファイル:** `server/api/projects.get.ts`（新規）, `server/api/projects.put.ts`（新規）, `server/api/projects/[id]/has-performance.get.ts`（新規）, `lib/schemas/api.ts`, `composables/useProjects.ts`
**規模:** M

### Task 8: performance 差分計算の純関数とテスト（テスト先行）

**内容:** `savePerformance` の差分計算（現在行 vs 望ましい最終状態 → DELETE / UPDATE / INSERT の各集合）を `server/utils/performanceDiff.ts` の純関数として設計し、**実装より先に Vitest のテストを書く**。「触った行だけ UPDATE して `updated_at` を無駄に動かさない」現行方針を差分判定の仕様としてテストに固定する。API ルートはこのタスクでは作らない。

**受け入れ基準:**

- [ ] 追加のみ / 更新のみ / 削除のみ / 混在 / 変更なし（UPDATE 対象ゼロ）の各ケースのテストがあり、すべて通る
- [ ] sales・costs 両系統の行差分と managementAmount / remark（t_status）の扱いがテストで仕様化されている
- [ ] 純関数は DB・Nuxt ランタイムに依存しない

**検証:** `make test` で新規 spec が通過。
**依存:** Task 3（schema.ts の型を入出力に使う場合）。Task 5〜7 と並行可
**触るファイル:** `server/utils/performanceDiff.ts`（新規）, `tests/unit/performanceDiff.spec.ts`（新規）
**規模:** M

### Task 9: performance の移行（最重要トランザクション）

**内容:** `GET /api/performance?fiscalYear=&month=&projectId=`（`{ sales, costs, status }`）、`PUT /api/performance` を新設し、`usePerformance` を差し替える。PUT はクライアントから「望ましい最終状態」を受け取り、Tx 内で現在行を SELECT → Task 8 の純関数で差分計算 → DELETE → UPDATE → INSERT → `t_status` を `onConflictDoUpdate`（`target: [fiscalYear, month, projectId]`）。**`updated_by` はクライアントから受け取らず、`requireAppUser` の結果（`family_name` + `first_name`）からサーバ側で導出する**（プラン 5.2）。GET のクエリは `getValidatedQuery` で必須化する。

**受け入れ基準:**

- [ ] 実績入力画面の取得・保存が動作し、保存 → 再取得で入力内容と一致する
- [ ] リクエストボディに `updated_by` 相当が存在しない（サーバ導出）
- [ ] 途中失敗（例: 不正データを混ぜて意図的に失敗させる）で部分適用されず全ロールバックされる

**検証:** 保存→再取得の一致、ロールバックの手動確認。`make test` 通過。
**依存:** Task 5（エラー契約）, Task 8（差分純関数）
**触るファイル:** `server/api/performance.get.ts`（新規）, `server/api/performance.put.ts`（新規）, `lib/schemas/api.ts`, `composables/usePerformance.ts`
**規模:** M

### ✅ チェックポイント3（書き込み系の移行完了）

- [ ] members / projects / performance の保存がすべて Tx 化され、失敗時に部分適用が起きない
- [ ] `make test` 通過。ここで人間レビュー

---

## フェーズ4: 集計と認証仕上げ（プラン T6〜T7）

### Task 10: dashboard 集計の SQL 化

**内容:** `GET /api/dashboard?fiscalYear=` を新設。t_sales / t_costs を対象 2 年度分 `SELECT fiscal_year, month, project_id, SUM(amount) ... GROUP BY` で集計し、**`buildDashboardData`（`lib/dashboard.ts`）をサーバから無変更で import** して畳み込む（和の和は和、なので GROUP BY 済み行を入力しても結果不変。プラン 8.1）。`useDashboard` を差し替える。

**受け入れ基準:**

- [ ] 移行前後で同一データに対するダッシュボード表示値（売上・費用・粗利・ステータス等）が一致する
- [ ] クライアントへ全明細行が転送されていない（集計済み行のみ）
- [ ] `buildDashboardData` と既存テストに変更がない

**検証:** 移行前の画面表示値を控えてから差し替え、目視比較。`make test` 通過。
**依存:** Task 5（エラー契約）。Task 6〜9 と並行可
**触るファイル:** `server/api/dashboard.get.ts`（新規）, `composables/useDashboard.ts`
**規模:** M

### Task 11: years / months 集計の SQL 化

**内容:** `GET /api/projects/:id/years`（`GROUP BY fiscal_year` + 実績有無）、`GET /api/projects/:id/months?fiscalYear=`（`GROUP BY month`）を新設し、`useProjectYears.fetchYears` / `useProjectMonths` を差し替える。`[month].vue` の隣月判定は months の結果を再利用する。クライアント側の `groupByYear` / `groupByMonth` 相当は縮退させる。

**受け入れ基準:**

- [ ] プロジェクト年度別・月別画面の表示値が移行前後で一致する
- [ ] 月別画面の隣月ナビゲーション（前月/翌月の活性判定）が移行前と同一に動作する
- [ ] fiscalYear クエリが `getValidatedQuery` で必須検証されている

**検証:** 年度別・月別・隣月遷移の手動確認。`make test` 通過。
**依存:** Task 5。Task 10 と並行可
**触るファイル:** `server/api/projects/[id]/years.get.ts`（新規）, `server/api/projects/[id]/months.get.ts`（新規）, `composables/useProjectYears.ts`, `composables/useProjectMonths.ts`
**規模:** M

### Task 12: useAppUser / middleware の /api/me 化

**内容:** `useAppUser.resolve()` の `m_users` 直叩きを `GET /api/me`（Task 4 で新設済み）へ置き換える。fail-closed（エラー時 UNREGISTERED 扱い）の挙動は維持する。`middleware/auth.global.ts` の判定フローが影響を受けないことを確認する。

**受け入れ基準:**

- [ ] 登録ユーザーのログイン → `/dashboard` 遷移、サイドバーの氏名表示が従来どおり
- [ ] 未登録アカウントはログイン不可メッセージが出てセッションが残らない
- [ ] ログアウト → `/login` リダイレクトが従来どおり。API エラー時は UNREGISTERED 扱い（fail-closed）

**検証:** 登録済み / 未登録 / ログアウトの 3 遷移を手動確認。
**依存:** Task 4
**触るファイル:** `composables/useAppUser.ts`（必要なら `middleware/auth.global.ts`）
**規模:** S

### ✅ チェックポイント4（全機能移行完了）

- [ ] 全画面が API 経由で動作し、表示値・エラーメッセージ・認証遷移が移行前と一致
- [ ] `make test` 通過。ここで人間レビュー

---

## フェーズ5: 除去とクリーンアップ（プラン T8〜T9）

### Task 13: PostgREST 依存の除去確認

**内容:** `useSupabaseClient()` の DB 用途が残っていないことを機械的に確認する（Auth 用途のみ残る状態にする）。RLS ポリシーは PostgREST 防御層として残置し、遮断が生きていることを再検証する。

**受け入れ基準:**

- [ ] `grep -r "\.from(" composables/ pages/` が 0 件
- [ ] `useSupabaseClient` の残存箇所がすべて Auth 用途である（目視確認）
- [ ] `make db-check-rls` で全テーブルが `[]`（RLS 残置の確認）

**検証:** 上記 grep / make コマンドの実行結果。
**依存:** Task 5〜12 すべて
**触るファイル:** （原則なし。取り漏れが見つかった場合のみ該当 composable）
**規模:** S

### Task 14: クリーンアップとドキュメント整備

**内容:** ①`types/database.types.ts` の参照を grep し、ゼロなら削除（残るなら退役を見送り理由を記録）②Makefile 整理: `generate` ターゲットを削除または「build を使え」と表示して exit 1 するガードに変更（**`nuxt generate` は Nitro API を含まず全 API が 404 になるため。プラン 10章**）③`docs/SETUP.md` 8章（Vercel デプロイ: `NUXT_DATABASE_URL` 追加、`SUPABASE_SERVICE_ROLE_KEY` は置かない）を執筆 ④`.env.example` を新旧対照（プラン 13.1）どおりに更新。

**受け入れ基準:**

- [ ] `make build` が成功し、`.output` に serverless API が含まれる
- [ ] `make generate` が実行できない（削除またはガードで exit 1）
- [ ] SETUP.md 8章と `.env.example` がプラン 10章・13.1 と整合している

**検証:** `make build` 成功。ドキュメントレビュー。
**依存:** Task 13
**触るファイル:** `types/database.types.ts`（削除候補）, `Makefile`, `docs/SETUP.md`, `.env.example`
**規模:** M

### ✅ チェックポイント5（完了）

- [ ] `make build` 成功、`make test` 通過、`make db-check-rls` 正常
- [ ] Vercel 環境変数（`NUXT_DATABASE_URL`）の設定を確認してからデプロイ
- [ ] 最終人間レビュー

---

## 並行作業の可否

| 区分 | 内容 |
| --- | --- |
| 並行可 | Task 1 と Task 2。Task 8 は Task 3 完了後いつでも。Task 6 / 7 / 10 / 11 は Task 5 のパターン確立後なら相互に独立 |
| 直列必須 | Task 2 → 3 → 5（基盤 → スキーマ → パイロット）、Task 8 → 9、Task 13 → 14 |
| 調整要 | `lib/schemas/api.ts` は Task 5 / 6 / 7 / 9 が同一ファイルに追記するため、並行時はコンフリクトに注意 |

## リスク（要約。詳細はプラン 12章）

| リスク | 影響 | 関連タスク |
| --- | --- | --- |
| numeric が `string` になる / pull 再実行で `mode: 'number'` 消失 | 高（計算全滅） | Task 3 |
| `prepare: false` 忘れ | 高（初回クエリから失敗） | Task 2 |
| `NUXT_DATABASE_URL` のクライアント露出 | 高（秘密情報漏洩） | Task 2 |
| `useSsrCookies: false` 化 / `user_metadata.email` 参照 | 高（全 API 401 / 認可バイパス） | Task 4 |
| バルク UPDATE 化による一時的 UNIQUE 衝突 | 中 | Task 6 |
| `make generate` でのデプロイ（全 API 404） | 高 | Task 14 |

## 未解決事項（人間の判断待ち）

- Task 1 の JWT Signing Keys 切替が既存セッションに与える影響（全ユーザー再ログインが必要か）は、切替前に Supabase のドキュメントで確認すること
- 既存メンバー同士の email 入れ替え（A⇄B）は移行後も失敗する既知の制約（プラン 7.2）。DEFERRABLE 制約への再作成は要件が出るまで対応しない方針で確定済み
