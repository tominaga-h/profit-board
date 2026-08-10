import { z } from 'zod'
import { toRowErrors } from '~/lib/schemas/rowErrors'
import type { RowErrors } from '~/lib/schemas/rowErrors'

/**
 * メンバー1行の入力検証（SPEC 5.1 の m_users DDL に対応）。
 *
 * ★ 上限値は DDL 由来。family_name / first_name は VARCHAR(50)、
 *   email は VARCHAR(255)、unit_price は NUMERIC(12,0)。ここで止めないと
 *   Postgres が 22001（値が長すぎる）や 22003（数値が範囲外）を返し、
 *   生の英語エラーがユーザーに出る。
 *
 * ★ .trim() は検証だけでなく値の変換も行う。保存されるのは trim 済みの値。
 *   メールの前後に空白が残ると JWT のクレームと一致せず、
 *   「登録したのにログインできないメンバー」ができてしまう。
 *
 * ★ 一方 .toLowerCase() はしない。DB は VARCHAR で大文字小文字を区別するが、
 *   docs/SETUP.md が「Google アカウントのものと完全に一致させること」と
 *   指示している以上、入力値を勝手に変換するほうが危険。
 *
 * ★ メールのドメイン制限は入れない。デザイン画像の注意書きには
 *   「社内ドメインのみ登録可」とあるが、SPEC にも DDL にも根拠がない
 *   （plan.md A1「デザイン生成時に付加された要素は採用しない」と同じ判断）。
 */
export const memberRowSchema = z.object({
  family_name: z
    .string()
    .trim()
    .min(1, '姓を入力してください')
    .max(50, '姓は50文字以内で入力してください'),
  first_name: z
    .string()
    .trim()
    .min(1, '名を入力してください')
    .max(50, '名は50文字以内で入力してください'),
  email: z
    .string()
    .trim()
    .min(1, 'メールアドレスを入力してください')
    .email('メールアドレスの形式で入力してください')
    .max(255, 'メールアドレスは255文字以内で入力してください'),
  /**
   * ★ invalid_type_error は空欄対策。入力欄を v-model.number で受けると
   *   空文字が NaN になり、これがないと英語の "Expected number, received nan" が出る。
   *
   * ★ int() を課すのは NUMERIC(12,0) が小数を保持できないため。
   *   小数を入れても DB 側で黙って丸められ、画面の表示と保存値がズレる。
   */
  unit_price: z
    .number({ invalid_type_error: '単価を入力してください' })
    .int('単価は整数で入力してください')
    .min(0, '単価は0以上で入力してください')
    .max(999_999_999_999, '単価が大きすぎます'),
})

/** 検証を通したあとのメンバー1行（trim 済み）。 */
export type MemberRowInput = z.infer<typeof memberRowSchema>

/** メンバー1行の検証エラー。列名 → メッセージ。 */
export type MemberRowErrors = RowErrors<MemberRowInput>

/**
 * 検証結果を「列名 → メッセージ」の形に畳む。
 *
 * 実体は lib/schemas/rowErrors.ts の toRowErrors。呼び出し側で型引数を
 * 書かずに済むよう、メンバー用に束ねた別名として残している。
 */
export const toMemberRowErrors = (issues: readonly z.ZodIssue[]): MemberRowErrors =>
  toRowErrors<MemberRowInput>(issues)
