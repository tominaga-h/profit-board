import type { Database } from '~/types/database.types'
import { FetchStatus } from '~/lib/fetchStatus'
import { calcGrossProfit, sumAmount } from '~/lib/calc'
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

/** 対象プロジェクト×年度の12ヶ月と、月ごとの売上・粗利。 */
export const useProjectMonths = (projectId: number, fiscalYear: number) => {
  const supabase = useSupabaseClient<Database>()

  const summaries = ref<ProjectMonthSummary[]>([])
  const status = ref<FetchStatus>(FetchStatus.IDLE)
  const errorMessage = ref<string | null>(null)

  const fetchMonths = async (): Promise<void> => {
    status.value = FetchStatus.LOADING
    errorMessage.value = null

    const scope = { project_id: projectId, fiscal_year: fiscalYear }

    const [salesResult, costsResult] = await Promise.all([
      supabase.from('t_sales').select('month, amount').match(scope),
      supabase.from('t_costs').select('month, amount').match(scope),
    ])

    const failed = salesResult.error ?? costsResult.error
    if (failed) {
      console.error('[useProjectMonths] 月別実績の取得に失敗しました', failed)
      summaries.value = []
      errorMessage.value = '月別の実績を取得できませんでした。時間をおいて再度お試しください。'
      status.value = FetchStatus.ERROR
      return
    }

    const groupByMonth = (rows: { month: number; amount: number }[]) => {
      const byMonth = new Map<number, { amount: number }[]>()
      for (const row of rows) {
        const bucket = byMonth.get(row.month)
        if (bucket) bucket.push(row)
        else byMonth.set(row.month, [row])
      }
      return byMonth
    }

    const salesByMonth = groupByMonth(salesResult.data ?? [])
    const costsByMonth = groupByMonth(costsResult.data ?? [])

    // 月の並びは FISCAL_MONTHS が正。数値昇順にすると年度の並びにならない。
    summaries.value = FISCAL_MONTHS.map((month) => {
      const sales = salesByMonth.get(month) ?? []
      const costs = costsByMonth.get(month) ?? []
      const totalSales = sumAmount(sales)
      const totalCosts = sumAmount(costs)

      return {
        month,
        calendarYear: toCalendarYear(fiscalYear, month),
        totalSales,
        grossProfit: calcGrossProfit(totalSales, totalCosts),
        hasRecords: sales.length > 0 || costs.length > 0,
      }
    })

    status.value = FetchStatus.SUCCESS
  }

  return { summaries, status, errorMessage, fetchMonths }
}
