-- ============================================================
-- ProfitBoard RLS（Row Level Security）
--
-- SPEC 3.2 の要件:
--   Supabase Auth で認証済み、かつ m_users に存在するメールアドレスの
--   ユーザーのみアクセスを許可し、未認証はDBレベルで完全に遮断する。
-- ============================================================

-- ------------------------------------------------------------
-- アプリ利用許可判定ヘルパー
-- ------------------------------------------------------------
-- ■ なぜ SECURITY DEFINER 関数に切り出すのか（再帰の回避）
--   「m_users に存在するメールのみ許可」を m_users 自身のポリシーに素直に書くと、
--   m_users の SELECT がポリシーを起動し、その中の SELECT がまたポリシーを起動して
--   無限再帰する（42P17: infinite recursion detected in policy）。
--   SECURITY DEFINER 関数は関数所有者の権限で実行され RLS を迂回するため、
--   この輪を断ち切れる。
--
-- ■ STABLE にする理由
--   DB を変更せず、同一ステートメント内では結果が変わらないため。
--   プランナが initPlan として結果をキャッシュでき、行ごとの再実行を避けられる。
--   テーブルとセッション設定を読むので IMMUTABLE は誤り。
--
-- ■ SET search_path = '' の理由
--   これを省くと関数は呼び出し側の search_path で動く。低権限ユーザーが
--   同名オブジェクトを仕込むと定義者権限で実行され得る（権限昇格）。
--   Supabase のリンターも function_search_path_mutable として警告する。
--   空に固定した上で全オブジェクトを完全修飾する。
CREATE OR REPLACE FUNCTION public.is_app_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- ★ 必ずトップレベルの email クレームを使うこと。
  --   auth.jwt() -> 'user_metadata' ->> 'email' は updateUser() でユーザー自身が
  --   書き換えられるため、認可に使うと任意のメールを名乗れる権限昇格の穴になる。
  --   なお auth.email() は非推奨。
  --   (SELECT ...) で包むのは initPlan 化して行ごとの再評価を避けるため。
  SELECT EXISTS (
    SELECT 1
    FROM public.m_users
    WHERE email = (SELECT auth.jwt() ->> 'email')
  );
$$;

COMMENT ON FUNCTION public.is_app_user() IS
  'ログイン中ユーザーのメール（JWTのトップレベル email クレーム）が m_users に存在するかを返す。RLS の再帰回避のため SECURITY DEFINER。';

-- 関数の実行権限を最小権限で付け直す。
-- CREATE FUNCTION は既定で PUBLIC に EXECUTE を付与するため、まず剥がす。
REVOKE EXECUTE ON FUNCTION public.is_app_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_app_user() FROM anon;
-- ここを忘れるとポリシー評価時に関数を実行できず、認証後の全リクエストが
-- permission denied for function is_app_user で失敗する。
GRANT EXECUTE ON FUNCTION public.is_app_user() TO authenticated;

-- ------------------------------------------------------------
-- RLS の有効化
-- ------------------------------------------------------------
-- CREATE TABLE では RLS は有効にならないため、テーブルごとに明示が必須。
-- ここが漏れると anon キーで全データが読めてしまう（情報漏洩）。
ALTER TABLE public.m_users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_sales    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_costs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_status   ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- ポリシー
-- ------------------------------------------------------------
-- ■ 方針
--   FOR ALL でまとめず、操作ごとに分けて定義する。どの操作が許可されているかが
--   SQL 上で自明になり、将来「DELETE だけ絞る」等の変更を局所化できる。
--
-- ■ 操作ごとに必要な句
--   SELECT … USING のみ
--   INSERT … WITH CHECK のみ（USING は指定不可）
--   UPDATE … USING（対象行の可視性）＋ WITH CHECK（更新後の値）の両方
--   DELETE … USING のみ
--
-- ■ TO authenticated
--   anon ではポリシー評価自体がスキップされ、未認証は 0 件となる（SPEC 3.2）。
--
-- ■ DELETE を許可する理由
--   Task 6 / 7 のマスタ行削除に必要。「実績があれば削除拒否」の業務ルールは
--   アプリ側のガードと FK 制約で担保する（SPEC 4.4 / 4.5）。

