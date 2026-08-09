import { describe, expect, it } from 'vitest'
import {
  FISCAL_MONTHS,
  FISCAL_START_MONTH,
  buildYoYComparison,
  calcYoYPointDiff,
  calcYoYRate,
  fiscalMonthIndex,
  getCurrentFiscalYear,
  getFiscalMonths,
  previousFiscalMonth,
  toCalendarYear,
  toFiscalYear,
} from '~/lib/fiscalYear'

/**
 * 年度は7月始まり（6月決算）。2026年度 = 2026年7月〜2027年6月。
 *
 * ★ Date を作るときは必ず new Date(2026, 5, 30) のローカル時刻コンストラクタを使う。
 *   new Date('2026-06-30') は UTC 解釈なので、JST では7月1日09:00になってしまい、
 *   年度の境界を検証しているつもりが実行環境のタイムゾーン次第で結果が変わる。
 *   （月は0始まりなので 5 が6月）
 *
 * ★ 比率・pt差は丸めない設計なので toBeCloseTo で比較する。
 *   一方、月や年度の変換結果は整数なので toBe で厳密比較する。
 */

describe('getFiscalMonths', () => {
  it('7月始まり（現在の設定）で12ヶ月が並ぶ', () => {
    expect(getFiscalMonths(7)).toEqual([7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6])
  })

  it('4月始まりでも正しく並ぶ', () => {
    expect(getFiscalMonths(4)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3])
  })

  it('1月始まり（暦年と一致）でも正しく並ぶ', () => {
    expect(getFiscalMonths(1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('12月始まり（境界）でも正しく並ぶ', () => {
    expect(getFiscalMonths(12)).toEqual([12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('どの開始月でも12ヶ月すべてが重複なく現れる', () => {
    for (let startMonth = 1; startMonth <= 12; startMonth++) {
      const months = getFiscalMonths(startMonth)
      expect(months).toHaveLength(12)
      expect(months[0]).toBe(startMonth)
      expect([...months].sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      ])
    }
  })
})

describe('FISCAL_MONTHS', () => {
  it('現在の開始月から生成された並びを持つ', () => {
    expect(FISCAL_MONTHS).toEqual(getFiscalMonths(FISCAL_START_MONTH))
  })

  it('先頭が開始月と一致する', () => {
    expect(FISCAL_MONTHS[0]).toBe(FISCAL_START_MONTH)
  })
})

describe('toCalendarYear', () => {
  it('開始月以降（7〜12月）は年度と同じ暦年になる', () => {
    expect(toCalendarYear(2026, 7)).toBe(2026)
    expect(toCalendarYear(2026, 12)).toBe(2026)
  })

  it('開始月より前（1〜6月）は翌暦年になる（年度またぎ）', () => {
    expect(toCalendarYear(2026, 1)).toBe(2027)
    expect(toCalendarYear(2026, 6)).toBe(2027)
  })

  it('開始月を変えると境界も追従する（4月始まり）', () => {
    expect(toCalendarYear(2026, 4, 4)).toBe(2026)
    expect(toCalendarYear(2026, 3, 4)).toBe(2027)
  })

  it('1月始まりなら年度と暦年が常に一致する', () => {
    for (let month = 1; month <= 12; month++) {
      expect(toCalendarYear(2026, month, 1)).toBe(2026)
    }
  })
})

describe('toFiscalYear', () => {
  it('開始月以降（7〜12月）はその暦年の年度になる', () => {
    expect(toFiscalYear(2026, 7)).toBe(2026)
    expect(toFiscalYear(2026, 12)).toBe(2026)
  })

  it('開始月より前（1〜6月）は前年度になる（年度またぎ）', () => {
    expect(toFiscalYear(2027, 1)).toBe(2026)
    expect(toFiscalYear(2027, 6)).toBe(2026)
  })

  it('toCalendarYear と往復して元の年度に戻る（全12ヶ月）', () => {
    for (const month of FISCAL_MONTHS) {
      expect(toFiscalYear(toCalendarYear(2026, month), month)).toBe(2026)
    }
  })

  it('どの開始月でも toCalendarYear と往復して元の年度に戻る', () => {
    for (let startMonth = 1; startMonth <= 12; startMonth++) {
      for (const month of getFiscalMonths(startMonth)) {
        const calendarYear = toCalendarYear(2026, month, startMonth)
        expect(toFiscalYear(calendarYear, month, startMonth)).toBe(2026)
      }
    }
  })
})

describe('getCurrentFiscalYear', () => {
  it('6月30日はまだ前年度（年度切替の前日）', () => {
    expect(getCurrentFiscalYear(new Date(2027, 5, 30))).toBe(2026)
  })

  it('7月1日から新年度になる（年度切替の当日）', () => {
    expect(getCurrentFiscalYear(new Date(2027, 6, 1))).toBe(2027)
  })

  it('年をまたいだ1月は前年の年度に属する', () => {
    expect(getCurrentFiscalYear(new Date(2027, 0, 15))).toBe(2026)
  })

  it('12月31日は同じ暦年の年度のまま', () => {
    expect(getCurrentFiscalYear(new Date(2026, 11, 31))).toBe(2026)
  })

  it('引数なしでも現在日時から年度を返す', () => {
    // 実行日に依存させないため値そのものは検証せず、既定値が生きていることだけ見る。
    expect(Number.isInteger(getCurrentFiscalYear())).toBe(true)
  })

  it('開始月を変えると同じ日でも年度が変わる', () => {
    // 2026年5月1日は、7月始まりなら前年度（2025年度）だが、4月始まりなら2026年度。
    const date = new Date(2026, 4, 1)
    expect(getCurrentFiscalYear(date, 7)).toBe(2025)
    expect(getCurrentFiscalYear(date, 4)).toBe(2026)
  })
})

describe('fiscalMonthIndex', () => {
  it('開始月（7月）が0、年度末月（6月）が11になる', () => {
    expect(fiscalMonthIndex(7)).toBe(0)
    expect(fiscalMonthIndex(12)).toBe(5)
    expect(fiscalMonthIndex(1)).toBe(6)
    expect(fiscalMonthIndex(6)).toBe(11)
  })

  it('FISCAL_MONTHS の並びが 0〜11 の連番になる', () => {
    expect(FISCAL_MONTHS.map((month) => fiscalMonthIndex(month))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ])
  })

  it('どの開始月でも年度の並びが 0〜11 の連番になる', () => {
    for (let startMonth = 1; startMonth <= 12; startMonth++) {
      const indexes = getFiscalMonths(startMonth).map((month) =>
        fiscalMonthIndex(month, startMonth),
      )
      expect(indexes).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    }
  })
})

describe('previousFiscalMonth', () => {
  it('年度内では暦の前月を返す', () => {
    expect(previousFiscalMonth(8)).toBe(7)
    expect(previousFiscalMonth(6)).toBe(5)
  })

  it('1月の前月は12月（暦年はまたぐが年度内では隣接）', () => {
    expect(previousFiscalMonth(1)).toBe(12)
  })

  it('年度初月（7月）には前月がない', () => {
    expect(previousFiscalMonth(7)).toBeNull()
  })

  it('どの開始月でも年度初月だけが null で、他は年度内の直前の月を返す', () => {
    for (let startMonth = 1; startMonth <= 12; startMonth++) {
      const months = getFiscalMonths(startMonth)
      expect(previousFiscalMonth(months[0], startMonth)).toBeNull()

      for (let index = 1; index < months.length; index++) {
        expect(previousFiscalMonth(months[index], startMonth)).toBe(months[index - 1])
      }
    }
  })
})

describe('buildYoYComparison', () => {
  it('当年度に実績のある月だけを両年度から足す', () => {
    // 年度の頭から3ヶ月（7,8,9月）だけ実績がある状態。
    const current = new Map([
      [7, 100],
      [8, 200],
      [9, 300],
    ])
    // 前年度は12ヶ月フルに実績がある。
    const previous = new Map(FISCAL_MONTHS.map((month) => [month, 1000]))

    const result = buildYoYComparison(current, previous)

    expect(result).not.toBeNull()
    expect(result?.current).toBe(600)
    // 10月以降の 1000 円が混ざっていないこと（7,8,9月の 3000 円だけ）。
    expect(result?.previous).toBe(3000)
    expect(result?.months).toEqual([7, 8, 9])
  })

  it('飛び月があっても前年度から同じ月だけを足す', () => {
    const current = new Map([
      [7, 100],
      [9, 200],
      [12, 300],
    ])
    const previous = new Map(FISCAL_MONTHS.map((month) => [month, 1000]))

    const result = buildYoYComparison(current, previous)

    expect(result?.current).toBe(600)
    // 欠けている8,10,11月を前年度から拾ってしまうと 5000 以上になる。
    expect(result?.previous).toBe(3000)
    expect(result?.months).toEqual([7, 9, 12])
  })

  it('前年度側に穴がある月は0として足す', () => {
    const current = new Map([
      [7, 100],
      [8, 200],
      [9, 300],
    ])
    const previous = new Map([
      [7, 1000],
      [9, 3000],
    ])

    const result = buildYoYComparison(current, previous)

    expect(result?.previous).toBe(4000)
    expect(result?.months).toEqual([7, 8, 9])
  })

  it('前年度に対象月のデータが1件もなければ null', () => {
    const current = new Map([
      [7, 100],
      [8, 200],
    ])
    const previous = new Map([
      [1, 1000],
      [2, 2000],
    ])

    expect(buildYoYComparison(current, previous)).toBeNull()
  })

  it('前年度が空なら null', () => {
    expect(buildYoYComparison(new Map([[7, 100]]), new Map())).toBeNull()
  })

  it('当年度が空なら null', () => {
    expect(buildYoYComparison(new Map(), new Map([[7, 100]]))).toBeNull()
  })

  it('months は Map の挿入順ではなく年度順（開始月から）で返る', () => {
    // 1月（年度の後半）を先に入れた Map。挿入順に従うと [1, 7] になってしまう。
    const current = new Map([
      [1, 100],
      [7, 200],
    ])
    const previous = new Map([
      [1, 50],
      [7, 50],
    ])

    expect(buildYoYComparison(current, previous)?.months).toEqual([7, 1])
  })

  it('開始月を変えると months の並びも追従する（4月始まり）', () => {
    const current = new Map([
      [1, 100],
      [4, 200],
    ])
    const previous = new Map([
      [1, 50],
      [4, 50],
    ])

    // 4月始まりでは4月が年度の先頭、1月は年度の後半。
    expect(buildYoYComparison(current, previous, 4)?.months).toEqual([4, 1])
    // 1月始まりなら順序が入れ替わる。
    expect(buildYoYComparison(current, previous, 1)?.months).toEqual([1, 4])
  })
})

describe('calcYoYRate', () => {
  it('前年より増えていればプラスの率', () => {
    expect(calcYoYRate({ current: 1200, previous: 1000, months: [7] })).toBeCloseTo(20)
  })

  it('前年より減っていればマイナスの率', () => {
    expect(calcYoYRate({ current: 800, previous: 1000, months: [7] })).toBeCloseTo(-20)
  })

  it('前年と同額なら0（null ではない）', () => {
    expect(calcYoYRate({ current: 1000, previous: 1000, months: [7] })).toBe(0)
  })

  it('比較対象がなければ null', () => {
    expect(calcYoYRate(null)).toBeNull()
  })

  it('前年が0なら null（Infinity にしない）', () => {
    expect(calcYoYRate({ current: 1000, previous: 0, months: [7] })).toBeNull()
  })

  it('前年が赤字（負）なら null', () => {
    expect(calcYoYRate({ current: 1000, previous: -500, months: [7] })).toBeNull()
  })
})

describe('calcYoYPointDiff', () => {
  it('利益率のポイント差を引き算で返す', () => {
    expect(calcYoYPointDiff(40, 35)).toBe(5)
    expect(calcYoYPointDiff(35, 40)).toBe(-5)
    expect(calcYoYPointDiff(40, 40)).toBe(0)
  })

  it('前年の率がなければ null', () => {
    expect(calcYoYPointDiff(40, null)).toBeNull()
  })

  it('小数の率でも差分が求まる', () => {
    expect(calcYoYPointDiff(40.1, 35.2)).toBeCloseTo(4.9)
  })
})
