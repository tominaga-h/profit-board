import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema'

// モジュールスコープで1回だけ生成するシングルトン。
// サーバレスでは関数インスタンスごとに再利用され、リクエストごとの接続生成を避ける。
let db: PostgresJsDatabase<typeof schema> | undefined

export const useDb = (): PostgresJsDatabase<typeof schema> => {
  if (!db) {
    const client = postgres(useRuntimeConfig().databaseUrl, {
      // 接続先は Supavisor transaction mode（:6543）。
      // prepared statement は transaction mode では使えないため false 必須。
      prepare: false,
      // max: 1 だと並列リクエストのクエリキューが詰まってハングする
      max: 5,
      // サーバレスでの接続リーク防止
      idle_timeout: 20,
      connect_timeout: 10,
    })
    db = drizzle(client, { schema })
  }
  return db
}
