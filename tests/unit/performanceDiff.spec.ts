import { describe, expect, it } from 'vitest'
import { CostType, diffPerformance } from '~/server/utils/performanceDiff'
import type { CurrentCostRow, CurrentSalesRow, DesiredCostRow, DesiredPerformanceState } from '~/server/utils/performanceDiff'

/**
 * ★ diffPerformance は composables/usePerformance.ts の savePerformance と
 *   同じ仕様（触った行だけ UPDATE、稼働0/管理費0は削除、DELETE→UPDATE→INSERT
 *   の順で崩れない差分を作る）を純関数として固定する回帰テスト。
 */

const scope = { fiscalYear: 2025, month: 4, projectId: 1, updatedBy: 'user@example.com' }

/** テスト用の空状態。各テストで必要な項目だけ上書きする。 */
const emptyDesired = (): DesiredPerformanceState => ({
  sales: [],
  costs: [],
  managementId: null,
  managementAmount: 0,
  remark: '',
})

const salesRow = (overrides: Partial<CurrentSalesRow>): CurrentSalesRow => ({
  id: 1,
  category_small: '保守',
  amount: 100000,
  ...overrides,
})

const costRow = (overrides: Partial<CurrentCostRow>): CurrentCostRow => ({
  id: 1,
  user_id: 1,
  cost_type: CostType.LABOR,
  work_hours: 10,
  unit_price: 60000,
  amount: 75000,
  ...overrides,
})

describe('diffPerformance / sales', () => {
  it('追加のみ: DB空 → フォームにN行', () => {
    const result = diffPerformance(
      { sales: [], costs: [], status: null },
      { ...emptyDesired(), sales: [
        { id: null, category_small: '保守', amount: 100000 },
        { id: null, category_small: '保守外（追加開発）', amount: 50000 },
      ] },
      scope,
    )

    expect(result.sales.toDelete).toEqual([])
    expect(result.sales.toUpdate).toEqual([])
    expect(result.sales.toInsert).toEqual([
      { fiscal_year: 2025, month: 4, project_id: 1, category_small: '保守', amount: 100000 },
      { fiscal_year: 2025, month: 4, project_id: 1, category_small: '保守外（追加開発）', amount: 50000 },
    ])
  })

  it('更新のみ: 値が変わった行だけがUPDATE対象になり、無変更行は含まれない', () => {
    const current = [salesRow({ id: 1, category_small: '保守', amount: 100000 }), salesRow({ id: 2, category_small: '保守外', amount: 50000 })]
    const result = diffPerformance(
      { sales: current, costs: [], status: null },
      { ...emptyDesired(), sales: [
        { id: 1, category_small: '保守', amount: 200000 },
        { id: 2, category_small: '保守外', amount: 50000 },
      ] },
      scope,
    )

    expect(result.sales.toUpdate).toEqual([
      { id: 1, category_small: '保守', amount: 200000 },
    ])
    expect(result.sales.toDelete).toEqual([])
    expect(result.sales.toInsert).toEqual([])
  })

  it('削除のみ: フォームから消えた行がDELETE対象になる', () => {
    const current = [salesRow({ id: 1 }), salesRow({ id: 2, category_small: '保守外', amount: 50000 })]
    const result = diffPerformance(
      { sales: current, costs: [], status: null },
      { ...emptyDesired(), sales: [{ id: 1, category_small: '保守', amount: 100000 }] },
      scope,
    )

    expect(result.sales.toDelete).toEqual([2])
    expect(result.sales.toUpdate).toEqual([])
    expect(result.sales.toInsert).toEqual([])
  })

  it('追加・更新・削除の混在', () => {
    const current = [
      salesRow({ id: 1, category_small: '保守', amount: 100000 }),
      salesRow({ id: 2, category_small: '保守外', amount: 50000 }),
    ]
    const result = diffPerformance(
      { sales: current, costs: [], status: null },
      { ...emptyDesired(), sales: [
        { id: 1, category_small: '保守', amount: 150000 },
        { id: null, category_small: '新規案件', amount: 30000 },
      ] },
      scope,
    )

    expect(result.sales.toDelete).toEqual([2])
    expect(result.sales.toUpdate).toEqual([{ id: 1, category_small: '保守', amount: 150000 }])
    expect(result.sales.toInsert).toEqual([
      { fiscal_year: 2025, month: 4, project_id: 1, category_small: '新規案件', amount: 30000 },
    ])
  })

  it('完全に無変更: DELETE/UPDATE/INSERTすべて空', () => {
    const current = [salesRow({ id: 1 }), salesRow({ id: 2, category_small: '保守外', amount: 50000 })]
    const result = diffPerformance(
      { sales: current, costs: [], status: null },
      { ...emptyDesired(), sales: [
        { id: 1, category_small: '保守', amount: 100000 },
        { id: 2, category_small: '保守外', amount: 50000 },
      ] },
      scope,
    )

    expect(result.sales.toDelete).toEqual([])
    expect(result.sales.toUpdate).toEqual([])
    expect(result.sales.toInsert).toEqual([])
  })
})

