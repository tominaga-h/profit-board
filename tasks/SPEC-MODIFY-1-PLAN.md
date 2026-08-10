# 仕様変更 v1 プラン

`docs/SPEC-MODIFY-1.md` の3変更を実装するためのタスク設計案。

> **確定済み設計判断:**  
> - 既存 Task 11-14 は **破棄して書き換え** (`[x] 破棄` マーク + Task 17-21 を新規追加)  
> - 第4階層（実績閲覧）は **閲覧専用** + 「この月の実績を編集」ボタン → `/performance/input?year=...&month=...&project=...` 遷移  
> - 「＋ 年度を追加」ボタンは **モーダル実装**（年度数値入力 + 保存ボタンのみのシンプル仕様）  
> - テスト用シードデータは **追加しない**（Task 19.3/19.4/20 は空画面で動作確認）

## 1. 影響範囲サマリ

| # | 仕様変更 | 影響を受ける既存ファイル | 新規ファイル |
|---|---|---|---|
| 1 | 年度マスタ | `pages/performance/input.vue`（`FISCAL_YEAR_RANGE`）<br>`lib/fiscalYear.ts`（年度計算は維持・年度選択だけ置換） | `supabase/migrations/<ts>_add_m_fiscal_years.sql`<br>`composables/useFiscalYears.ts`<br>`lib/schemas/fiscalYear.ts`<br>`tests/unit/schemas/fiscalYear.spec.ts` |
| 2 | 4階層ドリルダウン | `pages/dashboard.vue`（一部再設計）<br>`pages/projects/index.vue`（完全に置換）<br>`tasks/task.md`（Task 11-14 を破棄マーク） | `pages/projects/[id]/years/index.vue`<br>`pages/projects/[id]/[year]/months/index.vue`<br>`pages/projects/[id]/[year]/months/[month].vue`<br>`components/Breadcrumbs.vue`（共通部品）<br>`components/YearAddModal.vue`（年度追加モーダル） |
| 3 | work_hours NUMERIC(6,2) | `lib/schemas/performance.ts`<br>`tests/unit/schemas/performance.spec.ts`<br>`pages/performance/input.vue`（`step="0.1"`） | `supabase/migrations/<ts>_alter_t_costs_work_hours_scale.sql` |

## 2. 既存タスクとの関係

### 破棄する既存タスク
- **Task 11**（プロジェクト営業成績一覧）— 4階層の第1階層として全面置換
- **Task 12**（ダッシュボードKPI）— ダッシュボードは「俯瞰」機能に集中
- **Task 13**（月次推移グラフ）— Task 20 に統合
- **Task 14**（プロジェクト別月次マトリクス）— Task 20 に統合

> **判断**: Task 11-14 は「営業成績をダッシュボード / 一覧の双方が閲覧できる」前提のタスクで、SPEC-MODIFY-1 で単一責務化した以上、既存タスク文書をそのまま使うと責務分離が破綻する。`tasks/task.md` の該当タスクに `[x] 破棄` マークを付けて、新タスク（Task 17-21）で書き直す。

### 維持するタスク
- **Task 10**（保存処理）— スキーマに依存しない、画面側の処理のみ
- **Task 15**（仕上げ）— 4階層実装後に延期
- **Task 16**（デプロイ）— 最後に

## 3. 新規タスク

### Task 17: `m_fiscal_years` テーブル追加（年度マスタ）

