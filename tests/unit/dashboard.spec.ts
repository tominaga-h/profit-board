import { describe, expect, it } from 'vitest'
import { buildDashboardData, type DashboardProject, type PerformanceRow } from '~/lib/dashboard'
import { FISCAL_MONTHS } from '~/lib/fiscalYear'

/**
 * 年度は7月始まり。2023年度 = 2023年7月〜2024年6月で、month は暦月を持つ。
 *
 * ★ 比率・pt差は丸めない設計なので toBeCloseTo で比較する。
 *   金額の合計は整数のまま扱うので toBe で厳密比較する。
 */

const PROJECTS: DashboardProject[] = [
  { id: 1, service_name: 'サービスA', company_name: '会社A' },
  { id: 2, service_name: 'サービスB', company_name: '会社B' },
]

const row = (
  fiscal_year: number,
  month: number,
  project_id: number,
  amount: number,
): PerformanceRow => ({ fiscal_year, month, project_id, amount })

describe('buildDashboardData - KPI', () => {
  it('年度内の売上と費用を合計する', () => {
    const data = buildDashboardData(
      2023,
      PROJECTS,
      [row(2023, 7, 1, 1000), row(2023, 8, 1, 2000), row(2023, 1, 2, 500)],
      [row(2023, 7, 1, 400)],
    )

    expect(data.kpi.totalSales).toBe(3500)
    expect(data.kpi.totalCosts).toBe(400)
    expect(data.kpi.grossProfit).toBe(3100)
  })

  it('対象年度以外の行は合計に混ぜない', () => {
    const data = buildDashboardData(
      2023,
      PROJECTS,
      [row(2023, 7, 1, 1000), row(2022, 7, 1, 9999), row(2024, 7, 1, 8888)],
      [],
    )

    expect(data.kpi.totalSales).toBe(1000)
  })

  it('実績0件でも全項目0で返る', () => {
    const data = buildDashboardData(2023, PROJECTS, [], [])

    expect(data.kpi).toEqual({
      totalSales: 0,
      totalCosts: 0,
      grossProfit: 0,
      profitRate: 0,
    })
  })

  it('年間の利益率は月次の率の平均ではなく合計から出す', () => {
    // 7月: 売上100/費用90（率10%）、8月: 売上900/費用450（率50%）。
    // 月次の率を平均すると30%になるが、正しくは合計から (1000-540)/1000 = 46%。
    // 売上規模の違いを無視すると小さい月の率が過大に効く。
    const data = buildDashboardData(
      2023,
      PROJECTS,
      [row(2023, 7, 1, 100), row(2023, 8, 1, 900)],
      [row(2023, 7, 1, 90), row(2023, 8, 1, 450)],
    )

    expect(data.kpi.profitRate).toBeCloseTo(46, 10)
  })
})

describe('buildDashboardData - 月次', () => {
  it('実績のない月も含めて必ず12件返す', () => {
    // 欠番にするとグラフのX軸が詰まって並び、月の位置が読めなくなる。
    const data = buildDashboardData(2023, PROJECTS, [row(2023, 7, 1, 1000)], [])

    expect(data.monthly).toHaveLength(12)
  })

  it('月は年度の並び（7月始まり）で返る', () => {
    const data = buildDashboardData(2023, PROJECTS, [], [])

    expect(data.monthly.map((point) => point.month)).toEqual([...FISCAL_MONTHS])
  })

  it('実績のない月は hasRecords が false で合計0', () => {
    const data = buildDashboardData(2023, PROJECTS, [row(2023, 7, 1, 1000)], [])
    const august = data.monthly.find((point) => point.month === 8)

    expect(august?.hasRecords).toBe(false)
    expect(august?.summary.totalSales).toBe(0)
  })

  it('金額0の行しかない月も hasRecords は true', () => {
    // 「0円で入力済み」と「未入力」は別物。金額で判定すると区別が消える。
    const data = buildDashboardData(2023, PROJECTS, [row(2023, 7, 1, 0)], [])
    const july = data.monthly.find((point) => point.month === 7)

    expect(july?.hasRecords).toBe(true)
  })

  it('同じ月の複数プロジェクトを合算する', () => {
    const data = buildDashboardData(
      2023,
      PROJECTS,
      [row(2023, 7, 1, 1000), row(2023, 7, 2, 300)],
      [],
    )

    expect(data.monthly.find((point) => point.month === 7)?.summary.totalSales).toBe(1300)
  })
})

