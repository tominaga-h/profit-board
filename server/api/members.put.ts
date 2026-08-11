import { eq, inArray } from 'drizzle-orm'
import { memberPutRequestSchema } from '~/lib/schemas/api'
import { mUsers } from '../db/schema'

/**
 * メンバー一覧の一括保存。DELETE → UPDATE → INSERT の順で1トランザクションに束ねる。
 *
 * 削除を先にするのは、消したメンバーのメールアドレスを別の行に付け替えるケースがあるため。
 * 同一 Tx 内でも UNIQUE 制約（m_users_email_key）は文単位で即時評価されるので、
 * 順序を変えると一時的に同じメールが2行存在する状態になり得る。
 */
export default defineEventHandler(async (event) => {
  await requireAppUser(event)

  const body = await readValidatedBody(event, memberPutRequestSchema.parse)

  try {
    await useDb().transaction(async (tx) => {
      if (body.deletedIds.length > 0) {
        await tx.delete(mUsers).where(inArray(mUsers.id, body.deletedIds))
      }

      // 1行 = 1 UPDATE 文のループにする。複数行をまとめた1文にすると、
      // 文の実行途中で一時的な email 重複が生じ得る（UNIQUE 制約は文単位で評価されるため）。
      // 1行1文なら、ある行の UPDATE が終わってから次の行の UPDATE が評価されるので発生しない。
      const updates = body.drafts.filter(
        (draft): draft is typeof draft & { id: number } => draft.id !== null,
      )
      for (const draft of updates) {
        await tx
          .update(mUsers)
          .set({
            familyName: draft.family_name,
            firstName: draft.first_name,
            email: draft.email,
            unitPrice: draft.unit_price,
          })
          .where(eq(mUsers.id, draft.id))
      }

      const added = body.drafts.filter((draft) => draft.id === null)
      if (added.length > 0) {
        await tx.insert(mUsers).values(
          added.map((draft) => ({
            familyName: draft.family_name,
            firstName: draft.first_name,
            email: draft.email,
            unitPrice: draft.unit_price,
          })),
        )
      }
    })
  } catch (error) {
    toPgHttpError(error)
  }

  return { ok: true }
})
