import { describe, expect, it } from 'vitest'
import { fiscalYearInsertSchema } from '~/lib/schemas/fiscalYear'

describe('fiscalYearInsertSchema', () => {
  it('正しい年度は通る', () => {
    expect(fiscalYearInsertSchema.safeParse({ year: 2026 }).success).toBe(true)
  })

  it('1900と2999は境界値として通る', () => {
    expect(fiscalYearInsertSchema.safeParse({ year: 1900 }).success).toBe(true)
    expect(fiscalYearInsertSchema.safeParse({ year: 2999 }).success).toBe(true)
  })

  it('1899と3000は拒否する', () => {
    expect(fiscalYearInsertSchema.safeParse({ year: 1899 }).success).toBe(false)
    expect(fiscalYearInsertSchema.safeParse({ year: 3000 }).success).toBe(false)
  })

  it('負数と小数は拒否する', () => {
    expect(fiscalYearInsertSchema.safeParse({ year: -1 }).success).toBe(false)
    expect(fiscalYearInsertSchema.safeParse({ year: 2026.5 }).success).toBe(false)
  })
})