describe('diffPerformance / costs（稼働行）', () => {
  const labor = (overrides: Partial<DesiredCostRow>): DesiredCostRow => ({
    id: null,
    user_id: 1,
    work_hours: 0,
    unit_price: 0,
    ...overrides,
  })

  it('追加のみ: DB空 → フォームにN行（work_hours>0のみ対象）', () => {
    const result = diffPerformance(
      { sales: [], costs: [], status: null },
      { ...emptyDesired(), costs: [
        labor({ user_id: 1, work_hours: 10, unit_price: 60000 }),
        labor({ user_id: 2, work_hours: 20, unit_price: 50000 }),
      ] },
      scope,
    )

    expect(result.costs.toDelete).toEqual([])
    expect(result.costs.toUpdate).toEqual([])
    expect(result.costs.toInsert).toEqual([
      {
        fiscal_year: 2025, month: 4, project_id: 1,
        user_id: 1, cost_type: CostType.LABOR, work_hours: 10, work_days: 1.25, unit_price: 60000, amount: 75000,
      },
      {
        fiscal_year: 2025, month: 4, project_id: 1,
        user_id: 2, cost_type: CostType.LABOR, work_hours: 20, work_days: 2.5, unit_price: 50000, amount: 125000,
      },
    ])
  })

  it('稼働0の行は追加対象に含めない（未入力メンバーは保存しない仕様）', () => {
    const result = diffPerformance(
      { sales: [], costs: [], status: null },
      { ...emptyDesired(), costs: [labor({ user_id: 1, work_hours: 0, unit_price: 60000 })] },
      scope,
    )

    expect(result.costs.toInsert).toEqual([])
  })

  it('更新のみ: 値が変わった行だけがUPDATE対象になり、無変更行は含まれない', () => {
    const current = [
      costRow({ id: 1, user_id: 1, work_hours: 10, unit_price: 60000, amount: 75000 }),
      costRow({ id: 2, user_id: 2, work_hours: 20, unit_price: 50000, amount: 125000 }),
    ]
    const result = diffPerformance(
      { sales: [], costs: current, status: null },
      { ...emptyDesired(), costs: [
        labor({ id: 1, user_id: 1, work_hours: 16, unit_price: 60000 }),
        labor({ id: 2, user_id: 2, work_hours: 20, unit_price: 50000 }),
      ] },
      scope,
    )

    expect(result.costs.toUpdate).toEqual([
      { id: 1, cost_type: CostType.LABOR, work_hours: 16, work_days: 2, unit_price: 60000, amount: 120000 },
    ])
    expect(result.costs.toDelete).toEqual([])
    expect(result.costs.toInsert).toEqual([])
  })

  it('稼働時間が0に戻った既存行はUPDATEでなくDELETE対象になる', () => {
    const current = [costRow({ id: 1, user_id: 1, work_hours: 10, unit_price: 60000, amount: 75000 })]
    const result = diffPerformance(
      { sales: [], costs: current, status: null },
      { ...emptyDesired(), costs: [labor({ id: 1, user_id: 1, work_hours: 0, unit_price: 60000 })] },
      scope,
    )

    expect(result.costs.toDelete).toEqual([1])
    expect(result.costs.toUpdate).toEqual([])
    expect(result.costs.toInsert).toEqual([])
  })

  it('削除のみ: フォームから消えた行がDELETE対象になる', () => {
    const current = [
      costRow({ id: 1, user_id: 1 }),
      costRow({ id: 2, user_id: 2, work_hours: 20, unit_price: 50000, amount: 125000 }),
    ]
    const result = diffPerformance(
      { sales: [], costs: current, status: null },
      { ...emptyDesired(), costs: [labor({ id: 1, user_id: 1, work_hours: 10, unit_price: 60000 })] },
      scope,
    )

    expect(result.costs.toDelete).toEqual([2])
  })

  it('追加・更新・削除の混在', () => {
    const current = [
      costRow({ id: 1, user_id: 1, work_hours: 10, unit_price: 60000, amount: 75000 }),
      costRow({ id: 2, user_id: 2, work_hours: 20, unit_price: 50000, amount: 125000 }),
    ]
    const result = diffPerformance(
      { sales: [], costs: current, status: null },
      { ...emptyDesired(), costs: [
        labor({ id: 1, user_id: 1, work_hours: 16, unit_price: 60000 }),
        labor({ id: null, user_id: 3, work_hours: 8, unit_price: 40000 }),
      ] },
      scope,
    )

    expect(result.costs.toDelete).toEqual([2])
    expect(result.costs.toUpdate).toEqual([
      { id: 1, cost_type: CostType.LABOR, work_hours: 16, work_days: 2, unit_price: 60000, amount: 120000 },
    ])
    expect(result.costs.toInsert).toEqual([
      {
        fiscal_year: 2025, month: 4, project_id: 1,
        user_id: 3, cost_type: CostType.LABOR, work_hours: 8, work_days: 1, unit_price: 40000, amount: 40000,
      },
    ])
  })

  it('完全に無変更: DELETE/UPDATE/INSERTすべて空', () => {
    const current = [costRow({ id: 1, user_id: 1, work_hours: 10, unit_price: 60000, amount: 75000 })]
    const result = diffPerformance(
      { sales: [], costs: current, status: null },
      { ...emptyDesired(), costs: [labor({ id: 1, user_id: 1, work_hours: 10, unit_price: 60000 })] },
      scope,
    )

    expect(result.costs.toDelete).toEqual([])
    expect(result.costs.toUpdate).toEqual([])
    expect(result.costs.toInsert).toEqual([])
  })
})

