import { describe, expect, it } from 'vitest'
import { isNavItemActive } from '~/lib/navActive'

/**
 * Task 18 の受け入れ基準を固定する回帰テスト。
 *
 * 判定ロジック自体は Task 1 の時点で前方一致で書かれており、4階層の
 * ドリルダウン（Task 19）にも初めから追従していた。つまりこのテストは
 * 「動くようにする」ためではなく「壊れないようにする」ために書いている。
 * 完全一致（currentPath === to）へ書き換えられたら基準1が、
 * 素の startsWith(to) へ緩められたら /projectsXYZ のケースが落ちる。
 */
describe('isNavItemActive', () => {
  describe('プロジェクト一覧（Task 18 の対象）', () => {
    const to = '/projects'

    // 基準1: 4階層のドリルダウン配下すべてで活性になること。
    // Task 19 のページが未実装でも、パス文字列の規則は先に確定できる。
    it.each([
      ['/projects', '第1階層（プロジェクト選択）'],
      ['/projects/1/years', '第2階層（年度選択）'],
      ['/projects/1/years/2026/months', '第3階層（月選択）'],
      ['/projects/1/years/2026/months/7', '第4階層（実績閲覧）'],
    ])('%s で活性になる — %s', (path) => {
      expect(isNavItemActive(path, to)).toBe(true)
    })

    // 基準2: 既存挙動の維持。編集画面は一覧の配下という位置づけ。
    it('/projects/edit でも活性のまま（既存挙動と一致）', () => {
      expect(isNavItemActive('/projects/edit', to)).toBe(true)
    })

    // ★ このテストが本命。startsWith(`${to}/`) を startsWith(to) に
    //   緩めると通ってしまう。区切りの / でセグメント境界を守っていることの証明。
    it('/projectsXYZ は活性にしない（セグメント境界を越えない）', () => {
      expect(isNavItemActive('/projectsXYZ', to)).toBe(false)
    })

    // 他のナビ項目にいるときに巻き添えで光らないこと。
    it.each(['/dashboard', '/performance/input', '/members'])('%s では活性にしない', (path) => {
      expect(isNavItemActive(path, to)).toBe(false)
    })
  })

  describe('プロジェクト以外のナビ項目', () => {
    // 前方一致はプロジェクトだけの特別扱いではなく、全ナビ項目に効く規則。
    it('/members/edit では「メンバー」が活性になる', () => {
      expect(isNavItemActive('/members/edit', '/members')).toBe(true)
    })

    it('/dashboard で「ダッシュボード」が活性になる', () => {
      expect(isNavItemActive('/dashboard', '/dashboard')).toBe(true)
    })

    it('/performance/input で「実績入力」が活性になる', () => {
      expect(isNavItemActive('/performance/input', '/performance/input')).toBe(true)
    })
  })

  // AppSidebar.vue の navItems は to を持たない項目を含む（レポート・設定）。
  // plan.md A7 によりスコープ外で、リンクにせず非活性表示する。
  it('to が undefined の非活性項目はどのパスでも活性にならない', () => {
    expect(isNavItemActive('/dashboard', undefined)).toBe(false)
    expect(isNavItemActive('/projects/1/years', undefined)).toBe(false)
  })
})
