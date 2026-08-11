import type { H3Event } from 'h3'
import type { InferSelectModel } from 'drizzle-orm'
import { eq } from 'drizzle-orm'
import { serverSupabaseUser } from '#supabase/server'
import { mUsers } from '../db/schema'

export type AppUser = InferSelectModel<typeof mUsers>

declare module 'h3' {
  interface H3EventContext {
    appUser?: AppUser
  }
}

/**
 * リクエストの認証・認可を解決し、m_users の該当行を返す。
 *
 * この API サーバの DB 接続は RLS を通らない（テーブルオーナー接続）ため、
 * ここでの照合が唯一の防御線になる。RLS の is_app_user() と同じ判定
 * （トップレベル email クレームを m_users.email に等価一致）を再現する。
 */
export const requireAppUser = async (event: H3Event): Promise<AppUser> => {
  if (event.context.appUser) {
    return event.context.appUser
  }

  // serverSupabaseUser は statusCode 未指定の createError（＝500）を投げることがある。
  // 認可の失敗理由を401に統一するため、ここで捕まえて丸める。
  let claims
  try {
    claims = await serverSupabaseUser(event)
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  if (!claims) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // user_metadata.email は updateUser() で本人が書き換えられるため使わない。
  // is_app_user() と同じくトップレベルの email クレームのみを信頼する。
  const email = claims.email
  if (!email) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const [row] = await useDb()
    .select()
    .from(mUsers)
    .where(eq(mUsers.email, email))
    .limit(1)

  if (!row) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  event.context.appUser = row
  return row
}