**DDL**:  
```sql
CREATE TABLE public.m_fiscal_years (
  id         SERIAL PRIMARY KEY,
  year       INT         UNIQUE NOT NULL,
  label      VARCHAR(50) NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- 'ACTIVE' / 'CLOSED'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**RLS**: 既存の `is_app_user()` を流用し、SELECT/INSERT/UPDATE/DELETE の4ポリシーを追加。実体は `20260809120100_rls_policies.sql` に追記 or 新規マイグレーションとして分離。

**シード**: `seed.sql` に **今年度±2年の5件**（今年度-2, 今年度-1, 今年度, 今年度+1, 今年度+2）を INSERT。今年度を `status='ACTIVE'`、それ以外を `status='CLOSED'`。

**composable**: `composables/useFiscalYears.ts` で全件取得 + リアクティブな `fiscalYears` を提供。`order('year')` で降順/昇順を確定。

**schema/テスト**: `lib/schemas/fiscalYear.ts`（年度追加のバリデーション）+ `tests/unit/schemas/fiscalYear.spec.ts`。

**画面への適用**: `pages/performance/input.vue` の `FISCAL_YEAR_RANGE` を `useFiscalYears()` の戻り値に置換。

**依存**: なし。  
**規模**: S。

### Task 18: AppSidebar のリンク更新

「プロジェクト一覧」の導線を「ドリルダウン入口」として明確化し、活性判定を動的セグメントに追従。  
`/projects`, `/projects/[id]/years`, `/projects/[id]/[year]/months`, `/projects/[id]/[year]/months/[month]` のいずれかにいるとき「プロジェクト一覧」を活性。  
`startsWith('/projects')` の判定で吸収可能。

**依存**: なし（Task 19.1 と並行可）。  
**規模**: S。

### Task 19: 4階層のルーティングと各画面

#### Task 19.1: プロジェクト選択画面（`/projects`）
**デザイン画像**: `design/project-select.png`。  
`m_projects` 全件をカードリスト表示。件数を画面上部に表示（例: 「全10件」）。右上「プロジェクト編集」ボタンで `/projects/edit` へ。  
カードクリック → `/projects/[id]/years` へ遷移。

**依存**: なし（Task 17 と並行可）。  
**規模**: S。

#### Task 19.2: 年度選択画面（`/projects/[id]/years`）
**デザイン画像**: `design/year-select.png`。  
**データ**: `m_fiscal_years` 全件 + `t_sales`/`t_costs` を `project_id` で集計し年度ごとの「年間売上」「年間粗利」を算出。  
**表示**: 3カラムグリッド。`getCurrentFiscalYear()` と一致する年度に「今年度」バッジを自動付与。  
**ステータスラベル**: 年度マスタの `status`（「ACTIVE」→ 「進行中」表記 / 「CLOSED」→ 「確定」表記）を表示。  
**「＋ 年度を追加」ボタン**: 
- 押下で `YearAddModal.vue` を開く
- モーダル: 年度数値（西暦）の数値入力 + 「保存」/「キャンセル」ボタン
- 保存: バリデーション（数値・範囲 1900-2999・一意性）後 `m_fiscal_years` に INSERT
- 成功: モーダルを閉じて一覧を再フェッチ
- 失敗: 既存の `FetchStatus` のようなエラー表示

**依存**: Task 17, 19.1。  
**規模**: M。

#### Task 19.3: 月選択画面（`/projects/[id]/[year]/months`）
**デザイン画像**: `design/month-select.png`。  
**データ**: `FISCAL_MONTHS`（7月始まり12ヶ月）を4カラムで表示。各月の「売上」「粗利」を `t_sales`/`t_costs` の集計で算出。  
**表示**: 入力済み月（`t_sales` または `t_costs` にレコードあり）は青字、未入力月はグレーアウトしてクリック不可。  
**「当月」バッジ**: システム日付を `getCurrentFiscalYear()` + `FISCAL_MONTHS` の序数で判定して自動付与。  
**遷移**: クリック → `/projects/[id]/[year]/months/[month]` へ。

**依存**: Task 19.2。  
**規模**: M。

#### Task 19.4: 実績閲覧画面（`/projects/[id]/[year]/months/[month]`）
**デザイン画像**: `design/performance-view.png`。  
**上部サマリーカード**: 売上・費用・粗利（粗利率%）。`lib/calc.ts` の集計関数を使用。  
**詳細テーブル**: 7列（大項目 / 小項目 / 稼働時間 / 稼働人日 / 単価 / 金額 / 小計）。`t_sales`/`t_costs` を売上/費用セクションに分けて表示。  
**月ナビゲーション**: 右上に「< 前月」「当月」「翌月 >」ボタン。データ存在で活性化（`status` 同様の判定）。  
**最終更新**: `t_status.updated_at` + `t_status.updated_by` を「最終更新: YYYY/MM/DD HH:MM ユーザー名」形式で表示。  
**編集導線**: 「この月の実績を編集」ボタン → `/performance/input?year=${year}&month=${month}&project=${id}` に遷移。  
**閲覧専用**: 入力欄は表示せず、テーブルは読み取りのみ。

**依存**: Task 19.3。  
**規模**: M。

### Task 20: ダッシュボード（俯瞰）

営業成績をグラフとマトリクスで俯瞰。  
**年度選択**: Task 17 の年度マスタから。  
**KPIサマリー**: 売上高合計・費用合計・営業利益合計・利益率 + 前年同期比（%/pt）。`buildYoYComparison` の `null` 処理を活用。  
**月次推移グラフ**: 売上・費用の棒グラフ + 利益率の折れ線（Task 13 相当）。  
**プロジェクト別月次マトリクス**: 4行 × 12ヶ月 × 全プロジェクト（Task 14 相当）。  
**実績データ0件対応**: 0件でも計算が破綻しないよう、月集計関数は `Map` を空のまま返してよい。

**依存**: Task 17, Task 19.4（同じ集計関数を再利用）。  
**規模**: M。

### Task 21: `work_hours` を NUMERIC(6,2) に変更

**マイグレーション**: `NUMERIC(6,1)` → `NUMERIC(6,2)`。  
```sql
ALTER TABLE public.t_costs
  ALTER COLUMN work_hours TYPE NUMERIC(6, 2);
