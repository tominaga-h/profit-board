import type { z } from 'zod'

/**
 * 行の検証エラー。列名 → メッセージ。
 *
 * インライン一括編集の画面（メンバー編集・プロジェクト編集）はどれも
 * 「N行 × M列」の形をしていて、エラーは行と列の交点に出す必要がある。
 * 行の識別は画面側（draft.key）が持ち、この型は1行ぶんの列 → メッセージだけを表す。
 */
export type RowErrors<T> = Partial<Record<keyof T, string>>

/**
 * 検証結果を「列名 → メッセージ」の形に畳む。
 *
 * 同じ列に複数のエラーが出た場合は最初の1件だけを残す。入力欄の下に出せるのは
 * 1行ぶんで、2件目以降は直しても表示が変わらず、直った実感が得られないため。
 *
 * ★ 型引数だけがスキーマごとに変わり、処理は共通なのでジェネリックにしてある。
 *   スキーマごとに toMemberRowErrors のような専用関数を書くと中身が全部同じになる。
 */
export const toRowErrors = <T>(issues: readonly z.ZodIssue[]): RowErrors<T> => {
  const errors: RowErrors<T> = {}

  for (const issue of issues) {
    const field = issue.path[0]
    // path が空の issue（オブジェクト全体に対するエラー）は列に紐付けられない。
    if (typeof field !== 'string') continue

    const key = field as keyof T
    if (errors[key] === undefined) errors[key] = issue.message
  }

  return errors
}
