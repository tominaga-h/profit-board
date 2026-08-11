// PostgresError は named export ではなく、postgres 関数（default export）の静的
// プロパティとして提供される（node_modules/postgres/src/index.js の Object.assign）。
import postgres from 'postgres'
import { PG_ERROR_CODE } from '~/lib/pgErrorCodes'

/** members/projects/performance でも共有する Postgres エラーコード → HTTP 409 の対応表。 */
const CONFLICT_CODES: Set<string> = new Set(Object.values(PG_ERROR_CODE))

/**
 * Postgres のエラーコードを HTTP エラーへ変換する。
 *
 * UNIQUE 違反・FK 違反は呼び出し元がユーザー向けメッセージを組み立てられるよう
 * pgCode を data に載せて 409 にする。対象外のエラーはそのまま再 throw し、
 * 呼び出し元の catch を素通りさせて 500 として処理させる。
 */
export const toPgHttpError = (error: unknown): never => {
  if (error instanceof postgres.PostgresError && CONFLICT_CODES.has(error.code)) {
    throw createError({ statusCode: 409, data: { pgCode: error.code } })
  }
  throw error
}
