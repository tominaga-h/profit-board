<script setup lang="ts">
import { FetchStatus } from '~/lib/fetchStatus'
import { formatYen } from '~/lib/format'
import { calcLaborCost, calcWorkDays, summarize } from '~/lib/calc'
import { FISCAL_MONTHS, getCurrentFiscalYear } from '~/lib/fiscalYear'
import {
  costRowSchema,
  managementCostRowSchema,
  salesRowSchema,
  toCostRowErrors,
  toManagementCostRowErrors,
  toSalesRowErrors,
} from '~/lib/schemas/performance'
import type {
  CostRowErrors,
  ManagementCostRowErrors,
  SalesRowErrors,
} from '~/lib/schemas/performance'
import type { CostDraft, SalesDraft } from '~/composables/usePerformance'

const route = useRoute()

const { members, fetchMembers } = useMembers()
const { projects, fetchProjects } = useProjects()
const { fiscalYears } = useFiscalYears()
const { form, status, errorMessage, fetchPerformance, resetForm, isSaving, saveErrorMessage, savePerformance } =
  usePerformance()
const { displayName } = useAppUser()

const yearOptions = computed(() =>
  fiscalYears.value.map(({ year }) => ({
    value: String(year),
    label: `${year}年度`,
  })),
)

// 月は FISCAL_MONTHS の並び（7月始まり）を使う。数値昇順にすると
// 1,2,3... となり年度の並びにならない。
const monthOptions = FISCAL_MONTHS.map((month) => ({
  value: String(month),
  label: `${month}月`,
}))

const projectOptions = computed(() =>
  projects.value.map((project) => ({
    value: String(project.id),
    label: `${project.service_name}（${project.company_name}）`,
  })),
)

/**
 * 選択状態はすべて文字列で持つ。
 *
 * ★ USelect は DOM の <select> のラッパで、update:modelValue に
 *   event.target.value（＝常に string）を emit する。さらに modelValue と
 *   options の突き合わせは === の厳密比較で、外れると例外を出さず黙って
 *   空表示に落ちる。number で持つと選択のたびに型が壊れるので、
 *   画面側は string に統一し、DB へ渡す直前にだけ Number() する。
 *
 * ★ 未選択は null ではなく ''。USelect の modelValue の既定値が "" で、
 *   placeholder は空文字の disabled オプションとして先頭に差し込まれる。
 *
 * ★ 年度と月は今日の日付から埋める。実績入力は「当月ぶんを入れる」のが
 *   ほとんどで、毎回2つ選ばせるのは操作が増えるだけになる。
 *   年度は暦年ではなく getCurrentFiscalYear()（7月始まり）から採る。
 *   プロジェクトだけは未選択のまま——こちらは既定値を決めようがなく、
 *   先頭を勝手に選ぶと意図しないプロジェクトの入力画面を開いてしまう。
 */
const selectedYear = ref<string>('')
const selectedMonth = ref<string>(String(new Date().getMonth() + 1))
const selectedProject = ref<string>('')

const isReady = computed(
  () => selectedYear.value !== '' && selectedMonth.value !== '' && selectedProject.value !== '',
)

const selectedProjectName = computed(
  () =>
    projects.value.find((project) => String(project.id) === selectedProject.value)?.service_name ??
    null,
)

/** 閲覧画面への戻り先。選択が揃うまでは行き先が定まらない。 */
const viewHref = computed(() =>
  isReady.value
    ? `/projects/${selectedProject.value}/${selectedYear.value}/${selectedMonth.value}`
    : null,
)

/** 行の検証エラー。キーは draft.key。 */
const salesErrors = ref<Map<string, SalesRowErrors>>(new Map())
const costErrors = ref<Map<string, CostRowErrors>>(new Map())
const managementError = ref<ManagementCostRowErrors>({})

/**
 * クエリパラメータから初期値を復元する（task.md の ?project=&year=&month=）。
 *
 * ★ プロジェクトの復元は fetchProjects() の完了後でなければならない。
 *   options が空の間に modelValue をセットしても USelect は表示できない。
 *
 * ★ 実在チェックを自分で書く。存在しない ID を渡されても USelect は
 *   例外を出さず黙って空表示にするだけなので、不正値がそのまま
 *   selectedProject に残って「選択済みなのに空欄」の状態になる。
 *
 * ★ 妥当な値があるときだけ上書きする。クエリに year / month が無ければ
 *   今日から入れた初期値がそのまま残る（クエリ指定のほうが優先される）。
 */
