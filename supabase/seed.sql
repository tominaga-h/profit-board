-- ============================================================
-- ProfitBoard シードデータ
--
-- 初期管理者（SPEC 7章）1名のみを登録する。
-- 動作確認用のダミープロジェクト・実績データは意図的に作らない。
--
-- 【重要】このファイルは `supabase db push` の既定では適用されない。
--         リモートへ流すには `supabase db push --include-seed` を明示すること。
-- ============================================================

-- email に UNIQUE 制約があるため ON CONFLICT で冪等にする。
-- DO NOTHING にしているのは、/members/edit（Task 6）で姓名や単価を修正したあとに
-- 再度シードを流しても編集内容を巻き戻さないため。
--
-- id は指定しない。SERIAL の自動採番に任せる
-- （明示するとシーケンスの現在値がズレて次の INSERT が主キー衝突する）。
INSERT INTO public.m_users (family_name, first_name, email, unit_price)
VALUES ('冨永', '隼人', 'tominaga_h@mad2007.co.jp', 60000)
ON CONFLICT (email) DO NOTHING;
