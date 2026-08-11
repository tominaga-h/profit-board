import { z } from 'zod'
import { toRowErrors } from '~/lib/schemas/rowErrors'
import type { RowErrors } from '~/lib/schemas/rowErrors'

/**
 * プロジェクト1行の入力検証。m_projects の DDL に対応する。
 *
 * ★ 上限は DDL 由来で service_name / company_name とも VARCHAR(255)。
 *   メンバーの姓名（VARCHAR(50)）より広いので、member.ts を写すときに
 *   50 のまま持ってこないこと。超えると Postgres が 22001 を返し、
 *   生の英語エラーがユーザーに出る。
 *
 * ★ m_users と違い UNIQUE 制約が一切ない。同じサービス名・会社名の行を
 *   DB は受け入れるので、重複の検出は画面側（保存前の突き合わせ）でしか
 *   行えない。逆に言えば 23505 は起こりえないので、保存側で分岐を書いても
 *   到達しない死んだコードになる。
 *
 * ★ .trim() は検証と同時に値を変換する。保存されるのは trim 済みの値。
 *   前後の空白が残ると、見た目が同じで別物として扱われる行ができ、
 *   一覧やダッシュボードでどちらか判別できなくなる。
 */
export const projectRowSchema = z.object({
  service_name: z
    .string()
    .trim()
    .min(1, 'サービス名を入力してください')
    .max(255, 'サービス名は255文字以内で入力してください'),
  company_name: z
    .string()
    .trim()
    .min(1, '会社名を入力してください')
    .max(255, '会社名は255文字以内で入力してください'),
})

/** 検証を通したあとのプロジェクト1行（trim 済み）。 */
export type ProjectRowInput = z.infer<typeof projectRowSchema>

/** プロジェクト1行の検証エラー。列名 → メッセージ。 */
export type ProjectRowErrors = RowErrors<ProjectRowInput>

/**
 * 検証結果を「列名 → メッセージ」の形に畳む。
 *
 * 実体は lib/schemas/rowErrors.ts の toRowErrors。呼び出し側で型引数を
 * 書かずに済むよう、プロジェクト用に束ねた別名として残している。
 */
export const toProjectRowErrors = (issues: readonly z.ZodIssue[]): ProjectRowErrors =>
  toRowErrors<ProjectRowInput>(issues)
