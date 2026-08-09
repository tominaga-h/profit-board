import type { Database } from '~/types/database.types'

/** m_users の1行（アプリ利用が許可されたメンバー） */
export type AppUser = Database['public']['Tables']['m_users']['Row']

/**
 * 認証状態の解決フェーズ。
 *
 * `null`（未解決）と「照合の結果アクセス不可」を型で区別するために用意する。
 * これを boolean 2つで表すと「まだ読み込み中」と「拒否された」が混ざり、
 * ミドルウェアが解決前にリダイレクトを撃ってしまう。
 */
export const AppUserStatus = {
  /** まだ照合していない（初期状態） */
  IDLE: 'idle',
  /** m_users へ問い合わせ中 */
  LOADING: 'loading',
  /** 認証済みかつ m_users に登録あり → アプリ利用可 */
  AUTHORIZED: 'authorized',
  /** 未認証（セッションなし） */
  UNAUTHENTICATED: 'unauthenticated',
  /** 認証済みだが m_users に未登録 → SPEC 3.1 によりアクセス不可 */
  UNREGISTERED: 'unregistered'
} as const
export type AppUserStatus = (typeof AppUserStatus)[keyof typeof AppUserStatus]


/**
 * ログイン中ユーザーが m_users に登録されているかを解決し、その結果を保持する。
 *
 * SPEC 3.1「Supabase Auth で Google 認証後、m_users に存在するメールのみ許可」を
 * アプリ側で実装する部分。DB側は RLS（is_app_user()）が同じ条件で二重に守っている。
 */
export const useAppUser = () => {
  const supabase = useSupabaseClient<Database>()
  const claims = useSupabaseUser()

  // useState でリクエスト/ページ遷移をまたいで共有する。
  // ページごとに問い合わせ直すとサイドバーがちらつくため。
  const appUser = useState<AppUser | null>('app-user', () => null)
  const status = useState<AppUserStatus>('app-user-status', () => AppUserStatus.IDLE)

  /**
   * JWT のトップレベル `email` クレームを取り出す。
   *
   * ★ user_metadata.email は使わない。updateUser() でユーザー自身が書き換えられるため、
   *   認可に使うと任意のメールを名乗れる権限昇格の穴になる（RLS 側と同じ判断）。
   *   JwtPayload 型では email は必須クレームではないため、string である保証はない。
   */
  const authEmail = computed(() => {
    const email = claims.value?.email
    return typeof email === 'string' && email.length > 0 ? email : null
  })

  /**
   * m_users を照合して status / appUser を更新する。
   *
   * 認可判断そのものなので、失敗時は必ず「拒否側」に倒す（fail-closed）。
   */
  const resolve = async (): Promise<AppUserStatus> => {
    const email = authEmail.value

    // セッションが無い、またはメールクレームが取れない場合は未認証扱い。
    // メールが取れないケースを「許可」に倒すと照合を素通りするので、ここは必ず弾く。
    if (!email) {
      appUser.value = null
      status.value = 'unauthenticated'
      return status.value
    }

    status.value = AppUserStatus.LOADING

    // RLS により、m_users に未登録のユーザーからは 0 件しか返らない。
    // つまりこの照合はアプリ側とDB側の両方で成立している。
    const { data, error } = await supabase
      .from('m_users')
      .select('*')
      .eq('email', email)
      .maybeSingle()

    if (error) {
      // 通信断・RLS拒否などは「登録済み」と見なさない。
      console.error('[useAppUser] m_users の照合に失敗しました', error)
      appUser.value = null
      status.value = AppUserStatus.UNREGISTERED
      return status.value
    }

    appUser.value = data ?? null
    status.value = data ? AppUserStatus.AUTHORIZED : AppUserStatus.UNREGISTERED
    return status.value
  }

  /** サインアウトして状態を捨てる。未登録アカウントを弾くときにも使う。 */
  const signOut = async () => {
    await supabase.auth.signOut()
    appUser.value = null
    status.value = 'unauthenticated'
  }

  /** 姓名を結合した表示名。未解決なら null。 */
  const displayName = computed(() =>
    appUser.value ? `${appUser.value.family_name} ${appUser.value.first_name}` : null,
  )

  return {
    appUser,
    status,
    authEmail,
    displayName,
    resolve,
    signOut,
  }
}
