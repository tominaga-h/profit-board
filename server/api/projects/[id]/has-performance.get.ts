import { sql } from 'drizzle-orm'
import { projectIdParamSchema } from '~/lib/schemas/api'

/**
 * 指定プロジェクトに実績（t_sales / t_costs / t_status のいずれか）が
 * 1件でもあるかを判定する。削除制御に使う。
 *
 * t_status も対象に含める。仕様の文言は t_sales / t_costs だけだが、
 * t_status も project_id の外部キーを持ち（server/db/schema.ts tStatus）、
 * ここから漏らすと「削除できます」と見せてから保存時に FK 違反で落ちる。
 *
 * EXISTS ×3 を OR で束ねた1クエリにする。count を3本打つより往復が1回で済み、
 * どのテーブルも「1件見つかった時点で打ち切り」の EXISTS なので全件走査を避けられる。
 */
export default defineEventHandler(async (event) => {
  await requireAppUser(event)

  const { id } = await getValidatedRouterParams(event, projectIdParamSchema.parse)

  const [row] = await useDb().execute<{ has_records: boolean }>(sql`
    select
      exists(select 1 from t_sales where project_id = ${id})
      or exists(select 1 from t_costs where project_id = ${id})
      or exists(select 1 from t_status where project_id = ${id})
      as has_records
  `)

  return { hasRecords: row?.has_records ?? false }
})
