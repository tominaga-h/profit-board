/** サイドバーのナビ項目の活性判定。components/AppSidebar.vue から使う。 */

/**
 * 現在のパスがナビ項目 `to` の配下にあるか。`to` が undefined の項目は常に非活性。
 *
 * 前方一致で判定する。編集画面・ドリルダウン配下は一覧の配下という位置づけなので、
 * /projects/edit では「プロジェクト一覧」が、/members/edit では「メンバー」が光る。
 * NuxtLink の active-class（部分一致）や exact-active-class では
 * この挙動を意図どおりに揃えられない。
 *
 * ★ startsWith(to) ではなく startsWith(`${to}/`) にしている。
 *   区切りの / を含めないと /projectsXYZ のような別ルートまで活性になる。
 *
 * currentPath を引数で受けるのは、useRoute() に触れない純粋関数にして
 * Nuxt ランタイムなしで単体テストできるようにするため。
 */
export const isNavItemActive = (currentPath: string, to?: string): boolean => {
  if (!to) return false
  return currentPath === to || currentPath.startsWith(`${to}/`)
}
