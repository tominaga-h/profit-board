import type { Database } from '~/types/database.types'
import { FetchStatus } from '~/lib/fetchStatus'
import type { ProjectRowInput } from '~/lib/schemas/project'

/** m_projects の1行（プロジェクト）。 */
export type Project = Database['public']['Tables']['m_projects']['Row']

/**
 * 編集画面が持つ1行。
 *
 * ★ id は「まだ採番されていない新規行」を null で表す。0 や -1 で代用すると
 *   既存行の id と混ざり、UPDATE すべき行を INSERT してしまう。
 *
 * ★ key は v-model と :key のための画面内の識別子で、DB とは無関係。
 *   id は新規行では null なので :key に使えず、配列添字を使うと
 *   行削除のたびに後続行の key がずれて入力中の値が別の行へ移る。
 */
export type ProjectDraft = ProjectRowInput & {
  id: number | null
  key: string
}

/**
 * プロジェクトマスタ（m_projects）の取得と保存。
 *
 * ★ useMembers と同じ構造だが、m_projects には UNIQUE 制約が一切ない点が違う。
 *   同名の行を DB は受け入れるので 23505 は起こりえず、その分岐は持たない。
 *
 * ★ useState ではなくローカル ref を使う理由は useMembers と同じ。
 *   ページ遷移で作り直されるほうが、保存後に古いキャッシュが残らず素直に動く。
 */
