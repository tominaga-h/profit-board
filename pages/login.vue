<script setup lang="ts">
definePageMeta({ layout: 'auth' })
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
    <!-- TODO(Task 3): 「Googleでログイン」ボタン（Supabase Auth / Google OAuth 2.0） -->
    <!-- TODO(Task 3): m_users に未登録のアカウントへのログイン不可メッセージ表示 -->
  </UCard>
</template>