describe('diffPerformance / managementAmount（管理費）', () => {
  it('新規追加: managementIdなし・金額>0 で管理費行をINSERT', () => {
    const result = diffPerformance(
      { sales: [], costs: [], status: null },
      { ...emptyDesired(), managementId: null, managementAmount: 300000 },
      scope,
    )

    expect(result.costs.toInsert).toEqual([
      {
        fiscal_year: 2025, month: 4, project_id: 1,
        user_id: null, cost_type: CostType.MANAGEMENT, work_hours: 0, work_days: 0, unit_price: 0, amount: 300000,
      },
    ])
  })

  it('金額変更: managementIdありで金額が変わればUPDATE対象になる', () => {
    const current = [costRow({ id: 9, user_id: null, cost_type: CostType.MANAGEMENT, work_hours: 0, unit_price: 0, amount: 300000 })]
    const result = diffPerformance(
      { sales: [], costs: current, status: null },
      { ...emptyDesired(), managementId: 9, managementAmount: 400000 },
      scope,
    )

    expect(result.costs.toUpdate).toEqual([{ id: 9, amount: 400000 }])
  })

  it('無変更: 金額が同じならUPDATE対象に含まれない', () => {
    const current = [costRow({ id: 9, user_id: null, cost_type: CostType.MANAGEMENT, work_hours: 0, unit_price: 0, amount: 300000 })]
    const result = diffPerformance(
      { sales: [], costs: current, status: null },
      { ...emptyDesired(), managementId: 9, managementAmount: 300000 },
      scope,
    )

    expect(result.costs.toUpdate).toEqual([])
    expect(result.costs.toDelete).toEqual([])
  })

  it('0円に変更: 管理費行ごとDELETE対象になる（0円行は未入力と区別できないため残さない）', () => {
    const current = [costRow({ id: 9, user_id: null, cost_type: CostType.MANAGEMENT, work_hours: 0, unit_price: 0, amount: 300000 })]
    const result = diffPerformance(
      { sales: [], costs: current, status: null },
      { ...emptyDesired(), managementId: 9, managementAmount: 0 },
      scope,
    )

    expect(result.costs.toDelete).toEqual([9])
    expect(result.costs.toUpdate).toEqual([])
  })

  it('重複管理費行: 先頭以外は常にDELETE対象になる（画面は1行しか出さないため1行へ正規化する）', () => {
    const current = [
      costRow({ id: 9, user_id: null, cost_type: CostType.MANAGEMENT, work_hours: 0, unit_price: 0, amount: 300000 }),
      costRow({ id: 10, user_id: null, cost_type: CostType.MANAGEMENT, work_hours: 0, unit_price: 0, amount: 0 }),
    ]
    const result = diffPerformance(
      { sales: [], costs: current, status: null },
      { ...emptyDesired(), managementId: 9, managementAmount: 300000, duplicatedManagementIds: [10] },
      scope,
    )

    expect(result.costs.toDelete).toEqual([10])
    expect(result.costs.toUpdate).toEqual([])
  })
})

