export default defineNuxtConfig({
  compatibilityDate: '2026-08-09',

  // SPEC 2章: SPAモード
  ssr: false,

  devtools: { enabled: true },

  typescript: {
    strict: true,
    // Task 1 の検証は build 成功。型チェックは Task 4 以降で有効化する。
    typeCheck: false,
  },

  // @nuxtjs/tailwindcss・@nuxt/icon・@nuxtjs/color-mode は
  // @nuxt/ui が installModule で自動登録するため、ここには書かない（二重登録になる）。
  modules: ['@nuxt/ui', '@nuxtjs/supabase'],

  supabase: {
    // url / key は .env の SUPABASE_URL / SUPABASE_KEY から読まれる
    // （モジュールは NUXT_PUBLIC_SUPABASE_* を優先し、無ければこちらにフォールバックする）。

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
    },
  },
})
