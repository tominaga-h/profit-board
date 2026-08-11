-- ============================================================
-- ProfitBoard 年度マスタ
-- ============================================================

CREATE TABLE public.m_fiscal_years (
  id         SERIAL PRIMARY KEY,
  year       INT         UNIQUE NOT NULL,
  label      VARCHAR(50) NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE' / 'CLOSED'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_m_fiscal_years_updated_at
  BEFORE UPDATE ON public.m_fiscal_years
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.m_fiscal_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "m_fiscal_years_select_app_user" ON public.m_fiscal_years
  FOR SELECT TO authenticated
  USING ( (SELECT public.is_app_user()) );

CREATE POLICY "m_fiscal_years_insert_app_user" ON public.m_fiscal_years
  FOR INSERT TO authenticated
  WITH CHECK ( (SELECT public.is_app_user()) );

CREATE POLICY "m_fiscal_years_update_app_user" ON public.m_fiscal_years
  FOR UPDATE TO authenticated
  USING ( (SELECT public.is_app_user()) )
  WITH CHECK ( (SELECT public.is_app_user()) );

CREATE POLICY "m_fiscal_years_delete_app_user" ON public.m_fiscal_years
  FOR DELETE TO authenticated
  USING ( (SELECT public.is_app_user()) );
