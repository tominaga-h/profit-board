import { describe, expect, it } from 'vitest'
import { formatYen } from '~/lib/format'

describe('formatYen', () => {
  it('3桁区切りのカンマと ¥ を付ける', () => {
    expect(formatYen(65000)).toBe('¥65,000')
  })

  it('4桁未満はカンマを付けない', () => {
    expect(formatYen(800)).toBe('¥800')
  })

  it('億単位でもカンマが正しく入る', () => {
    expect(formatYen(123456789)).toBe('¥123,456,789')
  })

  it('0 は ¥0', () => {
    // 空文字や「-」に倒さない。未入力を「-」で表す判断（SPEC 4.1）は画面側の責務で、
    // ここで混ぜると「0円の実績」と「未入力」が区別できなくなる。
    expect(formatYen(0)).toBe('¥0')
  })

  it('負値は符号が記号の前に来る', () => {
    // ★ Intl に丸投げすると「¥-1,000」になる環境がある。
    //   赤字が並ぶ一覧（Task 11）でマイナスが記号に埋もれて読み落とされる。
    expect(formatYen(-1000)).toBe('-¥1,000')
  })

  it('通貨記号は半角の ¥（U+00A5）を使う', () => {
    // ★ style: 'currency' で実装すると全角 ￥（U+FFE5）になる環境がある。
    //   実装を差し替えたら落ちる回帰テスト。
    expect(formatYen(1000).charCodeAt(0)).toBe(0x00a5)
  })

  it('小数は四捨五入して整数にする', () => {
    // DB は NUMERIC(12,0) なので本来小数は来ないが、Task 9 の未保存フォーム値が
    // 丸め前のまま渡る経路がある。表示側でも必ず整数に落とす。
    expect(formatYen(1000.4)).toBe('¥1,000')
    expect(formatYen(1000.5)).toBe('¥1,001')
  })
})
