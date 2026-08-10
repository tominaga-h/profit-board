-- ============================================================
-- ProfitBoard 年度マスタの不要カラム削除
--
-- ユーザー指示により label/status を不要として削除する。
-- ============================================================

ALTER TABLE public.m_fiscal_years
  DROP COLUMN IF EXISTS label,
  DROP COLUMN IF EXISTS status;
