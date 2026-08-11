import { and, asc, eq } from 'drizzle-orm'
import { performanceQuerySchema } from '~/lib/schemas/api'
import { tCosts, tSales, tStatus } from '../db/schema'

/**
 * 指定した年度×月×プロジェクトの実績を取得する。
 *
 * select は列を明示して snake_case で返す。composables/usePerformance.ts の
 * fetchPerformance が PostgREST から受け取っていたのと同じ形（列・並び順）に
 * 揃えないと、クライアント側の組み立て処理（buildCostDrafts 等）が壊れる。
 */
export default defineEventHandler(async (event) => {
  await requireAppUser(event)

  const { fiscalYear, month, projectId } = await getValidatedQuery(
    event,
    performanceQuerySchema.parse,
  )

  const scope = and(
    eq(tSales.fiscalYear, fiscalYear),
    eq(tSales.month, month),
    eq(tSales.projectId, projectId),
  )
  const costScope = and(
    eq(tCosts.fiscalYear, fiscalYear),
    eq(tCosts.month, month),
    eq(tCosts.projectId, projectId),
  )
  const statusScope = and(
    eq(tStatus.fiscalYear, fiscalYear),
    eq(tStatus.month, month),
    eq(tStatus.projectId, projectId),
  )

  const db = useDb()

  const [sales, costs, statusRows] = await Promise.all([
    db
      .select({
        id: tSales.id,
        fiscal_year: tSales.fiscalYear,
        month: tSales.month,
        project_id: tSales.projectId,
        category_small: tSales.categorySmall,
        amount: tSales.amount,
        created_at: tSales.createdAt,
        updated_at: tSales.updatedAt,
      })
      .from(tSales)
      .where(scope)
      .orderBy(asc(tSales.id)),
    db
      .select({
        id: tCosts.id,
        fiscal_year: tCosts.fiscalYear,
        month: tCosts.month,
        project_id: tCosts.projectId,
        user_id: tCosts.userId,
        cost_type: tCosts.costType,
        work_hours: tCosts.workHours,
        work_days: tCosts.workDays,
        unit_price: tCosts.unitPrice,
        amount: tCosts.amount,
        created_at: tCosts.createdAt,
        updated_at: tCosts.updatedAt,
      })
      .from(tCosts)
      .where(costScope)
      .orderBy(asc(tCosts.id)),
    db
      .select({
        id: tStatus.id,
        fiscal_year: tStatus.fiscalYear,
        month: tStatus.month,
        project_id: tStatus.projectId,
        remark: tStatus.remark,
        updated_by: tStatus.updatedBy,
        created_at: tStatus.createdAt,
        updated_at: tStatus.updatedAt,
      })
      .from(tStatus)
      .where(statusScope)
      .limit(1),
  ])

  return {
    sales,
    costs,
    status: statusRows[0] ?? null,
  }
})
