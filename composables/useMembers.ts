import type { Database } from '~/types/database.types'
import { FetchStatus } from '~/lib/fetchStatus'
import type { MemberRowInput } from '~/lib/schemas/member'

/** m_users の1行（メンバー）。 */
export type Member = Database['public']['Tables']['m_users']['Row']

/**
 * 編集画面が持つ1行（Task 6）。
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
 * メンバーマスタ（m_users）の一覧を取得して保持する（SPEC 4.4）。
 *
 * ★ useState ではなくローカル ref を使う。useAppUser が useState なのは
 *   全ページ常駐のサイドバーが同じ状態を見るためで、一覧画面には当てはまらない。
 *   むしろ Task 6 の編集後に古いキャッシュが残るほうが害になる。
 *   ページ遷移で作り直されるほうが、常に最新が出るぶん素直に動く。
 */
export const useMembers = () => {
  const supabase = useSupabaseClient<Database>()

  const members = ref<Member[]>([])
  const status = ref<FetchStatus>(FetchStatus.IDLE)
  const errorMessage = ref<string | null>(null)

  /**
   * m_users を全件取得する。
   *
   * ★ order('id') は省略しない。PostgREST は ORDER BY がないと行順を保証せず、
   *   Task 6 で UPDATE した行だけが末尾に飛ぶ挙動になりうる。
   *   ID 昇順は登録順であり、SPEC 4.4 の「行追加は末尾」とも整合する。
   *
   * ★ RLS（m_users_select_app_user）により未登録ユーザーには0件しか返らないが、
   *   この画面に来た時点で middleware/auth.global.ts が AUTHORIZED を
   *   確認済みなので、0件になるのは本当にメンバーがいないときだけ。
   */
  const fetchMembers = async (): Promise<void> => {
    status.value = FetchStatus.LOADING
    errorMessage.value = null

    const { data, error } = await supabase
      .from('m_users')
      .select('*')
      .order('id', { ascending: true })

    if (error) {
      console.error('[useMembers] m_users の取得に失敗しました', error)
      members.value = []
      errorMessage.value = 'メンバー情報を取得できませんでした。時間をおいて再度お試しください。'
      status.value = FetchStatus.ERROR
      return
    }

    members.value = data ?? []
    status.value = FetchStatus.SUCCESS
  }

  // --- 以下は編集画面（Task 6）で使う ---------------------------------

  const isSaving = ref(false)
  const saveErrorMessage = ref<string | null>(null)

  /**
   * このメンバーに費用実績（t_costs）があるかを判定する（SPEC 4.4 の削除制御）。
   *
   * ★ head: true で本体を転送しない。存在するかどうかしか要らないため。
   *   索引 idx_t_costs_user_id が Task 2 の時点で用意されている。
   *
   * ★ 失敗したら true（実績あり）に倒す。判定できないまま削除を通すと、
   *   実績のあるメンバーを消そうとして DB の FK 違反にぶつかり、
   *   保存全体が途中で止まる。安全側は「消させない」。
   */
  const hasCostRecords = async (userId: number): Promise<boolean> => {
    const { count, error } = await supabase
      .from('t_costs')
      .select('id', { head: true, count: 'exact' })
      .eq('user_id', userId)
      .limit(1)

    if (error) {
      console.error('[useMembers] t_costs の実績確認に失敗しました', error)
      return true
    }

    return (count ?? 0) > 0
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
   * 編集内容を一括保存する（Task 6）。成功したら true。
   *
   * ★ 実行順は DELETE → UPDATE → INSERT。削除を先にするのは、消したメンバーの
   *   メールアドレスを別の行に付け替えるケースがあるため。順序を変えると
   *   一時的に同じメールが2行存在し、UNIQUE 制約（m_users_email_key）に当たる。
   *
   * ★ supabase-js はトランザクションを張れないので、途中で失敗すると
   *   部分適用になる。呼び出し側は false を受けたら必ず再取得して、
   *   画面を DB の実状態に合わせること。
   *
   * ★ 変更のあった行だけ UPDATE する。全行を投げると無変更行の updated_at まで
   *   動き、「誰がいつ触ったか」が追えなくなる。
   */
  const saveMembers = async (
    drafts: readonly MemberDraft[],
    deletedIds: readonly number[],
    original: ReadonlyMap<number, Member>,
  ): Promise<boolean> => {
    isSaving.value = true
    saveErrorMessage.value = null

    try {
      if (deletedIds.length > 0) {
        const { error } = await supabase.from('m_users').delete().in('id', [...deletedIds])

        if (error) {
          console.error('[useMembers] メンバーの削除に失敗しました', error)
          // 23503 = FK 違反。ゴミ箱押下時のチェックをすり抜けるのは、
          // その後に他の利用者が実績を登録した場合。
          saveErrorMessage.value =
            error.code === '23503'
              ? '実績データが登録されたため、削除できませんでした。画面を最新の状態に更新します。'
              : 'メンバーの削除に失敗しました。'
          return false
        }
      }

      for (const draft of pickChanged(drafts, original)) {
        const { error } = await supabase
          .from('m_users')
          // updated_at は送らない。トリガ trg_m_users_updated_at が自動で更新する。
          .update({
            family_name: draft.family_name,
            first_name: draft.first_name,
            email: draft.email,
            unit_price: draft.unit_price,
          })
          .eq('id', draft.id)

        if (error) {
          console.error('[useMembers] メンバーの更新に失敗しました', error)
          saveErrorMessage.value =
            error.code === '23505'
              ? `メールアドレス「${draft.email}」は既に登録されています。`
              : `「${draft.family_name} ${draft.first_name}」の更新に失敗しました。`
          return false
        }
      }

      const added = drafts.filter((draft) => draft.id === null)

      if (added.length > 0) {
        const { error } = await supabase.from('m_users').insert(
          // ★ id は送らない。SERIAL の自動採番に任せる。明示するとシーケンスの
          //   現在値がズレて、次の INSERT が主キー衝突する（seed.sql と同じ理由）。
          added.map((draft) => ({
            family_name: draft.family_name,
            first_name: draft.first_name,
            email: draft.email,
            unit_price: draft.unit_price,
          })),
        )

        if (error) {
          console.error('[useMembers] メンバーの追加に失敗しました', error)
          saveErrorMessage.value =
            error.code === '23505'
              ? '追加したメールアドレスが既に登録されています。'
              : 'メンバーの追加に失敗しました。'
          return false
        }
      }

      return true
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
