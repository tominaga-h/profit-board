import { describe, expect, it } from 'vitest'
import {
  costRowSchema,
  managementCostRowSchema,
  salesRowSchema,
  toCostRowErrors,
  toManagementCostRowErrors,
  toSalesRowErrors,
} from '~/lib/schemas/performance'

describe('salesRowSchema', () => {
  const validRow = { category_small: '保守', amount: 2_400_000 }

  const errorOf = (row: Record<string, unknown>, field: keyof typeof validRow) => {
    const result = salesRowSchema.safeParse(row)
    if (result.success) return undefined
    return toSalesRowErrors(result.error.issues)[field]
  }

  it('正しい行は通る', () => {
    expect(salesRowSchema.safeParse(validRow).success).toBe(true)
  })

  it('小項目名の空欄・空白のみを弾く', () => {
    expect(errorOf({ ...validRow, category_small: '' }, 'category_small')).toBe(
      '小項目名を入力してください',
    )
    // trim が min(1) より先に効くので「  」は空文字になる。
    expect(errorOf({ ...validRow, category_small: '   ' }, 'category_small')).toBe(
      '小項目名を入力してください',
    )
  })

  it('小項目名は100文字ちょうどが通り、101文字を弾く（VARCHAR(100)）', () => {
    // ★ メンバーの姓名は50、プロジェクト名は255。桁が3種類あるので写し間違えやすい。
    expect(
      salesRowSchema.safeParse({ ...validRow, category_small: 'あ'.repeat(100) }).success,
    ).toBe(true)
    expect(errorOf({ ...validRow, category_small: 'あ'.repeat(101) }, 'category_small')).toBe(
      '小項目名は100文字以内で入力してください',
    )
  })

  it('小項目名の前後の空白は取り除く', () => {
    const result = salesRowSchema.safeParse({ ...validRow, category_small: ' 保守 ' })
    expect(result.success && result.data.category_small).toBe('保守')
  })

  it('金額は0を許し、負値・小数を弾く（NUMERIC(12,0)）', () => {
    expect(salesRowSchema.safeParse({ ...validRow, amount: 0 }).success).toBe(true)
    expect(errorOf({ ...validRow, amount: -1 }, 'amount')).toBe('金額は0以上で入力してください')
    // 通すと DB 側で黙って丸められ、画面の表示と保存値がズレる。
    expect(errorOf({ ...validRow, amount: 100.5 }, 'amount')).toBe('金額は整数で入力してください')
  })

  it('金額の空欄（NaN）を未入力として伝える', () => {
    // v-model.number の空欄は NaN になる。invalid_type_error がないと
    // "Expected number, received nan" という英語が画面に出る。
    expect(errorOf({ ...validRow, amount: Number.NaN }, 'amount')).toBe('金額を入力してください')
  })

  it('金額は12桁を超える値を弾く', () => {
    expect(salesRowSchema.safeParse({ ...validRow, amount: 999_999_999_999 }).success).toBe(true)
    expect(errorOf({ ...validRow, amount: 1_000_000_000_000 }, 'amount')).toBe('金額が大きすぎます')
  })
})

