/** 画面表示用の書式変換。 */

/**
 * 金額整形に使う Intl インスタンス。
 *
 * ★ style: 'currency' は使わない。ja-JP + JPY では環境の ICU によって
 *   全角の ￥（U+FFE5）や "JP¥" を返すことがあり、デザインの半角 ¥ と揃わない。
 *   区切りだけ Intl に任せ、通貨記号は自前で前置すれば結果が確定する。
 *
 * ★ 関数の外に置いて使い回す。Task 14 のマトリクスは
 *   4行 × 12ヶ月 × プロジェクト数のセルを描画するので、
 *   セルごとに new すると生成コストがそのまま積み上がる。
 */
const YEN_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })

/**
 * 金額を「¥65,000」形式にする。
 *
 * 単位は円で固定する（plan.md A4 / SPEC 4.1「単位：円固定」）。
 * デザイン画像の千円表記は採用しない。
 *
 * ★ 負値は「-¥1,000」と符号を先頭に置く。Intl に丸投げすると「¥-1,000」に
 *   なる場合があり、赤字が並ぶ一覧（Task 11）でマイナスが記号に埋もれる。
 *
 * ★ 小数は整数に丸める。DB の金額列は NUMERIC(12,0) なので本来小数は来ないが、
 *   Task 9 の未保存フォーム値のように丸め前の値が渡る経路があるため、
 *   表示側でも必ず整数に落として桁ズレを防ぐ。
 */
export const formatYen = (value: number): string => {
  const formatted = YEN_FORMATTER.format(Math.abs(value))
  return value < 0 ? `-¥${formatted}` : `¥${formatted}`
}
