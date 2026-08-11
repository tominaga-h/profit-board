/** 画面表示用の書式変換。 */

/**
 * 金額整形に使う Intl インスタンス。
 *
 * ★ style: 'currency' は使わない。ja-JP + JPY では環境の ICU によって
 *   全角の ￥（U+FFE5）や "JP¥" を返すことがあり、デザインの半角 ¥ と揃わない。
 *   区切りだけ Intl に任せ、通貨記号は自前で前置すれば結果が確定する。
 *
 * ★ 関数の外に置いて使い回す。ダッシュボードのマトリクスは
 *   4行 × 12ヶ月 × プロジェクト数のセルを描画するので、
 *   セルごとに new すると生成コストがそのまま積み上がる。
 */
const YEN_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })

/**
 * 金額を「¥65,000」形式にする。
 *
 * 単位は円で固定する（仕様で「単位：円固定」と定められている）。
 * デザイン画像の千円表記は採用しない。
 *
 * ★ 負値は「-¥1,000」と符号を先頭に置く。Intl に丸投げすると「¥-1,000」に
 *   なる場合があり、赤字が並ぶ一覧でマイナスが記号に埋もれる。
 *
 * ★ 小数は整数に丸める。DB の金額列は NUMERIC(12,0) なので本来小数は来ないが、
 *   実績入力画面の未保存フォーム値のように丸め前の値が渡る経路があるため、
 *   表示側でも必ず整数に落として桁ズレを防ぐ。
 */
export const formatYen = (value: number): string => {
  const formatted = YEN_FORMATTER.format(Math.abs(value))
  return value < 0 ? `-¥${formatted}` : `¥${formatted}`
}

/**
 * 値がないことを表す記号。
 *
 * 前年度の実績がない場合の表示と、マトリクスの未入力月で同じものを使う。
 * どちらも「0ではなくデータがない」を意味するので、字面を1ヶ所で決める。
 */
export const NO_VALUE = '-'

/** 率を「23.5%」形式にする。null は値なしの記号に倒す。 */
export const formatPercent = (value: number | null): string =>
  value === null ? NO_VALUE : `${value.toFixed(1)}%`

/**
 * 前年同期比の増減率を「+8.2%」形式にする。
 *
 * ★ 符号を必ず付ける。増減を表す値なので、正のときに符号がないと
 *   その場の実数値なのか前年差なのかが読み手に判別できない。
 */
export const formatSignedPercent = (value: number | null): string =>
  value === null ? NO_VALUE : `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(1)}%`

/**
 * 率の増減を「+1.8pt」形式にする。
 *
 * 利益率どうしの比較は増減率（%）ではなくポイント差で表す。
 */
export const formatPointDiff = (value: number | null): string =>
  value === null ? NO_VALUE : `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(1)}pt`
