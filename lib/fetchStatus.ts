/** 非同期取得の進行状態。一覧系の画面（Task 5/6/7/11/12）で共通に使う。 */

/**
 * データ取得の進行フェーズ。
 *
 * ★ pending: boolean と error: Error | null の2変数では表さない。
 *   「まだ取得していない」と「取得したが0件」がどちらも
 *   pending=false・error=null・rows=[] になって区別できず、
 *   初回描画で一瞬「0件です」が出てしまう。
 *
 * ★ 「0件」はここに入れない。0件は失敗ではなく SUCCESS の一形態で、
 *   件数は rows.length で判る。ステータスに混ぜると Task 6 の
 *   「0件だが保存はできる」状態が表現できなくなる。
 */
export const FetchStatus = {
  /** まだ取得していない（初期状態） */
  IDLE: 'idle',
  /** 取得中 */
  LOADING: 'loading',
  /** 取得成功（0件を含む） */
  SUCCESS: 'success',
  /** 取得失敗 */
  ERROR: 'error',
} as const
export type FetchStatus = (typeof FetchStatus)[keyof typeof FetchStatus]
