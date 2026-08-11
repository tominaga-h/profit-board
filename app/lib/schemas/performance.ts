import { z } from 'zod'
import { toRowErrors } from '~/lib/schemas/rowErrors'
import type { RowErrors } from '~/lib/schemas/rowErrors'

/**
 * 売上行の入力検証。t_sales の DDL に対応する。
 *
 * ★ category_small は VARCHAR(100)。メンバーの姓名（50）や
 *   プロジェクト名（255）とも違うので、他のスキーマから写さないこと。
 *
 * ★ amount は NUMERIC(12,0) なので小数を保持できない。通しても DB 側で
 *   黙って丸められ、画面の表示と保存値がズレる。
 */
export const salesRowSchema = z.object({
  category_small: z
    .string()
    .trim()
    .min(1, '小項目名を入力してください')
    .max(100, '小項目名は100文字以内で入力してください'),
  amount: z
    .number({ invalid_type_error: '金額を入力してください' })
    .int('金額は整数で入力してください')
    .min(0, '金額は0以上で入力してください')
    .max(999_999_999_999, '金額が大きすぎます'),
})

/**
 * 稼働行の入力検証。t_costs の DDL に対応する。
 *
 * ★ work_hours は NUMERIC(6,2)。整数部4桁・小数2桁なので上限は 9999.99。
 *   小数第3位以下を入れると DB 側で丸められ、画面の人日計算と保存値が食い違う。
 *
 * ★ 稼働時間の「未入力」は 0 として扱うので、min(0) は空欄を弾かない。
 *   0 は「このメンバーはこの月にこのプロジェクトへ稼働しなかった」という
 *   正当な状態で、保存時には対象から外れる（行を作らない）。
 */
export const costRowSchema = z.object({
  work_hours: z
    .number({ invalid_type_error: '稼働時間を入力してください' })
    .min(0, '稼働時間は0以上で入力してください')
    .max(9_999.99, '稼働時間が大きすぎます')
    // ★ 100倍して整数になるかで小数第2位までを判定する。
    //   value * 100 と書くと浮動小数の誤差が乗るため、指数表記を経由して桁を移す。
    .refine(
      (value) => Number(`${value}e2`) === Math.round(Number(`${value}e2`)),
      '稼働時間は小数第2位までで入力してください',
    ),
  unit_price: z
    .number({ invalid_type_error: '単価を入力してください' })
    .int('単価は整数で入力してください')
    .min(0, '単価は0以上で入力してください')
    .max(999_999_999_999, '単価が大きすぎます'),
})

/**
 * 管理費行の入力検証。
 *
 * ★ 稼働時間・単価を持たず金額だけを直接入力する行（管理費）。
 *   DB 上は user_id が NULL の t_costs 行として保存される。
 */
export const managementCostRowSchema = z.object({
  amount: z
    .number({ invalid_type_error: '管理費を入力してください' })
    .int('管理費は整数で入力してください')
    .min(0, '管理費は0以上で入力してください')
    .max(999_999_999_999, '管理費が大きすぎます'),
})

export type SalesRowInput = z.infer<typeof salesRowSchema>
export type CostRowInput = z.infer<typeof costRowSchema>
export type ManagementCostRowInput = z.infer<typeof managementCostRowSchema>

export type SalesRowErrors = RowErrors<SalesRowInput>
export type CostRowErrors = RowErrors<CostRowInput>
export type ManagementCostRowErrors = RowErrors<ManagementCostRowInput>

/** 売上行の検証結果を「列名 → メッセージ」に畳む。 */
export const toSalesRowErrors = (issues: readonly z.ZodIssue[]): SalesRowErrors =>
  toRowErrors<SalesRowInput>(issues)

/** 稼働行の検証結果を「列名 → メッセージ」に畳む。 */
export const toCostRowErrors = (issues: readonly z.ZodIssue[]): CostRowErrors =>
  toRowErrors<CostRowInput>(issues)

/** 管理費行の検証結果を「列名 → メッセージ」に畳む。 */
export const toManagementCostRowErrors = (
  issues: readonly z.ZodIssue[],
): ManagementCostRowErrors => toRowErrors<ManagementCostRowInput>(issues)
