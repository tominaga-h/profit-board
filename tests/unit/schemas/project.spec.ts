import { describe, expect, it } from 'vitest'
import { projectRowSchema, toProjectRowErrors } from '~/lib/schemas/project'
import { toRowErrors } from '~/lib/schemas/rowErrors'

/** 検証を通る最小の行。各テストで壊したい列だけ上書きする。 */
const validRow = {
  service_name: '営業支援システム',
  company_name: '株式会社サンプル',
}

/** 検証に失敗させ、指定した列のメッセージを取り出す。 */
const errorOf = (row: Record<string, unknown>, field: keyof typeof validRow): string | undefined => {
  const result = projectRowSchema.safeParse(row)
  if (result.success) return undefined
  return toProjectRowErrors(result.error.issues)[field]
}

describe('projectRowSchema', () => {
  it('正しい行は通る', () => {
    expect(projectRowSchema.safeParse(validRow).success).toBe(true)
  })

  describe('サービス名・会社名', () => {
    it('空欄は弾く', () => {
      expect(errorOf({ ...validRow, service_name: '' }, 'service_name')).toBe(
        'サービス名を入力してください',
      )
      expect(errorOf({ ...validRow, company_name: '' }, 'company_name')).toBe(
        '会社名を入力してください',
      )
    })

    it('空白だけの入力も空欄として弾く', () => {
      // ★ trim が min(1) より先に効くので「  」は空文字になる。
      //   これを通すと、名前が空白のプロジェクトができて一覧で行が潰れる。
      expect(errorOf({ ...validRow, service_name: '   ' }, 'service_name')).toBe(
        'サービス名を入力してください',
      )
      expect(errorOf({ ...validRow, company_name: '   ' }, 'company_name')).toBe(
        '会社名を入力してください',
      )
    })

    it('255文字ちょうどは通り、256文字は弾く（VARCHAR(255)）', () => {
      // ★ メンバーの姓名は VARCHAR(50)。member.ts を写して 50 にすると、
      //   51文字以上のサービス名が画面で弾かれて登録できなくなる。
      expect(
        projectRowSchema.safeParse({ ...validRow, service_name: 'あ'.repeat(255) }).success,
      ).toBe(true)
      expect(errorOf({ ...validRow, service_name: 'あ'.repeat(256) }, 'service_name')).toBe(
        'サービス名は255文字以内で入力してください',
      )
      expect(errorOf({ ...validRow, company_name: 'あ'.repeat(256) }, 'company_name')).toBe(
        '会社名は255文字以内で入力してください',
      )
    })

    it('前後の空白は取り除いて保存する', () => {
      // ★ 空白が残ると、見た目が同じで別物として扱われる行ができ、
      //   一覧やダッシュボードでどちらか判別できなくなる。
      const result = projectRowSchema.safeParse({
        service_name: ' 営業支援システム ',
        company_name: ' 株式会社サンプル ',
      })

      expect(result.success && result.data).toEqual({
        service_name: '営業支援システム',
        company_name: '株式会社サンプル',
      })
    })
  })

  it('両方の列が不正なら両方のメッセージが出る', () => {
    const result = projectRowSchema.safeParse({ service_name: '', company_name: '' })

    expect(result.success).toBe(false)
    if (result.success) return

    expect(toProjectRowErrors(result.error.issues)).toEqual({
      service_name: 'サービス名を入力してください',
      company_name: '会社名を入力してください',
    })
  })
})

describe('toRowErrors', () => {
  // toMemberRowErrors / toProjectRowErrors の実体。型引数だけが違う。
  type Row = { service_name: string; company_name: string }

  it('同じ列に複数のエラーがあれば最初の1件だけ残す', () => {
    const errors = toRowErrors<Row>([
      { code: 'custom', path: ['service_name'], message: '1件目' },
      { code: 'custom', path: ['service_name'], message: '2件目' },
    ] as never)

    expect(errors.service_name).toBe('1件目')
  })

  it('列に紐付かないエラーは捨てる', () => {
    // path が空の issue はオブジェクト全体に対するもので、入力欄の下に出せない。
    expect(toRowErrors<Row>([{ code: 'custom', path: [], message: '全体エラー' }] as never)).toEqual(
      {},
    )
  })

  it('エラーがなければ空オブジェクト', () => {
    expect(toRowErrors<Row>([])).toEqual({})
  })
})
