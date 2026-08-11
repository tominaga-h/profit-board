import { z } from 'zod'

/** 年度マスタ1行の追加検証。 */
export const fiscalYearInsertSchema = z.object({
  year: z.number().int().min(1900).max(2999),
})

export type FiscalYearInsert = z.infer<typeof fiscalYearInsertSchema>