export const useProjects = () => {
  const supabase = useSupabaseClient<Database>()

  const projects = ref<Project[]>([])
  const status = ref<FetchStatus>(FetchStatus.IDLE)
  const errorMessage = ref<string | null>(null)

  /**
   * m_projects を全件取得する。
   *
   * ★ order('id') は省略しない。PostgREST は ORDER BY がないと行順を保証せず、
   *   UPDATE した行だけが末尾に飛ぶ挙動になりうる。
   *   ID 昇順は登録順であり、「行追加は末尾」という仕様とも整合する。
   */
  const fetchProjects = async (): Promise<void> => {
    status.value = FetchStatus.LOADING
    errorMessage.value = null

    const { data, error } = await supabase
      .from('m_projects')
      .select('*')
      .order('id', { ascending: true })

    if (error) {
      console.error('[useProjects] m_projects の取得に失敗しました', error)
      projects.value = []
      errorMessage.value = 'プロジェクト情報を取得できませんでした。時間をおいて再度お試しください。'
      status.value = FetchStatus.ERROR
      return
    }

    projects.value = data ?? []
    status.value = FetchStatus.SUCCESS
  }

  const isSaving = ref(false)
  const saveErrorMessage = ref<string | null>(null)

  /**
   * このプロジェクトに実績があるかを判定する。削除制御に使う。
   *
   * ★ 見るのは3テーブル。仕様の文言は t_sales / t_costs だけだが、
   *   t_status も project_id の外部キーを持つ（init_schema.sql の t_status DDL）。
   *   ここから漏らすと「削除できます」と見せてから、保存時に FK 違反で落ちる。
   *   押した時点で拒否するという仕様の意図に合わせて3つとも見る。
   *
   * ★ Promise.all で並列に投げる。順番に await すると往復が3回積み上がり、
   *   ゴミ箱を押してからボタンが戻るまでの待ちがそのまま3倍になる。
   *
   * ★ head: true で本体を転送しない。存在するかどうかしか要らないため。
   *   idx_t_sales_project_id / idx_t_costs_project_id は DDL 側に
   *   「プロジェクト削除ガード」のコメント付きで用意されている。
   *   t_status は UNIQUE (fiscal_year, month, project_id) の先頭列が
   *   fiscal_year なので project_id 単独では索引が効かないが、
   *   年度×月×PJで1行しかできず件数が小さいので許容する。
   *
   * ★ 1つでも失敗したら true（実績あり）に倒す。判定できないまま削除を通すと、
   *   実績のあるプロジェクトを消そうとして DB の FK 違反にぶつかり、
   *   保存全体が途中で止まる。安全側は「消させない」。
   */
  const hasPerformanceRecords = async (projectId: number): Promise<boolean> => {
    const countIn = async (table: 't_sales' | 't_costs' | 't_status'): Promise<number | null> => {
      const { count, error } = await supabase
        .from(table)
        .select('id', { head: true, count: 'exact' })
        .eq('project_id', projectId)
        .limit(1)

      if (error) {
        console.error(`[useProjects] ${table} の実績確認に失敗しました`, error)
        return null
      }

      return count ?? 0
    }

    const counts = await Promise.all([countIn('t_sales'), countIn('t_costs'), countIn('t_status')])

    return counts.some((count) => count === null || count > 0)
  }

  /** 既存行のうち、取得時から値が変わったものだけを拾う。 */
  const pickChanged = (drafts: readonly ProjectDraft[], original: ReadonlyMap<number, Project>) =>
    drafts.filter((draft): draft is ProjectDraft & { id: number } => {
      if (draft.id === null) return false
      const before = original.get(draft.id)
      if (!before) return false
      return (
        before.service_name !== draft.service_name || before.company_name !== draft.company_name
      )
    })

  /**
   * 編集内容を一括保存する。成功したら true。
   *
   * ★ 実行順は DELETE → UPDATE → INSERT。useMembers と揃えているが、
   *   こちらに順序の必然性はない。m_users は email の UNIQUE 制約があり、
   *   削除した行のメールを別の行に付け替えると一時的に重複するため
   *   DELETE を先に置く必要があった。m_projects には UNIQUE がないので
   *   どの順でも同じ結果になる。2画面で揃えているのは読む側の都合であって、
   *   ここに制約回避の意味を読み取らないこと。
   *
   * ★ supabase-js はトランザクションを張れないので、途中で失敗すると
   *   部分適用になる。呼び出し側は false を受けたら必ず再取得して、
   *   画面を DB の実状態に合わせること。
   *
   * ★ 変更のあった行だけ UPDATE する。全行を投げると無変更行の updated_at まで
   *   動き、「いつ触ったか」が追えなくなる。
   *
   * ★ 23505（UNIQUE 違反）の分岐は持たない。m_projects に一意制約がなく、
   *   書いても到達しない死んだコードになる。23503（FK 違反）は起こりうる。
   */
  const saveProjects = async (
    drafts: readonly ProjectDraft[],
    deletedIds: readonly number[],
    original: ReadonlyMap<number, Project>,
  ): Promise<boolean> => {
    isSaving.value = true
    saveErrorMessage.value = null

    try {
      if (deletedIds.length > 0) {
        const { error } = await supabase.from('m_projects').delete().in('id', [...deletedIds])

        if (error) {
          console.error('[useProjects] プロジェクトの削除に失敗しました', error)
          // 23503 = FK 違反。ゴミ箱押下時のチェックをすり抜けるのは、
          // その後に他の利用者が実績を登録した場合。
          saveErrorMessage.value =
            error.code === '23503'
              ? '実績データが登録されたため、削除できませんでした。画面を最新の状態に更新します。'
              : 'プロジェクトの削除に失敗しました。'
          return false
        }
      }

      for (const draft of pickChanged(drafts, original)) {
        const { error } = await supabase
          .from('m_projects')
          // updated_at は送らない。トリガ trg_m_projects_updated_at が自動で更新する。
          .update({ service_name: draft.service_name, company_name: draft.company_name })
          .eq('id', draft.id)

        if (error) {
          console.error('[useProjects] プロジェクトの更新に失敗しました', error)
          saveErrorMessage.value = `「${draft.service_name}」の更新に失敗しました。`
          return false
        }
      }

      const added = drafts.filter((draft) => draft.id === null)

      if (added.length > 0) {
        const { error } = await supabase.from('m_projects').insert(
          // ★ id は送らない。SERIAL の自動採番に任せる。明示するとシーケンスの
          //   現在値がズレて、次の INSERT が主キー衝突する（seed.sql と同じ理由）。
          added.map((draft) => ({
            service_name: draft.service_name,
            company_name: draft.company_name,
          })),
        )

        if (error) {
          console.error('[useProjects] プロジェクトの追加に失敗しました', error)
          saveErrorMessage.value = 'プロジェクトの追加に失敗しました。'
          return false
        }
      }

      return true
    } finally {
      isSaving.value = false
    }
  }

  return {
    projects,
    status,
    errorMessage,
    fetchProjects,
    isSaving,
    saveErrorMessage,
    hasPerformanceRecords,
    saveProjects,
  }
}