const restoreFromQuery = () => {
  const year = route.query.year
  if (typeof year === 'string' && fiscalYears.value.some((fiscalYear) => fiscalYear.year === Number(year))) {
    selectedYear.value = year
  }

  const month = route.query.month
  if (typeof month === 'string' && FISCAL_MONTHS.includes(Number(month))) {
    selectedMonth.value = month
  }

  const project = route.query.project
  if (typeof project === 'string' && projects.value.some((row) => String(row.id) === project)) {
    selectedProject.value = project
  }
}

onMounted(async () => {
  // メンバーとプロジェクトは条件に依らないので先に揃える。
  await Promise.all([fetchMembers(), fetchProjects()])
  restoreFromQuery()
})

// 年度マスタの取得完了後、クエリ指定がなければ今年度を初期選択する。
watch(
  fiscalYears,
  () => {
    if (fiscalYears.value.length === 0) return
    if (selectedYear.value !== '') return

    const currentYear = getCurrentFiscalYear()
    selectedYear.value = String(
      fiscalYears.value.some((fiscalYear) => fiscalYear.year === currentYear)
        ? currentYear
        : fiscalYears.value[0].year,
    )
    restoreFromQuery()
  },
  { immediate: true },
)

/**
 * 条件が変わったら読み直す。
 *
 * ★ 3つ揃うまでは取得しない。揃っていない状態で問い合わせても
 *   意味のある結果にならず、フォームだけが中途半端に埋まる。
 *
 * ★ URL への反映は replace。プルダウンを触るたびに履歴が積み上がると
 *   戻るボタンが使い物にならなくなる（confirm.vue / AppSidebar.vue が
 *   同じ理由で replace: true を使っている）。
 */
watch([selectedYear, selectedMonth, selectedProject], async () => {
  salesErrors.value = new Map()
  costErrors.value = new Map()
  managementError.value = {}

  if (!isReady.value) {
    resetForm()
    return
  }

  await navigateTo(
    {
      path: '/performance/input',
      query: {
        year: selectedYear.value,
        month: selectedMonth.value,
        project: selectedProject.value,
      },
    },
    { replace: true },
  )

  await fetchPerformance(
    Number(selectedYear.value),
    Number(selectedMonth.value),
    Number(selectedProject.value),
    members.value,
  )
})

// --- リアルタイム計算 -------------------------------

/** 稼働行の金額。丸めた人日 × 単価。 */
const laborAmount = (draft: CostDraft): number =>
  calcLaborCost(calcWorkDays(draft.work_hours), draft.unit_price)

const totalSales = computed(() =>
  form.value.sales.reduce((total, row) => total + (Number.isFinite(row.amount) ? row.amount : 0), 0),
)

const totalCosts = computed(() => {
  const labor = form.value.costs.reduce((total, draft) => total + laborAmount(draft), 0)
  const management = Number.isFinite(form.value.managementAmount) ? form.value.managementAmount : 0
  return labor + management
})

const summary = computed(() => summarize(totalSales.value, totalCosts.value))

/**
 * 稼働時間が未入力のメンバー数。アラート表示に使う。
 *
 * 0 と NaN（入力欄を空にした状態）の両方を未入力として数える。
 * 管理費は人ではないので含めない。
 */
const unfilledCount = computed(
  () => form.value.costs.filter((draft) => !(draft.work_hours > 0)).length,
)

// --- 入力操作 ---------------------------------------------

const addSalesRow = () => {
  form.value.sales.push({ key: crypto.randomUUID(), id: null, category_small: '', amount: 0 })
}

const removeSalesRow = (draft: SalesDraft) => {
  form.value.sales = form.value.sales.filter((row) => row.key !== draft.key)
  salesErrors.value.delete(draft.key)
}

