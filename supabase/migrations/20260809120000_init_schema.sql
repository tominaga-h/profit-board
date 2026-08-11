-- ============================================================
-- ProfitBoard 初期スキーマ
--
-- テーブル定義は docs/SPEC.md 5.1 に準拠する（カラムの追加・変更・削除は行わない）。
-- 部門カラム・PMカラムは持たない（tasks/plan.md の決定事項 A1 / A2）。
-- ============================================================

-- ------------------------------------------------------------
-- updated_at 自動更新トリガ関数
-- ------------------------------------------------------------
-- NEW レコードのフィールドを書き換えるだけで、テーブル等の外部オブジェクトに
-- 一切アクセスしない。権限昇格を必要とする操作がないため SECURITY DEFINER は
-- 付けない（不要に付けると攻撃面を広げるだけになる）。
-- search_path 汚染を避けるため now() は pg_catalog で完全修飾する。
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'UPDATE 時に updated_at を現在時刻へ自動更新する共通トリガ関数';

-- ------------------------------------------------------------
-- m_users（メンバーマスタ）
-- ------------------------------------------------------------
CREATE TABLE public.m_users (
  id          SERIAL PRIMARY KEY,
  family_name VARCHAR(50)    NOT NULL,
  first_name  VARCHAR(50)    NOT NULL,
  email       VARCHAR(255)   UNIQUE NOT NULL,
  unit_price  NUMERIC(12, 0) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.m_users IS
  'メンバーマスタ。email がアプリの利用許可リストを兼ねる（SPEC 3.1 / RLS の判定元）';

CREATE TRIGGER trg_m_users_updated_at
  BEFORE UPDATE ON public.m_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- m_projects（プロジェクトマスタ）
-- ------------------------------------------------------------
CREATE TABLE public.m_projects (
  id           SERIAL PRIMARY KEY,
  service_name VARCHAR(255) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.m_projects IS
  'プロジェクトマスタ。部門・PM カラムは持たない（plan.md A1 / A2）';

CREATE TRIGGER trg_m_projects_updated_at
  BEFORE UPDATE ON public.m_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- t_sales（月次売上実績）
-- ------------------------------------------------------------
CREATE TABLE public.t_sales (
  id             SERIAL PRIMARY KEY,
  fiscal_year    INT            NOT NULL,
  month          INT            NOT NULL,
  project_id     INT            NOT NULL REFERENCES public.m_projects(id),
  category_small VARCHAR(100)   NOT NULL,
  amount         NUMERIC(12, 0) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- 同一の年度×月×プロジェクトに複数の小項目行（「保守」「保守外」＋任意追加行）が
-- 並ぶため、UNIQUE 制約は設けない。重複防止は Task 10 の delete→insert 洗い替えが担う。
COMMENT ON TABLE public.t_sales IS
  '月次売上実績。年度×月×プロジェクト単位で delete→insert により洗い替えする（Task 10）';

CREATE TRIGGER trg_t_sales_updated_at
  BEFORE UPDATE ON public.t_sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- t_costs（月次費用実績）
-- ------------------------------------------------------------
CREATE TABLE public.t_costs (
  id          SERIAL PRIMARY KEY,
  fiscal_year INT            NOT NULL,
  month       INT            NOT NULL,
  project_id  INT            NOT NULL REFERENCES public.m_projects(id),
  user_id     INT            REFERENCES public.m_users(id), -- NULLの場合は管理費等
  cost_type   VARCHAR(50)    NOT NULL DEFAULT 'LABOR',      -- 'LABOR' or 'MANAGEMENT'
  work_hours  NUMERIC(6, 1)  DEFAULT 0,
  work_days   NUMERIC(6, 2)  DEFAULT 0,
  unit_price  NUMERIC(12, 0) DEFAULT 0,
  amount      NUMERIC(12, 0) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.t_costs IS
  '月次費用実績。user_id が NULL の行は管理費（cost_type = MANAGEMENT）';

CREATE TRIGGER trg_t_costs_updated_at
  BEFORE UPDATE ON public.t_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- t_status（月次ステータス・備考）
-- ------------------------------------------------------------
CREATE TABLE public.t_status (
  id          SERIAL PRIMARY KEY,
  fiscal_year INT         NOT NULL,
  month       INT         NOT NULL,
  project_id  INT         NOT NULL REFERENCES public.m_projects(id),
  remark      TEXT,
  updated_by  VARCHAR(255),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fiscal_year, month, project_id)
);

COMMENT ON TABLE public.t_status IS
  '月次の備考・更新者。年度×月×プロジェクトで一意（Task 10 の upsert 競合ターゲット）';

CREATE TRIGGER trg_t_status_updated_at
  BEFORE UPDATE ON public.t_status
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- インデックス
-- ------------------------------------------------------------
-- RLS ポリシーの述語は is_app_user()（行に依存しない真偽値）なので、
-- RLS を速くする列インデックスは存在しない。アプリの実クエリに対して張る。

-- 実績入力画面の読込（Task 8）と delete→insert 洗い替え（Task 10）の主経路。
-- 先頭列が fiscal_year なので、ダッシュボードの年度全件取得（Task 12/14）にも効く。
CREATE INDEX idx_t_sales_fy_month_project
  ON public.t_sales (fiscal_year, month, project_id);

CREATE INDEX idx_t_costs_fy_month_project
  ON public.t_costs (fiscal_year, month, project_id);

-- メンバー削除ガード（Task 6）: このメンバーの実績が1件でもあるかの EXISTS 判定。
CREATE INDEX idx_t_costs_user_id
  ON public.t_costs (user_id);

-- プロジェクト削除ガード（Task 7）: このプロジェクトの実績があるかの EXISTS 判定。
-- 上の複合インデックスは先頭列が fiscal_year のため project_id 単独では使えず、別途必要。
CREATE INDEX idx_t_sales_project_id
  ON public.t_sales (project_id);

CREATE INDEX idx_t_costs_project_id
  ON public.t_costs (project_id);

-- t_status は UNIQUE (fiscal_year, month, project_id) が同じ列順の索引を提供するため追加不要。
