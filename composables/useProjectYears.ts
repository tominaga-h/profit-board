import type { Database } from '~/types/database.types'
import { FetchStatus } from '~/lib/fetchStatus'
import { calcGrossProfit, sumAmount } from '~/lib/calc'

/** 年度カード1枚分。年度マスタの行に、その年度の実績集計を添えたもの。 */
export type ProjectYearSummary = {
  year: number
  totalSales: number
  grossProfit: number
}

/** 年度追加の結果。失敗理由を画面に出し分けるため、真偽値ではなくメッセージを返す。 */
export type AddYearResult = { ok: true } | { ok: false; message: string }

/**
 * 対象プロジェクトの年度一覧と、年度ごとの年間売上・年間粗利。
 *
 * 年度ごとにクエリを投げず、project_id だけで全年度分を取ってから畳む。
 * 年度 N 件で 2N 回の往復になるのを避けるため。
 */
export const useProjectYears = (projectId: number) => {
  const supabase = useSupabaseClient<Database>()

  const summaries = ref<ProjectYearSummary[]>([])
  const status = ref<FetchStatus>(FetchStatus.IDLE)
  const errorMessage = ref<string | null>(null)

  const fetchYears = async (): Promise<void> => {
    status.value = FetchStatus.LOADING
    errorMessage.value = null

    const [yearsResult, salesResult, costsResult] = await Promise.all([
      supabase.from('m_fiscal_years').select('year').order('year', { ascending: false }),
      supabase.from('t_sales').select('fiscal_year, amount').eq('project_id', projectId),
      supabase.from('t_costs').select('fiscal_year, amount').eq('project_id', projectId),
    ])

    const failed = yearsResult.error ?? salesResult.error ?? costsResult.error
    if (failed) {
      console.error('[useProjectYears] 年度情報の取得に失敗しました', failed)
      summaries.value = []
      errorMessage.value = '年度情報を取得できませんでした。時間をおいて再度お試しください。'
      status.value = FetchStatus.ERROR
      return
    }

    const groupByYear = (rows: { fiscal_year: number; amount: number }[]) => {
      const byYear = new Map<number, { amount: number }[]>()
      for (const row of rows) {
        const bucket = byYear.get(row.fiscal_year)
        if (bucket) bucket.push(row)
        else byYear.set(row.fiscal_year, [row])
      }
      return byYear
    }

    const salesByYear = groupByYear(salesResult.data ?? [])
    const costsByYear = groupByYear(costsResult.data ?? [])

    summaries.value = (yearsResult.data ?? []).map(({ year }) => {
      const totalSales = sumAmount(salesByYear.get(year) ?? [])
      const totalCosts = sumAmount(costsByYear.get(year) ?? [])
      return { year, totalSales, grossProfit: calcGrossProfit(totalSales, totalCosts) }
    })

    status.value = FetchStatus.SUCCESS
  }

  const isAdding = ref(false)

  /**
   * 年度マスタに1年度を追加する。
   *
   * 重複は事前に問い合わせず 23505 を捕まえる。確認と INSERT の間に
   * 他の利用者が同じ年度を登録する競合を、往復を増やさずに塞げる。
   */
  const addYear = async (year: number): Promise<AddYearResult> => {
    isAdding.value = true

    try {
      const { error } = await supabase.from('m_fiscal_years').insert({ year })

      if (error) {
        console.error('[useProjectYears] 年度の追加に失敗しました', error)
        return {
          ok: false,
          message:
            error.code === '23505'
              ? `${year}年度は既に登録されています。`
              : '年度の追加に失敗しました。',
        }
      }

      await fetchYears()
      return { ok: true }
    } finally {
      isAdding.value = false
    }
  }

  return { summaries, status, errorMessage, fetchYears, isAdding, addYear }
}
