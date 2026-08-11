import { asc, inArray, sql } from 'drizzle-orm'
import { dashboardQuerySchema } from '~/lib/schemas/api'
import { mProjects, tCosts, tSales } from '../db/schema'

/**
 * 当年度・前年度ダッシュボードの集計素材を取得する。
 *
 * 明細行を丸ごと返さず、SQL 側で年度×月×プロジェクト単位に GROUP BY した
 * 集計済み行だけを返す。buildDashboardData は amount を合計するだけの
 * 純関数なので、明細の代わりに SUM 済みの行を入力しても結果は変わらない
 * （和の和は和）。
 *
 * buildDashboardData の呼び出しはクライアント（useDashboard）側で行う。
 * 戻り値の DashboardData は Map（byMonth）を含み、サーバから JSON で返すと
 * Map が {} に潰れて ProjectMatrix が壊れるため、サーバで畳み込んではいけない。
 *
 * select は列を明示して snake_case で返す。buildDashboardData が期待する
 * PerformanceRow / DashboardProject の形に合わせないと集計が壊れる。
 */
export default defineEventHandler(async (event) => {
  await requireAppUser(event)

  const { fiscalYear } = await getValidatedQuery(event, dashboardQuerySchema.parse)
  const years = [fiscalYear, fiscalYear - 1]

  const db = useDb()

  // sum() の戻りは SQL<string | null>（numeric 集約は PostgreSQL がテキストで返すため）。
  // amount は NUMERIC(12,0)（1行最大 約1兆）なので、月×年度分を足し合わせると
  // ::int（上限約21億）はオーバーフローしうる。coalesce で「行なし = 0」を SQL 側で
  // 確定させつつ、numeric のまま受け取り、後段で Number() に変換する。
  const amountSum = (column: typeof tSales.amount | typeof tCosts.amount) =>
    sql<string>`coalesce(sum(${column}), 0)`

  const groupCols = <T extends typeof tSales | typeof tCosts>(table: T) => ({
    fiscal_year: table.fiscalYear,
    month: table.month,
    project_id: table.projectId,
  })

  const [projects, salesRows, costsRows] = await Promise.all([
    db
      .select({
        id: mProjects.id,
        service_name: mProjects.serviceName,
        company_name: mProjects.companyName,
      })
      .from(mProjects)
      .orderBy(asc(mProjects.id)),
    db
      .select({ ...groupCols(tSales), amount: amountSum(tSales.amount) })
      .from(tSales)
      .where(inArray(tSales.fiscalYear, years))
      .groupBy(tSales.fiscalYear, tSales.month, tSales.projectId),
    db
      .select({ ...groupCols(tCosts), amount: amountSum(tCosts.amount) })
      .from(tCosts)
      .where(inArray(tCosts.fiscalYear, years))
      .groupBy(tCosts.fiscalYear, tCosts.month, tCosts.projectId),
  ])

  // amount は SQL では numeric の文字列表現のまま届く。buildDashboardData は
  // number 前提の純関数なので、返す前にここで number へ変換する
  // （列定義の mode: 'number' は集約結果には効かない）。
  const toNumberRows = <T extends { amount: string }>(rows: readonly T[]) =>
    rows.map((row) => ({ ...row, amount: Number(row.amount) }))

  return {
    projects,
    sales: toNumberRows(salesRows),
    costs: toNumberRows(costsRows),
  }
})