```

**schema変更**: `lib/schemas/performance.ts` の `costRowSchema`：
- 上限を `9999.99` に下げる（旧 `99999.9`）
- 小数桁判定を100倍基準へ変更
- エラーメッセージを「小数第2位まで」に更新

**入力UI**: `pages/performance/input.vue` の `step="0.1"` → `step="0.01"`。

**テスト**: `tests/unit/schemas/performance.spec.ts` で：
- `2.25` 許容
- `2.256` 拒否
- `0.01` 許容
- 上限 `9999.99` テスト
- `10000` 拒否

**依存**: なし（Task 17 と並行可）。  
**規模**: S。

## 4. スケジュール案

実装の依存関係（並行可 / 順序依存）:

```
Task 17（年度マスタ）       ─┐
                            ├─→ Task 19.1 → 19.2 → 19.3 → 19.4
Task 21（work_hours）       ─┤                            │
                            │                            ↓
Task 18（Sidebar）         ─┘                       Task 20（ダッシュボード）
                                                         │
                                                         ↓
                                                    Task 15（仕上げ）
                                                         ↓
                                                    Task 16（デプロイ）
```

- Task 17 と Task 21 は独立。並行着手可。
- Task 18 は Task 19.1 と並行可。
- Task 19 の 4 段階は直列でビルド確認しながら。
- Task 20 は Task 19.4 の集計関数を再利用するため、19.4 完了後。

## 5. リスク・注意点

1. **実績データ0件**: マイグレーションは安全だが、Task 19.3/19.4/20 は「空画面」での確認になる。空画面の UI が妥当か（0件表示の出し方、CTA表示）は Task 15 で最終調整。
2. **動的ルートのパフォーマンス**: `[id]/[year]/months/[month]` で毎回 Supabase を叩くと待ちが積み上がる。`Promise.all` 並列取得を統一（既存 `usePerformance.ts` を参考）。
3. **`status` カラムと表示ラベルの整合**: 年度マスタの `status`（'ACTIVE' / 'CLOSED'）と表示（'進行中' / '確定'）のマッピングは1箇所（`lib/fiscalYear.ts` または `composables/useFiscalYears.ts`）に集約。
4. **`FISCAL_START_MONTH` との関係**: 年度マスタは「年度年」だけを保持。`FISCAL_START_MONTH = 7` は別箇所で参照され続ける（変更しない）。
5. **`work_hours NUMERIC(6,2)` の最大値**: `9999.99` になる点に注意。現状 0 件なので問題なし。
6. **年度追加モーダルの権限**: `m_fiscal_years` への INSERT 権限を全員が持つ前提。SPEC外だが、RLSの `is_app_user()` がそのまま通る。意図しないユーザーは `m_users` 登録で弾かれているため、当面は問題なし。
7. **ダッシュボードの実績0件時の表示**: 「-」を KPI / グラフ / マトリクスで統一するか、個別判定にするかは Task 20 で決定。

## 6. 全体チェックポイント

- [ ] Task 17 完了時点: 既存 `pages/performance/input.vue` の年度プルダウンがマスタ由来で動く
- [ ] Task 19.1 完了時点: `/projects` でプロジェクトカードリストが表示される
- [ ] Task 19.2 完了時点: 4階層ドリルダウンの入口（年度選択）が機能し、年度追加モーダルが動く
- [ ] Task 19.4 完了時点: プロジェクトの月次の営業成績が閲覧できる
- [ ] Task 20 完了時点: ダッシュボードで営業成績が俯瞰できる
- [ ] Task 21 完了時点: 実績入力で小数第2位（0.25h 等）が保存できる
- [ ] Task 15 完了時点: 全画面のローディング/エラー/0件表示が整っている
- [ ] Task 16 完了時点: 本番URLで全機能が動作する
