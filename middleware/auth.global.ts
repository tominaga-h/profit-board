/**
 * 全ルート共通の認証ガード。
 *
 * ■ なぜ自前で書くか
 *   @nuxtjs/supabase の内蔵リダイレクト（redirect: true）は「セッションの有無」しか見ない。
 *   ProfitBoard の要件は「認証済み かつ m_users に登録済み」なので、内蔵に任せると
 *   未登録のGoogleアカウントでも全画面に入れてしまう。そのため nuxt.config.ts で
 *   redirect: false にし、判定をここへ一本化している。
 *
 * ■ 判定の流れ
 *   セッションなし              → /login へ
 *   セッションあり・m_users あり → 通す（/login に来たら /dashboard へ）
 *   セッションあり・m_users なし → /login?error=unregistered へ（サインアウトは login 側で実施）
 */

import { AppUserStatus } from "~/composables/useAppUser"

/** 認証なしで到達できるパス。 */
const PUBLIC_PATHS = new Set(['/login', '/confirm'])

export default defineNuxtRouteMiddleware(async (to) => {
  // SPAモード（ssr: false）なのでサーバ側では動かないが、
  // 将来 ssr を有効化しても誤作動しないよう明示的に抜ける。
  // ここを書かないと、セッション復元前のサーバ側で全リクエストが /login に飛ぶ。
  if (import.meta.server) return

  const session = useSupabaseSession()
  const { status, resolve, appUser } = useAppUser()

  // /confirm は OAuth のコールバック受け口。セッション確立の途中なので素通しする。
  if (to.path === '/confirm') return

  // --- セッションなし ---------------------------------------------------
  if (!session.value) {
    // ログイン画面自身は通す（ここで弾くとリダイレクトループになる）。
    if (PUBLIC_PATHS.has(to.path)) return
    return navigateTo('/login')
  }

  // --- セッションあり ---------------------------------------------------
  // ページ遷移のたびに問い合わせると無駄なので、解決済みなら再利用する。
  if (status.value === AppUserStatus.IDLE || (status.value !== AppUserStatus.LOADING && !appUser.value)) {
    await resolve()
  }

  // 未登録アカウント（ログイン不可）
  if (status.value !== AppUserStatus.AUTHORIZED) {
    // 既に /login にいるなら遷移不要。ここで navigateTo するとループする。
    if (to.path === '/login') return
    return navigateTo('/login?error=unregistered')
  }

  // 認証済みユーザーがログイン画面に来たらダッシュボードへ送る。
  if (to.path === '/login') {
    return navigateTo('/dashboard')
  }
})
