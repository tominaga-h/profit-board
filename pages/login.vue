<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const supabase = useSupabaseClient()
const route = useRoute()
const { signOut } = useAppUser()

const isSigningIn = ref(false)
const errorMessage = ref<string | null>(null)

/**
 * 未登録アカウントの後始末。
 *
 * ミドルウェアは ?error=unregistered を付けてここへ飛ばすだけで、
 * サインアウトはこの画面で行う。ミドルウェア内で await signOut() すると
 * セッション破棄→onAuthStateChange→再度ミドルウェア発火、と競合しやすいため。
 *
 * 「セッションが残らない」ことが受け入れ基準なので、ここは確実に実行する。
 */
onMounted(async () => {
  if (route.query.error === 'unregistered') {
    errorMessage.value =
      'このGoogleアカウントは利用登録がありません。管理者にメンバー登録を依頼してください。'
    await signOut()
  }
})

const signInWithGoogle = async () => {
  isSigningIn.value = true
  errorMessage.value = null

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Google 側の「承認済みリダイレクトURI」に登録するのは Supabase の
      // /auth/v1/callback。ここで指定するのは、その後アプリに戻ってくる先。
      // window.location.origin を使うのは、localhost と本番で同じコードを動かすため。
      redirectTo: `${window.location.origin}/confirm`,
    },
  })

  if (error) {
    // 正常時はGoogleへ画面遷移するのでここには来ない。
    // 到達するのは設定不備（プロバイダ未有効化など）のとき。
    console.error('[login] Google OAuth の開始に失敗しました', error)
    errorMessage.value = 'ログインを開始できませんでした。時間をおいて再度お試しください。'
    isSigningIn.value = false
  }
}
</script>

<template>
  <!-- フッター（© 表記）はデザイン上カードの外に置くため、max-w-sm はこのラッパーが持つ。 -->
  <div class="w-full max-w-md">
    <UCard class="py-10 px-7 shadow-lg">
      <div class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-600 text-white">
        <UIcon name="i-lucide-chart-column" class="h-7 w-7" />
      </div>

      <h1 class="mt-4 text-center text-2xl font-bold text-slate-900">ProfitBoard</h1>
      <p class="mt-1 text-center text-sm text-slate-500">営業成績管理システム</p>

      <UAlert
        v-if="errorMessage"
        class="mt-4"
        color="red"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="errorMessage"
      />

      <UButton
        class="mt-6 py-4 w-full justify-center shadow-lg"
        size="lg"
        color="white"
        variant="solid"
        icon="i-logos-google-icon"
        :loading="isSigningIn"
        :disabled="isSigningIn"
        @click="signInWithGoogle"
      >
        Googleでログイン
      </UButton>

      <p class="mt-5 text-center text-xs text-slate-400">
        社内アカウント（@mad2007.co.jp）のみログインできます
      </p>
    </UCard>

    <p class="mt-6 text-center text-xs text-slate-400">© 2026 ProfitBoard</p>
  </div>
</template>
