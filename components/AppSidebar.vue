<script setup lang="ts">
type NavItem = {
  label: string
  /** undefined の項目は非活性（リンクにしない） */
  to?: string
  icon: string
}

const navItems: NavItem[] = [
  { label: 'ダッシュボード', to: '/dashboard', icon: 'i-lucide-layout-dashboard' },
  { label: 'プロジェクト一覧', to: '/projects', icon: 'i-lucide-folder-kanban' },
  { label: '実績入力', to: '/performance/input', icon: 'i-lucide-pencil-line' },
  { label: 'メンバー', to: '/members', icon: 'i-lucide-users' },
  // plan.md A7: SPEC に機能要件がないためスコープ外。非活性で表示のみ。
  { label: 'レポート', icon: 'i-lucide-file-text' },
  { label: '設定', icon: 'i-lucide-settings' },
]

const route = useRoute()

/**
 * 前方一致で判定する。編集画面は一覧の配下という位置づけなので、
 * /projects/edit では「プロジェクト一覧」が、/members/edit では「メンバー」が光る。
 * NuxtLink の active-class（部分一致）や exact-active-class では
 * この挙動を意図どおりに揃えられない。
 */
const isActive = (to?: string) => {
  if (!to) return false
  return route.path === to || route.path.startsWith(`${to}/`)
}

// Task 3 でログインユーザーの実データに差し替える（composables/useAppUser.ts）。
// plan.md A1 により部門は表示しない。
const currentUser = {
  name: 'ゲスト',
  caption: '未ログイン',
  initial: 'G',
}
</script>

<template>
  <aside class="flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
    <!-- ロゴ -->
    <div class="flex items-center gap-2.5 px-5 py-5">
      <div class="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 text-white">
        <UIcon name="i-lucide-chart-column" class="h-5 w-5" />
      </div>
      <span class="text-lg font-bold text-slate-900">ProfitBoard</span>
    </div>

    <!-- ナビゲーション -->
    <nav class="flex-1 space-y-1 px-3 py-2">
      <template v-for="item in navItems" :key="item.label">
        <NuxtLink
          v-if="item.to"
          :to="item.to"
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors"
          :class="
            isActive(item.to)
              ? 'bg-blue-50 font-semibold text-blue-700'
              : 'text-slate-600 hover:bg-slate-50'
          "
        >
          <UIcon :name="item.icon" class="h-5 w-5 shrink-0" />
          <span>{{ item.label }}</span>
        </NuxtLink>

        <!--
          非活性項目は <a> ではなく <span> にする。
          <a> に disabled 属性は効かないため。
        -->
        <span
          v-else
          aria-disabled="true"
          class="flex cursor-not-allowed select-none items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400"
        >
          <UIcon :name="item.icon" class="h-5 w-5 shrink-0" />
          <span>{{ item.label }}</span>
        </span>
      </template>
    </nav>

    <!-- ログインユーザー -->
    <div class="mt-auto border-t border-slate-200 p-4">
      <div class="flex items-center gap-3">
        <div
          class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700"
        >
          {{ currentUser.initial }}
        </div>
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-slate-900">{{ currentUser.name }}</p>
          <p class="truncate text-xs text-slate-500">{{ currentUser.caption }}</p>
        </div>
      </div>
    </div>
  </aside>
</template>
