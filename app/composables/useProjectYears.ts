import type { FetchError } from 'ofetch'
import { FetchStatus } from '~/lib/fetchStatus'
import { calcGrossProfit } from '~/lib/calc'
import { PG_ERROR_CODE } from '~/lib/pgErrorCodes'

/** 年度カード1枚分。年度マスタの行に、その年度の実績集計を添えたもの。 */
export type ProjectYearSummary = {
  year: number
  totalSales: number
  grossProfit: number
}

/** 年度追加の結果。失敗理由を画面に出し分けるため、真偽値ではなくメッセージを返す。 */
export type AddYearResult = { ok: true } | { ok: false; message: string }

/** /api/projects/[id]/years が返す集計素材（年度で SUM 済みの行）。 */
type ProjectYearsSourceResponse = {
  years: { year: number }[]
  sales: { fiscal_year: number; amount: number }[]
  costs: { fiscal_year: number; amount: number }[]
}

/**
 * 対象プロジェクトの年度一覧と、年度ごとの年間売上・年間粗利。
 *
 * /api/projects/[id]/years（server/api/projects/[id]/years.get.ts）が SQL の
 * GROUP BY で年度単位の SUM 済み行まで絞り、畳み込みはここで行う。
 */
export const useProjectYears = (projectId: number) => {
  const summaries = ref<ProjectYearSummary[]>([])
  const status = ref<FetchStatus>(FetchStatus.IDLE)
  const errorMessage = ref<string | null>(null)

  const fetchYears = async (): Promise<void> => {
    status.value = FetchStatus.LOADING
    errorMessage.value = null

    try {
      const source = await $fetch<ProjectYearsSourceResponse>(
        `/api/projects/${projectId}/years`,
      )

      const salesByYear = new Map(source.sales.map((row) => [row.fiscal_year, row.amount]))
      const costsByYear = new Map(source.costs.map((row) => [row.fiscal_year, row.amount]))

      summaries.value = source.years
        .map(({ year }) => {
          const totalSales = salesByYear.get(year) ?? 0
          const totalCosts = costsByYear.get(year) ?? 0
          return { year, totalSales, grossProfit: calcGrossProfit(totalSales, totalCosts) }
        })
        // 年度マスタは昇順で届く。カード表示は新しい年度から並べる。
        .sort((a, b) => b.year - a.year)

      status.value = FetchStatus.SUCCESS
    } catch (error) {
      console.error('[useProjectYears] 年度情報の取得に失敗しました', error)
      summaries.value = []
      errorMessage.value = '年度情報を取得できませんでした。時間をおいて再度お試しください。'
      status.value = FetchStatus.ERROR
    }
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
      await $fetch('/api/fiscal-years', { method: 'POST', body: { year } })

      await fetchYears()
      return { ok: true }
    } catch (error) {
      console.error('[useProjectYears] 年度の追加に失敗しました', error)
      // h3 の createError({ data }) は sendError で { data: { pgCode } } として
      // レスポンスに載る。ofetch の FetchError.data はそのレスポンス本体を指すため、
      // pgCode は error.data.data に入る（実挙動で確認済み）。
      const pgCode = (error as FetchError)?.data?.data?.pgCode
      return {
        ok: false,
        message:
          pgCode === PG_ERROR_CODE.UNIQUE_VIOLATION
            ? `${year}年度は既に登録されています。`
            : '年度の追加に失敗しました。',
      }
    } finally {
      isAdding.value = false
    }
  }

  return { summaries, status, errorMessage, fetchYears, isAdding, addYear }
}
