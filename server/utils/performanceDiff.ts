/**
 * savePerformance の差分計算（純関数）。
 *
 * composables/usePerformance.ts の savePerformance と同じ仕様
 * （行の同一性は id、触った行だけ UPDATE、稼働0/管理費0は削除）を
 * DB・Nuxt ランタイムに依存しない形へ切り出したもの。
 * サーバ側 Tx で SELECT した現在行と、クライアントの望ましい最終状態を
 * この関数へ渡し、返り値の toDelete → toUpdate → toInsert → status の順で
 * 実行することを前提にする。
 */
import { calcLaborCost, calcWorkDays } from '~/lib/calc'

/** t_costs.cost_type に書き込む値。DB の CHECK 制約はなく申し合わせなので定数で固定する。 */
export const CostType = {
  LABOR: 'LABOR',
  MANAGEMENT: 'MANAGEMENT',
} as const
export type CostType = (typeof CostType)[keyof typeof CostType]

/** DB から SELECT した t_sales の現在行。差分計算に必要な列だけを持つ。 */
export type CurrentSalesRow = {
  id: number
  category_small: string
  amount: number
}

/** DB から SELECT した t_costs の現在行。 */
export type CurrentCostRow = {
  id: number
  user_id: number | null
  cost_type: string
  work_hours: number
  unit_price: number
  amount: number
}

/** DB から SELECT した t_status の現在行。remark upsert の要否判定には使わないが、将来の分岐に備えて渡せる形にしておく。 */
export type CurrentStatusRow = {
  id: number
  fiscal_year: number
  month: number
  project_id: number
  remark: string | null
  updated_by: string | null
}

/** サーバが Tx 内で SELECT した現在行一式。 */
export type CurrentPerformanceRows = {
  sales: readonly CurrentSalesRow[]
  costs: readonly CurrentCostRow[]
  status: CurrentStatusRow | null
}

/** クライアントが送る望ましい売上行の最終状態。id が null なら新規行。 */
export type DesiredSalesRow = {
  id: number | null
  category_small: string
  amount: number
}

/** クライアントが送る望ましい稼働行の最終状態。管理費行は含まない（managementAmount で別枠）。 */
export type DesiredCostRow = {
  id: number | null
  user_id: number
  work_hours: number
  unit_price: number
}

/**
 * クライアントが送る「望ましい最終状態」全体。
 *
 * managementId / managementAmount / duplicatedManagementIds は現行の
 * usePerformance.form 相当。管理費は画面が1行しか出さない一方 DB には
 * 複数行できてしまうため、正規化対象の重複 id を明示的に受け取る。
 */
export type DesiredPerformanceState = {
  sales: readonly DesiredSalesRow[]
  costs: readonly DesiredCostRow[]
  managementId: number | null
  managementAmount: number
  /** 管理費の先頭以外の行 id。常に DELETE 対象になる。 */
  duplicatedManagementIds?: readonly number[]
  remark: string
}

/** 保存スコープ。t_status の UNIQUE (fiscal_year, month, project_id) と一致する。 */
export type PerformanceScope = {
  fiscalYear: number
  month: number
  projectId: number
  updatedBy: string
}

export type SalesInsertPayload = {
  fiscal_year: number
  month: number
  project_id: number
  category_small: string
  amount: number
}

export type SalesUpdatePayload = {
  id: number
  category_small: string
  amount: number
}

export type CostInsertPayload = {
  fiscal_year: number
  month: number
  project_id: number
  user_id: number | null
  cost_type: CostType
  work_hours: number
  work_days: number
  unit_price: number
  amount: number
}

/**
 * 稼働行の UPDATE payload。
 *
 * 管理費の UPDATE は amount だけを更新する（現行の savePerformance が
 * 管理費行に work_hours/unit_price を持たせず amount 直書きのため）ので、
 * 稼働行の UPDATE（cost_type 込みのフル項目）とは形が異なる。
 */
export type CostUpdatePayload =
  | { id: number; cost_type: CostType; work_hours: number; work_days: number; unit_price: number; amount: number }
  | { id: number; amount: number }

export type StatusUpsertPayload = {
  fiscal_year: number
  month: number
  project_id: number
  remark: string
  updated_by: string
}

export type PerformanceDiffResult = {
  sales: {
    toDelete: number[]
    toUpdate: SalesUpdatePayload[]
    toInsert: SalesInsertPayload[]
  }
  costs: {
    toDelete: number[]
    toUpdate: CostUpdatePayload[]
    toInsert: CostInsertPayload[]
  }
  /** t_status は UNIQUE キーで衝突解決するため、常に1件の upsert 用データを返す。 */
  status: StatusUpsertPayload
}

/** 売上行の差分。id で現在行と対応付け、値が変わった行だけを toUpdate に積む。 */
const diffSales = (
  current: readonly CurrentSalesRow[],
  desired: readonly DesiredSalesRow[],
  scope: PerformanceScope,
): PerformanceDiffResult['sales'] => {
  const currentById = new Map(current.map((row) => [row.id, row]))
  const survivingIds = new Set(desired.map((row) => row.id).filter((id): id is number => id !== null))

  const toDelete = current.map((row) => row.id).filter((id) => !survivingIds.has(id))

  const toUpdate: SalesUpdatePayload[] = []
  const toInsert: SalesInsertPayload[] = []

  for (const draft of desired) {
    if (draft.id === null) {
      toInsert.push({
        fiscal_year: scope.fiscalYear,
        month: scope.month,
        project_id: scope.projectId,
        category_small: draft.category_small,
        amount: draft.amount,
      })
      continue
    }

    const previous = currentById.get(draft.id)
    if (!previous) continue
    if (previous.category_small === draft.category_small && previous.amount === draft.amount) continue

    toUpdate.push({ id: draft.id, category_small: draft.category_small, amount: draft.amount })
  }

  return { toDelete, toUpdate, toInsert }
}