/**
 * 全行を検証する。問題がなければ true。
 *
 * ★ 呼び出し口は2つ。入力欄の blur（下記 validateLater）と保存ボタン。
 *   検証を保存時だけにすると、全部入力し終えてから初めて赤が出る。
 */
const validate = (): boolean => {
  const nextSalesErrors = new Map<string, SalesRowErrors>()
  for (const draft of form.value.sales) {
    const result = salesRowSchema.safeParse(draft)
    if (!result.success) {
      nextSalesErrors.set(draft.key, toSalesRowErrors(result.error.issues))
      continue
    }
    // trim 済みの小項目名を書き戻す。
    draft.category_small = result.data.category_small
  }

  const nextCostErrors = new Map<string, CostRowErrors>()
  for (const draft of form.value.costs) {
    const result = costRowSchema.safeParse(draft)
    if (!result.success) nextCostErrors.set(draft.key, toCostRowErrors(result.error.issues))
  }

  const managementResult = managementCostRowSchema.safeParse({
    amount: form.value.managementAmount,
  })

  salesErrors.value = nextSalesErrors
  costErrors.value = nextCostErrors
  managementError.value = managementResult.success
    ? {}
    : toManagementCostRowErrors(managementResult.error.issues)

  return (
    nextSalesErrors.size === 0 && nextCostErrors.size === 0 && managementResult.success
  )
}

/**
 * 入力欄から離れたときに検証する。
 *
 * ★ 入力のたび（@input）には走らせない。「6」と打った瞬間に
 *   「60000未満です」のような指摘が出ると、打ち終わる前に赤くなって鬱陶しい。
 */
const validateLater = () => {
  validate()
}

const salesErrorFor = (draft: SalesDraft): SalesRowErrors => salesErrors.value.get(draft.key) ?? {}
const costErrorFor = (draft: CostDraft): CostRowErrors => costErrors.value.get(draft.key) ?? {}

/** 保存できたことを伝える一時メッセージ。 */
const savedMessage = ref<string | null>(null)

const handleSave = async () => {
  savedMessage.value = null
  if (!validate()) return

  // 認証済みなら必ず名前が取れる。取れないのは想定外の状態なので、
  // 誰が更新したか分からないデータを残さず中断する。
  const updatedBy = displayName.value
  if (!updatedBy) {
    saveErrorMessage.value = 'ログイン情報を取得できませんでした。再読み込みしてください。'
    return
  }

  const saved = await savePerformance(
    Number(selectedYear.value),
    Number(selectedMonth.value),
    Number(selectedProject.value),
    updatedBy,
  )

  // 失敗時は部分適用が起きている可能性があるので、成否によらず取り直す。
  await fetchPerformance(
    Number(selectedYear.value),
    Number(selectedMonth.value),
    Number(selectedProject.value),
    members.value,
  )

  if (saved) savedMessage.value = '保存しました。'
}

/** 入力欄の共通クラス。エラー時だけ枠を赤くする。 */
const inputClass = (hasError: boolean) => [
  'w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none',
  'focus:border-blue-500 focus:ring-2 focus:ring-blue-100',
  hasError ? 'border-red-400 bg-red-50' : 'border-slate-200',
]

/** 読み取り専用セル（自動計算された人日・金額）の共通クラス。 */
const readonlyClass =
  'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm tabular-nums text-slate-500'

/** 人日の表示。小数第2位まで持つが、末尾の0は落として読みやすくする。 */
const formatWorkDays = (workHours: number): string => String(calcWorkDays(workHours))

