/**
 * Postgres エラーコード（SQLSTATE）。
 *
 * サーバ（server/utils/pgError.ts）とクライアント（composables）の双方で
 * 同じコード値を参照するための共有定義。マジックナンバーでの比較を避ける。
 */
export const PG_ERROR_CODE = {
  /** unique_violation */
  UNIQUE_VIOLATION: '23505',
  /** foreign_key_violation */
  FOREIGN_KEY_VIOLATION: '23503',
} as const
