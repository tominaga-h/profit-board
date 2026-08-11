<script setup lang="ts">
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
// 棒と折れ線が混ざるので型付きの Bar ではなく汎用の Chart を使う。
// Bar は ChartData<'bar'> しか受け取らず、折れ線のデータセットを渡せない。
import { Chart as ChartRenderer } from 'vue-chartjs'
import { formatYen } from '~/lib/format'
import { toCalendarYear } from '~/lib/fiscalYear'
import type { MonthlyPoint } from '~/lib/dashboard'

const props = defineProps<{
  fiscalYear: number
  monthly: readonly MonthlyPoint[]
}>()

/**
 * 使う要素だけ登録する。registerables を丸ごと入れるとレーダーや円など
 * この画面で描かない種類まで取り込み、バンドルが太る。
 *
 * 棒と折れ線を1つのグラフに混ぜるので、Controller は両方要る。
 */
Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
)

const labels = computed(() =>
  props.monthly.map((point) => `${toCalendarYear(props.fiscalYear, point.month)}/${point.month}`),
)

/**
 * 利益率は実績のある月だけ点を打つ。
 *
 * ★ 未入力の月を0%として繋ぐと、赤字でもないのに折れ線が0まで落ちて
 *   「利益率が急落した月」に見える。null を入れると Chart.js が線を切る。
 */
const profitRates = computed(() =>
  props.monthly.map((point) => (point.hasRecords ? point.summary.profitRate : null)),
)

/**
 * 棒と折れ線が混ざるので型引数は 'bar' | 'line'。
 * 'bar' だけにすると折れ線のデータセットが代入できずビルドが落ちる。
 */
const chartData = computed<ChartData<'bar' | 'line'>>(() => ({
  labels: labels.value,
  datasets: [
    {
      label: '売上',
      data: props.monthly.map((point) => point.summary.totalSales),
      backgroundColor: '#2563eb',
      borderRadius: 4,
      yAxisID: 'y',
      order: 2,
    },
    {
      label: '費用',
      data: props.monthly.map((point) => point.summary.totalCosts),
      backgroundColor: '#cbd5e1',
      borderRadius: 4,
      yAxisID: 'y',
      order: 3,
    },
    {
      // 型は bar のままだが type で個別に上書きする。混合グラフの指定方法。
      type: 'line' as const,
      label: '利益率',
      data: profitRates.value,
      borderColor: '#22c55e',
      backgroundColor: '#22c55e',
      borderWidth: 2,
      pointRadius: 3,
      // 実績のない月で線を途切れさせる。繋ぐと未入力が0%に見える。
      spanGaps: false,
      yAxisID: 'yRate',
      order: 1,
    },
  ],
}))

const chartOptions = computed<ChartOptions<'bar' | 'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { position: 'top', align: 'end', labels: { boxWidth: 8, usePointStyle: true } },
    tooltip: {
      callbacks: {
        label: (context) => {
          const value = context.parsed.y
          if (value === null) return `${context.dataset.label}: -`
          return context.dataset.label === '利益率'
            ? `利益率: ${value.toFixed(1)}%`
            : `${context.dataset.label}: ${formatYen(value)}`
        },
      },
    },
  },
  scales: {
    x: { grid: { display: false } },
    y: {
      // 金額の軸。0 を必ず含めないと棒の高さの比が実態とずれる。
      beginAtZero: true,
      ticks: { callback: (value) => formatYen(Number(value)) },
    },
    yRate: {
      position: 'right',
      // 率の軸。金額と桁が違うので独立させる。
      grid: { display: false },
      ticks: { callback: (value) => `${value}%` },
    },
  },
}))
</script>

<template>
  <div class="rounded-xl border border-slate-200 bg-white px-6 py-5">
    <h2 class="text-sm font-semibold text-slate-900">月次推移</h2>

    <!-- SPA でも Chart.js は canvas の実測に依存するのでマウント後に描く。 -->
    <ClientOnly>
      <div class="mt-4 h-72">
        <ChartRenderer type="bar" :data="chartData" :options="chartOptions" />
      </div>

      <template #fallback>
        <div class="mt-4 flex h-72 items-center justify-center text-sm text-slate-400">
          グラフを準備しています...
        </div>
      </template>
    </ClientOnly>
  </div>
</template>
