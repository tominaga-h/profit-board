import { z } from 'zod'
import { fiscalYearInsertSchema } from './fiscalYear'
import { memberRowSchema } from './member'
import { projectRowSchema } from './project'
import { costRowSchema, managementCostRowSchema, salesRowSchema } from './performance'

/** POST /api/fiscal-years のリクエストボディ検証。行スキーマと検証ルールを共有する。 */
export const fiscalYearCreateRequestSchema = fiscalYearInsertSchema

export type FiscalYearCreateRequest = z.infer<typeof fiscalYearCreateRequestSchema>

/**
 * PUT /api/members のリクエストボディ検証。
 *
 * id が null の行は新規追加（INSERT）、値がある行は更新（UPDATE）として扱う。
 * 行内容の検証ルールは memberRowSchema（画面の入力検証）とサーバでずらさないよう共有する。
 */
export const memberPutRequestSchema = z.object({
  drafts: z.array(memberRowSchema.extend({ id: z.number().int().positive().nullable() })),
  deletedIds: z.array(z.number().int().positive()),
})

export type MemberPutRequest = z.infer<typeof memberPutRequestSchema>

/** GET /api/members/[id]/has-costs のルートパラメータ検証。 */
export const memberIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * PUT /api/projects のリクエストボディ検証。
 *
 * id が null の行は新規追加（INSERT）、値がある行は更新（UPDATE）として扱う。
 * 行内容の検証ルールは projectRowSchema（画面の入力検証）とサーバでずらさないよう共有する。
 */
export const projectPutRequestSchema = z.object({
  drafts: z.array(projectRowSchema.extend({ id: z.number().int().positive().nullable() })),
  deletedIds: z.array(z.number().int().positive()),
})

export type ProjectPutRequest = z.infer<typeof projectPutRequestSchema>

/** GET /api/projects/[id]/has-performance のルートパラメータ検証。 */
export const projectIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * GET /api/performance のクエリ検証。
 *
 * fiscalYearInsertSchema と範囲を揃える（年度の妥当値は1ヶ所でしか決めない）。
 * クエリ文字列はそのままでは string なので z.coerce.number() で数値化する。
 */
export const performanceQuerySchema = z.object({
  fiscalYear: z.coerce.number().int().min(1900).max(2999),
  month: z.coerce.number().int().min(1).max(12),
  projectId: z.coerce.number().int().positive(),
})

export type PerformanceQuery = z.infer<typeof performanceQuerySchema>

/**
 * PUT /api/performance のリクエストボディ検証。
 *
 * DesiredPerformanceState（server/utils/performanceDiff.ts）と対応する形。
 * updated_by は受け取らない。改竄可能な入力を信用せず、サーバ側で
 * requireAppUser(event) の結果から導出するため。
 */
export const performancePutRequestSchema = z.object({
  fiscalYear: z.coerce.number().int().min(1900).max(2999),
  month: z.coerce.number().int().min(1).max(12),
  projectId: z.coerce.number().int().positive(),
  sales: z.array(salesRowSchema.extend({ id: z.number().int().positive().nullable() })),
  costs: z.array(
    costRowSchema.extend({
      id: z.number().int().positive().nullable(),
      user_id: z.number().int().positive(),
    }),
  ),
  managementId: z.number().int().positive().nullable(),
  managementAmount: managementCostRowSchema.shape.amount,
  duplicatedManagementIds: z.array(z.number().int().positive()),
  remark: z.string(),
})

export type PerformancePutRequest = z.infer<typeof performancePutRequestSchema>
