import type { Database } from '~/types/database.types'
import { FetchStatus } from '~/lib/fetchStatus'
import { calcLaborCost, calcWorkDays } from '~/lib/calc'
import type { Member } from '~/composables/useMembers'

export type SalesRecord = Database['public']['Tables']['t_sales']['Row']
export type CostRecord = Database['public']['Tables']['t_costs']['Row']
export type StatusRecord = Database['public']['Tables']['t_status']['Row']

/**
 * 費用行の種別。
 *
 * ★ t_costs.cost_type は VARCHAR(50) で CHECK 制約がない。DDL のコメントに
 *   'LABOR' or 'MANAGEMENT' と書かれているだけの申し合わせなので、DB から
 *   読んだ値をそのまま信用しない。行の種別は user_id が NULL かどうかで
 *   判定する（テーブルコメント「user_id が NULL の行は管理費」が
 *   構造的な根拠を持つ唯一の記述）。保存時にはこの定数を書き込む。
 */
export const CostType = {
  LABOR: 'LABOR',
  MANAGEMENT: 'MANAGEMENT',
} as const
export type CostType = (typeof CostType)[keyof typeof CostType]

/** 仕様が定める売上の初期小項目。 */
export const DEFAULT_SALES_CATEGORIES = ['保守', '保守外（追加開発）'] as const

/** 画面上の売上行。 */
export type SalesDraft = {
  /** v-for の :key。配列添字を使うと行削除で入力値が別の行へ移る。 */
  key: string
  /** t_sales.id。まだ保存していない行は null。 */
  id: number | null
  category_small: string
  amount: number
}

/**
 * 画面上のメンバー稼働行。メンバー1人につき必ず1行できる。
 *
 * ★ 稼働のないメンバーの行も作る。「未入力メンバーが存在する場合の
 *   アラート表示」は、全メンバーの行があって初めて数えられる。
 */
export type CostDraft = {
  key: string
  /** t_costs.id。稼働実績のないメンバーは null。 */
  id: number | null
  /** m_users.id。 */
  user_id: number
  /** 表示用の氏名（姓 名）。 */
  label: string
  work_hours: number
  unit_price: number
}

/** 実績入力フォーム全体の状態。 */
export type PerformanceForm = {
  sales: SalesDraft[]
  costs: CostDraft[]
  /** 管理費（user_id が NULL の t_costs 行）。金額だけを直接入力する。 */
  managementAmount: number
  /**
   * 管理費行の t_costs.id。未登録なら null。
   *
   * 画面は1行しか出さないが DB には複数作れてしまうので、
   * 先頭行だけを更新対象として持ち、残りは保存時に削除して1行へ寄せる。
   */
  managementId: number | null
  /** 先頭以外の管理費行。保存時に削除して重複を解消する。 */
  duplicatedManagementIds: number[]
  remark: string
  /** 既存の t_status。未登録なら null。「最終更新」表示に使う。 */
  status: StatusRecord | null
}

/**
 * 取得直後の値。保存時にどの行が変わったかを判定するために使う。
 *
 * 参照ではなく値をコピーして持つ。フォームと同じオブジェクトを指していると
 * 入力のたびにスナップショット側も書き換わり、差分が常に空になる。
 */
type PerformanceSnapshot = {
  sales: Map<number, { category_small: string; amount: number }>
  costs: Map<number, { work_hours: number; unit_price: number }>
  managementAmount: number
}

/**
 * 実績入力画面のデータ読込。
 *
 * ★ useState ではなくローカル ref を使う。useMembers / useProjects と同じ判断で、
 *   ページ遷移のたびに作り直されるほうが古いキャッシュが残らず素直に動く。
 */
