<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const supabase = useSupabaseClient()
const route = useRoute()
const { signOut } = useAppUser()

const isSigningIn = ref(false)
const errorMessage = ref<string | null>(null)

/**
 * 未登録アカウントの後始末（SPEC 3.1）。
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
  <UCard class="w-full max-w-sm">
    <div class="flex items-center gap-2.5">
      <div class="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 text-white">
        <UIcon name="i-lucide-chart-column" class="h-5 w-5" />
      </div>
      <span class="text-lg font-bold text-slate-900">ProfitBoard</span>
    </div>

    <p class="mt-4 text-sm text-slate-500">ログインしてください</p>

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
  </UCard>
</template>
