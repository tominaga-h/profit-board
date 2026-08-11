import type { z } from 'zod'
import { fiscalYearInsertSchema } from './fiscalYear'

/** POST /api/fiscal-years のリクエストボディ検証。行スキーマと検証ルールを共有する。 */
export const fiscalYearCreateRequestSchema = fiscalYearInsertSchema

export type FiscalYearCreateRequest = z.infer<typeof fiscalYearCreateRequestSchema>
