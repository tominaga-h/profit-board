import type { FetchError } from 'ofetch'
import type { Database } from '~~/types/database.types'
import { FetchStatus } from '~/lib/fetchStatus'
import type { MemberRowInput } from '~/lib/schemas/member'
import { PG_ERROR_CODE } from '~/lib/pgErrorCodes'

/** m_users の1行（メンバー）。 */
export type Member = Database['public']['Tables']['m_users']['Row']

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
export type MemberDraft = MemberRowInput & {
  id: number | null
  key: string
}

/**
 * メンバーマスタ（m_users）の一覧を取得して保持する。
 *
 * ★ useState ではなくローカル ref を使う。useAppUser が useState なのは
 *   全ページ常駐のサイドバーが同じ状態を見るためで、一覧画面には当てはまらない。
 *   むしろ編集画面での保存後に古いキャッシュが残るほうが害になる。
 *   ページ遷移で作り直されるほうが、常に最新が出るぶん素直に動く。
 */
export const useMembers = () => {
  const members = ref<Member[]>([])
  const status = ref<FetchStatus>(FetchStatus.IDLE)
  const errorMessage = ref<string | null>(null)

  /**
   * m_users を全件取得する。並び順（ID 昇順）はサーバ側（server/api/members.get.ts）が保証する。
   *
   * ★ RLS を通らない API サーバ接続だが、requireAppUser による認可は
   *   middleware/auth.global.ts の AUTHORIZED 確認と同じ判定を再現しているため、
   *   0件になるのは本当にメンバーがいないときだけ。
   */
  const fetchMembers = async (): Promise<void> => {
    status.value = FetchStatus.LOADING
    errorMessage.value = null

    try {
      members.value = await $fetch<Member[]>('/api/members')
      status.value = FetchStatus.SUCCESS
    } catch (error) {
      console.error('[useMembers] m_users の取得に失敗しました', error)
      members.value = []
      errorMessage.value = 'メンバー情報を取得できませんでした。時間をおいて再度お試しください。'
      status.value = FetchStatus.ERROR
    }
  }

  const isSaving = ref(false)
  const saveErrorMessage = ref<string | null>(null)

  /**
   * このメンバーに費用実績（t_costs）があるかを判定する。削除制御に使う。
   *
   * ★ 失敗したら true（実績あり）に倒す。判定できないまま削除を通すと、
   *   実績のあるメンバーを消そうとして DB の FK 違反にぶつかり、
   *   保存全体が途中で止まる。安全側は「消させない」。
   */
  const hasCostRecords = async (userId: number): Promise<boolean> => {
    try {
      const { hasRecords } = await $fetch<{ hasRecords: boolean }>(
        `/api/members/${userId}/has-costs`,
      )
      return hasRecords
    } catch (error) {
      console.error('[useMembers] t_costs の実績確認に失敗しました', error)
      return true
    }
  }

  /** 既存行のうち、取得時から値が変わったものだけを拾う。 */
  const pickChanged = (drafts: readonly MemberDraft[], original: ReadonlyMap<number, Member>) =>
    drafts.filter((draft): draft is MemberDraft & { id: number } => {
      if (draft.id === null) return false
      const before = original.get(draft.id)
      if (!before) return false
      return (
        before.family_name !== draft.family_name ||
        before.first_name !== draft.first_name ||
        before.email !== draft.email ||
        before.unit_price !== draft.unit_price
      )
    })

  /**
   * 編集内容を一括保存する。成功したら true。
   *
   * ★ DELETE → UPDATE → INSERT の順序は server/api/members.put.ts のトランザクション内で
   *   維持される（削除したメンバーのメールを別行へ付け替えるケースで、同一 Tx 内でも
   *   UNIQUE 制約は文単位で即時評価されるため、順序自体は消えない）。
   *
   * ★ 失敗時は Tx ごとロールバックされるため部分適用は起きない。それでも再取得するのは
   *   画面表示を DB の実状態に合わせるため（保存前の編集内容を残したままにしない）。
   *
   * ★ 変更のあった行だけ UPDATE 対象として送る。全行を投げると無変更行の updated_at まで
   *   動き、「誰がいつ触ったか」が追えなくなる。
   */
  const saveMembers = async (
    drafts: readonly MemberDraft[],
    deletedIds: readonly number[],
    original: ReadonlyMap<number, Member>,
  ): Promise<boolean> => {
    isSaving.value = true
    saveErrorMessage.value = null

    // 未変更の既存行はサーバに送らない。サーバ側は受け取った drafts のうち
    // id ありは UPDATE、id なし（新規行）は INSERT として扱うため、
    // 変更行だけを渡せばそのまま「変更行のみ更新」になる。
    const added = drafts.filter((draft) => draft.id === null)

    try {
      await $fetch('/api/members', {
        method: 'PUT',
        body: {
          drafts: [...pickChanged(drafts, original), ...added],
          deletedIds: [...deletedIds],
        },
      })

      return true
    } catch (error) {
      console.error('[useMembers] メンバーの保存に失敗しました', error)
      const pgCode = (error as FetchError)?.data?.data?.pgCode

      saveErrorMessage.value =
        pgCode === PG_ERROR_CODE.FOREIGN_KEY_VIOLATION
          ? '実績データが登録されたため、削除できませんでした。画面を最新の状態に更新します。'
          : pgCode === PG_ERROR_CODE.UNIQUE_VIOLATION
            ? 'メールアドレスが重複しているため保存できませんでした。'
            : 'メンバーの保存に失敗しました。'

      return false
    } finally {
      isSaving.value = false
    }
  }

  return {
    members,
    status,
    errorMessage,
    fetchMembers,
    isSaving,
    saveErrorMessage,
    hasCostRecords,
    saveMembers,
  }
}
