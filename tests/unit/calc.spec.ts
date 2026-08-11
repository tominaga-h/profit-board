import { describe, expect, it } from 'vitest'
import {
  calcGrossProfit,
  calcLaborCost,
  calcProfitRate,
  calcWorkDays,
  roundTo,
  sumAmount,
  summarize,
} from '~/lib/calc'

/**
 * ★ 丸め済みの値（calcWorkDays / calcLaborCost）は toBe で厳密比較する。
 *   丸めが効いていること自体が検証対象なので、toBeCloseTo にすると
 *   丸めのバグを見逃す。
 *
 * ★ 丸めない値（calcProfitRate）は toBeCloseTo で比較する。
 *   -66.66666666666667 のような値を厳密比較すると環境依存で脆くなる。
 */

describe('roundTo', () => {
  it('0.615 は 0.62 に切り上がる', () => {
    // ★ toFixed で実装すると 0.61 になる。実装差し替えの回帰テスト。
    expect(roundTo(0.615, 2)).toBe(0.62)
  })

  it('1.005 は 1.01 に切り上がる', () => {
    // ★ Math.round(v * 100) / 100 で実装すると 1 になる。同上。
    expect(roundTo(1.005, 2)).toBe(1.01)
  })

  it('0.075 は 0.08 に切り上がる', () => {
    // 0.6h ÷ 8 の値。toFixed だと 0.07 になる。
    expect(roundTo(0.075, 2)).toBe(0.08)
  })

  it('5未満は切り捨てる', () => {
    expect(roundTo(1.004, 2)).toBe(1)
    expect(roundTo(0.074, 2)).toBe(0.07)
  })

  it('0はそのまま0', () => {
    expect(roundTo(0, 2)).toBe(0)
  })

  it('桁数0で整数に丸める', () => {
    expect(roundTo(7222.15, 0)).toBe(7222)
    expect(roundTo(7222.5, 0)).toBe(7223)
  })

  it('負の値は0方向に丸める（JSのMath.roundの仕様）', () => {
    // 費用が負になる運用はないが、挙動を固定しておく。
    expect(roundTo(-0.615, 2)).toBe(-0.61)
  })
})

describe('calcWorkDays', () => {
  it('2.0時間は0.25人日', () => {
    expect(calcWorkDays(2.0)).toBe(0.25)
  })

  it('12時間は1.5人日', () => {
    expect(calcWorkDays(12)).toBe(1.5)
  })

  it('120時間は15人日', () => {
    expect(calcWorkDays(120)).toBe(15)
  })

  it('5時間は0.63人日（0.625 を四捨五入）', () => {
    expect(calcWorkDays(5)).toBe(0.63)
  })

  it('0.6時間は0.08人日（0.075 を四捨五入）', () => {
    expect(calcWorkDays(0.6)).toBe(0.08)
  })

  it('12.2時間は1.53人日（1.525 を四捨五入）', () => {
    expect(calcWorkDays(12.2)).toBe(1.53)
  })

  it('1時間は0.13人日（0.125 を四捨五入）', () => {
    expect(calcWorkDays(1)).toBe(0.13)
  })

  it('未入力（0時間）は0人日', () => {
    expect(calcWorkDays(0)).toBe(0)
  })

  it('160時間は20人日（月間フル稼働）', () => {
    expect(calcWorkDays(160)).toBe(20)
  })
})

describe('calcLaborCost', () => {
  it('15人日 × ¥60,000 = ¥900,000', () => {
    expect(calcLaborCost(15, 60000)).toBe(900000)
  })

  it('120時間 × ¥60,000 = ¥900,000（稼働時間からの通し計算）', () => {
    expect(calcLaborCost(calcWorkDays(120), 60000)).toBe(900000)
  })

  it('5時間 × ¥60,000 は丸めた人日で計算して ¥37,800', () => {
    // ★ このテストが「丸めた後の人日で掛ける」という仕様の証明。
    //   丸めずに 0.625 × 60,000 とすると ¥37,500 になり 300 円ズレる。
    expect(calcLaborCost(calcWorkDays(5), 60000)).toBe(37800)
  })

  it('2時間 × ¥60,000 = ¥15,000', () => {
    expect(calcLaborCost(calcWorkDays(2), 60000)).toBe(15000)
  })

  it('稼働0なら費用0', () => {
    expect(calcLaborCost(0, 60000)).toBe(0)
  })

  it('端数が出ても整数円に丸める', () => {
    // 0.13 × 55,555 = 7,222.15
    expect(calcLaborCost(0.13, 55555)).toBe(7222)
  })
})

describe('sumAmount', () => {
  it('空配列は0（未入力の月）', () => {
    expect(sumAmount([])).toBe(0)
  })

  it('複数行を合計する', () => {
    expect(sumAmount([{ amount: 100 }, { amount: 200 }, { amount: 300 }])).toBe(600)
  })

  it('負の金額（返金等）も合計できる', () => {
    expect(sumAmount([{ amount: 1000 }, { amount: -300 }])).toBe(700)
  })

  it('amount 以外のキーを持つ行も渡せる', () => {
    // t_sales.Row 相当のオブジェクトをそのまま渡せることの確認。
    const rows = [
      { id: 1, project_id: 10, category_small: '保守', amount: 500000 },
      { id: 2, project_id: 10, category_small: '保守外', amount: 300000 },
    ]
    expect(sumAmount(rows)).toBe(800000)
  })
})

describe('calcGrossProfit', () => {
  it('売上から費用を引く', () => {
    expect(calcGrossProfit(1000000, 600000)).toBe(400000)
  })

  it('費用が上回れば赤字になる', () => {
    expect(calcGrossProfit(600000, 1000000)).toBe(-400000)
  })

  it('売上と費用が同額なら0', () => {
    expect(calcGrossProfit(1000000, 1000000)).toBe(0)
  })
})

describe('calcProfitRate', () => {
  it('黒字なら正の率', () => {
    expect(calcProfitRate(1000000, 400000)).toBeCloseTo(40)
  })

  it('赤字なら負の率', () => {
    expect(calcProfitRate(600000, -400000)).toBeCloseTo(-66.6667, 3)
  })

  it('利益0なら0%', () => {
    expect(calcProfitRate(1000000, 0)).toBe(0)
  })

  it('費用0なら100%', () => {
    expect(calcProfitRate(1000000, 1000000)).toBeCloseTo(100)
  })

  it('売上0なら0%を返す', () => {
    const rate = calcProfitRate(0, -500000)
    expect(rate).toBe(0)
    // -Infinity になっていないことを明示的に確認する。
    expect(Number.isFinite(rate)).toBe(true)
  })

  it('売上0・費用0でも NaN にならない', () => {
    const rate = calcProfitRate(0, 0)
    expect(rate).toBe(0)
    expect(Number.isNaN(rate)).toBe(false)
  })
})

describe('summarize', () => {
  it('売上・費用から4指標をまとめて返す', () => {
    expect(summarize(1000000, 600000)).toEqual({
      totalSales: 1000000,
      totalCosts: 600000,
      grossProfit: 400000,
      profitRate: 40,
    })
  })

  it('売上0でも率が0で破綻しない', () => {
    const summary = summarize(0, 500000)
    expect(summary.grossProfit).toBe(-500000)
    expect(summary.profitRate).toBe(0)
  })

  it('実績なし（すべて0）でも破綻しない', () => {
    expect(summarize(0, 0)).toEqual({
      totalSales: 0,
      totalCosts: 0,
      grossProfit: 0,
      profitRate: 0,
    })
  })
})
