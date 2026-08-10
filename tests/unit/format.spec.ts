import { describe, expect, it } from 'vitest'
import { formatPercent, formatPointDiff, formatSignedPercent, formatYen } from '~/lib/format'

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

describe('formatPercent', () => {
  it('小数第1位まで出して % を付ける', () => {
    expect(formatPercent(23.456)).toBe('23.5%')
  })

  it('0% は「-」に倒さない', () => {
    // 売上0の月は利益率0%が正しい値（SPEC 6.1-⑥）。データなしと混同させない。
    expect(formatPercent(0)).toBe('0.0%')
  })

  it('負の率はそのまま符号を付けて出す', () => {
    expect(formatPercent(-12.3)).toBe('-12.3%')
  })

  it('null はデータなしの記号にする', () => {
    expect(formatPercent(null)).toBe('-')
  })
})

describe('formatSignedPercent', () => {
  it('増加には + を付ける', () => {
    expect(formatSignedPercent(8.24)).toBe('+8.2%')
  })

  it('減少には - を付ける', () => {
    expect(formatSignedPercent(-5.06)).toBe('-5.1%')
  })

  it('増減0でも + を付ける', () => {
    // 符号を省くと、前年差なのかその場の実数値なのかが読み手に判別できない。
    expect(formatSignedPercent(0)).toBe('+0.0%')
  })

  it('null はデータなしの記号にする', () => {
    // 前年度の実績がない場合の表示（SPEC 4.1）。
    expect(formatSignedPercent(null)).toBe('-')
  })
})

describe('formatPointDiff', () => {
  it('増加には + を付けて pt を添える', () => {
    expect(formatPointDiff(1.83)).toBe('+1.8pt')
  })

  it('減少には - を付ける', () => {
    expect(formatPointDiff(-2.26)).toBe('-2.3pt')
  })

  it('null はデータなしの記号にする', () => {
    expect(formatPointDiff(null)).toBe('-')
  })

  it('単位は % ではなく pt', () => {
    // 率どうしの比較は増減率ではなくポイント差で表す（SPEC 4.1）。
    // % で実装すると意味が変わる回帰テスト。
    expect(formatPointDiff(1.8)).not.toContain('%')
  })
})