describe('costRowSchema', () => {
  const validRow = { work_hours: 120, unit_price: 60_000 }

  const errorOf = (row: Record<string, unknown>, field: keyof typeof validRow) => {
    const result = costRowSchema.safeParse(row)
    if (result.success) return undefined
    return toCostRowErrors(result.error.issues)[field]
  }

  it('正しい行は通る', () => {
    expect(costRowSchema.safeParse(validRow).success).toBe(true)
  })

  it('稼働時間0は通る（未入力メンバーの正当な状態）', () => {
    // ★ 0 は「この月はこのプロジェクトへ稼働しなかった」という正当な状態。
    //   Task 10 では保存対象から外れる（t_costs に行を作らない）。
    expect(costRowSchema.safeParse({ ...validRow, work_hours: 0 }).success).toBe(true)
  })

  it('稼働時間の負値を弾く', () => {
    expect(errorOf({ ...validRow, work_hours: -1 }, 'work_hours')).toBe(
      '稼働時間は0以上で入力してください',
    )
  })

  it('稼働時間は小数第2位まで許し、第3位以下を弾く（NUMERIC(6,2)）', () => {
    // 15分単位（0.25h）を通すことがこの桁に広げた理由。
    expect(costRowSchema.safeParse({ ...validRow, work_hours: 0.25 }).success).toBe(true)
    expect(costRowSchema.safeParse({ ...validRow, work_hours: 2.25 }).success).toBe(true)
    expect(costRowSchema.safeParse({ ...validRow, work_hours: 0.01 }).success).toBe(true)
    expect(costRowSchema.safeParse({ ...validRow, work_hours: 2.5 }).success).toBe(true)
    expect(errorOf({ ...validRow, work_hours: 2.256 }, 'work_hours')).toBe(
      '稼働時間は小数第2位までで入力してください',
    )
  })

  it('浮動小数の誤差で正当な値を弾かない', () => {
    // ★ 素朴に (v * 100) % 1 === 0 と書くと 0.29 * 100 = 28.999... で落ちる。
    //   指数表記を経由すれば10進の桁移動になり、この罠を踏まない。
    for (const hours of [0.3, 0.7, 1.1, 8.3, 16.7, 120.9, 0.05, 0.29, 1.25, 8.15, 120.35]) {
      expect(costRowSchema.safeParse({ ...validRow, work_hours: hours }).success).toBe(true)
    }
  })

  it('稼働時間は上限9999.99を超える値を弾く（NUMERIC(6,2)）', () => {
    // 桁数は6のままなので、小数を1桁増やした分だけ整数部の上限が下がる。
    expect(costRowSchema.safeParse({ ...validRow, work_hours: 9_999.99 }).success).toBe(true)
    expect(errorOf({ ...validRow, work_hours: 10_000 }, 'work_hours')).toBe(
      '稼働時間が大きすぎます',
    )
  })

  it('稼働時間の空欄（NaN）を未入力として伝える', () => {
    expect(errorOf({ ...validRow, work_hours: Number.NaN }, 'work_hours')).toBe(
      '稼働時間を入力してください',
    )
  })

  it('単価は0を許し、負値・小数を弾く', () => {
    expect(costRowSchema.safeParse({ ...validRow, unit_price: 0 }).success).toBe(true)
    expect(errorOf({ ...validRow, unit_price: -1 }, 'unit_price')).toBe(
      '単価は0以上で入力してください',
    )
    expect(errorOf({ ...validRow, unit_price: 60_000.5 }, 'unit_price')).toBe(
      '単価は整数で入力してください',
    )
  })

  it('両方の列が不正なら両方のメッセージが出る', () => {
    const result = costRowSchema.safeParse({ work_hours: -1, unit_price: -1 })

    expect(result.success).toBe(false)
    if (result.success) return

    expect(toCostRowErrors(result.error.issues)).toEqual({
      work_hours: '稼働時間は0以上で入力してください',
      unit_price: '単価は0以上で入力してください',
    })
  })
})

describe('managementCostRowSchema', () => {
  const errorOf = (row: Record<string, unknown>) => {
    const result = managementCostRowSchema.safeParse(row)
    if (result.success) return undefined
    return toManagementCostRowErrors(result.error.issues).amount
  }

  it('0以上の整数を通す', () => {
    expect(managementCostRowSchema.safeParse({ amount: 0 }).success).toBe(true)
    expect(managementCostRowSchema.safeParse({ amount: 120_000 }).success).toBe(true)
  })

  it('負値・小数・空欄を弾く', () => {
    expect(errorOf({ amount: -1 })).toBe('管理費は0以上で入力してください')
    expect(errorOf({ amount: 100.5 })).toBe('管理費は整数で入力してください')
    expect(errorOf({ amount: Number.NaN })).toBe('管理費を入力してください')
  })

  it('12桁を超える値を弾く', () => {
    expect(managementCostRowSchema.safeParse({ amount: 999_999_999_999 }).success).toBe(true)
    expect(errorOf({ amount: 1_000_000_000_000 })).toBe('管理費が大きすぎます')
  })
})
