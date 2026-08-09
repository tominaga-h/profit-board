import { describe, expect, it } from 'vitest'
import { FetchStatus } from '~/lib/fetchStatus'

/**
 * 定数だけのモジュールだが、as const オブジェクトリテラルは実行される文なので
 * import しないとカバレッジに穴が空く。値そのものを検証する意味は薄いため、
 * 「4状態が揃っていること」だけを確かめる。
 */
describe('FetchStatus', () => {
  it('取得中・成功・失敗と未着手の4状態を持つ', () => {
    // ★ 状態を1つ消すと落ちる。0件を独立ステータスとして足した場合もここで気付ける
    //   （0件は SUCCESS の一形態として rows.length で表す方針）。
    expect(Object.values(FetchStatus)).toEqual(['idle', 'loading', 'success', 'error'])
  })
})
