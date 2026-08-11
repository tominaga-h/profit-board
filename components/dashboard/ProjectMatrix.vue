<script setup lang="ts">
import { formatPercent, formatYen, NO_VALUE } from '~/lib/format'
import { FISCAL_MONTHS, toCalendarYear } from '~/lib/fiscalYear'
import type { MatrixRow } from '~/lib/dashboard'

const props = defineProps<{
  fiscalYear: number
  rows: readonly MatrixRow[]
}>()

/** 各行の見出しと、月の指標からどの値を引くか。4行の並びはこれが正。 */
const METRICS = [
  { key: 'sales', label: '売上' },
  { key: 'costs', label: '費用' },
  { key: 'profit', label: '粗利' },
  { key: 'rate', label: '粗利率' },
] as const

type MetricKey = (typeof METRICS)[number]['key']

const columns = computed(() =>
  FISCAL_MONTHS.map((month) => ({
    month,
    label: `${toCalendarYear(props.fiscalYear, month)}年${month}月`,
  })),
)

/**
 * セル1つ分の表示文字列。
 *
 * ★ 未入力の月は Map にキーがない。0円と区別して「-」にする。
 */
const formatCell = (row: MatrixRow, month: number, metric: MetricKey): string => {
  const summary = row.byMonth.get(month)
  if (!summary) return NO_VALUE

  if (metric === 'rate') return formatPercent(summary.profitRate)
  if (metric === 'sales') return formatYen(summary.totalSales)
  if (metric === 'costs') return formatYen(summary.totalCosts)
  return formatYen(summary.grossProfit)
}

/** 年間合計の列。こちらは実績0件でも0として出す（未入力の月とは意味が違う）。 */
const formatTotal = (row: MatrixRow, metric: MetricKey): string => {
  if (metric === 'rate') return formatPercent(row.total.profitRate)
  if (metric === 'sales') return formatYen(row.total.totalSales)
  if (metric === 'costs') return formatYen(row.total.totalCosts)
  return formatYen(row.total.grossProfit)
}

/** 粗利の行だけ赤字を色で示す。売上・費用は符号を持たないので対象外。 */
const isNegative = (row: MatrixRow, metric: MetricKey): boolean =>
  (metric === 'profit' || metric === 'rate') && row.total.grossProfit < 0
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div class="flex items-center justify-between px-6 py-4">
      <h2 class="text-sm font-semibold text-slate-900">プロジェクト別 月次営業成績</h2>
      <p class="text-xs text-slate-400">単位：円 ／ 全{{ rows.length }}件</p>
    </div>

    <!-- 12ヶ月分あるので横に溢れる。テーブルだけをスクロールさせる。 -->
    <div class="overflow-x-auto">
      <table class="min-w-full border-t border-slate-200">
        <thead class="bg-slate-50">
          <tr>
            <!-- 名前が縦に折り返すと4行分の高さを超えて行がずれるので幅を確保する。 -->
            <th
              scope="col"
              class="w-56 min-w-56 px-6 py-3 text-left text-xs font-semibold text-slate-500"
            >
              プロジェクト
            </th>
            <th scope="col" class="px-3 py-3 text-left text-xs font-semibold text-slate-500">
              種別
            </th>
            <th scope="col" class="bg-amber-50 px-4 py-3 text-right text-xs font-semibold text-amber-700">
              PJ別総合
            </th>
            <th
              v-for="column in columns"
              :key="column.month"
              scope="col"
              class="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold text-slate-500"
            >
              {{ column.label }}
            </th>
          </tr>
        </thead>

        <tbody class="divide-y divide-slate-200">
          <template v-for="row in rows" :key="row.projectId">
            <tr
              v-for="(metric, index) in METRICS"
              :key="metric.key"
              :class="[
                metric.key === 'profit' || metric.key === 'rate' ? 'bg-blue-50/40' : '',
                index === 0 ? 'border-t-2 border-slate-200' : '',
              ]"
            >
              <!-- プロジェクト名は4行にまたがるので先頭行だけに置く。 -->
              <th
                v-if="index === 0"
                scope="rowgroup"
                :rowspan="METRICS.length"
                class="px-6 py-3 text-left align-top"
              >
                <span class="block text-sm font-semibold text-slate-900">
                  {{ row.serviceName }}
                </span>
                <span class="mt-0.5 block text-xs text-slate-500">{{ row.companyName }}</span>
              </th>

              <td
                class="whitespace-nowrap px-3 py-2 text-xs"
                :class="
                  metric.key === 'profit' || metric.key === 'rate'
                    ? 'font-semibold text-blue-700'
                    : 'text-slate-500'
                "
              >
                {{ metric.label }}
              </td>

              <td
                class="whitespace-nowrap bg-amber-50 px-4 py-2 text-right text-xs font-semibold tabular-nums"
                :class="isNegative(row, metric.key) ? 'text-red-600' : 'text-slate-900'"
              >
                {{ formatTotal(row, metric.key) }}
              </td>

              <td
                v-for="column in columns"
                :key="column.month"
                class="whitespace-nowrap px-4 py-2 text-right text-xs tabular-nums"
                :class="
                  metric.key === 'profit' || metric.key === 'rate'
                    ? 'font-semibold text-blue-700'
                    : 'text-slate-600'
                "
              >
                {{ formatCell(row, column.month, metric.key) }}
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <div v-if="rows.length === 0" class="px-6 py-12 text-center">
      <UIcon name="i-lucide-folder-kanban" class="h-8 w-8 text-slate-300" />
      <p class="mt-3 text-sm text-slate-500">プロジェクトが登録されていません。</p>
      <p class="mt-1 text-xs text-slate-400">
        「プロジェクト編集」からプロジェクトを追加してください。
      </p>
    </div>
  </div>
</template>
