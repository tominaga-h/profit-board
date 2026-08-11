import { FetchStatus } from '~/lib/fetchStatus'
import { buildDashboardData } from '~/lib/dashboard'
import type { DashboardData, DashboardProject, PerformanceRow } from '~/lib/dashboard'

/** /api/dashboard が返す集計素材（年度×月×プロジェクトで SUM 済みの行）。 */
type DashboardSourceResponse = {
  projects: DashboardProject[]
  sales: PerformanceRow[]
  costs: PerformanceRow[]
}

/**
 * 年度全体の集計を取得する。
 *
 * /api/dashboard（server/api/dashboard.get.ts）が SQL の GROUP BY で集計済み行まで
 * 絞り、畳み込み（buildDashboardData）はここで行う。DashboardData は Map を含む
 * ため、サーバで畳み込んで JSON で返すと Map が {} に潰れて画面が壊れる。
 * 前年同期比のための前年度分もサーバ側で1回のクエリにまとめており、往復は増えない。
 */
export const useDashboard = () => {
  const data = ref<DashboardData | null>(null)
  const status = ref<FetchStatus>(FetchStatus.IDLE)
  const errorMessage = ref<string | null>(null)

  const fetchDashboard = async (fiscalYear: number): Promise<void> => {
    status.value = FetchStatus.LOADING
    errorMessage.value = null

    try {
      const source = await $fetch<DashboardSourceResponse>('/api/dashboard', {
        query: { fiscalYear },
      })
      data.value = buildDashboardData(fiscalYear, source.projects, source.sales, source.costs)
      status.value = FetchStatus.SUCCESS
    } catch (error) {
      console.error('[useDashboard] 集計データの取得に失敗しました', error)
      data.value = null
      errorMessage.value = '集計データを取得できませんでした。時間をおいて再度お試しください。'
      status.value = FetchStatus.ERROR
    }
  }

  return { data, status, errorMessage, fetchDashboard }
}
