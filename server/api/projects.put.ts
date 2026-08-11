import { eq, inArray } from 'drizzle-orm'
import { projectPutRequestSchema } from '~/lib/schemas/api'
import { mProjects } from '../db/schema'

/**
 * プロジェクト一覧の一括保存。DELETE → UPDATE → INSERT の順で1トランザクションに束ねる。
 *
 * m_projects には UNIQUE 制約が一切なく、この順序に必然性はない。
 * useMembers（m_users は email に UNIQUE 制約があり、削除→更新の順が必要）と
 * 構造を揃えるためにこの順序にしている。
 */
export default defineEventHandler(async (event) => {
  await requireAppUser(event)

  const body = await readValidatedBody(event, projectPutRequestSchema.parse)

  try {
    await useDb().transaction(async (tx) => {
      if (body.deletedIds.length > 0) {
        await tx.delete(mProjects).where(inArray(mProjects.id, body.deletedIds))
      }

      // 1行 = 1 UPDATE 文のループにする。UNIQUE 制約がないため必然性はないが、
      // useMembers と構造を揃える。
      const updates = body.drafts.filter(
        (draft): draft is typeof draft & { id: number } => draft.id !== null,
      )
      for (const draft of updates) {
        await tx
          .update(mProjects)
          .set({
            serviceName: draft.service_name,
            companyName: draft.company_name,
          })
          .where(eq(mProjects.id, draft.id))
      }

      const added = body.drafts.filter((draft) => draft.id === null)
      if (added.length > 0) {
        await tx.insert(mProjects).values(
          added.map((draft) => ({
            serviceName: draft.service_name,
            companyName: draft.company_name,
          })),
        )
      }
    })
  } catch (error) {
    toPgHttpError(error)
  }

  return { ok: true }
})
