import { defineConfig } from 'drizzle-kit'

// pull（drift 検知）専用の設定。
// スキーマ変更の唯一の正は supabase/migrations/*.sql であり、
// drizzle-kit generate / push / migrate は使わないこと（2系統から
// スキーマ変更が走ると、どちらの SQL が正か分からなくなる）。
export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  // pull の出力は作業用フォルダ（gitignore 済み）へ隔離する。
  // server/db に向けると手メンテの schema.ts が上書きされ、
  // migration 用の SQL / meta も毎回生成されてしまう。
  out: './.drizzle-pull',
  // pull は Supavisor session mode（:5432）を使う。transaction mode は
  // drizzle-kit の introspection と相性が悪い。
  dbCredentials: { url: process.env.DIRECT_DATABASE_URL! },
  schemaFilter: ['public'],
})