-- m_users
CREATE POLICY "m_users_select_app_user" ON public.m_users
  FOR SELECT TO authenticated
  USING ( (SELECT public.is_app_user()) );

CREATE POLICY "m_users_insert_app_user" ON public.m_users
  FOR INSERT TO authenticated
  WITH CHECK ( (SELECT public.is_app_user()) );

CREATE POLICY "m_users_update_app_user" ON public.m_users
  FOR UPDATE TO authenticated
  USING ( (SELECT public.is_app_user()) )
  WITH CHECK ( (SELECT public.is_app_user()) );

CREATE POLICY "m_users_delete_app_user" ON public.m_users
  FOR DELETE TO authenticated
  USING ( (SELECT public.is_app_user()) );

-- m_projects
CREATE POLICY "m_projects_select_app_user" ON public.m_projects
  FOR SELECT TO authenticated
  USING ( (SELECT public.is_app_user()) );

CREATE POLICY "m_projects_insert_app_user" ON public.m_projects
  FOR INSERT TO authenticated
  WITH CHECK ( (SELECT public.is_app_user()) );

CREATE POLICY "m_projects_update_app_user" ON public.m_projects
  FOR UPDATE TO authenticated
  USING ( (SELECT public.is_app_user()) )
  WITH CHECK ( (SELECT public.is_app_user()) );

CREATE POLICY "m_projects_delete_app_user" ON public.m_projects
  FOR DELETE TO authenticated
  USING ( (SELECT public.is_app_user()) );

-- t_sales
CREATE POLICY "t_sales_select_app_user" ON public.t_sales
  FOR SELECT TO authenticated
  USING ( (SELECT public.is_app_user()) );

CREATE POLICY "t_sales_insert_app_user" ON public.t_sales
  FOR INSERT TO authenticated
  WITH CHECK ( (SELECT public.is_app_user()) );

CREATE POLICY "t_sales_update_app_user" ON public.t_sales
  FOR UPDATE TO authenticated
  USING ( (SELECT public.is_app_user()) )
  WITH CHECK ( (SELECT public.is_app_user()) );

CREATE POLICY "t_sales_delete_app_user" ON public.t_sales
  FOR DELETE TO authenticated
  USING ( (SELECT public.is_app_user()) );

-- t_costs
CREATE POLICY "t_costs_select_app_user" ON public.t_costs
  FOR SELECT TO authenticated
  USING ( (SELECT public.is_app_user()) );

CREATE POLICY "t_costs_insert_app_user" ON public.t_costs
  FOR INSERT TO authenticated
  WITH CHECK ( (SELECT public.is_app_user()) );

CREATE POLICY "t_costs_update_app_user" ON public.t_costs
  FOR UPDATE TO authenticated
  USING ( (SELECT public.is_app_user()) )
  WITH CHECK ( (SELECT public.is_app_user()) );

CREATE POLICY "t_costs_delete_app_user" ON public.t_costs
  FOR DELETE TO authenticated
  USING ( (SELECT public.is_app_user()) );

-- t_status
CREATE POLICY "t_status_select_app_user" ON public.t_status
  FOR SELECT TO authenticated
  USING ( (SELECT public.is_app_user()) );

CREATE POLICY "t_status_insert_app_user" ON public.t_status
  FOR INSERT TO authenticated
  WITH CHECK ( (SELECT public.is_app_user()) );

CREATE POLICY "t_status_update_app_user" ON public.t_status
  FOR UPDATE TO authenticated
  USING ( (SELECT public.is_app_user()) )
  WITH CHECK ( (SELECT public.is_app_user()) );

CREATE POLICY "t_status_delete_app_user" ON public.t_status
  FOR DELETE TO authenticated
  USING ( (SELECT public.is_app_user()) );
