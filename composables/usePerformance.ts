import type { Database } from '~/types/database.types'
import { FetchStatus } from '~/lib/fetchStatus'
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

/** SPEC 4.3 が定める売上の初期小項目。 */
export const DEFAULT_SALES_CATEGORIES = ['保守', '保守外（追加開発）'] as const

/** 画面上の売上行。 */
export type SalesDraft = {
  /** v-for の :key。配列添字を使うと行削除で入力値が別の行へ移る。 */
  key: string
  category_small: string
  amount: number
}

/**
 * 画面上のメンバー稼働行。メンバー1人につき必ず1行できる。
 *
 * ★ 稼働のないメンバーの行も作る。SPEC 4.3 の「未入力メンバーが存在する場合の
 *   アラート表示」は、全メンバーの行があって初めて数えられる。
 */
export type CostDraft = {
  key: string
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
  remark: string
  /** 既存の t_status。未登録なら null。「最終更新」表示に使う。 */
  status: StatusRecord | null
}

/**
 * 実績入力画面のデータ読込（SPEC 4.3）。
 *
 * ★ useState ではなくローカル ref を使う。useMembers / useProjects と同じ判断で、
 *   ページ遷移のたびに作り直されるほうが古いキャッシュが残らず素直に動く。
 */
export const usePerformance = () => {
  const supabase = useSupabaseClient<Database>()

  const form = ref<PerformanceForm>({
    sales: [],
    costs: [],
    managementAmount: 0,
    remark: '',
    status: null,
  })

  const status = ref<FetchStatus>(FetchStatus.IDLE)
  const errorMessage = ref<string | null>(null)

  /** 売上の初期2行（SPEC 4.3）。実績が1件もない月に出す。 */
  const buildDefaultSales = (): SalesDraft[] =>
    DEFAULT_SALES_CATEGORIES.map((category) => ({
      key: crypto.randomUUID(),
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
        user_id: member.id,
        label: `${member.family_name} ${member.first_name}`,
        work_hours: record?.work_hours ?? 0,
        unit_price: record?.unit_price ?? member.unit_price,
      }
    })
  }

  /**
   * 管理費の金額を取り出す。
   *
   * ★ user_id が NULL の行が複数あれば合算する。DB には UNIQUE 制約がなく
   *   複数行を作れてしまうため（画面は1行しか出さないので、通常は0か1行）。
   *   合算せず先頭だけ採ると、2行目以降の金額が画面から消えたまま
   *   保存時の洗い替えで失われる。
   */
  const sumManagementAmount = (records: readonly CostRecord[]): number =>
    records
      .filter((record) => record.user_id === null)
      .reduce((total, record) => total + record.amount, 0)

  /**
   * 指定した年度×月×プロジェクトの実績を読み込む。
   *
   * ★ 3テーブルを Promise.all で並列に取る。直列に await すると往復が
   *   3回積み上がり、プルダウンを切り替えるたびの待ちがそのまま3倍になる。
   *   索引 idx_t_sales_fy_month_project / idx_t_costs_fy_month_project は
   *   Task 2 の時点で「実績入力画面の読込（Task 8）」のコメント付きで用意済み。
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

    form.value = {
      // 実績が1件もない月は SPEC 4.3 の初期2行を出す。
      sales:
        salesRecords.length > 0
          ? salesRecords.map((record) => ({
              key: `sales-${record.id}`,
              category_small: record.category_small,
              amount: record.amount,
            }))
          : buildDefaultSales(),
      costs: buildCostDrafts(members, costRecords),
      managementAmount: sumManagementAmount(costRecords),
      remark: statusResult.data?.remark ?? '',
      status: statusResult.data,
    }

    status.value = FetchStatus.SUCCESS
  }

  /** 選択が外れたときにフォームを空へ戻す（前の条件の値が残らないように）。 */
  const resetForm = () => {
    form.value = { sales: [], costs: [], managementAmount: 0, remark: '', status: null }
    status.value = FetchStatus.IDLE
    errorMessage.value = null
  }

  return {
    form,
    status,
    errorMessage,
    fetchPerformance,
    resetForm,
  }
}
