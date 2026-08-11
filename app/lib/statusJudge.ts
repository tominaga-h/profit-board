/** プロジェクトの月次ステータス判定。 */

/**
 * プロジェクトの月次ステータス。
 *
 * デザイン画像にある「遅延」「完了」は採用しない（仕様を正とする）。
 * キーを英語にしているのは、一覧画面のフィルタを URL クエリ
 * （/projects?status=growth）に載せるため。
 */
export const ProjectStatus = {
  /** 黒字かつ前月より改善 */
  GROWTH: 'growth',
  /** 黒字だが横ばい〜悪化 */
  STABLE: 'stable',
  /** 赤字だが前月より改善 */
  CAUTION: 'caution',
  /** 赤字かつ横ばい〜悪化 */
  WARNING: 'warning',
} as const
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus]

/**
 * ステータスの表示情報。配色は仕様の指定値そのまま。
 *
 * ★ Tailwind のクラス名（green-500 等）ではなく hex を持つ。
 *   Tailwind のパレットはバージョンによって色値が変わるため、
 *   仕様が hex で指定している以上こちらを確定値とする。
 *
 * satisfies を付けているのは、ProjectStatus に値を足したのに
 * ここへの追記を忘れた場合にコンパイルエラーで気付けるようにするため。
 */
export const PROJECT_STATUS_META = {
  [ProjectStatus.GROWTH]: { label: '成長', color: '#22C55E' },
  [ProjectStatus.STABLE]: { label: '順調', color: '#22C55E' },
  [ProjectStatus.CAUTION]: { label: '注意', color: '#EAB308' },
  [ProjectStatus.WARNING]: { label: '警告', color: '#EF4444' },
} as const satisfies Record<ProjectStatus, { label: string; color: string }>

/**
 * 月次ステータスを判定する。
 *
 * 当月利益の黒字/赤字（0以上が黒字）と、前月からの利益の増減で4通りに分かれる。
 * 比較対象（前月か前年度か等）は呼び出し側が決める。この関数は差分の符号しか見ない。
 *
 * ★ previousProfit は number | null で、null が「前月データなし」を表す。
 *   0 で代用してはいけない。今の判定表では「前月なし」と「前月比0」が
 *   たまたま同じ結果になるが、それは偶然であって仕様が変われば静かに壊れる。
 *   区別は型で持つ。
 */
export const judgeStatus = (
  currentProfit: number,
  previousProfit: number | null,
): ProjectStatus => {
  // 仕様上の黒字は0以上。0 を赤字側に入れないよう >= で判定する。
  const isProfitable = currentProfit >= 0

  // 前月データが存在しない場合（年度初月等）の規則。
  if (previousProfit === null) {
    return isProfitable ? ProjectStatus.STABLE : ProjectStatus.WARNING
  }

  // 仕様上の「前月比」は率ではなく利益の差分。
  // 「プラス」は > 0 なので、差分0は「一致またはマイナス」側に入る。
  const isImproving = currentProfit - previousProfit > 0

  if (isProfitable) {
    return isImproving ? ProjectStatus.GROWTH : ProjectStatus.STABLE
  }
  return isImproving ? ProjectStatus.CAUTION : ProjectStatus.WARNING
}

/**
 * 前月比（利益の差分）。前月データがなければ null（画面では「-」表示）。
 *
 * ★ 仕様上の「前月比」は率ではなく差分なので、金額の差をそのまま返す。
 *   一覧画面の「前月比」列もこの値を使う。
 */
export const calcMonthOverMonthDiff = (
  currentProfit: number,
  previousProfit: number | null,
): number | null => (previousProfit === null ? null : currentProfit - previousProfit)
