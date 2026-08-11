import { asc } from 'drizzle-orm'
import { mUsers } from '../db/schema'

/**
 * m_users 全件。既存の useMembers と同じ「ID 昇順」で返す。
 *
 * select は列を明示して snake_case で返す。クライアント型（database.types.ts 由来）は
 * snake_case であり、Drizzle スキーマの camelCase プロパティ名のまま返すと
 * 全フィールドが undefined になって画面が壊れる。
 */
export default defineEventHandler(async (event) => {
  await requireAppUser(event)

  return await useDb()
    .select({
      id: mUsers.id,
      family_name: mUsers.familyName,
      first_name: mUsers.firstName,
      email: mUsers.email,
      unit_price: mUsers.unitPrice,
      created_at: mUsers.createdAt,
      updated_at: mUsers.updatedAt,
    })
    .from(mUsers)
    .orderBy(asc(mUsers.id))
})
