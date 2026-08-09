<script setup lang="ts">
/**
 * OAuth コールバックの受け口。
 *
 * Google → Supabase(/auth/v1/callback) → ここ、という順で戻ってくる。
 * URL に付く ?code=... は supabase-js が detectSessionInUrl で自動的に
 * セッションへ交換するため、この画面はその完了を待って振り分けるだけでよい。
 *
 * 認証の中継地点なのでサイドバーは出さない（auth レイアウト）。
 */
definePageMeta({ layout: 'auth' })

const session = useSupabaseSession()
const { resolve } = useAppUser()

const errorMessage = ref<string | null>(null)

/**
 * セッション確立を待つ時間の上限。
 *
 * これが無いと、コードの交換に失敗したときに「読み込み中」のまま画面が固まる。
 * ユーザーには原因が分からないので、必ず /login まで戻して理由を出す。
 */
const SESSION_TIMEOUT_MS = 10_000

onMounted(async () => {
  // すでにセッションがあれば即座に進む。無ければ確立を待つ。
  if (!session.value) {
    const established = await new Promise<boolean>((resolveWait) => {
      const timer = setTimeout(() => {
        stop()
        resolveWait(false)
      }, SESSION_TIMEOUT_MS)

      // useSupabaseSession は onAuthStateChange で更新されるので、
      // watch していれば交換完了の瞬間に反応できる。
      const stop = watch(
        session,
        (value) => {
          if (value) {
            clearTimeout(timer)
            stop()
            resolveWait(true)
          }
        },
        { immediate: true },
      )
    })

    if (!established) {
      errorMessage.value = 'ログインに失敗しました。もう一度お試しください。'
      await navigateTo('/login', { replace: true })
      return
    }
  }

  // m_users と照合してから行き先を決める（SPEC 3.1）。
  const status = await resolve()

  // replace: true で履歴を残さない。戻るボタンで ?code= 付きの URL に
  // 戻ってしまうと、使用済みコードの再交換でエラーになる。
  if (status === 'authorized') {
    await navigateTo('/dashboard', { replace: true })
  } else {
    // 未登録アカウント。サインアウトは /login 側で行う。
    await navigateTo('/login?error=unregistered', { replace: true })
  }
})
</script>

<template>
  <UCard class="w-full max-w-sm">
    <div class="flex items-center gap-3">
      <UIcon
        v-if="!errorMessage"
        name="i-lucide-loader-circle"
        class="h-5 w-5 shrink-0 animate-spin text-blue-600"
      />
      <p class="text-sm text-slate-600">
        {{ errorMessage ?? 'ログイン処理中です...' }}
      </p>
    </div>
  </UCard>
</template>
