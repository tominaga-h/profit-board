# 動作確認用の実績データ（CSV）

Supabase 管理画面の Table Editor → 各テーブル → Insert → Import data from CSV
から取り込む。対象は **2023年度1月・プロジェクトID 1** の1ヶ月分。

`supabase db push --include-seed` は未適用のマイグレーションがあるときだけ
`seed.sql` を流すため、スキーマが最新の状態ではシードが実行されない。
実績データはスキーマ変更を伴わないので、CSV を手で取り込む。

## 取り込む順序

`t_sales` → `t_costs` → `t_status`（相互の依存はないので順不同でもよい）。

再取り込みすると行が重複する。`t_sales` / `t_costs` には UNIQUE 制約がないため
DB 側では防げない。2回目以降は先に対象行を消すこと。

```sql
DELETE FROM t_sales  WHERE fiscal_year = 2023 AND month = 1 AND project_id = 1;
DELETE FROM t_costs  WHERE fiscal_year = 2023 AND month = 1 AND project_id = 1;
DELETE FROM t_status WHERE fiscal_year = 2023 AND month = 1 AND project_id = 1;
```

## 前提

- `m_projects` に id=1 が存在する
- `m_users` に id=1〜6 が存在する（`t_costs.user_id` の外部キー）

id がずれている場合は CSV の `project_id` / `user_id` を実際の値に直す。

## 列について

- **`id` は含めない。** `SERIAL` の自動採番に任せる。明示するとシーケンスの
  現在値がズレて、次の INSERT が主キー衝突する
- **`created_at` / `updated_at` も含めない。** `DEFAULT NOW()` が入る
- **`t_costs` の管理費行は `user_id` を空にする。** 空欄が NULL として入り、
  読み取り側はこの列で管理費行を見分ける
- **`month` は暦月。** 2023年度の `1` は暦2024年1月を指す（年度は7月始まり）

## 数値の整合

`work_days` は `work_hours / 8` を小数第2位で四捨五入した値、
`amount` は `work_days × unit_price`。時間から直接計算すると画面の人日と
金額の辻褄が合わなくなるため、この順で求めた値を入れている。

`work_hours` は `NUMERIC(6,2)` なので小数第2位まで（上限 9999.99）。

取り込み後、`/projects/1/2023/1` は次の値になる。

| 項目 | 値 |
| --- | --- |
| 売上 | ¥3,000,000 |
| 費用 | ¥2,025,000（人件費 ¥1,905,000 + 管理費 ¥120,000） |
| 粗利 | ¥975,000（32.5%） |
