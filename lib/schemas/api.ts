import { z } from 'zod'
import { fiscalYearInsertSchema } from './fiscalYear'
import { memberRowSchema } from './member'
import { projectRowSchema } from './project'

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
