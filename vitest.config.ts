import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * 単体テスト（Vitest）の設定。
 *
 * ★ Nuxt のプラグイン（@nuxt/test-utils の defineVitestConfig）は読み込まない。
 *   テスト対象の composable は Nuxt ランタイム（useState / useSupabaseClient 等）に
 *   一切触れない純粋関数なので、スタブすべき対象がない。
 *   Nuxt を起動すると得るものがないまま起動時間だけ数十秒増える。
 *   コンポーネントのテストが必要になったら、その時点で足す。
 */
/**
 * srcDir（app/）の絶対パス。
 *
 * ★ new URL(...).pathname ではなく fileURLToPath を使う。前者は Windows で
 *   `/C:/...` という不正なパスを返すため、file: URL からパスへの変換は
 *   必ずこの関数を通す。
 */
const srcDir = fileURLToPath(new URL('./app', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      // `~/` の解決。tsconfig の paths は .nuxt/tsconfig.json 側にあるが、
      // .nuxt は生成物で gitignore されているため、未生成の環境では引けない。
      // クリーンチェックアウトでもテストが走るよう、ここに直接書く。
      // compatibilityVersion: 4 で srcDir が app/ になったため、Nuxt 実行時の
      // 解決先（app/ 基準）に合わせる。
      '~': srcDir,
      '@': srcDir,
    },
  },
  test: {
    // 対象は純粋関数のみ。DOM を使わないので node が最速。
    environment: 'node',
    include: ['tests/unit/**/*.spec.ts'],

    // globals は有効にしない。有効にすると tsconfig.json に
    // types: ["vitest/globals"] の追加が必要になり、typeCheck: true 下で
    // 構成を汚す。各テストで vitest から明示 import する。

    coverage: {
      provider: 'v8',
      // 計測対象は app/lib/ の計算ロジックだけ。
      // composables/ は Supabase クライアント等に依存し単体テストの対象外。
      include: ['app/lib/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
})