export const usePerformance = () => {
  const supabase = useSupabaseClient<Database>()

  const emptyForm = (): PerformanceForm => ({
    sales: [],
    costs: [],
    managementAmount: 0,
    managementId: null,
    duplicatedManagementIds: [],
    remark: '',
    status: null,
  })

  const form = ref<PerformanceForm>(emptyForm())

  const status = ref<FetchStatus>(FetchStatus.IDLE)
  const errorMessage = ref<string | null>(null)

  /** 保存済みの行だけを控える。id を持たない行は差分の比較対象にならない。 */
  const takeSnapshot = (source: PerformanceForm): PerformanceSnapshot => ({
    sales: new Map(
      source.sales
        .filter((draft): draft is SalesDraft & { id: number } => draft.id !== null)
        .map((draft) => [draft.id, { category_small: draft.category_small, amount: draft.amount }]),
    ),
    costs: new Map(
      source.costs
        .filter((draft): draft is CostDraft & { id: number } => draft.id !== null)
        .map((draft) => [draft.id, { work_hours: draft.work_hours, unit_price: draft.unit_price }]),
    ),
    managementAmount: source.managementAmount,
  })

  const snapshot = ref<PerformanceSnapshot>(takeSnapshot(emptyForm()))

  /** 売上の初期2行。実績が1件もない月に出す。 */
  const buildDefaultSales = (): SalesDraft[] =>
    DEFAULT_SALES_CATEGORIES.map((category) => ({
      key: crypto.randomUUID(),
      id: null,
      category_small: category,
      amount: 0,
    }))

  /**
   * メンバーと既存実績から稼働行を組み立てる。
   *
   * ★ 単価は「実績があればその値、なければマスタ単価」の順で採る。
   *   t_costs.unit_price に単価を保存する設計になっているのは、
   *   マスタ単価を後から変えても過去月の金額が動かないようにするため。
   *   ここでマスタ単価を優先すると、その意図が壊れる。
   *
   * ★ work_hours / unit_price は NOT NULL ではない（DEFAULT 0 のみ）ので
   *   null が返りうる。?? 0 を必ず通す。
   */
  const buildCostDrafts = (members: readonly Member[], records: readonly CostRecord[]) => {
    const byUserId = new Map(
      records.filter((record) => record.user_id !== null).map((record) => [record.user_id, record]),
    )

    return members.map((member): CostDraft => {
      const record = byUserId.get(member.id)
      return {
        key: `member-${member.id}`,
        id: record?.id ?? null,
        user_id: member.id,
        label: `${member.family_name} ${member.first_name}`,
        work_hours: record?.work_hours ?? 0,
        unit_price: record?.unit_price ?? member.unit_price,
      }
    })
  }

  /**
   * 管理費の金額と、更新対象の行 id を取り出す。
   *
   * ★ user_id が NULL の行が複数あれば合算する。DB には UNIQUE 制約がなく
   *   複数行を作れてしまうため（画面は1行しか出さないので、通常は0か1行）。
   *   合算せず先頭だけ採ると、2行目以降の金額が画面から消える。
   *
   * ★ 合算値は先頭行へ書き戻し、2行目以降は保存時に削除して1行に寄せる。
   *   画面が1行しか持たない以上、DB 側も1行に正規化しないと
   *   次に読み直したときまた合算されて金額が二重に見える。
   */
  const pickManagement = (records: readonly CostRecord[]) => {
    const rows = records.filter((record) => record.user_id === null)
    const [first, ...rest] = rows

    return {
      amount: rows.reduce((total, record) => total + record.amount, 0),
      id: first?.id ?? null,
      duplicatedIds: rest.map((record) => record.id),
    }
  }

  /**
   * 稼働行の保存値を組み立てる。
   *
   * 人日と金額は画面表示と同じ関数を通す。ここで別計算にすると、
   * 画面に出ている人日と保存された金額の辻褄が合わなくなる。
   */
  const buildCostPayload = (draft: CostDraft) => {
    const workDays = calcWorkDays(draft.work_hours)
    return {
      user_id: draft.user_id,
      cost_type: CostType.LABOR,
      work_hours: draft.work_hours,
      work_days: workDays,
      unit_price: draft.unit_price,
      amount: calcLaborCost(workDays, draft.unit_price),
    }
  }

  /**
   * 指定した年度×月×プロジェクトの実績を読み込む。
   *
   * ★ 3テーブルを Promise.all で並列に取る。直列に await すると往復が
   *   3回積み上がり、プルダウンを切り替えるたびの待ちがそのまま3倍になる。
   *   索引 idx_t_sales_fy_month_project / idx_t_costs_fy_month_project は
   *   DDL 側に「実績入力画面の読込」のコメント付きで用意済み。
   *
   * ★ t_status は maybeSingle()。UNIQUE (fiscal_year, month, project_id) が
   *   あるので0行か1行にしかならない。single() だと0行でエラーになる。
   */
  const fetchPerformance = async (
    fiscalYear: number,
    month: number,
    projectId: number,
    members: readonly Member[],
  ): Promise<void> => {
    status.value = FetchStatus.LOADING
    errorMessage.value = null

    const scope = { fiscal_year: fiscalYear, month, project_id: projectId }

    const [salesResult, costsResult, statusResult] = await Promise.all([
      supabase.from('t_sales').select('*').match(scope).order('id', { ascending: true }),
      supabase.from('t_costs').select('*').match(scope).order('id', { ascending: true }),
      supabase.from('t_status').select('*').match(scope).maybeSingle(),
    ])

    const failure = salesResult.error ?? costsResult.error ?? statusResult.error
    if (failure) {
      console.error('[usePerformance] 実績の取得に失敗しました', failure)
      errorMessage.value = '実績データを取得できませんでした。時間をおいて再度お試しください。'
      status.value = FetchStatus.ERROR
      return
    }

    const salesRecords = salesResult.data ?? []
    const costRecords = costsResult.data ?? []

    const management = pickManagement(costRecords)

    form.value = {
      // 実績が1件もない月は仕様どおり初期2行を出す。
      sales:
        salesRecords.length > 0
          ? salesRecords.map((record) => ({
              key: `sales-${record.id}`,
              id: record.id,
              category_small: record.category_small,
              amount: record.amount,
            }))
          : buildDefaultSales(),
      costs: buildCostDrafts(members, costRecords),
      managementAmount: management.amount,
      managementId: management.id,
      duplicatedManagementIds: management.duplicatedIds,
      remark: statusResult.data?.remark ?? '',
      status: statusResult.data,
    }

    snapshot.value = takeSnapshot(form.value)
    status.value = FetchStatus.SUCCESS
  }

  /** 選択が外れたときにフォームを空へ戻す（前の条件の値が残らないように）。 */
  const resetForm = () => {
    form.value = emptyForm()
    snapshot.value = takeSnapshot(form.value)
    status.value = FetchStatus.IDLE
    errorMessage.value = null
  }

  const isSaving = ref(false)
  const saveErrorMessage = ref<string | null>(null)

  /**
   * 入力内容を保存する。成功したら true。
   *
   * 洗い替えではなく差分で当てる。行を作り直さないので id と created_at が残り、
   * 触っていない行の updated_at も動かないため「誰がいつ何を変えたか」が追える。
   *
   * ★ 実行順は DELETE → UPDATE → INSERT。消えた行を先に片付けないと、
   *   同じ月に同じ小項目が一時的に二重で並ぶ。
   *
   * ★ supabase-js はトランザクションを張れないので、途中で失敗すると
   *   部分適用になる。呼び出し側は成否によらず再取得して、
   *   画面を DB の実状態に合わせること。
   *
   * ★ 23505 の分岐は持たない。t_sales / t_costs に一意制約がなく
   *   （同じ月に複数の小項目行が並ぶため意図的に付けていない）、
   *   t_status は upsert が競合を処理するので到達しない。
   */
  const savePerformance = async (
    fiscalYear: number,
    month: number,
    projectId: number,
    updatedBy: string,
  ): Promise<boolean> => {
    isSaving.value = true
    saveErrorMessage.value = null

    const scope = { fiscal_year: fiscalYear, month, project_id: projectId }
    const current = form.value
    const before = snapshot.value

    const fail = (message: string, error: unknown): false => {
      console.error(`[usePerformance] ${message}`, error)
      saveErrorMessage.value = message
      return false
    }

    try {
      // --- DELETE ---------------------------------------------------------
      const survivingSalesIds = new Set(
        current.sales.map((draft) => draft.id).filter((id): id is number => id !== null),
      )
      const removedSalesIds = [...before.sales.keys()].filter((id) => !survivingSalesIds.has(id))

      // 稼働が 0 に戻った行は残さない。未入力メンバーは保存対象外という仕様。
      const removedCostIds = current.costs
        .filter((draft) => draft.id !== null && draft.work_hours === 0)
        .map((draft) => draft.id as number)

      // 管理費が 0 になったら行ごと消す。0 の行を残すと未入力と区別できない。
      const removedManagementIds = [
        ...current.duplicatedManagementIds,
        ...(current.managementId !== null && current.managementAmount === 0
          ? [current.managementId]
          : []),
      ]

      const removedIds = [...removedCostIds, ...removedManagementIds]

      if (removedSalesIds.length > 0) {
        const { error } = await supabase.from('t_sales').delete().in('id', removedSalesIds)
        if (error) return fail('売上行の削除に失敗しました。', error)
      }

      if (removedIds.length > 0) {
        const { error } = await supabase.from('t_costs').delete().in('id', removedIds)
        if (error) return fail('費用行の削除に失敗しました。', error)
      }

      // --- UPDATE ---------------------------------------------------------
      for (const draft of current.sales) {
        if (draft.id === null) continue
        const previous = before.sales.get(draft.id)
        if (!previous) continue
        if (
          previous.category_small === draft.category_small &&
          previous.amount === draft.amount
        ) {
          continue
        }

        const { error } = await supabase
          .from('t_sales')
          .update({ category_small: draft.category_small, amount: draft.amount })
          .eq('id', draft.id)
        if (error) return fail(`「${draft.category_small}」の更新に失敗しました。`, error)
      }

      for (const draft of current.costs) {
        if (draft.id === null || draft.work_hours === 0) continue
        const previous = before.costs.get(draft.id)
        if (!previous) continue
        if (
          previous.work_hours === draft.work_hours &&
          previous.unit_price === draft.unit_price
        ) {
          continue
        }

        const { error } = await supabase
          .from('t_costs')
          .update(buildCostPayload(draft))
          .eq('id', draft.id)
        if (error) return fail(`「${draft.label}」の更新に失敗しました。`, error)
      }

      const managementId = current.managementId
      if (
        managementId !== null &&
        current.managementAmount > 0 &&
        before.managementAmount !== current.managementAmount
      ) {
        const { error } = await supabase
          .from('t_costs')
          .update({ amount: current.managementAmount })
          .eq('id', managementId)
        if (error) return fail('管理費の更新に失敗しました。', error)
      }

      // --- INSERT ---------------------------------------------------------
      const addedSales = current.sales
        .filter((draft) => draft.id === null)
        .map((draft) => ({
          ...scope,
          category_small: draft.category_small,
          amount: draft.amount,
        }))

      if (addedSales.length > 0) {
        const { error } = await supabase.from('t_sales').insert(addedSales)
        if (error) return fail('売上行の追加に失敗しました。', error)
      }

      type CostInsert = Database['public']['Tables']['t_costs']['Insert']

      const addedCosts: CostInsert[] = current.costs
        .filter((draft) => draft.id === null && draft.work_hours > 0)
        .map((draft) => ({ ...scope, ...buildCostPayload(draft) }))

      if (current.managementId === null && current.managementAmount > 0) {
        addedCosts.push({
          ...scope,
          user_id: null,
          cost_type: CostType.MANAGEMENT,
          work_hours: 0,
          work_days: 0,
          unit_price: 0,
          amount: current.managementAmount,
        })
      }

      if (addedCosts.length > 0) {
        const { error } = await supabase.from('t_costs').insert(addedCosts)
        if (error) return fail('費用行の追加に失敗しました。', error)
      }

      // --- UPSERT ---------------------------------------------------------
      // 年度×月×PJの UNIQUE を競合ターゲットにする（init_schema.sql のコメント参照）。
      const { error: statusError } = await supabase
        .from('t_status')
        .upsert(
          { ...scope, remark: current.remark, updated_by: updatedBy },
          { onConflict: 'fiscal_year,month,project_id' },
        )
      if (statusError) return fail('備考の保存に失敗しました。', statusError)

      return true
    } finally {
      isSaving.value = false
    }
  }

  return {
    form,
    status,
    errorMessage,
    fetchPerformance,
    resetForm,
    isSaving,
    saveErrorMessage,
    savePerformance,
  }
}
