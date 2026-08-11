export default defineNuxtConfig({
  compatibilityDate: '2026-08-09',

  future: { compatibilityVersion: 4 },

  // SPEC 2章: SPAモード
  ssr: false,

  devtools: { enabled: true },

  typescript: {
    strict: true,
    // build 時に vue-tsc が走り、型エラーがあればビルドが失敗する。
    // tests/ も .nuxt/tsconfig.json の include（../**/*）に入るため対象になる。
    typeCheck: true,
    tsConfig: {
      compilerOptions: {
        // compatibilityVersion: 4 は既定でこれを有効化するが、
        // 既存コードの型エラー修正はこのリファクタの範囲外のため v3 の挙動を維持する。
        noUncheckedIndexedAccess: false,
      },
    },
  },

  // @nuxtjs/tailwindcss・@nuxt/icon・@nuxtjs/color-mode は
  // @nuxt/ui が installModule で自動登録するため、ここには書かない（二重登録になる）。
  modules: ['@nuxt/ui', '@nuxtjs/supabase'],

  runtimeConfig: {
    // Drizzle が使う DB 接続文字列。.env の NUXT_DATABASE_URL で上書きされる。
    // DB パスワードを含むため public に置かないこと（クライアントバンドルに露出する）。
    databaseUrl: '',
  },

  supabase: {
    // 既定値 '~/types/database.types.ts' は srcDir（app/）基準になり、
    // ルート直下の types/database.types.ts を見失って Database = unknown に
    // フォールバックしてしまうため、~~（プロジェクトルート）基準で明示する。
    types: '~~/types/database.types.ts',

    // url / key は .env の SUPABASE_URL / SUPABASE_KEY から読まれる
    // （モジュールは NUXT_PUBLIC_SUPABASE_* を優先し、無ければこちらにフォールバックする）。

    // ■ useSsrCookies（既定 true）を false にしないこと
    //   セッションが cookie ではなく localStorage に保存されるようになり、
    //   /api/** への $fetch にセッションが乗らず全 API ルートが 401 になる。
    //   サーバ側の requireAppUser は cookie からのセッション復元に依存している。

    // ■ 内蔵リダイレクトを無効化する理由
    //   内蔵の global-auth ミドルウェアは「セッションの有無」しか見ない。
    //   ProfitBoard の要件（SPEC 3.1）は「認証済み かつ m_users に登録済み」なので、
    //   これに任せると未登録のGoogleアカウントでも全画面に入れてしまう。
    //   判定は middleware/auth.global.ts に一本化する。
    redirect: false,

    clientOptions: {
      auth: {
        // OAuth のコールバックURL（/confirm）に付く ?code=... を検知して
        // 自動でセッションに交換させる。SPAなのでサーバ側の処理は挟まない。
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    },
  },

  // デザインは白基調のライトテーマのみ。SPEC にダークモードの要件はないため、
  // OS のカラースキーム追従（@nuxtjs/color-mode の既定）を無効化して固定する。
  colorMode: {
    // オプション名は preference（preferred ではない）。
    // 誤った名前は黙って無視されるため、OS がダークだと画面が暗転してしまう。
    preference: 'light',
    fallback: 'light',
  },

  app: {
    head: {
      title: 'ProfitBoard',
      htmlAttrs: { lang: 'ja' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
})
