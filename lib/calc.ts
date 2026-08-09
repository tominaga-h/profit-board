/** 売上・費用・粗利の計算（SPEC 6.1）。 */

/** 1人日あたりの稼働時間（SPEC 6.1-①）。 */
export const HOURS_PER_WORK_DAY = 8

/**
 * 稼働人日の小数桁（plan.md A5）。
 * t_costs.work_days が NUMERIC(6,2) であることに由来する。
 */
export const WORK_DAYS_SCALE = 2

/**
 * 指定桁で四捨五入する。
 *
 * ★ Math.round(value * 100) / 100 は使えない。乗算の時点で誤差が入り、
 *   1.005 が 100.49999... になって 1.00 に落ちる（期待は 1.01）。
 *
 * ★ toFixed も使えない。二進浮動小数の実際の格納値を見て丸めるため、
 *   0.6h ÷ 8 = 0.075 を 0.07 にしてしまう（四捨五入の期待は 0.08）。
 *   実際の入力範囲（work_hours は NUMERIC(6,1)）の 0.0〜200.0h だけで
 *   169 件が期待と食い違う。
 *
 * 指数表記の文字列を経由すると10進での桁移動になり、上記どちらの罠も踏まない。
 * Number('0.075e2') は 7.5 を正確に得るので、Math.round で 8 → 0.08 になる。
 */
export const roundTo = (value: number, digits: number): number => {
  const shifted = Number(`${value}e${digits}`)
  return Number(`${Math.round(shifted)}e${-digits}`)
}

/**
 * 稼働時間から稼働人日を求める（SPEC 6.1-①、plan.md A5）。
 *
 * 小数第2位で四捨五入するのは t_costs.work_days が NUMERIC(6,2) だから。
 * ここで丸めておかないと、画面の表示値とDBの保存値がズレる。
 */
export const calcWorkDays = (workHours: number): number =>
  roundTo(workHours / HOURS_PER_WORK_DAY, WORK_DAYS_SCALE)

/**
 * 稼働人日と単価から人件費を求める（SPEC 6.1-②）。
 *
 * ★ 引数には「丸めた後の人日」を渡す。稼働時間から一気に計算すると、
 *   画面に出ている人日（丸め済み）と金額の辻褄が合わずユーザーが検算できない。
 *   例: 5h は 0.63人日 × ¥60,000 = ¥37,800。丸めずに 0.625 で掛けると
 *   ¥37,500 となり、画面の「0.63人日」と 300 円ズレる。
 *
 * 円未満は保持できない（t_costs.amount が NUMERIC(12,0)）ので整数に丸める。
 */
export const calcLaborCost = (workDays: number, unitPrice: number): number =>
  roundTo(workDays * unitPrice, 0)

/**
 * 金額を持つ行。
 *
 * ★ t_sales.Row / t_costs.Row に直接依存させず構造的部分型にしているのは、
 *   実績入力画面で「まだ保存していないフォーム上の行」も同じ関数で集計するため。
 */
export type AmountBearing = { amount: number }

/** 金額行の合計（SPEC 6.1-③④）。 */
export const sumAmount = (rows: readonly AmountBearing[]): number =>
  rows.reduce((total, row) => total + row.amount, 0)

/** 営業利益（粗利）。売上合計から費用合計を引く（SPEC 6.1-⑤）。 */
export const calcGrossProfit = (totalSales: number, totalCosts: number): number =>
  totalSales - totalCosts

/**
 * 利益率（粗利率）を % で返す（SPEC 6.1-⑥）。
 *
 * ★ 売上0のときは0を返す。SPEC 6.1-⑥ が「売上ゼロの場合は0%」と明示している。
 *   ゼロ除算のまま Infinity / NaN を出すと画面に「NaN%」が並び、
 *   さらに前年同期比の pt 差分にまで NaN が伝播する。
 *
 * ★ 売上0でも費用が発生していれば粗利は赤字のまま返る。
 *   「粗利 -500,000円／粗利率 0%」という一見ちぐはぐな表示になるが、
 *   これが SPEC 通りの挙動。
 *
 * ★ ここでは丸めない。SPEC に率の丸め桁の定義がなく、DBにも保存しない
 *   （都度算出する）。表示桁は画面側の責務。ここで丸めると前年同期比の
 *   pt 差分の精度まで落ちる。
 */
export const calcProfitRate = (totalSales: number, grossProfit: number): number => {
  if (totalSales === 0) return 0
  return (grossProfit / totalSales) * 100
}

/** 売上・費用から導出される指標一式。KPIカードやマトリクスの1セルに対応する。 */
export type ProfitSummary = {
  totalSales: number
  totalCosts: number
  grossProfit: number
  profitRate: number
}

/**
 * 売上合計・費用合計から指標一式をまとめて求める（SPEC 6.1-③〜⑥）。
 *
 * KPIカード4種やマトリクス表の1列は常にこの4つを揃って必要とするため、
 * 呼び出し側で個別に4回呼ばなくて済むようにまとめてある。
 */
export const summarize = (totalSales: number, totalCosts: number): ProfitSummary => {
  const grossProfit = calcGrossProfit(totalSales, totalCosts)
  return {
    totalSales,
    totalCosts,
    grossProfit,
    profitRate: calcProfitRate(totalSales, grossProfit),
  }
}
