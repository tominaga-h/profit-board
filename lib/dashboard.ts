/** ダッシュボードの集計。DBの行を年度・月・プロジェクトの単位に畳む。 */

import { calcProfitRate, summarize, type ProfitSummary } from '~/lib/calc'
import {
  FISCAL_MONTHS,
  buildYoYComparison,
  calcYoYPointDiff,
  calcYoYRate,
  type MonthlyValues,
  type YoYComparison,
} from '~/lib/fiscalYear'

/**
 * 集計元の1行。
 *
 * t_sales と t_costs の共通部分だけを取る。金額の意味（売上か費用か）は
 * どちらの配列に入れて渡すかで決まるので、行自体は区別を持たない。
 */
export type PerformanceRow = {
  fiscal_year: number
  month: number
  project_id: number
  amount: number
}

/** マトリクス表の1プロジェクト分。 */
export type MatrixRow = {
  projectId: number
  serviceName: string
  companyName: string
  /** 実績のある月だけを持つ。キーのない月が表の「-」になる。 */
  byMonth: ReadonlyMap<number, ProfitSummary>
  total: ProfitSummary
}

/** 月次推移グラフの1点。 */
export type MonthlyPoint = {
  month: number
  summary: ProfitSummary
  /** 実績行の有無。金額0の月と未入力の月を折れ線で区別するために持つ。 */
  hasRecords: boolean
}

/** 前年同期比のひとまとまり。率の差分だけ pt なので型が違う。 */
export type DashboardYoY = {
  sales: number | null
  costs: number | null
  profit: number | null
  /** 利益率は率どうしの比較なので % ではなく pt 差（SPEC 4.1）。 */
  profitRatePoint: number | null
  /** 比較に使った月。「7〜1月の累計比較」と注記するために持つ。 */
  months: readonly number[]
}

export type DashboardData = {
  kpi: ProfitSummary
  yoy: DashboardYoY
  monthly: readonly MonthlyPoint[]
  matrix: readonly MatrixRow[]
}

/** マトリクスの行に必要なプロジェクト情報。 */
export type DashboardProject = {
  id: number
  service_name: string
  company_name: string
}

/**
 * 月ごとの合計額。実績行のあった月だけをキーに持つ。
 *
 * ★ キーの有無が「未入力かどうか」を表す。金額0の行だけがある月は合計0だが
 *   入力済みなので、値ではなくキーで判断する。集合を別に持つ必要はない。
 */
type MonthlyFold = ReadonlyMap<number, number>

const foldByMonth = (rows: readonly PerformanceRow[]): MonthlyFold => {
  const totals = new Map<number, number>()
  for (const row of rows) totals.set(row.month, (totals.get(row.month) ?? 0) + row.amount)
  return totals
}

/** 年度内の合計。実績のない月は 0 として足す。 */
const sumMonths = (fold: MonthlyFold): number =>
  FISCAL_MONTHS.reduce((total, month) => total + (fold.get(month) ?? 0), 0)

const filterByYear = (rows: readonly PerformanceRow[], fiscalYear: number) =>
  rows.filter((row) => row.fiscal_year === fiscalYear)

/**
 * 前年同期比を組み立てる。
 *
 * ★ 前年の利益率は「前年同期の累計売上と累計粗利」から出す。月ごとの利益率を
 *   平均すると売上規模の違いが無視され、小さい月の率が過大に効いてしまう。
 *
 * ★ 比較対象の月は売上側の集合で代表させる。売上・費用・利益で別々の月集合を
 *   使うと、KPI ごとに違う期間を比べた数字が横並びになる。
 */
const buildYoY = (
  currentSales: MonthlyFold,
  currentCosts: MonthlyFold,
  previousSales: MonthlyFold,
  previousCosts: MonthlyFold,
): DashboardYoY => {
  const salesComparison = buildYoYComparison(currentSales, previousSales)
  const costsComparison = buildYoYComparison(currentCosts, previousCosts)

  const profitComparison = buildProfitComparison(salesComparison, costsComparison)

  return {
    sales: calcYoYRate(salesComparison),
    costs: calcYoYRate(costsComparison),
    profit: calcYoYRate(profitComparison),
    profitRatePoint: buildProfitRatePoint(salesComparison, costsComparison),
    months: salesComparison?.months ?? [],
  }
}

