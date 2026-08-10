<script setup lang="ts">
import { FetchStatus } from '~/lib/fetchStatus'
import { formatYen } from '~/lib/format'
import type { ProjectMonthSummary } from '~/composables/useProjectMonths'

const route = useRoute()

const toPositiveInt = (value: unknown): number | null => {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

const projectId = computed(() => toPositiveInt(route.params.id))
const fiscalYear = computed(() => toPositiveInt(route.params.year))

const { projects, status: projectStatus, fetchProjects } = useProjects()

const project = computed(() =>
  projectId.value === null ? null : projects.value.find((row) => row.id === projectId.value) ?? null,
)

/** プロジェクトを引けたと確定するまでは「見つからない」と断定しない。 */
const isNotFound = computed(
  () =>
    fiscalYear.value === null ||
    (projectStatus.value === FetchStatus.SUCCESS && project.value === null),
)

const { summaries, status, errorMessage, fetchMonths } = useProjectMonths(
  projectId.value ?? 0,
  fiscalYear.value ?? 0,
)

/** 当月バッジは暦月だけで判定する。年度をまたいでも同じ月に付く。 */
const currentMonth = new Date().getMonth() + 1
const isCurrentMonth = (summary: ProjectMonthSummary) =>
  summary.month === currentMonth

onMounted(async () => {
  await fetchProjects()
  if (projectId.value !== null && fiscalYear.value !== null) await fetchMonths()
})
</script>

<template>
  <div>
    <!-- 引けなかったプロジェクト名は項目ごと省く。'...' のまま固定されるのを避ける。 -->
    <Breadcrumbs :items="[
      { label: 'プロジェクト一覧', to: '/projects' },
      ...(project ? [{ label: project.service_name, to: `/projects/${projectId}/years` }] : []),
      ...(fiscalYear !== null ? [{ label: `${fiscalYear}年度`, to: `/projects/${projectId}/years` }] : []),
      { label: '月を選択' },
    ]" />

    <PageHeader :title="fiscalYear !== null ? `${fiscalYear}年度の月を選択` : '月を選択'" subtitle="閲覧する月を選んでください" />

    <div v-if="isNotFound" class="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
      <UIcon name="i-lucide-circle-alert" class="h-8 w-8 text-slate-300" />
      <p class="mt-3 text-sm text-slate-500">対象が見つかりません。</p>
      <p class="mt-1 text-xs text-slate-400">URL が正しいかご確認ください。</p>
      <UButton to="/projects" color="white" class="mt-4 py-2.5 px-4">プロジェクト一覧へ戻る</UButton>
    </div>

    <!-- IDLE も読み込み中に含める。onMounted 前の1フレームで空表示になるのを防ぐ。 -->
    <div v-else-if="status === FetchStatus.IDLE || status === FetchStatus.LOADING"
      class="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-16 text-sm text-slate-500">
      <UIcon name="i-lucide-loader-circle" class="h-5 w-5 animate-spin" />
      <span>読み込み中...</span>
    </div>

    <div v-else-if="status === FetchStatus.ERROR" class="rounded-xl border border-slate-200 bg-white px-6 py-10">
      <UAlert color="red" variant="subtle" icon="i-lucide-circle-alert" :description="errorMessage ?? ''" />
    </div>

    <!-- 0件の枝は要らない。月は常に12枚出る。 -->
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <NuxtLink v-for="summary in summaries" :key="summary.month"
        :to="`/projects/${projectId}/${fiscalYear}/months/${summary.month}`"
        class="rounded-xl border px-5 py-4 transition-colors" :class="isCurrentMonth(summary)
          ? 'bg-blue-50  border-blue-500 ring-blue-100'
          : !summary.hasRecords
            ? 'bg-grey border-slate-200 hover:border-blue-300 hover:bg-blue-50'
            : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50'

          ">
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="text-xs text-slate-400">{{ summary.calendarYear }}年</p>
            <div class="flex items-baseline gap-2">
              <span class="text-2xl font-bold" :class="isCurrentMonth(summary)
                ? 'text-slate-900'
                : !summary.hasRecords
                  ? 'text-slate-400'
                  : 'text-slate-900'">{{
                    summary.month }}月</span>
              <span v-if="isCurrentMonth(summary)" class="rounded px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                当月
              </span>
            </div>
          </div>
          <div class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600" aria-hidden="true">
            <UIcon name="i-lucide-chevron-right" class="h-4 w-4" />
          </div>
        </div>

        <p v-if="!summary.hasRecords" class="mt-10 text-xs text-slate-400">未入力</p>

        <dl v-else class="mt-10 flex gap-6">
          <div>
            <dt class="text-xs text-slate-500">売上</dt>
            <dd class="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
              {{ formatYen(summary.totalSales) }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-slate-500">粗利</dt>
            <dd class="mt-0.5 text-sm font-semibold tabular-nums"
              :class="summary.grossProfit < 0 ? 'text-red-600' : 'text-slate-900'">
              {{ formatYen(summary.grossProfit) }}
            </dd>
          </div>
        </dl>
      </NuxtLink>
    </div>
  </div>
</template>
