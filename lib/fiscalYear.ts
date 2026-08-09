/** 年度のユーティリティと前年同期比の計算。 */

/**
 * 年度の開始月。6月決算のため 7月〜翌6月を1年度としている。
 *
 * ★ 会計年度の定義はここ1ヶ所だけで決まる。以下の関数は開始月を引数で受け取るが
 *   既定値がこの定数なので、年度の区切りを変えるときはこの値を書き換えればよい。
 *   引数で開始月を渡せるようにしてあるのは、区切りが変わっても計算が正しいことを
 *   テストで確かめられるようにするため。
 */
export const FISCAL_START_MONTH = 7

/**
 * 指定した開始月から12ヶ月分の月の並びを作る。
 *
 * 開始月を引数で受け取るのは、年度の区切りが変わっても並びが正しく作られることを
 * テストで確かめられるようにするため。定数から直接組み立ててしまうと、
 * 現在の設定（7月始まり）以外の並びを検証できない。
 */
export const getFiscalMonths = (startMonth: number): number[] =>
  Array.from({ length: 12 }, (_, offset) => ((startMonth - 1 + offset) % 12) + 1)

/**
 * 年度内の月の並び（開始月から12ヶ月）。
 *
 * 表の列順・グラフの X 軸の並びはこれを正とする。月を数値の昇順で並べると
 * 1,2,3... となり年度の並びにならないため、必ずこれを使う。
 */
export const FISCAL_MONTHS: readonly number[] = getFiscalMonths(FISCAL_START_MONTH)

/**
 * 年度と月から暦年を求める。
 *
 * 年度は開始月で始まるので、開始月より前の月は翌暦年に属する。
 * 7月始まりなら年度2026の1月 = 暦2027年1月。
 */
export const toCalendarYear = (
  fiscalYear: number,
  month: number,
  startMonth: number = FISCAL_START_MONTH,
): number => (month < startMonth ? fiscalYear + 1 : fiscalYear)

/**
 * 暦年月から年度を求める。
 *
 * 開始月より前の月は前年度に属する。7月始まりなら暦2027年6月 = 年度2026。
 */
export const toFiscalYear = (
  calendarYear: number,
  month: number,
  startMonth: number = FISCAL_START_MONTH,
): number => (month < startMonth ? calendarYear - 1 : calendarYear)

/**
 * 基準日が属する年度を返す。
 *
 * ★ 基準日を引数で受け取るのは、テストを実行日に依存させないため。
 *   関数内で new Date() を直接呼ぶと「4月1日に走らせたら落ちる」テストになる。
 *   呼び出し側は引数なしで呼べばよい（既定値が現在時刻）。
 *
 * getMonth() は 0 始まりなので +1 して暦月にしてから年度へ変換する。
 */
export const getCurrentFiscalYear = (
  baseDate: Date = new Date(),
  startMonth: number = FISCAL_START_MONTH,
): number => toFiscalYear(baseDate.getFullYear(), baseDate.getMonth() + 1, startMonth)

/**
 * 年度内での月の序数（開始月が0、年度末月が11）。
 *
 * 月の前後比較やソートはこの序数で行う。暦月のまま比較すると
 * 7月始まりで「1月 < 7月」となり、年度内では1月の方が後ろである事実と食い違う。
 */
export const fiscalMonthIndex = (
  month: number,
  startMonth: number = FISCAL_START_MONTH,
): number => (month - startMonth + 12) % 12

/**
 * 年度内の前月を返す。年度初月には前月がないので null。
 *
 * ★ 年度初月の前月は暦の上では前年度の末月だが、ここでは null を返す。
 *   SPEC 6.2 が「前月データが存在しない場合（年度初月等）」を独立した
 *   判定規則として定めているため、年度をまたいだ比較はしない。
 */
export const previousFiscalMonth = (
  month: number,
  startMonth: number = FISCAL_START_MONTH,
): number | null => {
  const index = fiscalMonthIndex(month, startMonth)
  return index === 0 ? null : getFiscalMonths(startMonth)[index - 1]
}

/**
 * 年度内の月ごとの値。実績のある月だけを持ち、未入力の月はキー自体を持たない。
 *
 * ★ 「値が0の月」と「未入力の月」を区別するためにこの形にしている。
 *   0 で埋めた配列にすると、前年同期比が比較対象の月を選べなくなる。
 */
export type MonthlyValues = ReadonlyMap<number, number>

/** 前年同期比の比較対象となる累計のペア。 */
export type YoYComparison = {
  current: number
  previous: number
  /** 両年度で足し合わせた月。UI で「4〜7月の累計比較」と注記するために返す。 */
  months: readonly number[]
}

/**
 * 前年同期比の比較対象を組み立てる（plan.md A6）。
 *
 * 選択年度で実績がある月だけを対象にし、前年度からも「同じ月」だけを足す。
 * 単純に年度合計どうしを比べると、期の途中（例: 7月時点）に前年度の12ヶ月
 * フル実績と比較してしまい、必ず大幅マイナスに見えてしまう。
 *
 * ★ 月の集合は当年度側で確定させ、前年度でその月が未入力なら0として足す。
 *   両年度に存在する月の積集合を取る案もあるが、それだと前年度に穴があるだけで
 *   当年度の実績が比較から消え、数字が小さく出てしまう。
 *
 * ★ 前年度に対象月のデータが1件もなければ null を返す。
 *   SPEC 4.1 の「過去データが存在しない場合は『-』を表示」に対応する。
 */
export const buildYoYComparison = (
  currentValues: MonthlyValues,
  previousValues: MonthlyValues,
  startMonth: number = FISCAL_START_MONTH,
): YoYComparison | null => {
  // 年度の並び（開始月から）で拾う。Map の挿入順に依存させない。
  const months = getFiscalMonths(startMonth).filter((month) => currentValues.has(month))
  if (months.length === 0) return null

  if (!months.some((month) => previousValues.has(month))) return null

  const sum = (values: MonthlyValues) =>
    months.reduce((total, month) => total + (values.get(month) ?? 0), 0)

  return { current: sum(currentValues), previous: sum(previousValues), months }
}

/**
 * 前年同期比の増減率（%）。売上・費用・営業利益のKPIカードで使う（SPEC 4.1）。
 *
 * ★ 前年が0以下なら null を返す。0 で割ると Infinity になり画面に
 *   「Infinity%」が出る。前年が負（赤字）の場合も増減率の符号が直感と逆に
 *   なるため、率としては定義できないものとして「-」に倒す。
 */
export const calcYoYRate = (comparison: YoYComparison | null): number | null => {
  if (!comparison) return null
  if (comparison.previous <= 0) return null
  return ((comparison.current - comparison.previous) / comparison.previous) * 100
}

/**
 * 前年同期比のポイント差（pt）。利益率カードで使う（SPEC 4.1）。
 *
 * 率どうしの比較は「%の増減率」ではなく「何ポイント動いたか」で表す。
 * SPEC 4.1 が利益率だけ pt と定めているのはこのため。単純な引き算になる。
 */
export const calcYoYPointDiff = (
  currentRate: number,
  previousRate: number | null,
): number | null => (previousRate === null ? null : currentRate - previousRate)