/**
 * 稼働行（管理費以外）の差分。
 *
 * ★ 稼働時間0の行は「未入力メンバー」として保存対象外という現行仕様のため、
 *   既存行なら DELETE、新規行なら INSERT しない（＝スキップ）扱いにする。
 */
const diffLaborCosts = (
  current: readonly CurrentCostRow[],
  desired: readonly DesiredCostRow[],
  scope: PerformanceScope,
): { toDelete: number[]; toUpdate: CostUpdatePayload[]; toInsert: CostInsertPayload[] } => {
  const currentById = new Map(current.map((row) => [row.id, row]))

  const zeroedExistingIds = desired
    .filter((draft) => draft.id !== null && draft.work_hours === 0)
    .map((draft) => draft.id as number)

  const survivingIds = new Set(
    desired
      .filter((draft) => draft.id !== null && draft.work_hours > 0)
      .map((draft) => draft.id as number),
  )
  const missingIds = current.map((row) => row.id).filter((id) => !survivingIds.has(id) && !zeroedExistingIds.includes(id))

  const toDelete = [...zeroedExistingIds, ...missingIds]

  const toUpdate: CostUpdatePayload[] = []
  const toInsert: CostInsertPayload[] = []

  for (const draft of desired) {
    if (draft.work_hours === 0) continue

    const workDays = calcWorkDays(draft.work_hours)
    const amount = calcLaborCost(workDays, draft.unit_price)

    if (draft.id === null) {
      toInsert.push({
        fiscal_year: scope.fiscalYear,
        month: scope.month,
        project_id: scope.projectId,
        user_id: draft.user_id,
        cost_type: CostType.LABOR,
        work_hours: draft.work_hours,
        work_days: workDays,
        unit_price: draft.unit_price,
        amount,
      })
      continue
    }

    const previous = currentById.get(draft.id)
    if (!previous) continue
    if (previous.work_hours === draft.work_hours && previous.unit_price === draft.unit_price) continue

    toUpdate.push({
      id: draft.id,
      cost_type: CostType.LABOR,
      work_hours: draft.work_hours,
      work_days: workDays,
      unit_price: draft.unit_price,
      amount,
    })
  }

  return { toDelete, toUpdate, toInsert }
}

/**
 * 管理費（user_id が NULL の t_costs 行）の差分。
 *
 * ★ 画面は1行しか持たないが DB には複数行できてしまうため、
 *   先頭行以外（duplicatedManagementIds）は常に DELETE 対象にして1行へ正規化する。
 * ★ 金額0への変更は「未入力」と区別できないため行ごと削除する（現行仕様）。
 */
const diffManagement = (
  current: readonly CurrentCostRow[],
  desired: DesiredPerformanceState,
  scope: PerformanceScope,
): { toDelete: number[]; toUpdate: CostUpdatePayload[]; toInsert: CostInsertPayload[] } => {
  const duplicatedIds = desired.duplicatedManagementIds ?? []
  const { managementId, managementAmount } = desired

  const toDelete: number[] = [...duplicatedIds]
  const toUpdate: CostUpdatePayload[] = []
  const toInsert: CostInsertPayload[] = []

  if (managementId !== null) {
    if (managementAmount === 0) {
      toDelete.push(managementId)
    } else {
      const previous = current.find((row) => row.id === managementId)
      if (previous && previous.amount !== managementAmount) {
        toUpdate.push({ id: managementId, amount: managementAmount })
      }
    }
  } else if (managementAmount > 0) {
    toInsert.push({
      fiscal_year: scope.fiscalYear,
      month: scope.month,
      project_id: scope.projectId,
      user_id: null,
      cost_type: CostType.MANAGEMENT,
      work_hours: 0,
      work_days: 0,
      unit_price: 0,
      amount: managementAmount,
    })
  }

  return { toDelete, toUpdate, toInsert }
}

/**
 * 望ましい最終状態と DB 現在行から、テーブルごとの DELETE/UPDATE/INSERT と
 * t_status upsert 用データを求める。
 *
 * 呼び出し側（サーバ Tx）はこの返り値を
 * DELETE → UPDATE → INSERT → status upsert の順で実行すること。
 * 削除を先に行わないと、同じ月に同じ小項目が一時的に二重で並ぶ
 * （現行 savePerformance と同じ理由）。
 */
export const diffPerformance = (
  current: CurrentPerformanceRows,
  desired: DesiredPerformanceState,
  scope: PerformanceScope,
): PerformanceDiffResult => {
  const sales = diffSales(current.sales, desired.sales, scope)

  const laborCurrent = current.costs.filter((row) => row.user_id !== null)
  const managementCurrent = current.costs.filter((row) => row.user_id === null)

  const labor = diffLaborCosts(laborCurrent, desired.costs, scope)
  const management = diffManagement(managementCurrent, desired, scope)

  const costs = {
    toDelete: [...labor.toDelete, ...management.toDelete],
    toUpdate: [...labor.toUpdate, ...management.toUpdate],
    toInsert: [...labor.toInsert, ...management.toInsert],
  }

  const status: StatusUpsertPayload = {
    fiscal_year: scope.fiscalYear,
    month: scope.month,
    project_id: scope.projectId,
    remark: desired.remark,
    updated_by: scope.updatedBy,
  }

  return { sales, costs, status }
}
