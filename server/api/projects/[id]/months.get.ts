import { and, eq, sql } from 'drizzle-orm'
import { dashboardQuerySchema, projectIdParamSchema } from '~/lib/schemas/api'
import { tCosts, tSales } from '../../../db/schema'

/**
 * プロジェクト×年度の月別サマリの集計素材を取得する。
 *
 * 月カードは年度内の12ヶ月を必ず全部出す（未入力月も「-」で表示）ため、
 * 月の並び自体は既存の FISCAL_MONTHS（クライアント）が担う。ここでは
 * project_id / fiscal_year で絞った t_sales / t_costs を month 単位に
 * GROUP BY した SUM 行だけを返す。畳み込みは useProjectMonths 側の責務。
 *
 * クエリ検証は dashboardQuerySchema を流用する（fiscalYear 単体の検証ルールは
 * 既にそこで定義済みのため、年度の妥当値を複数箇所で定義しない）。
 */
export default defineEventHandler(async (event) => {
  await requireAppUser(event)

  const { id } = await getValidatedRouterParams(event, projectIdParamSchema.parse)
  const { fiscalYear } = await getValidatedQuery(event, dashboardQuerySchema.parse)

  const db = useDb()

  // sum() の戻りは SQL<string | null>。coalesce で「行なし = 0」を SQL 側で
  // 確定させ、numeric のまま受け取ってから後段で Number() に変換する
  // （amount は NUMERIC(12,0) で ::int キャストだとオーバーフローしうるため）。
  const amountSum = (column: typeof tSales.amount | typeof tCosts.amount) =>
    sql<string>`coalesce(sum(${column}), 0)`

  const [salesRows, costsRows] = await Promise.all([
    db
      .select({ month: tSales.month, amount: amountSum(tSales.amount) })
      .from(tSales)
      .where(and(eq(tSales.projectId, id), eq(tSales.fiscalYear, fiscalYear)))
      .groupBy(tSales.month),
    db
      .select({ month: tCosts.month, amount: amountSum(tCosts.amount) })
      .from(tCosts)
      .where(and(eq(tCosts.projectId, id), eq(tCosts.fiscalYear, fiscalYear)))
      .groupBy(tCosts.month),
  ])

  const toNumberRows = <T extends { amount: string }>(rows: readonly T[]) =>
    rows.map((row) => ({ ...row, amount: Number(row.amount) }))

  return {
    sales: toNumberRows(salesRows),
    costs: toNumberRows(costsRows),
  }
})
