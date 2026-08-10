/** サイドバーのナビ項目の活性判定。components/AppSidebar.vue から使う。 */

/**
 * 現在のパスがナビ項目 `to` の配下にあるか。
 *
 * 前方一致で判定する。編集画面・ドリルダウン配下は一覧の配下という位置づけなので、
 * /projects/edit では「プロジェクト一覧」が、/members/edit では「メンバー」が光る。
 * NuxtLink の active-class（部分一致）や exact-active-class では
 * この挙動を意図どおりに揃えられない。
 *
 * ★ startsWith(to) ではなく startsWith(`${to}/`) にしている。
 *   区切りの / を含めないと /projectsXYZ のような別ルートまで活性になる。
 *   SPEC-MODIFY-1-PLAN.md の Task 18 は「startsWith('/projects') で吸収可能」と
 *   書いているが、素直にそう実装するとこの穴が開く。セグメント境界を守るのが要点。
 *
 * ★ 4階層のドリルダウン（/projects/[id]/years/[year]/months/[month]）に
 *   追従するのは、それらがすべて `/projects/` で始まるため。Task 19 で
 *   ページが増えてもこの関数を触る必要はない。
 *
 * currentPath を引数で受けるのは、useRoute() に触れない純粋関数にして
 * Nuxt ランタイムなしで単体テストできるようにするため（lib/ の他ファイルと同じ方針）。
 *
 * @param currentPath 現在のパス（route.path）
 * @param to ナビ項目のリンク先。undefined は非活性項目（レポート・設定）
 */
export const isNavItemActive = (currentPath: string, to?: string): boolean => {
  if (!to) return false
  return currentPath === to || currentPath.startsWith(`${to}/`)
}
