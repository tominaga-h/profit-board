import { describe, expect, it } from 'vitest'
import {
  PROJECT_STATUS_META,
  ProjectStatus,
  calcMonthOverMonthDiff,
  judgeStatus,
} from '~/lib/statusJudge'

describe('judgeStatus', () => {
  describe('SPEC 6.2 の判定表', () => {
    it('黒字 × 前月比プラス → 成長', () => {
      expect(judgeStatus(100, 50)).toBe(ProjectStatus.GROWTH)
    })

    it('黒字 × 前月比マイナス → 順調', () => {
      expect(judgeStatus(100, 150)).toBe(ProjectStatus.STABLE)
    })

    it('赤字 × 前月比プラス → 注意', () => {
      expect(judgeStatus(-100, -150)).toBe(ProjectStatus.CAUTION)
    })

    it('赤字 × 前月比マイナス → 警告', () => {
      expect(judgeStatus(-100, -50)).toBe(ProjectStatus.WARNING)
    })
  })

  describe('境界値: 前月比が0', () => {
    it('黒字 × 前月比0 → 順調（「一致またはマイナス」側）', () => {
      // ★ 差分の判定を >= 0 と書くと「成長」になってしまう。
      expect(judgeStatus(100, 100)).toBe(ProjectStatus.STABLE)
    })

    it('赤字 × 前月比0 → 警告（「一致またはマイナス」側）', () => {
      expect(judgeStatus(-100, -100)).toBe(ProjectStatus.WARNING)
    })
  })

  describe('境界値: 当月利益が0', () => {
    it('利益0は黒字扱い（前月比プラスなら成長）', () => {
      // ★ 黒字の判定を > 0 と書くと赤字側に落ちて「注意」になってしまう。
      expect(judgeStatus(0, -50)).toBe(ProjectStatus.GROWTH)
    })

    it('利益0 × 前月比マイナス → 順調', () => {
      expect(judgeStatus(0, 50)).toBe(ProjectStatus.STABLE)
    })

    it('利益0 × 前月比0 → 順調（二重の境界値）', () => {
      expect(judgeStatus(0, 0)).toBe(ProjectStatus.STABLE)
    })

    it('-1は赤字側', () => {
      expect(judgeStatus(-1, -2)).toBe(ProjectStatus.CAUTION)
      expect(judgeStatus(-1, 0)).toBe(ProjectStatus.WARNING)
    })
  })

  describe('前月データが存在しない場合（年度初月等）', () => {
    it('黒字 → 順調', () => {
      expect(judgeStatus(100, null)).toBe(ProjectStatus.STABLE)
    })

    it('赤字 → 警告', () => {
      expect(judgeStatus(-100, null)).toBe(ProjectStatus.WARNING)
    })

    it('利益0 → 順調（黒字扱い・二重の境界値）', () => {
      expect(judgeStatus(0, null)).toBe(ProjectStatus.STABLE)
    })
  })
})

describe('calcMonthOverMonthDiff', () => {
  it('利益の差分を返す', () => {
    expect(calcMonthOverMonthDiff(100, 50)).toBe(50)
    expect(calcMonthOverMonthDiff(100, 150)).toBe(-50)
  })

  it('前月と同額なら0（null ではない）', () => {
    // ★ 「増減なし」と「前月データなし」を区別する。
    expect(calcMonthOverMonthDiff(100, 100)).toBe(0)
  })

  it('前月データがなければ null', () => {
    expect(calcMonthOverMonthDiff(100, null)).toBeNull()
  })
})

describe('PROJECT_STATUS_META', () => {
  it('SPEC 6.2 のラベルと配色を持つ', () => {
    expect(PROJECT_STATUS_META[ProjectStatus.GROWTH]).toEqual({
      label: '成長',
      color: '#22C55E',
    })
    expect(PROJECT_STATUS_META[ProjectStatus.STABLE]).toEqual({
      label: '順調',
      color: '#22C55E',
    })
    expect(PROJECT_STATUS_META[ProjectStatus.CAUTION]).toEqual({
      label: '注意',
      color: '#EAB308',
    })
    expect(PROJECT_STATUS_META[ProjectStatus.WARNING]).toEqual({
      label: '警告',
      color: '#EF4444',
    })
  })

  it('全ステータスの表示情報が揃っている', () => {
    // ステータスを増やしたときのメタ追記漏れを検知する。
    expect(Object.keys(PROJECT_STATUS_META).sort()).toEqual(
      Object.values(ProjectStatus).sort(),
    )
  })
})
