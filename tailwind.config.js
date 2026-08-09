/** @type {import('tailwindcss').Config} */
export default {
  // content は @nuxtjs/tailwindcss（@nuxt/ui が自動インストール）が既定値を持つため書かない。
  // アクセント青 #2563EB / 背景 #F8FAFC は Tailwind 標準の blue-600 / slate-50 と一致するため
  // 独自定義しない（app.config.ts の ui.primary / ui.gray で Nuxt UI 側にも反映済み）。
  theme: {
    extend: {
      colors: {
        // SPEC 6.2 のステータス判定バッジ色
        status: {
          growth: '#22C55E', // 成長（緑）
          stable: '#22C55E', // 順調（緑）
          caution: '#EAB308', // 注意（黄）
          warning: '#EF4444', // 警告（赤）
        },
      },
    },
  },
}
