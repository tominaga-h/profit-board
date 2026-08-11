import { fiscalYearCreateRequestSchema } from '~/lib/schemas/api'
import { mFiscalYears } from '../db/schema'

/** 年度マスタへの1件追加。year の重複は pgError 経由で 409 に変換する。 */
export default defineEventHandler(async (event) => {
  await requireAppUser(event)

  // h3 の readValidatedBody は fn の戻り値が真偽値以外だとそのまま body として使う
  // （safeParse の結果オブジェクトを返しても失敗を検知しない）。schema.parse を渡すことで
  // 失敗時に ZodError を throw させ、h3 側の catch で 400 に変換させる。
  const body = await readValidatedBody(event, fiscalYearCreateRequestSchema.parse)

  try {
    await useDb().insert(mFiscalYears).values({ year: body.year })
  } catch (error) {
    toPgHttpError(error)
  }

  return { ok: true }
})
