<script setup lang="ts">
export type BreadcrumbItem = {
  label: string
  to?: string
}

defineProps<{ items: BreadcrumbItem[] }>()
</script>

<template>
  <nav aria-label="パンくず" class="mb-2">
    <ol class="flex flex-wrap items-center gap-1.5 text-xs">
      <li v-for="(item, index) in items" :key="item.label" class="flex items-center gap-1.5">
        <UIcon
          v-if="index > 0"
          name="i-lucide-chevron-right"
          class="h-3.5 w-3.5 shrink-0 text-slate-300"
        />

        <!--
          リンクにするかは to の有無ではなく最後の要素かで決める。to だけで見ると、
          呼び出し側が末尾に to を渡したとき現在地が自分自身へのリンクになる。
        -->
        <span v-if="index === items.length - 1" aria-current="page" class="font-semibold text-slate-900">
          {{ item.label }}
        </span>

        <NuxtLink v-else-if="item.to" :to="item.to" class="text-slate-500 hover:text-blue-600">
          {{ item.label }}
        </NuxtLink>

        <span v-else class="text-slate-500">{{ item.label }}</span>
      </li>
    </ol>
  </nav>
</template>