/** 最終更新の表示。一度も保存していない月は値がない。 */
const lastUpdated = computed(() => {
  const record = form.value.status
  if (!record?.updated_by) return null
  const at = new Date(record.updated_at)
  const stamp = `${at.getFullYear()}/${String(at.getMonth() + 1).padStart(2, '0')}/${String(at.getDate()).padStart(2, '0')} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  return `${stamp} ${record.updated_by}`
})
</script>

<template>
  <div>
    <Breadcrumbs v-if="isReady" :items="[
      { label: '実績入力' },
      { label: `${selectedYear}年度 ${selectedMonth}月` },
      { label: `${selectedProjectName}` },
    ]" />

    <PageHeader title="売上・費用実績入力" subtitle="プロジェクト×年月の実績を入力します">
      <template #actions>
        <!-- 未保存の変更は破棄される。保存の左に置いて、先に保存する導線を自然にする。 -->
        <UButton v-if="viewHref" :to="viewHref" icon="i-lucide-eye" color="white" class="py-2.5 px-4">
          閲覧画面に戻る
        </UButton>

        <UButton icon="i-lucide-check" class="py-2.5 px-4" :loading="isSaving" :disabled="!isReady || isSaving"
          @click="handleSave">
          保存する
        </UButton>
      </template>
    </PageHeader>

    <p v-if="lastUpdated" class="-mt-4 mb-4 text-xs text-slate-400">最終更新: {{ lastUpdated }}</p>

    <UAlert v-if="saveErrorMessage" color="red" variant="subtle" icon="i-lucide-circle-alert" class="mb-4"
      :description="saveErrorMessage" />

    <UAlert v-else-if="savedMessage" color="green" variant="subtle" icon="i-lucide-check" class="mb-4"
      :description="savedMessage" />

    <!-- 条件選択とサマリー -->
    <div class="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-4">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <label class="mb-1 block text-xs text-slate-500" for="fiscal-year">年度</label>
            <USelect id="fiscal-year" v-model="selectedYear" :options="yearOptions" placeholder="年度を選択" class="w-36" />
          </div>
          <div>
            <label class="mb-1 block text-xs text-slate-500" for="fiscal-month">月</label>
            <USelect id="fiscal-month" v-model="selectedMonth" :options="monthOptions" placeholder="月を選択"
              class="w-28" />
          </div>
          <div>
            <label class="mb-1 block text-xs text-slate-500" for="project">プロジェクト</label>
            <USelect id="project" v-model="selectedProject" :options="projectOptions" placeholder="プロジェクトを選択"
              class="w-72" />
          </div>

          <UBadge v-if="isReady && unfilledCount > 0" color="amber" size="sm" variant="soft"
            class="mt-2 py-2 px-3 shrink-0">
            <UIcon name="i-lucide-triangle-alert" class="mr-1 h-3.5 w-3.5" />
            未入力 {{ unfilledCount }} 名
          </UBadge>
        </div>

        <!-- リアルタイムサマリー -->
        <div v-if="isReady" class="flex items-end gap-6">
          <div class="text-right">
            <p class="text-xs text-slate-500">売上</p>
            <p class="text-xl font-bold tabular-nums text-slate-900">
              {{ formatYen(summary.totalSales) }}
            </p>
          </div>
          <div class="text-right">
            <p class="text-xs text-slate-500">費用</p>
            <p class="text-xl font-bold tabular-nums text-slate-900">
              {{ formatYen(summary.totalCosts) }}
            </p>
          </div>
          <div class="text-right">
            <p class="text-xs text-slate-500">粗利（{{ summary.profitRate.toFixed(1) }}%）</p>
            <!-- 赤字は赤で出す。符号だけだと一覧で見落とす。 -->
            <p class="text-xl font-bold tabular-nums"
              :class="summary.grossProfit < 0 ? 'text-red-600' : 'text-emerald-600'">
              {{ formatYen(summary.grossProfit) }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <UAlert v-if="status === FetchStatus.ERROR" color="red" variant="subtle" icon="i-lucide-circle-alert" class="mb-4"
      :description="errorMessage ?? ''" />

    <!-- 条件が揃うまでは表を出さない -->
    <div v-if="!isReady" class="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
      <UIcon name="i-lucide-list-filter" class="h-8 w-8 text-slate-300" />
      <p class="mt-3 text-sm text-slate-500">年度・月・プロジェクトを選択してください。</p>
      <p v-if="projects.length === 0" class="mt-1 text-xs text-slate-400">
        プロジェクトが登録されていません。「プロジェクト編集」から登録してください。
      </p>
    </div>

    <div v-else class="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div v-if="status === FetchStatus.IDLE || status === FetchStatus.LOADING"
        class="flex items-center justify-center gap-2 px-6 py-16 text-sm text-slate-500">
        <UIcon name="i-lucide-loader-circle" class="h-5 w-5 animate-spin" />
        <span>読み込み中...</span>
      </div>

      <!--
        売上・費用・粗利を1つの表で出す（デザイン画像に忠実）。
        ブロックごとに table を分けると列幅が揃わず、稼働時間・人日・単価の
        位置が売上ブロックとずれる。
      -->
      <table v-else-if="status === FetchStatus.SUCCESS" class="min-w-full">
        <thead class="bg-slate-50">
          <tr>
            <th scope="col" class="w-28 px-6 py-3 text-left text-xs font-semibold text-slate-500">
              大項目
            </th>
            <th scope="col" class="px-3 py-3 text-left text-xs font-semibold text-slate-500">
              小項目
            </th>
            <th scope="col" class="w-32 px-3 py-3 text-right text-xs font-semibold text-slate-500">
              稼働時間(時間)
            </th>
            <th scope="col" class="w-28 px-3 py-3 text-right text-xs font-semibold text-slate-500">
              稼働人日(日)
            </th>
            <th scope="col" class="w-36 px-3 py-3 text-right text-xs font-semibold text-slate-500">
              単価
            </th>
            <th scope="col" class="w-40 px-3 py-3 text-right text-xs font-semibold text-slate-500">
              金額
            </th>
            <th scope="col" class="w-40 px-6 py-3 text-right text-xs font-semibold text-slate-500">
              小計
            </th>
          </tr>
        </thead>

        <!-- 売上 -->
        <tbody class="divide-y divide-slate-200">
          <tr class="border-t bg-slate-50/70">
            <th scope="rowgroup" class="px-6 py-3 text-left text-sm font-bold text-slate-900">
              売上
            </th>
            <td colspan="5"></td>
            <td class="px-6 py-3 text-right text-sm font-bold tabular-nums text-slate-900">
              {{ formatYen(totalSales) }}
            </td>
          </tr>

          <!--
            align-middle にするのは、この表がテキストセル（小項目名・メンバー名）と
            入力欄を同じ行に並べるため。align-top だとテキストだけが上端に寄り、
            隣の入力欄（padding を持つ）と目線の高さが揃わない。
          -->
          <tr v-for="draft in form.sales" :key="draft.key" class="align-middle">
            <td></td>
            <td class="px-3 py-3">
              <input v-model="draft.category_small" type="text" maxlength="100"
                :class="inputClass(!!salesErrorFor(draft).category_small)"
                :aria-invalid="!!salesErrorFor(draft).category_small" aria-label="小項目名" @blur="validateLater" />
              <p v-if="salesErrorFor(draft).category_small" class="mt-1 text-xs text-red-600">
                {{ salesErrorFor(draft).category_small }}
              </p>
            </td>
            <td colspan="3"></td>
            <td class="px-3 py-3">
              <div class="relative">
                <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                  ¥
                </span>
                <input v-model.number="draft.amount" type="number" min="0" step="1"
                  :class="[inputClass(!!salesErrorFor(draft).amount), 'pl-7 text-right tabular-nums']"
                  :aria-invalid="!!salesErrorFor(draft).amount" aria-label="金額" @blur="validateLater" />
              </div>
              <p v-if="salesErrorFor(draft).amount" class="mt-1 text-xs text-red-600">
                {{ salesErrorFor(draft).amount }}
              </p>
            </td>
            <td class="px-6 py-3 text-right">
              <UButton color="gray" variant="ghost" size="xs" icon="i-lucide-trash-2"
                :aria-label="`${draft.category_small} を削除`" title="この行を削除" @click="removeSalesRow(draft)" />
            </td>
          </tr>

          <tr>
            <td></td>
            <td class="px-3 py-3" colspan="6">
              <UButton variant="ghost" icon="i-lucide-plus" class="border border-dashed border-blue-300"
                @click="addSalesRow">
                追加
              </UButton>
            </td>
          </tr>
        </tbody>

        <!-- 費用 -->
        <tbody class="divide-y divide-slate-200 border-t border-slate-200">
          <tr class="bg-slate-50/70">
            <th scope="rowgroup" class="px-6 py-3 text-left text-sm font-bold text-slate-900">
              費用
            </th>
            <td colspan="5"></td>
            <td class="px-6 py-3 text-right text-sm font-bold tabular-nums text-slate-900">
              {{ formatYen(totalCosts) }}
            </td>
          </tr>

          <tr v-for="draft in form.costs" :key="draft.key" class="align-middle">
            <td></td>
            <td class="px-3 py-3 text-sm font-semibold text-slate-900">{{ draft.label }}</td>

            <td class="px-3 py-3">
              <div class="relative">
                <input v-model.number="draft.work_hours" type="number" min="0" step="0.01" :class="[
                  inputClass(!!costErrorFor(draft).work_hours),
                  'pr-7 text-right tabular-nums',
                ]" :aria-invalid="!!costErrorFor(draft).work_hours" :aria-label="`${draft.label} の稼働時間`"
                  @blur="validateLater" />
                <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                  h
                </span>
              </div>
              <p v-if="costErrorFor(draft).work_hours" class="mt-1 text-xs text-red-600">
                {{ costErrorFor(draft).work_hours }}
              </p>
            </td>

            <!-- 稼働人日は自動計算。編集させない。 -->
            <td class="px-3 py-3">
              <p :class="readonlyClass">{{ formatWorkDays(draft.work_hours) }}</p>
            </td>

            <td class="px-3 py-3">
              <div class="relative">
                <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                  ¥
                </span>
                <!--
                  単価はマスタ値を初期表示するが上書きできる。
                  入力値は t_costs.unit_price に保存されるので、
                  あとからマスタ単価が変わっても過去月の金額は動かない。
                -->
                <input v-model.number="draft.unit_price" type="number" min="0" step="1" :class="[
                  inputClass(!!costErrorFor(draft).unit_price),
                  'pl-7 text-right tabular-nums',
                ]" :aria-invalid="!!costErrorFor(draft).unit_price" :aria-label="`${draft.label} の単価`"
                  @blur="validateLater" />
              </div>
              <p v-if="costErrorFor(draft).unit_price" class="mt-1 text-xs text-red-600">
                {{ costErrorFor(draft).unit_price }}
              </p>
            </td>

            <!-- 金額は自動計算。丸めた人日 × 単価。 -->
            <td class="px-3 py-3">
              <p :class="readonlyClass">{{ formatYen(laborAmount(draft)) }}</p>
            </td>
            <td></td>
          </tr>

          <!-- 管理費（t_costs の user_id が NULL の行） -->
          <tr class="align-middle">
            <td></td>
            <td class="px-3 py-3 text-sm font-semibold text-slate-900">管理費</td>
            <td colspan="3"></td>
            <td class="px-3 py-3">
              <div class="relative">
                <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                  ¥
                </span>
                <input v-model.number="form.managementAmount" type="number" min="0" step="1"
                  :class="[inputClass(!!managementError.amount), 'pl-7 text-right tabular-nums']"
                  :aria-invalid="!!managementError.amount" aria-label="管理費" @blur="validateLater" />
              </div>
              <p v-if="managementError.amount" class="mt-1 text-xs text-red-600">
                {{ managementError.amount }}
              </p>
            </td>
            <td></td>
          </tr>
        </tbody>

        <!-- 粗利 -->
        <tbody class="border-t border-slate-200">
          <tr class="border-b bg-slate-50/70">
            <th scope="rowgroup" class="px-6 py-3 text-left text-sm font-bold text-slate-900">
              粗利
            </th>
            <td colspan="5"></td>
            <td class="px-6 py-3 text-right text-sm font-bold tabular-nums"
              :class="summary.grossProfit < 0 ? 'text-red-600' : 'text-emerald-600'">
              {{ formatYen(summary.grossProfit) }}
            </td>
          </tr>

          <!-- 備考 -->
          <tr>
            <th scope="row" class="px-6 py-4 text-left text-sm font-semibold text-slate-900">
              備考
            </th>
            <td class="px-3 py-4" colspan="6">
              <input v-model="form.remark" type="text" :class="inputClass(false)" aria-label="備考"
                placeholder="この月の状況を記録できます" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="mt-3 text-xs text-slate-400">
      稼働人日は稼働時間 ÷ 8h で自動計算されます。金額は税抜・円単位で入力してください。
    </p>
  </div>
</template>
