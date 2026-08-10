import type { Database } from '~/types/database.types'
import { FetchStatus } from '~/lib/fetchStatus'
import { buildDashboardData, type DashboardData } from '~/lib/dashboard'

/**
 * 年度全体の集計を取得する（SPEC 4.1）。
 *
 * ★ プロジェクト一覧も含めてここで取る。useProjects と併用すると status が2系統になり、
 *   画面側で「どちらも成功したか」を組み合わせる分岐が増える。集計の材料は
 *   ひとまとまりで揃って初めて意味を持つので、取得の成否も1つにまとめる。
 *
 * ★ 年度は引数ではなく fetchDashboard の引数で受ける。年度プルダウンの操作で
 *   何度も切り替わるため、composable を作り直さずに再取得できるようにする。
 */
export const useDashboard = () => {
  const supabase = useSupabaseClient<Database>()

  const data = ref<DashboardData | null>(null)
  const status = ref<FetchStatus>(FetchStatus.IDLE)
  const errorMessage = ref<string | null>(null)

  /**
   * 指定年度と前年度の実績をまとめて取得して畳む。
   *
   * 前年同期比のために前年度が要るが、年度ごとに問い合わせを分けると往復が倍になる。
   * 2年度分を1回で引いて、年度の振り分けは集計側で行う。
   */
  const fetchDashboard = async (fiscalYear: number): Promise<void> => {
    status.value = FetchStatus.LOADING
    errorMessage.value = null

    const years = [fiscalYear, fiscalYear - 1]

    const [projectsResult, salesResult, costsResult] = await Promise.all([
      supabase.from('m_projects').select('id, service_name, company_name').order('id'),
      supabase
        .from('t_sales')
        .select('fiscal_year, month, project_id, amount')
        .in('fiscal_year', years),
      supabase
        .from('t_costs')
        .select('fiscal_year, month, project_id, amount')
        .in('fiscal_year', years),
    ])

    const failed = projectsResult.error ?? salesResult.error ?? costsResult.error
    if (failed) {
      console.error('[useDashboard] 集計データの取得に失敗しました', failed)
      data.value = null
      errorMessage.value = '集計データを取得できませんでした。時間をおいて再度お試しください。'
      status.value = FetchStatus.ERROR
      return
    }

    data.value = buildDashboardData(
      fiscalYear,
      projectsResult.data ?? [],
      salesResult.data ?? [],
      costsResult.data ?? [],
    )
    status.value = FetchStatus.SUCCESS
  }

  return { data, status, errorMessage, fetchDashboard }
}
