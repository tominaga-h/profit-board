import { asc } from 'drizzle-orm'
import { mProjects } from '../db/schema'

/**
 * m_projects 全件。既存の useProjects と同じ「ID 昇順」で返す。
 *
 * select は列を明示して snake_case で返す。クライアント型（database.types.ts 由来）は
 * snake_case であり、Drizzle スキーマの camelCase プロパティ名のまま返すと
 * 全フィールドが undefined になって画面が壊れる。
 */
export default defineEventHandler(async (event) => {
  await requireAppUser(event)

  return await useDb()
    .select({
      id: mProjects.id,
      service_name: mProjects.serviceName,
      company_name: mProjects.companyName,
      created_at: mProjects.createdAt,
      updated_at: mProjects.updatedAt,
    })
    .from(mProjects)
    .orderBy(asc(mProjects.id))
})