/**
 * 営業利益の比較を売上と費用の比較から導く。
 *
 * ★ 利益用に buildYoYComparison をもう一度呼ばない。利益は行として存在せず
 *   売上−費用でしか作れないため、月ごとに引き算した Map を組み直す必要がある。
 *   売上と費用それぞれの累計から引くほうが、同じ月集合を使う保証が型で残る。
 */
const buildProfitComparison = (
  sales: YoYComparison | null,
  costs: YoYComparison | null,
): YoYComparison | null => {
  if (!sales) return null

  const previousCosts = costs?.previous ?? 0
  return {
    current: sales.current - (costs?.current ?? 0),
    previous: sales.previous - previousCosts,
    months: sales.months,
  }
}

/** 利益率の pt 差。前年の売上が0なら率が定義できないので null に倒す。 */
const buildProfitRatePoint = (
  sales: YoYComparison | null,
  costs: YoYComparison | null,
): number | null => {
  if (!sales) return null

  const currentRate = calcProfitRate(sales.current, sales.current - (costs?.current ?? 0))
  const previousSales = sales.previous
  if (previousSales === 0) return null

  const previousRate = calcProfitRate(previousSales, previousSales - (costs?.previous ?? 0))
  return calcYoYPointDiff(currentRate, previousRate)
}

/**
 * プロジェクト単位で月ごとの指標を組む。
 *
 * 実績のないプロジェクトも行を残す。マトリクスから消すと、入力漏れなのか
 * 対象外なのかが画面から判別できなくなる。
 */
const buildMatrix = (
  projects: readonly DashboardProject[],
  sales: readonly PerformanceRow[],
  costs: readonly PerformanceRow[],
): MatrixRow[] => {
  const salesByProject = groupByProject(sales)
  const costsByProject = groupByProject(costs)

  return projects.map((project) => {
    const projectSales = foldByMonth(salesByProject.get(project.id) ?? [])
    const projectCosts = foldByMonth(costsByProject.get(project.id) ?? [])

    const byMonth = new Map<number, ProfitSummary>()
    for (const month of FISCAL_MONTHS) {
      if (!projectSales.has(month) && !projectCosts.has(month)) continue
      byMonth.set(month, summarize(projectSales.get(month) ?? 0, projectCosts.get(month) ?? 0))
    }

    return {
      projectId: project.id,
      serviceName: project.service_name,
      companyName: project.company_name,
      byMonth,
      // 年間の粗利率は合計から出す。月次の率を平均すると売上規模を無視する。
      total: summarize(sumMonths(projectSales), sumMonths(projectCosts)),
    }
  })
}

const groupByProject = (rows: readonly PerformanceRow[]): Map<number, PerformanceRow[]> => {
  const byProject = new Map<number, PerformanceRow[]>()
  for (const row of rows) {
    const bucket = byProject.get(row.project_id)
    if (bucket) bucket.push(row)
    else byProject.set(row.project_id, [row])
  }
  return byProject
}

/**
 * ダッシュボードが必要とする集計を一度に組み立てる。
 *
 * 売上・費用の行は2年度分をまとめて受け取る。前年同期比のために前年度が要る一方、
 * 年度ごとに問い合わせを分けると往復が倍になるため、絞り込みはここで行う。
 */
export const buildDashboardData = (
  fiscalYear: number,
  projects: readonly DashboardProject[],
  salesRows: readonly PerformanceRow[],
  costsRows: readonly PerformanceRow[],
): DashboardData => {
  const currentSalesRows = filterByYear(salesRows, fiscalYear)
  const currentCostsRows = filterByYear(costsRows, fiscalYear)

  const currentSales = foldByMonth(currentSalesRows)
  const currentCosts = foldByMonth(currentCostsRows)
  const previousSales = foldByMonth(filterByYear(salesRows, fiscalYear - 1))
  const previousCosts = foldByMonth(filterByYear(costsRows, fiscalYear - 1))

  // 月は必ず12件返す。実績のない月を欠番にするとグラフのX軸が詰まって並ぶ。
  const monthly = FISCAL_MONTHS.map((month) => ({
    month,
    summary: summarize(currentSales.get(month) ?? 0, currentCosts.get(month) ?? 0),
    hasRecords: currentSales.has(month) || currentCosts.has(month),
  }))

  return {
    kpi: summarize(sumMonths(currentSales), sumMonths(currentCosts)),
    yoy: buildYoY(currentSales, currentCosts, previousSales, previousCosts),
    monthly,
    matrix: buildMatrix(projects, currentSalesRows, currentCostsRows),
  }
}
