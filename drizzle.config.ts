import { defineConfig } from 'drizzle-kit'

// pull（drift 検知）専用の設定。
// スキーマ変更の唯一の正は supabase/migrations/*.sql であり、
// drizzle-kit generate / push / migrate は使わないこと（2系統から
// スキーマ変更が走ると、どちらの SQL が正か分からなくなる）。
export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db',
  // pull は Supavisor session mode（:5432）を使う。transaction mode は
  // drizzle-kit の introspection と相性が悪い。
  dbCredentials: { url: process.env.DIRECT_DATABASE_URL! },
  schemaFilter: ['public'],
})
