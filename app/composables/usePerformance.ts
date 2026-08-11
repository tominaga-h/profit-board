import type { Database } from '~~/types/database.types'
import { FetchStatus } from '~/lib/fetchStatus'
import type { Member } from '~/composables/useMembers'

export type SalesRecord = Database['public']['Tables']['t_sales']['Row']
export type CostRecord = Database['public']['Tables']['t_costs']['Row']
export type StatusRecord = Database['public']['Tables']['t_status']['Row']

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

/** GET /api/performance のレスポンス。server/api/performance.get.ts が返す形。 */
type PerformanceResponse = {
  sales: SalesRecord[]
  costs: CostRecord[]
  status: StatusRecord | null
}

/**
 * 実績入力画面のデータ読込。
 *
 * ★ useState ではなくローカル ref を使う。useMembers / useProjects と同じ判断で、
 *   ページ遷移のたびに作り直されるほうが古いキャッシュが残らず素直に動く。
 */
export const usePerformance = () => {
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
   * 指定した年度×月×プロジェクトの実績を読み込む。
   *
   * サーバ（server/api/performance.get.ts）が t_sales / t_costs / t_status を
   * まとめて返す。列・並び順は移行前の PostgREST 直叩きと同じ形に揃えてあるので、
   * 以降の組み立て処理（buildCostDrafts 等）は変更していない。
   */
  const fetchPerformance = async (
    fiscalYear: number,
    month: number,
    projectId: number,
    members: readonly Member[],
  ): Promise<void> => {
    status.value = FetchStatus.LOADING
    errorMessage.value = null

    let response: PerformanceResponse
    try {
      response = await $fetch<PerformanceResponse>('/api/performance', {
        query: { fiscalYear, month, projectId },
      })
    } catch (error) {
      console.error('[usePerformance] 実績の取得に失敗しました', error)
      errorMessage.value = '実績データを取得できませんでした。時間をおいて再度お試しください。'
      status.value = FetchStatus.ERROR
      return
    }

    const salesRecords = response.sales
    const costRecords = response.costs

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
      remark: response.status?.remark ?? '',
      status: response.status,
    }

    status.value = FetchStatus.SUCCESS
  }

  /** 選択が外れたときにフォームを空へ戻す（前の条件の値が残らないように）。 */
  const resetForm = () => {
    form.value = emptyForm()
    status.value = FetchStatus.IDLE
    errorMessage.value = null
  }

  const isSaving = ref(false)
  const saveErrorMessage = ref<string | null>(null)

  /**
   * 入力内容を保存する。成功したら true。
   *
   * 洗い替えではなく差分で当てる方針は変わらないが、差分計算そのものは
   * サーバ（server/utils/performanceDiff.ts の diffPerformance）が Tx 内で行う。
   * ここでは「望ましい最終状態」を組み立てて送るだけにする。
   *
   * ★ updatedBy 引数は呼び出し側（ページ）のシグネチャを変えないために残すが、
   *   送信はしない。updated_by はサーバが requireAppUser(event) から導出する
   *   （クライアントから任意の文字列を送れると、誰が更新したか偽装できてしまう）。
   */
  const savePerformance = async (
    fiscalYear: number,
    month: number,
    projectId: number,
    _updatedBy: string,
  ): Promise<boolean> => {
    isSaving.value = true
    saveErrorMessage.value = null

    const current = form.value

    try {
      await $fetch('/api/performance', {
        method: 'PUT',
        body: {
          fiscalYear,
          month,
          projectId,
          sales: current.sales.map((draft) => ({
            id: draft.id,
            category_small: draft.category_small,
            amount: draft.amount,
          })),
          costs: current.costs.map((draft) => ({
            id: draft.id,
            user_id: draft.user_id,
            work_hours: draft.work_hours,
            unit_price: draft.unit_price,
          })),
          managementId: current.managementId,
          managementAmount: current.managementAmount,
          duplicatedManagementIds: current.duplicatedManagementIds,
          remark: current.remark,
        },
      })

      return true
    } catch (error) {
      console.error('[usePerformance] 実績の保存に失敗しました', error)
      saveErrorMessage.value = '実績の保存に失敗しました。'
      return false
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
