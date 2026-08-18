<script setup lang="ts">
import { FetchStatus } from '~/lib/fetchStatus'
import { formatPercent, formatPointDiff, formatSignedPercent, formatYen } from '~/lib/format'
import { getCurrentFiscalYear } from '~/lib/fiscalYear'

const route = useRoute()
const router = useRouter()
const { fiscalYears, status: yearsStatus } = useFiscalYears()
const { data, status, errorMessage, fetchDashboard } = useDashboard()

/**
 * 選択年度は文字列で持つ。USelect は常に string を emit し、options との
 * 突き合わせは厳密比較なので、number で持つと選択のたびに空表示へ落ちる。
 */
const selectedYear = ref<string>('')

const yearOptions = computed(() =>
  fiscalYears.value.map(({ year }) => ({ value: String(year), label: `${year}年度` })),
)

const isCorrectFiscalYear = (year: number) => {
  if (fiscalYears.value.length === 0) return false
  return fiscalYears.value.some((fiscalYear) => fiscalYear.year === year)
}

const queryFiscalYear = computed(() => {
  if (fiscalYears.value.length === 0) return null

  const queryFiscalYear = route.query.fiscal_year
  if (queryFiscalYear && typeof queryFiscalYear === "string" && isCorrectFiscalYear(Number(queryFiscalYear))) {
    return Number(queryFiscalYear)
  } else {
    null
  }

})

/** 年度マスタは非同期に埋まるので、届いてから初期値を決める。 */
watch(
  fiscalYears,
  () => {
    if (fiscalYears.value.length === 0) return
    if (selectedYear.value !== '') return

    const currentYear = getCurrentFiscalYear()
    selectedYear.value = String(isCorrectFiscalYear(currentYear) ? currentYear : fiscalYears.value[0].year)
  },
  { immediate: true },
)

watch(selectedYear, (year) => {
  if (year === '') return

  // すでに同一のfiscal_yearが設定されていれば何もしない
  if (queryFiscalYear.value && queryFiscalYear.value === Number(year)) return

  router.push(`/dashboard?fiscal_year=${selectedYear.value}`)
})

watch(route, () => {
  if (queryFiscalYear.value) {
    selectedYear.value = String(queryFiscalYear.value)
    void fetchDashboard(queryFiscalYear.value)
  }
})

/** 年度マスタが1件もないと年度を選べず、集計そのものが始められない。 */
const hasNoYears = computed(
  () => yearsStatus.value === FetchStatus.SUCCESS && fiscalYears.value.length === 0,
)

/**
 * 比較に使った月の注記。
 *
 * 前年同期比は「当年度で実績のある月」だけを前年度と比べるため、
 * 何月分を突き合わせた数字なのかを示さないと読み手が解釈できない。
 */
const comparisonNote = computed(() => {
  const months = data.value?.yoy.months ?? []
  if (months.length === 0) return null
  return `${months.map((month) => `${month}月`).join('・')}の累計で比較`
})

type KpiCard = {
  label: string
  value: string
  /** 前年同期比の表示文字列。データがなければ「-」。 */
  diff: string
  /** 増減を良し悪しで色付けするための符号。null は色を付けない。 */
  tone: 'up' | 'down' | null
  emphasize: boolean
  /** 金額がマイナスかどうか。強調カードの文字色を赤に切り替えるために使う。 */
  negative: boolean
}

/**
 * 増減の色を決める。
 *
 * ★ 費用だけ増加が「悪い」。同じ +8.2% でも売上と費用では意味が逆になるので、
 *   符号ではなく指標ごとに良し悪しを決める。
 */
const toTone = (value: number | null, higherIsBetter: boolean): 'up' | 'down' | null => {
  if (value === null || value === 0) return null
  return value > 0 === higherIsBetter ? 'up' : 'down'
}

const kpiCards = computed<KpiCard[]>(() => {
  const current = data.value
  if (!current) return []

  const { kpi, yoy } = current

  return [
    {
      label: '売上高',
      value: formatYen(kpi.totalSales),
      diff: formatSignedPercent(yoy.sales),
      tone: toTone(yoy.sales, true),
      emphasize: false,
      negative: false,
    },
    {
      label: '費用',
      value: formatYen(kpi.totalCosts),
      diff: formatSignedPercent(yoy.costs),
      tone: toTone(yoy.costs, false),
      emphasize: false,
      negative: false,
    },
    {
      label: '営業利益',
      value: formatYen(kpi.grossProfit),
      diff: formatSignedPercent(yoy.profit),
      tone: toTone(yoy.profit, true),
      emphasize: true,
      negative: kpi.grossProfit < 0,
    },
    {
      label: '利益率',
      value: formatPercent(kpi.profitRate),
      diff: formatPointDiff(yoy.profitRatePoint),
      tone: toTone(yoy.profitRatePoint, true),
      emphasize: false,
      negative: false,
    },
  ]
})

</script>

<template>
  <div>
    <PageHeader :title="`${selectedYear ? `${selectedYear}年度 ` : ''}営業成績ダッシュボード`" subtitle="年度全体の売上・費用・営業利益を俯瞰します">
      <template #actions>
        <USelect v-model="selectedYear" :options="yearOptions" placeholder="年度を選択" class="w-36" aria-label="年度" />
      </template>
    </PageHeader>

    <div v-if="hasNoYears" class="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
      <UIcon name="i-lucide-calendar" class="h-8 w-8 text-slate-300" />
      <p class="mt-3 text-sm text-slate-500">年度が登録されていません。</p>
      <p class="mt-1 text-xs text-slate-400">
        プロジェクトの年度選択画面から年度を登録してください。
      </p>
    </div>

    <!-- IDLE も読み込み中に含める。年度が決まる前の1フレームで空表示になるのを防ぐ。 -->
    <div v-else-if="status === FetchStatus.IDLE || status === FetchStatus.LOADING"
      class="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-16 text-sm text-slate-500">
      <UIcon name="i-lucide-loader-circle" class="h-5 w-5 animate-spin" />
      <span>読み込み中...</span>
    </div>

    <div v-else-if="status === FetchStatus.ERROR" class="rounded-xl border border-slate-200 bg-white px-6 py-10">
      <UAlert color="red" variant="subtle" icon="i-lucide-circle-alert" :description="errorMessage ?? ''" />
    </div>

    <div v-else-if="data" class="space-y-4">
      <dl class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="card in kpiCards" :key="card.label" class="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <dt class="text-xs text-slate-500">{{ card.label }}</dt>
          <dd class="mt-1 text-2xl font-bold tabular-nums"
            :class="card.emphasize ? (card.negative ? 'text-red-600' : 'text-emerald-600') : 'text-slate-900'">
            {{ card.value }}
          </dd>
          <dd class="mt-2 flex items-center gap-2">
            <span class="rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums" :class="{
              'bg-emerald-50 text-emerald-700': card.tone === 'up',
              'bg-red-50 text-red-600': card.tone === 'down',
              'bg-slate-100 text-slate-500': card.tone === null,
            }">
              {{ card.diff }}
            </span>
            <span class="text-xs text-slate-400">前年同期比</span>
          </dd>
        </div>
      </dl>

      <p v-if="comparisonNote" class="text-xs text-slate-400">
        前年同期比は{{ comparisonNote }}
      </p>

      <DashboardMonthlyTrendChart :fiscal-year="Number(selectedYear)" :monthly="data.monthly" />

      <DashboardProjectMatrix :fiscal-year="Number(selectedYear)" :rows="data.matrix" />
    </div>
  </div>
</template>
