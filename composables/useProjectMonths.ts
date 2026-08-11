import { FetchStatus } from '~/lib/fetchStatus'
import { calcGrossProfit } from '~/lib/calc'
import { FISCAL_MONTHS, toCalendarYear } from '~/lib/fiscalYear'

/** 月カード1枚分。実績のない月も 0 の行として必ず作る。 */
export type ProjectMonthSummary = {
  /** 暦月（1〜12）。年度内の連番ではない。 */
  month: number
  /** 表示用の暦年。7月始まりなので 1〜6月は翌年になる。 */
  calendarYear: number
  totalSales: number
  grossProfit: number
  /** 実績行が1件でもあるか。金額0でも行があれば入力済みなので額では判定できない。 */
  hasRecords: boolean
}

/** /api/projects/[id]/months が返す集計素材（月で SUM 済みの行）。 */
type ProjectMonthsSourceResponse = {
  sales: { month: number; amount: number }[]
  costs: { month: number; amount: number }[]
}

/** 対象プロジェクト×年度の12ヶ月と、月ごとの売上・粗利。 */
export const useProjectMonths = (projectId: number, fiscalYear: number) => {
  const summaries = ref<ProjectMonthSummary[]>([])
  const status = ref<FetchStatus>(FetchStatus.IDLE)
  const errorMessage = ref<string | null>(null)

  const fetchMonths = async (): Promise<void> => {
    status.value = FetchStatus.LOADING
    errorMessage.value = null

    try {
      const source = await $fetch<ProjectMonthsSourceResponse>(
        `/api/projects/${projectId}/months`,
        { query: { fiscalYear } },
      )

      const salesByMonth = new Map(source.sales.map((row) => [row.month, row.amount]))
      const costsByMonth = new Map(source.costs.map((row) => [row.month, row.amount]))

      // 月の並びは FISCAL_MONTHS が正。数値昇順にすると年度の並びにならない。
      summaries.value = FISCAL_MONTHS.map((month) => {
        const totalSales = salesByMonth.get(month) ?? 0
        const totalCosts = costsByMonth.get(month) ?? 0

        return {
          month,
          calendarYear: toCalendarYear(fiscalYear, month),
          totalSales,
          grossProfit: calcGrossProfit(totalSales, totalCosts),
          hasRecords: salesByMonth.has(month) || costsByMonth.has(month),
        }
      })

      status.value = FetchStatus.SUCCESS
    } catch (error) {
      console.error('[useProjectMonths] 月別実績の取得に失敗しました', error)
      summaries.value = []
      errorMessage.value = '月別の実績を取得できませんでした。時間をおいて再度お試しください。'
      status.value = FetchStatus.ERROR
    }
  }

  return { summaries, status, errorMessage, fetchMonths }
}
