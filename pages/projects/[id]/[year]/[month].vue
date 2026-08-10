<script setup lang="ts">
import { FetchStatus } from '~/lib/fetchStatus'
import { formatYen } from '~/lib/format'
import { calcLaborCost, calcWorkDays, summarize, sumAmount } from '~/lib/calc'
import { FISCAL_MONTHS, shiftFiscalMonth, toCalendarYear } from '~/lib/fiscalYear'
import type { Database } from '~/types/database.types'

const route = useRoute()
const supabase = useSupabaseClient<Database>()

const toInt = (value: unknown): number | null => {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

const projectId = computed(() => toInt(route.params.id))
const fiscalYear = computed(() => toInt(route.params.year))
const month = computed(() => {
  const parsed = toInt(route.params.month)
  return parsed !== null && FISCAL_MONTHS.includes(parsed) ? parsed : null
})

const { projects, status: projectStatus, fetchProjects } = useProjects()
const { members, fetchMembers } = useMembers()
const { form, status, errorMessage, fetchPerformance } = usePerformance()
const { summaries, fetchMonths } = useProjectMonths(projectId.value ?? 0, fiscalYear.value ?? 0)

const project = computed(() =>
  projectId.value === null ? null : projects.value.find((row) => row.id === projectId.value) ?? null,
)

const isNotFound = computed(
  () =>
    fiscalYear.value === null ||
    month.value === null ||
    (projectStatus.value === FetchStatus.SUCCESS && project.value === null),
)

/**
 * この月に実績行があるか。
 *
 * fetchPerformance は実績0件の月に売上の初期2行を作る（入力用の仕様）。
 * 閲覧でそのまま出すと存在しない売上が並ぶので、行の有無で表示を分ける。
 */
const hasRecords = computed(
  () => summaries.value.find((row) => row.month === month.value)?.hasRecords ?? false,
)

const managementCost = computed(() => form.value.managementAmount)

const laborCost = (draft: { work_hours: number; unit_price: number }) =>
  calcLaborCost(calcWorkDays(draft.work_hours), draft.unit_price)

const totalSales = computed(() => sumAmount(form.value.sales))
const totalCosts = computed(
  () => form.value.costs.reduce((total, draft) => total + laborCost(draft), 0) + managementCost.value,
)
const summary = computed(() => summarize(totalSales.value, totalCosts.value))

/** 最終更新。保存処理が t_status に書き込むまでは値がない。 */
const lastUpdated = computed(() => {
  const record = form.value.status
  if (!record?.updated_by) return null
  const at = new Date(record.updated_at)
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = `${at.getFullYear()}/${pad(at.getMonth() + 1)}/${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`
  return `${stamp} ${record.updated_by}`
})

/**
 * 月ナビの遷移先。年度をまたぐので年度と月を対で持つ。
 * 隣が同一年度なら summaries から、年度をまたぐならその1ヶ月だけ問い合わせる。
 */
const buildNeighbor = async (offset: 1 | -1) => {
  if (fiscalYear.value === null || month.value === null || projectId.value === null) return null

  const next = shiftFiscalMonth({ fiscalYear: fiscalYear.value, month: month.value }, offset)
  const to = `/projects/${projectId.value}/${next.fiscalYear}/${next.month}`

  if (next.fiscalYear === fiscalYear.value) {
    const found = summaries.value.find((row) => row.month === next.month)
    return { to, month: next.month, hasRecords: found?.hasRecords ?? false }
  }

  const scope = { project_id: projectId.value, fiscal_year: next.fiscalYear, month: next.month }
  const [sales, costs] = await Promise.all([
    supabase.from('t_sales').select('id', { head: true, count: 'exact' }).match(scope).limit(1),
    supabase.from('t_costs').select('id', { head: true, count: 'exact' }).match(scope).limit(1),
  ])

  return { to, month: next.month, hasRecords: (sales.count ?? 0) > 0 || (costs.count ?? 0) > 0 }
}

const previousMonth = ref<Awaited<ReturnType<typeof buildNeighbor>>>(null)
const nextMonth = ref<Awaited<ReturnType<typeof buildNeighbor>>>(null)

const editHref = computed(
  () => `/performance/input?year=${fiscalYear.value}&month=${month.value}&project=${projectId.value}`,
)

const load = async () => {
  if (projectId.value === null || fiscalYear.value === null || month.value === null) return

  await Promise.all([fetchProjects(), fetchMembers(), fetchMonths()])
  await fetchPerformance(fiscalYear.value, month.value, projectId.value, members.value)
    ;[previousMonth.value, nextMonth.value] = await Promise.all([
      buildNeighbor(-1),
      buildNeighbor(1),
    ])
}

onMounted(load)
watch(() => route.params.month, load)
</script>

<template>
  <div>
    <Breadcrumbs :items="[
      { label: 'プロジェクト一覧', to: '/projects' },
      ...(project ? [{ label: project.service_name, to: `/projects/${projectId}` }] : []),
      ...(fiscalYear !== null ? [{ label: `${fiscalYear}年度`, to: `/projects/${projectId}/${fiscalYear}` }] : []),
      { label: `${month}月実績` },
    ]" />

    <PageHeader
      :title="fiscalYear !== null && month !== null ? `${toCalendarYear(fiscalYear, month)}年${month}月の実績（${fiscalYear}年度）` : '実績'"
      :subtitle="lastUpdated ? `最終更新: ${lastUpdated}` : undefined">
      <template #actions>
        <div v-if="!isNotFound" class="flex items-center gap-2">
          <div class="flex items-center overflow-hidden rounded-lg border border-slate-200">
            <NuxtLink v-if="previousMonth" :to="previousMonth.to"
              class="flex items-center gap-1 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
              <UIcon name="i-lucide-chevron-left" class="h-4 w-4" />
              <span>{{ previousMonth.month }}月</span>
            </NuxtLink>

            <span class="border-x border-slate-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700">
              {{ month }}月
            </span>

            <NuxtLink v-if="nextMonth" :to="nextMonth.to"
              class="flex items-center gap-1 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
              <span>{{ nextMonth.month }}月</span>
              <UIcon name="i-lucide-chevron-right" class="h-4 w-4" />
            </NuxtLink>
          </div>

          <UButton :to="editHref" icon="i-lucide-square-pen" color="white" class="py-2.5 px-4">
            この月の実績を編集
          </UButton>
        </div>
      </template>
    </PageHeader>

    <div v-if="isNotFound" class="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
      <UIcon name="i-lucide-circle-alert" class="h-8 w-8 text-slate-300" />
      <p class="mt-3 text-sm text-slate-500">対象が見つかりません。</p>
      <p class="mt-1 text-xs text-slate-400">URL が正しいかご確認ください。</p>
      <UButton to="/projects" color="white" class="mt-4 py-2.5 px-4">プロジェクト一覧へ戻る</UButton>
    </div>

    <div v-else-if="status === FetchStatus.IDLE || status === FetchStatus.LOADING"
      class="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-16 text-sm text-slate-500">
      <UIcon name="i-lucide-loader-circle" class="h-5 w-5 animate-spin" />
      <span>読み込み中...</span>
    </div>

    <div v-else-if="status === FetchStatus.ERROR" class="rounded-xl border border-slate-200 bg-white px-6 py-10">
      <UAlert color="red" variant="subtle" icon="i-lucide-circle-alert" :description="errorMessage ?? ''" />
    </div>

    <div v-else-if="!hasRecords" class="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
      <UIcon name="i-lucide-file-x" class="h-8 w-8 text-slate-300" />
      <p class="mt-3 text-sm text-slate-500">この月の実績は登録されていません。</p>
      <p class="mt-1 text-xs text-slate-400">「この月の実績を編集」から入力できます。</p>
    </div>

    <template v-else>
      <!-- サマリー -->
      <div class="mb-4 rounded-xl border border-slate-200 bg-white px-6 py-4">
        <div class="flex flex-wrap items-end justify-between gap-6">
          <div class="flex flex-wrap gap-8">
            <div>
              <p class="text-xs text-slate-500">プロジェクト</p>
              <p class="mt-0.5 text-sm font-semibold text-slate-900">{{ project?.service_name }}</p>
            </div>
            <div>
              <p class="text-xs text-slate-500">対象月</p>
              <p class="mt-0.5 text-sm font-semibold text-slate-900">
                {{ fiscalYear !== null && month !== null ? toCalendarYear(fiscalYear, month) : '' }}年{{ month }}月
              </p>
            </div>
          </div>

          <div class="flex flex-wrap gap-8">
            <div class="text-right">
              <p class="text-xs text-slate-500">売上</p>
              <p class="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{{ formatYen(totalSales) }}</p>
            </div>
            <div class="text-right">
              <p class="text-xs text-slate-500">費用</p>
              <p class="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{{ formatYen(totalCosts) }}</p>
            </div>
            <div class="text-right">
              <p class="text-xs text-slate-500">粗利（{{ summary.profitRate.toFixed(1) }}%）</p>
              <p class="mt-0.5 text-lg font-bold tabular-nums"
                :class="summary.grossProfit < 0 ? 'text-red-600' : 'text-emerald-600'">
                {{ formatYen(summary.grossProfit) }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- 明細。閲覧専用なので入力欄は置かない。 -->
      <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table class="min-w-full">
          <thead class="bg-slate-50">
            <tr>
              <th scope="col" class="w-28 px-6 py-3 text-left text-xs font-semibold text-slate-500">大項目</th>
              <th scope="col" class="px-3 py-3 text-left text-xs font-semibold text-slate-500">小項目</th>
              <th scope="col" class="w-32 px-3 py-3 text-right text-xs font-semibold text-slate-500">稼働時間(時間)</th>
              <th scope="col" class="w-28 px-3 py-3 text-right text-xs font-semibold text-slate-500">稼働人日(日)</th>
              <th scope="col" class="w-36 px-3 py-3 text-right text-xs font-semibold text-slate-500">単価</th>
              <th scope="col" class="w-40 px-3 py-3 text-right text-xs font-semibold text-slate-500">金額</th>
              <th scope="col" class="w-40 px-6 py-3 text-right text-xs font-semibold text-slate-500">小計</th>
            </tr>
          </thead>

          <tbody class="divide-y divide-slate-200">
            <tr class="bg-slate-50/70">
              <th scope="rowgroup" class="px-6 py-3 text-left text-sm font-bold text-slate-900">売上</th>
              <td colspan="5"></td>
              <td class="px-6 py-3 text-right text-sm font-bold tabular-nums text-blue-700">
                {{ formatYen(totalSales) }}
              </td>
            </tr>
            <tr v-for="draft in form.sales" :key="draft.key">
              <td></td>
              <td class="px-3 py-3 text-sm text-slate-900">{{ draft.category_small }}</td>
              <td colspan="3"></td>
              <td class="px-3 py-3 text-right text-sm tabular-nums text-slate-900">
                {{ formatYen(draft.amount) }}
              </td>
              <td></td>
            </tr>
          </tbody>

          <tbody class="divide-y divide-slate-200">
            <tr class="bg-slate-50/70">
              <th scope="rowgroup" class="px-6 py-3 text-left text-sm font-bold text-slate-900">費用</th>
              <td colspan="5"></td>
              <td class="px-6 py-3 text-right text-sm font-bold tabular-nums text-blue-700">
                {{ formatYen(totalCosts) }}
              </td>
            </tr>
            <!-- 稼働のないメンバーも行として残す。誰が動いていないかが分かる。 -->
            <tr v-for="draft in form.costs" :key="draft.key" :class="draft.work_hours === 0 ? 'text-slate-400' : ''">
              <td></td>
              <td class="px-3 py-3 text-sm" :class="draft.work_hours === 0 ? '' : 'text-slate-900'">
                {{ draft.label }}
              </td>
              <!-- toFixed(1) にすると 0.25h が 0.3 に見える（DB は小数第2位まで持つ）。 -->
              <td class="px-3 py-3 text-right text-sm tabular-nums">{{ draft.work_hours }}</td>
              <td class="px-3 py-3 text-right text-sm tabular-nums">{{ calcWorkDays(draft.work_hours) }}</td>
              <td class="px-3 py-3 text-right text-sm tabular-nums">{{ formatYen(draft.unit_price) }}</td>
              <td class="px-3 py-3 text-right text-sm tabular-nums">{{ formatYen(laborCost(draft)) }}</td>
              <td></td>
            </tr>
            <tr>
              <td></td>
              <td class="px-3 py-3 text-sm text-slate-900">管理費</td>
              <td colspan="3"></td>
              <td class="px-3 py-3 text-right text-sm tabular-nums text-slate-900">
                {{ formatYen(managementCost) }}
              </td>
              <td></td>
            </tr>
          </tbody>

          <tbody class="divide-y divide-slate-200">
            <tr class="bg-slate-50/70">
              <th scope="rowgroup" class="px-6 py-3 text-left text-sm font-bold text-slate-900">粗利</th>
              <td colspan="5"></td>
              <td class="px-6 py-3 text-right text-sm font-bold tabular-nums"
                :class="summary.grossProfit < 0 ? 'text-red-600' : 'text-emerald-600'">
                {{ formatYen(summary.grossProfit) }}
              </td>
            </tr>
            <tr v-if="form.remark">
              <th scope="row" class="px-6 py-3 text-left text-sm font-semibold text-slate-900">備考</th>
              <td colspan="6" class="px-3 py-3 text-sm text-slate-600">{{ form.remark }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
        <UIcon name="i-lucide-info" class="h-3.5 w-3.5 shrink-0" />
        この画面は閲覧専用です。数値の修正は「この月の実績を編集」から行ってください。
      </p>
    </template>
  </div>
</template>