describe('buildDashboardData - 前年同期比', () => {
  it('当年度で実績のある月だけを前年度と比べる', () => {
    // 当年度は7月のみ。前年度に12ヶ月あっても7月だけを取る。
    // 年度合計どうしを比べると期の途中で必ず大幅マイナスに見えてしまう。
    const previousSales = FISCAL_MONTHS.map((month) => row(2022, month, 1, 1000))
    const data = buildDashboardData(
      2023,
      PROJECTS,
      [row(2023, 7, 1, 1500), ...previousSales],
      [],
    )

    // 1500 対 1000 で +50%。前年度12ヶ月分の 12000 とは比べない。
    expect(data.yoy.sales).toBeCloseTo(50, 10)
    expect(data.yoy.months).toEqual([7])
  })

  it('前年度に実績がなければ null', () => {
    const data = buildDashboardData(2023, PROJECTS, [row(2023, 7, 1, 1000)], [])

    expect(data.yoy.sales).toBeNull()
    expect(data.yoy.profit).toBeNull()
    expect(data.yoy.profitRatePoint).toBeNull()
  })

  it('当年度に実績がなければ null', () => {
    const data = buildDashboardData(2023, PROJECTS, [row(2022, 7, 1, 1000)], [])

    expect(data.yoy.sales).toBeNull()
    expect(data.yoy.months).toEqual([])
  })

  it('金額0の月も比較対象の月として数える', () => {
    // ★ この方式の肝。amount !== 0 で絞ると当年度の7月が比較から落ち、
    //   8月だけの比較になって数字が変わる。
    const data = buildDashboardData(
      2023,
      PROJECTS,
      [
        row(2023, 7, 1, 0),
        row(2023, 8, 1, 1000),
        row(2022, 7, 1, 400),
        row(2022, 8, 1, 600),
      ],
      [],
    )

    expect(data.yoy.months).toEqual([7, 8])
    // 当年 1000 対 前年 1000 で増減なし。7月が落ちると 1000 対 600 になる。
    expect(data.yoy.sales).toBeCloseTo(0, 10)
  })

  it('前年度に穴がある月は0として足す', () => {
    // 前年度の8月が未入力。当年度側で月の集合を確定させるので8月も比較に入る。
    const data = buildDashboardData(
      2023,
      PROJECTS,
      [row(2023, 7, 1, 1000), row(2023, 8, 1, 1000), row(2022, 7, 1, 1000)],
      [],
    )

    expect(data.yoy.months).toEqual([7, 8])
    expect(data.yoy.sales).toBeCloseTo(100, 10)
  })

  it('営業利益は同じ月の集合で売上と費用の差から出す', () => {
    const data = buildDashboardData(
      2023,
      PROJECTS,
      [row(2023, 7, 1, 1000), row(2022, 7, 1, 1000)],
      [row(2023, 7, 1, 400), row(2022, 7, 1, 600)],
    )

    // 当年 600 対 前年 400 で +50%。
    expect(data.yoy.profit).toBeCloseTo(50, 10)
  })

  it('利益率は % ではなく pt 差で返る', () => {
    const data = buildDashboardData(
      2023,
      PROJECTS,
      [row(2023, 7, 1, 1000), row(2022, 7, 1, 1000)],
      [row(2023, 7, 1, 400), row(2022, 7, 1, 500)],
    )

    // 当年 60% 対 前年 50% で +10pt。増減率なら +20% になる。
    expect(data.yoy.profitRatePoint).toBeCloseTo(10, 10)
  })

  it('前年が赤字なら増減率は null', () => {
    // 前年が負だと増減率の符号が直感と逆になるため率としては定義できない。
    const data = buildDashboardData(
      2023,
      PROJECTS,
      [row(2023, 7, 1, 1000), row(2022, 7, 1, 1000)],
      [row(2023, 7, 1, 400), row(2022, 7, 1, 1500)],
    )

    expect(data.yoy.profit).toBeNull()
    // pt 差は前年が赤字でも定義できるので残る。
    expect(data.yoy.profitRatePoint).toBeCloseTo(110, 10)
  })

  it('前年の売上が0なら pt 差は null', () => {
    // 前年に実績行はあるが売上が0。率が定義できないので比較しない。
    // buildYoYComparison は行があれば返すので、ここで別途弾く必要がある。
    const data = buildDashboardData(
      2023,
      PROJECTS,
      [row(2023, 7, 1, 1000), row(2022, 7, 1, 0)],
      [row(2022, 7, 1, 300)],
    )

    expect(data.yoy.profitRatePoint).toBeNull()
  })

  it('費用の前年同期比も売上と同じ月の集合で出す', () => {
    const data = buildDashboardData(
      2023,
      PROJECTS,
      [row(2023, 7, 1, 1000), row(2022, 7, 1, 1000)],
      [row(2023, 7, 1, 600), row(2022, 7, 1, 400)],
    )

    expect(data.yoy.costs).toBeCloseTo(50, 10)
  })
})

