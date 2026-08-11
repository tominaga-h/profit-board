import { desc } from 'drizzle-orm'
import { mFiscalYears } from '../db/schema'

/** 年度マスタ全件。既存の useFiscalYears と同じ「年度降順」で返す。 */
export default defineEventHandler(async (event) => {
  await requireAppUser(event)

  return await useDb()
    .select({ id: mFiscalYears.id, year: mFiscalYears.year })
    .from(mFiscalYears)
    .orderBy(desc(mFiscalYears.year))
})
