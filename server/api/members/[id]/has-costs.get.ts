import { eq } from 'drizzle-orm'
import { memberIdParamSchema } from '~/lib/schemas/api'
import { tCosts } from '../../../db/schema'

/** 指定メンバーに費用実績（t_costs）が1件でもあるかを判定する。削除制御に使う。 */
export default defineEventHandler(async (event) => {
  await requireAppUser(event)

  const { id } = await getValidatedRouterParams(event, memberIdParamSchema.parse)

  const [row] = await useDb()
    .select({ id: tCosts.id })
    .from(tCosts)
    .where(eq(tCosts.userId, id))
    .limit(1)

  return { hasRecords: row !== undefined }
})
