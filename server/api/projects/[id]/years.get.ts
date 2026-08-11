import { asc, eq, sql } from 'drizzle-orm'
import { projectIdParamSchema } from '~/lib/schemas/api'
import { mFiscalYears, tCosts, tSales } from '../../../db/schema'

/**
 * プロジェクトの年度別サマリの集計素材を取得する。
 *
 * 年度カードは登録済みの年度マスタを常に全件出す（実績のない年度も0円で表示）ため、
 * m_fiscal_years を主とし、t_sales / t_costs は project_id で絞って
 * fiscal_year 単位に GROUP BY した SUM 行だけを返す。畳み込み（年度ごとの
 * 売上・粗利への集約）はクライアント（useProjectYears）側の責務。
 */
export default defineEventHandler(async (event) => {
  await requireAppUser(event)

  const { id } = await getValidatedRouterParams(event, projectIdParamSchema.parse)

  // sum() の戻りは SQL<string | null>。coalesce で「行なし = 0」を SQL 側で
  // 確定させ、numeric のまま受け取ってから後段で Number() に変換する
  // （amount は NUMERIC(12,0) で ::int キャストだとオーバーフローしうるため）。
  const amountSum = (column: typeof tSales.amount | typeof tCosts.amount) =>
    sql<string>`coalesce(sum(${column}), 0)`

  const db = useDb()

  const [years, salesRows, costsRows] = await Promise.all([
    db.select({ year: mFiscalYears.year }).from(mFiscalYears).orderBy(asc(mFiscalYears.year)),
    db
      .select({ fiscal_year: tSales.fiscalYear, amount: amountSum(tSales.amount) })
      .from(tSales)
      .where(eq(tSales.projectId, id))
      .groupBy(tSales.fiscalYear),
    db
      .select({ fiscal_year: tCosts.fiscalYear, amount: amountSum(tCosts.amount) })
      .from(tCosts)
      .where(eq(tCosts.projectId, id))
      .groupBy(tCosts.fiscalYear),
  ])

  const toNumberRows = <T extends { amount: string }>(rows: readonly T[]) =>
    rows.map((row) => ({ ...row, amount: Number(row.amount) }))

  return {
    years,
    sales: toNumberRows(salesRows),
    costs: toNumberRows(costsRows),
  }
})
