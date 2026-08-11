<script setup lang="ts">
import { FetchStatus } from '~/lib/fetchStatus'
import { formatYen } from '~/lib/format'
import { getCurrentFiscalYear } from '~/lib/fiscalYear'
import type { ProjectYearSummary } from '~/composables/useProjectYears'

const route = useRoute()

/** route.params.id は文字列。整数でない URL は存在しない ID として扱う。 */
const projectId = computed(() => {
  const parsed = Number(route.params.id)
  return Number.isInteger(parsed) ? parsed : null
})

const { projects, status: projectStatus, fetchProjects } = useProjects()

const project = computed(() =>
  projectId.value === null ? null : projects.value.find((row) => row.id === projectId.value) ?? null,
)

/** プロジェクトを引けたと確定するまでは「見つからない」と断定しない。 */
const isProjectMissing = computed(
  () => projectStatus.value === FetchStatus.SUCCESS && project.value === null,
)

const { summaries, status, errorMessage, fetchYears, isAdding, addYear } = useProjectYears(
  projectId.value ?? 0,
)

const isModalOpen = ref(false)
const saveErrorMessage = ref<string | null>(null)

const handleSave = async (year: number) => {
  saveErrorMessage.value = null
  const result = await addYear(year)

  if (result.ok) {
    isModalOpen.value = false
    return
  }

  saveErrorMessage.value = result.message
}

const openModal = () => {
  saveErrorMessage.value = null
  isModalOpen.value = true
}

const currentFiscalYear = getCurrentFiscalYear()
const isSameYear = computed(() => (summary: ProjectYearSummary) => {
  return summary.year === currentFiscalYear
})

onMounted(async () => {
  await fetchProjects()
  if (projectId.value !== null) await fetchYears()
})
</script>

<template>
  <div>
    <!-- 引けなかったプロジェクト名は項目ごと省く。'...' のまま固定されるのを避ける。 -->
    <Breadcrumbs :items="[
      { label: 'プロジェクト一覧', to: '/projects' },
      ...(project ? [{ label: `${project.service_name}（${project.company_name}）` }] : []),
      { label: '年度を選択' },
    ]" />

    <PageHeader title="年度を選択" subtitle="閲覧する年度を選んでください">
      <template #actions>
        <UButton icon="i-lucide-plus" class="py-2.5 px-4" :disabled="isProjectMissing" @click="openModal">
          年度を追加
        </UButton>
      </template>
    </PageHeader>

    <div v-if="isProjectMissing" class="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
      <UIcon name="i-lucide-circle-alert" class="h-8 w-8 text-slate-300" />
      <p class="mt-3 text-sm text-slate-500">プロジェクトが見つかりません。</p>
      <p class="mt-1 text-xs text-slate-400">URL が正しいかご確認ください。</p>
      <UButton to="/projects" color="white" variant="solid" class="mt-4">
        プロジェクト一覧へ戻る
      </UButton>
    </div>

    <!-- IDLE も読み込み中に含める。onMounted 前の1フレームで「0件」が見えるのを防ぐ。 -->
    <div v-else-if="status === FetchStatus.IDLE || status === FetchStatus.LOADING"
      class="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-16 text-sm text-slate-500">
      <UIcon name="i-lucide-loader-circle" class="h-5 w-5 animate-spin" />
      <span>読み込み中...</span>
    </div>

    <div v-else-if="status === FetchStatus.ERROR" class="rounded-xl border border-slate-200 bg-white px-6 py-10">
      <UAlert color="red" variant="subtle" icon="i-lucide-circle-alert" :description="errorMessage ?? ''" />
    </div>

    <div v-else-if="summaries.length === 0" class="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
      <UIcon name="i-lucide-calendar" class="h-8 w-8 text-slate-300" />
      <p class="mt-3 text-sm text-slate-500">年度が登録されていません。</p>
      <p class="mt-1 text-xs text-slate-400">「年度を追加」から年度を登録してください。</p>
    </div>

    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <NuxtLink v-for="summary in summaries" :key="summary.year" :to="`/projects/${projectId}/${summary.year}`"
        class="rounded-xl border px-5 py-4 transition-colors" :class="isSameYear(summary)
          ? 'bg-blue-50  border-blue-500 ring-blue-100'
          : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50'
          ">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-baseline gap-2">
            <span class="text-2xl font-bold text-slate-900">{{ summary.year }}年度</span>
            <span v-if="isSameYear(summary)" class="rounded px-1.5 py-0.5 text-xs font-semibold text-blue-700">
              今年度
            </span>
          </div>
          <div class="grid h-8 w-8 shrink-0 place-items-center rounded-lg "
            :class="isSameYear(summary) ? 'bg-white text-blue-600' : 'bg-blue-50 text-blue-600'" aria-hidden="true">
            <UIcon name="i-lucide-chevron-right" class="h-4 w-4" />
          </div>
        </div>

        <dl class="mt-10 flex gap-6">
          <div>
            <dt class="text-xs text-slate-500">年間売上</dt>
            <dd class="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
              {{ formatYen(summary.totalSales) }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-slate-500">年間粗利</dt>
            <dd class="mt-0.5 text-sm font-semibold tabular-nums"
              :class="summary.grossProfit < 0 ? 'text-red-600' : 'text-slate-900'">
              {{ formatYen(summary.grossProfit) }}
            </dd>
          </div>
        </dl>
      </NuxtLink>
    </div>

    <YearAddModal v-model="isModalOpen" :is-saving="isAdding" :save-error-message="saveErrorMessage"
      @save="handleSave" />
  </div>
</template>
