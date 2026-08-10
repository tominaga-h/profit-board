<script setup lang="ts">
import { FetchStatus } from '~/lib/fetchStatus'

// 保存系も返るが、この画面は取得しかしないので受け取らない。
const { projects, status, errorMessage, fetchProjects } = useProjects()

onMounted(fetchProjects)
</script>

<template>
  <div>
    <Breadcrumbs :items="[{ label: 'プロジェクト一覧' }]" />

    <PageHeader title="プロジェクトを選択" :subtitle="status === FetchStatus.SUCCESS
      ? `全${projects.length}件・プロジェクトを選ぶと年度→月の順で実績を閲覧できます`
      : 'プロジェクトを選ぶと年度→月の順で実績を閲覧できます'
      ">
      <template #actions>
        <!--
          color="white" は bg-white + ring-gray-300 を持つ。gray/outline だと
          背景が透明でページ地色が透け、gray/solid だと bg-gray-50 で灰色になる。
        -->
        <UButton to="/projects/edit" icon="i-lucide-square-pen" color="white" class="py-2.5 px-4">
          プロジェクト編集
        </UButton>
      </template>
    </PageHeader>

    <!-- IDLE も読み込み中に含める。onMounted 前の1フレームで「0件」が見えるのを防ぐ。 -->
    <div v-if="status === FetchStatus.IDLE || status === FetchStatus.LOADING"
      class="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-16 text-sm text-slate-500">
      <UIcon name="i-lucide-loader-circle" class="h-5 w-5 animate-spin" />
      <span>読み込み中...</span>
    </div>

    <div v-else-if="status === FetchStatus.ERROR" class="rounded-xl border border-slate-200 bg-white px-6 py-10">
      <!-- description は string のみ。この枝では v-if の narrowing が効かず ?? '' が要る。 -->
      <UAlert color="red" variant="subtle" icon="i-lucide-circle-alert" :description="errorMessage ?? ''" />
    </div>

    <div v-else-if="projects.length === 0" class="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
      <UIcon name="i-lucide-folder-kanban" class="h-8 w-8 text-slate-300" />
      <p class="mt-3 text-sm text-slate-500">プロジェクトが登録されていません。</p>
      <p class="mt-1 text-xs text-slate-400">
        「プロジェクト編集」からプロジェクトを追加してください。
      </p>
    </div>

    <!-- 行全体がリンクなので table にしない（tr を a で包むのは不正なHTML）。 -->
    <div v-else class="space-y-2">
      <NuxtLink v-for="project in projects" :key="project.id" :to="`/projects/${project.id}/years`"
        class="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-blue-300 hover:bg-blue-50/40">
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-slate-900">{{ project.service_name }}</p>
          <p class="mt-0.5 truncate text-xs text-slate-500">{{ project.company_name }}</p>
        </div>
        <div class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600" aria-hidden="true">
          <UIcon name="i-lucide-chevron-right" class="h-4 w-4" />
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
