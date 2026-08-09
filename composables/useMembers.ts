import type { Database } from '~/types/database.types'
import { FetchStatus } from '~/lib/fetchStatus'

/** m_users の1行（メンバー）。 */
export type Member = Database['public']['Tables']['m_users']['Row']

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

  return {
    members,
    status,
    errorMessage,
    fetchMembers,
  }
}
