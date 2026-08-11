import type { FetchError } from 'ofetch'
import type { Database } from '~~/types/database.types'
import { FetchStatus } from '~/lib/fetchStatus'
import type { ProjectRowInput } from '~/lib/schemas/project'
import { PG_ERROR_CODE } from '~/lib/pgErrorCodes'

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
  const projects = ref<Project[]>([])
  const status = ref<FetchStatus>(FetchStatus.IDLE)
  const errorMessage = ref<string | null>(null)

  /**
   * m_projects を全件取得する。並び順（ID 昇順）はサーバ側（server/api/projects.get.ts）が保証する。
   *
   * ★ RLS を通らない API サーバ接続だが、requireAppUser による認可は
   *   middleware/auth.global.ts の AUTHORIZED 確認と同じ判定を再現しているため、
   *   0件になるのは本当にプロジェクトがないときだけ。
   */
  const fetchProjects = async (): Promise<void> => {
    status.value = FetchStatus.LOADING
    errorMessage.value = null

    try {
      projects.value = await $fetch<Project[]>('/api/projects')
      status.value = FetchStatus.SUCCESS
    } catch (error) {
      console.error('[useProjects] m_projects の取得に失敗しました', error)
      projects.value = []
      errorMessage.value = 'プロジェクト情報を取得できませんでした。時間をおいて再度お試しください。'
      status.value = FetchStatus.ERROR
    }
  }

  const isSaving = ref(false)
  const saveErrorMessage = ref<string | null>(null)

  /**
   * このプロジェクトに実績があるかを判定する。削除制御に使う。
   *
   * ★ 失敗したら true（実績あり）に倒す。判定できないまま削除を通すと、
   *   実績のあるプロジェクトを消そうとして DB の FK 違反にぶつかり、
   *   保存全体が途中で止まる。安全側は「消させない」。
   */
  const hasPerformanceRecords = async (projectId: number): Promise<boolean> => {
    try {
      const { hasRecords } = await $fetch<{ hasRecords: boolean }>(
        `/api/projects/${projectId}/has-performance`,
      )
      return hasRecords
    } catch (error) {
      console.error('[useProjects] 実績確認に失敗しました', error)
      return true
    }
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
   * ★ DELETE → UPDATE → INSERT の順序は server/api/projects.put.ts のトランザクション内で
   *   維持される。m_projects には UNIQUE 制約がなく順序に必然性はないが、
   *   useMembers（email の UNIQUE 制約により削除を先にする必要がある）と
   *   構造を揃えるためにこの順序にしている。
   *
   * ★ 失敗時は Tx ごとロールバックされるため部分適用は起きない。それでも再取得するのは
   *   画面表示を DB の実状態に合わせるため（保存前の編集内容を残したままにしない）。
   *
   * ★ 変更のあった行だけ UPDATE 対象として送る。全行を投げると無変更行の updated_at まで
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

    const added = drafts.filter((draft) => draft.id === null)

    try {
      await $fetch('/api/projects', {
        method: 'PUT',
        body: {
          drafts: [...pickChanged(drafts, original), ...added],
          deletedIds: [...deletedIds],
        },
      })

      return true
    } catch (error) {
      console.error('[useProjects] プロジェクトの保存に失敗しました', error)
      const pgCode = (error as FetchError)?.data?.data?.pgCode

      saveErrorMessage.value =
        pgCode === PG_ERROR_CODE.FOREIGN_KEY_VIOLATION
          ? '実績データが登録されたため、削除できませんでした。画面を最新の状態に更新します。'
          : 'プロジェクトの保存に失敗しました。'

      return false
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
