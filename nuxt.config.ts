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
  modules: ['@nuxt/ui'],

  // デザインは白基調のライトテーマのみ。SPEC にダークモードの要件はないため、
  // OS のカラースキーム追従（@nuxtjs/color-mode の既定）を無効化して固定する。
  colorMode: {
    preferred: 'light',
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