describe('diffPerformance / t_status（remark upsert）', () => {
  it('remarkを含むupsert用データを毎回生成する（現行は常にupsertを発行する方針）', () => {
    const result = diffPerformance(
      { sales: [], costs: [], status: null },
      { ...emptyDesired(), remark: '特記事項あり' },
      scope,
    )

    expect(result.status).toEqual({
      fiscal_year: 2025,
      month: 4,
      project_id: 1,
      remark: '特記事項あり',
      updated_by: 'user@example.com',
    })
  })

  it('remarkが空文字でもupsert用データを生成する（空文字はクリア操作として正当な値）', () => {
    const current = { id: 1, fiscal_year: 2025, month: 4, project_id: 1, remark: '前回の備考', updated_by: 'old@example.com' }
    const result = diffPerformance(
      { sales: [], costs: [], status: current },
      { ...emptyDesired(), remark: '' },
      scope,
    )

    expect(result.status).toEqual({
      fiscal_year: 2025,
      month: 4,
      project_id: 1,
      remark: '',
      updated_by: 'user@example.com',
    })
  })

  it('既存t_statusが無くても（初回保存）upsert用データを生成する', () => {
    const result = diffPerformance(
      { sales: [], costs: [], status: null },
      { ...emptyDesired(), remark: '初回コメント' },
      scope,
    )

    expect(result.status.remark).toBe('初回コメント')
  })
})

describe('diffPerformance / 境界値', () => {
  it('金額0円の売上行はそのままUPDATE/INSERT対象になる（0は正当な値）', () => {
    const result = diffPerformance(
      { sales: [], costs: [], status: null },
      { ...emptyDesired(), sales: [{ id: null, category_small: '保守', amount: 0 }] },
      scope,
    )

    expect(result.sales.toInsert).toEqual([
      { fiscal_year: 2025, month: 4, project_id: 1, category_small: '保守', amount: 0 },
    ])
  })

  it('売上金額が0から0への変更はUPDATE対象に含まれない', () => {
    const current = [salesRow({ id: 1, amount: 0 })]
    const result = diffPerformance(
      { sales: current, costs: [], status: null },
      { ...emptyDesired(), sales: [{ id: 1, category_small: '保守', amount: 0 }] },
      scope,
    )

    expect(result.sales.toUpdate).toEqual([])
  })

  it('稼働時間の小数（8.5h）でも人日・金額が正しく丸められてINSERTされる', () => {
    const result = diffPerformance(
      { sales: [], costs: [], status: null },
      { ...emptyDesired(), costs: [{ id: null, user_id: 1, work_hours: 8.5, unit_price: 60000 }] },
      scope,
    )

    // 8.5 / 8 = 1.0625 → 1.06人日、1.06 × 60000 = 63600円
    expect(result.costs.toInsert).toEqual([
      {
        fiscal_year: 2025, month: 4, project_id: 1,
        user_id: 1, cost_type: CostType.LABOR, work_hours: 8.5, work_days: 1.06, unit_price: 60000, amount: 63600,
      },
    ])
  })
})
