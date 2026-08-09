import { describe, expect, it } from 'vitest'
import { memberRowSchema, toMemberRowErrors } from '~/lib/schemas/member'

/** 検証を通る最小の行。各テストで壊したい列だけ上書きする。 */
const validRow = {
  family_name: '冨永',
  first_name: '隼人',
  email: 'tominaga_h@mad2007.co.jp',
  unit_price: 60000,
}

/** 検証に失敗させ、指定した列のメッセージを取り出す。 */
const errorOf = (row: Record<string, unknown>, field: string): string | undefined => {
  const result = memberRowSchema.safeParse(row)
  if (result.success) return undefined
  return toMemberRowErrors(result.error.issues)[field as keyof typeof validRow]
}

describe('memberRowSchema', () => {
  it('正しい行は通る', () => {
    expect(memberRowSchema.safeParse(validRow).success).toBe(true)
  })

  describe('姓・名', () => {
    it('空欄は弾く', () => {
      expect(errorOf({ ...validRow, family_name: '' }, 'family_name')).toBe('姓を入力してください')
      expect(errorOf({ ...validRow, first_name: '' }, 'first_name')).toBe('名を入力してください')
    })

    it('空白だけの入力も空欄として弾く', () => {
      // ★ trim が min(1) より先に効くので「  」は空文字になる。
      //   これを通すと、姓名が空白のメンバーができて一覧で行が潰れる。
      expect(errorOf({ ...validRow, family_name: '   ' }, 'family_name')).toBe(
        '姓を入力してください',
      )
    })

    it('50文字ちょうどは通り、51文字は弾く（VARCHAR(50)）', () => {
      expect(memberRowSchema.safeParse({ ...validRow, family_name: 'あ'.repeat(50) }).success).toBe(
        true,
      )
      expect(errorOf({ ...validRow, family_name: 'あ'.repeat(51) }, 'family_name')).toBe(
        '姓は50文字以内で入力してください',
      )
    })

    it('前後の空白は取り除いて保存する', () => {
      const result = memberRowSchema.safeParse({ ...validRow, family_name: ' 冨永 ' })
      expect(result.success && result.data.family_name).toBe('冨永')
    })
  })

  describe('メールアドレス', () => {
    it('形式が不正なものを弾く', () => {
      expect(errorOf({ ...validRow, email: 'tominaga' }, 'email')).toBe(
        'メールアドレスの形式で入力してください',
      )
    })

    it('空欄は形式エラーではなく未入力として伝える', () => {
      // ★ 空欄に「形式で入力してください」と出すと、何を直せばよいか伝わらない。
      expect(errorOf({ ...validRow, email: '' }, 'email')).toBe('メールアドレスを入力してください')
    })

    it('前後の空白は取り除く', () => {
      // ★ 空白が残ると JWT のメールクレームと一致せず、
      //   登録できたのにログインできないメンバーができる。
      const result = memberRowSchema.safeParse({ ...validRow, email: ' a@b.co.jp ' })
      expect(result.success && result.data.email).toBe('a@b.co.jp')
    })

    it('大文字を小文字に変換しない', () => {
      // ★ SETUP.md が「Google アカウントのものと完全に一致させること」と
      //   指示しているため、入力値を勝手に変換してはいけない。
      const result = memberRowSchema.safeParse({ ...validRow, email: 'Tominaga@mad2007.co.jp' })
      expect(result.success && result.data.email).toBe('Tominaga@mad2007.co.jp')
    })
  })

  describe('単価', () => {
    it('0 は通る（NOT NULL DEFAULT 0）', () => {
      expect(memberRowSchema.safeParse({ ...validRow, unit_price: 0 }).success).toBe(true)
    })

    it('負の値を弾く', () => {
      expect(errorOf({ ...validRow, unit_price: -1 }, 'unit_price')).toBe(
        '単価は0以上で入力してください',
      )
    })

    it('小数を弾く（NUMERIC(12,0) は小数を保持できない）', () => {
      // ★ 通すと DB 側で黙って丸められ、画面の表示と保存値がズレる。
      expect(errorOf({ ...validRow, unit_price: 60000.5 }, 'unit_price')).toBe(
        '単価は整数で入力してください',
      )
    })

    it('空欄（NaN）を未入力として伝える', () => {
      // ★ v-model.number の空欄は NaN になる。invalid_type_error がないと
      //   "Expected number, received nan" という英語が画面に出る。
      expect(errorOf({ ...validRow, unit_price: Number.NaN }, 'unit_price')).toBe(
        '単価を入力してください',
      )
    })

    it('12桁を超える値を弾く（NUMERIC(12,0)）', () => {
      expect(memberRowSchema.safeParse({ ...validRow, unit_price: 999_999_999_999 }).success).toBe(
        true,
      )
      expect(errorOf({ ...validRow, unit_price: 1_000_000_000_000 }, 'unit_price')).toBe(
        '単価が大きすぎます',
      )
    })
  })
})

describe('toMemberRowErrors', () => {
  it('列名をキーにしたオブジェクトへ畳む', () => {
    const result = memberRowSchema.safeParse({
      family_name: '',
      first_name: '',
      email: 'x',
      unit_price: -1,
    })

    expect(result.success).toBe(false)
    if (result.success) return

    expect(toMemberRowErrors(result.error.issues)).toEqual({
      family_name: '姓を入力してください',
      first_name: '名を入力してください',
      email: 'メールアドレスの形式で入力してください',
      unit_price: '単価は0以上で入力してください',
    })
  })

  it('同じ列に複数のエラーがあれば最初の1件だけ残す', () => {
    const errors = toMemberRowErrors([
      { code: 'custom', path: ['email'], message: '1件目' },
      { code: 'custom', path: ['email'], message: '2件目' },
    ] as never)

    expect(errors.email).toBe('1件目')
  })

  it('列に紐付かないエラーは捨てる', () => {
    // path が空の issue はオブジェクト全体に対するもので、入力欄の下に出せない。
    expect(toMemberRowErrors([{ code: 'custom', path: [], message: '全体エラー' }] as never)).toEqual(
      {},
    )
  })

  it('エラーがなければ空オブジェクト', () => {
    expect(toMemberRowErrors([])).toEqual({})
  })
})