describe('buildDashboardData - マトリクス', () => {
  it('実績のないプロジェクトも行を残す', () => {
    // 消すと入力漏れなのか対象外なのかが画面から判別できない。
    const data = buildDashboardData(2023, PROJECTS, [row(2023, 7, 1, 1000)], [])

    expect(data.matrix).toHaveLength(2)
    expect(data.matrix[1].projectId).toBe(2)
    expect(data.matrix[1].byMonth.size).toBe(0)
  })

  it('プロジェクトの並びは渡された順を保つ', () => {
    const data = buildDashboardData(2023, PROJECTS, [], [])

    expect(data.matrix.map((matrixRow) => matrixRow.projectId)).toEqual([1, 2])
  })

  it('未入力の月はキーを持たない', () => {
    // キーの有無が表の「-」表示の根拠になる。
    const data = buildDashboardData(2023, PROJECTS, [row(2023, 7, 1, 1000)], [])

    expect(data.matrix[0].byMonth.has(7)).toBe(true)
    expect(data.matrix[0].byMonth.has(8)).toBe(false)
  })

  it('費用だけある月もキーを持つ', () => {
    const data = buildDashboardData(2023, PROJECTS, [], [row(2023, 7, 1, 500)])
    const july = data.matrix[0].byMonth.get(7)

    expect(july?.totalSales).toBe(0)
    expect(july?.grossProfit).toBe(-500)
  })

  it('他プロジェクトの実績を混ぜない', () => {
    const data = buildDashboardData(
      2023,
      PROJECTS,
      [row(2023, 7, 1, 1000), row(2023, 7, 2, 300)],
      [],
    )

    expect(data.matrix[0].byMonth.get(7)?.totalSales).toBe(1000)
    expect(data.matrix[1].byMonth.get(7)?.totalSales).toBe(300)
  })

  it('年間合計はプロジェクト内の全月を足す', () => {
    const data = buildDashboardData(
      2023,
      PROJECTS,
      [row(2023, 7, 1, 1000), row(2023, 1, 1, 500)],
      [row(2023, 7, 1, 200)],
    )

    expect(data.matrix[0].total.totalSales).toBe(1500)
    expect(data.matrix[0].total.grossProfit).toBe(1300)
  })

  it('マトリクスに前年度の行は含めない', () => {
    const data = buildDashboardData(2023, PROJECTS, [row(2022, 7, 1, 9999)], [])

    expect(data.matrix[0].byMonth.size).toBe(0)
    expect(data.matrix[0].total.totalSales).toBe(0)
  })

  it('プロジェクトが0件ならマトリクスも0件', () => {
    const data = buildDashboardData(2023, [], [row(2023, 7, 1, 1000)], [])

    expect(data.matrix).toHaveLength(0)
    // プロジェクトが引けなくても KPI は集計できる。
    expect(data.kpi.totalSales).toBe(1000)
  })
})
