import { and, eq } from 'drizzle-orm'
import { performancePutRequestSchema } from '~/lib/schemas/api'
import { diffPerformance } from '../utils/performanceDiff'
import type { CurrentPerformanceRows } from '../utils/performanceDiff'
import { tCosts, tSales, tStatus } from '../db/schema'

/**
 * 実績（売上・費用・備考）の保存。
 *
 * composables/usePerformance.ts の savePerformance と同じ「洗い替えではなく
 * 差分で当てる」方針を、diffPerformance（純関数）+ サーバ Tx で再現する。
 * updated_by はボディで受け取らず、requireAppUser(event) の結果から導出する
 * （クライアントから任意の文字列を送れると、誰が更新したか偽装できてしまう）。
 */
export default defineEventHandler(async (event) => {
  const appUser = await requireAppUser(event)
  const updatedBy = `${appUser.familyName} ${appUser.firstName}`

  const body = await readValidatedBody(event, performancePutRequestSchema.parse)

  const scope = {
    fiscalYear: body.fiscalYear,
    month: body.month,
    projectId: body.projectId,
    updatedBy,
  }

  try {
    await useDb().transaction(async (tx) => {
      const salesScope = and(
        eq(tSales.fiscalYear, scope.fiscalYear),
        eq(tSales.month, scope.month),
        eq(tSales.projectId, scope.projectId),
      )
      const costsScope = and(
        eq(tCosts.fiscalYear, scope.fiscalYear),
        eq(tCosts.month, scope.month),
        eq(tCosts.projectId, scope.projectId),
      )

      const [currentSales, currentCostRows] = await Promise.all([
        tx
          .select({ id: tSales.id, category_small: tSales.categorySmall, amount: tSales.amount })
          .from(tSales)
          .where(salesScope),
        tx
          .select({
            id: tCosts.id,
            user_id: tCosts.userId,
            cost_type: tCosts.costType,
            work_hours: tCosts.workHours,
            unit_price: tCosts.unitPrice,
            amount: tCosts.amount,
          })
          .from(tCosts)
          .where(costsScope),
      ])

      // work_hours / unit_price は NOT NULL ではない（DEFAULT 0 のみ）ので null が返りうる。
      // CurrentCostRow は number 固定のため、composables/usePerformance.ts と同じく ?? 0 を通す。
      const currentCosts = currentCostRows.map((row) => ({
        ...row,
        work_hours: row.work_hours ?? 0,
        unit_price: row.unit_price ?? 0,
      }))

      const current: CurrentPerformanceRows = {
        sales: currentSales,
        costs: currentCosts,
        // diffPerformance は status.id 等を差分計算に使わない（常に upsert）ので null で足りる。
        status: null,
      }

      const desired = {
        sales: body.sales,
        costs: body.costs,
        managementId: body.managementId,
        managementAmount: body.managementAmount,
        duplicatedManagementIds: body.duplicatedManagementIds,
        remark: body.remark,
      }

      const diff = diffPerformance(current, desired, scope)

      // --- DELETE ---------------------------------------------------------
      if (diff.sales.toDelete.length > 0) {
        for (const id of diff.sales.toDelete) {
          await tx.delete(tSales).where(eq(tSales.id, id))
        }
      }
      if (diff.costs.toDelete.length > 0) {
        for (const id of diff.costs.toDelete) {
          await tx.delete(tCosts).where(eq(tCosts.id, id))
        }
      }

      // --- UPDATE（1行=1文。同じ月に同じ小項目が一時的に重複しないよう順序を守る） ---
      for (const row of diff.sales.toUpdate) {
        await tx
          .update(tSales)
          .set({ categorySmall: row.category_small, amount: row.amount })
          .where(eq(tSales.id, row.id))
      }

      for (const row of diff.costs.toUpdate) {
        // 稼働行はフル項目、管理費は amount のみの union 型なので分岐する。
        if ('cost_type' in row) {
          await tx
            .update(tCosts)
            .set({
              costType: row.cost_type,
              workHours: row.work_hours,
              workDays: row.work_days,
              unitPrice: row.unit_price,
              amount: row.amount,
            })
            .where(eq(tCosts.id, row.id))
        } else {
          await tx.update(tCosts).set({ amount: row.amount }).where(eq(tCosts.id, row.id))
        }
      }

      // --- INSERT ---------------------------------------------------------
      if (diff.sales.toInsert.length > 0) {
        await tx.insert(tSales).values(
          diff.sales.toInsert.map((row) => ({
            fiscalYear: row.fiscal_year,
            month: row.month,
            projectId: row.project_id,
            categorySmall: row.category_small,
            amount: row.amount,
          })),
        )
      }

      if (diff.costs.toInsert.length > 0) {
        await tx.insert(tCosts).values(
          diff.costs.toInsert.map((row) => ({
            fiscalYear: row.fiscal_year,
            month: row.month,
            projectId: row.project_id,
            userId: row.user_id,
            costType: row.cost_type,
            workHours: row.work_hours,
            workDays: row.work_days,
            unitPrice: row.unit_price,
            amount: row.amount,
          })),
        )
      }

      // --- status upsert ----------------------------------------------------
      // UNIQUE (fiscal_year, month, project_id) を競合ターゲットにする。
      await tx
        .insert(tStatus)
        .values({
          fiscalYear: diff.status.fiscal_year,
          month: diff.status.month,
          projectId: diff.status.project_id,
          remark: diff.status.remark,
          updatedBy: diff.status.updated_by,
        })
        .onConflictDoUpdate({
          target: [tStatus.fiscalYear, tStatus.month, tStatus.projectId],
          set: { remark: diff.status.remark, updatedBy: diff.status.updated_by },
        })
    })
  } catch (error) {
    toPgHttpError(error)
  }

  return { ok: true }
})
