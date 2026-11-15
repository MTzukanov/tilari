import { afterEach, describe, expect, it } from 'vitest'
import type { MonthPoint } from '../api'
import {
  CASH_FLOW_STORAGE_KEY,
  DEFAULT_CASH_FLOW,
  loadCashFlowOptions,
  runningTotals,
  saveCashFlowOptions,
} from './chartOptions'

const month = (key: string, income: number, expense: number, interest = 0): MonthPoint => ({
  key,
  income_snt: income,
  expense_snt: expense,
  net_snt: income - expense,
  interest_snt: interest,
  capex_snt: 0,
  proceeds_snt: 0,
  unrecovered_snt: 0,
})

describe('cash-flow chart options', () => {
  afterEach(() => localStorage.clear())

  it('start with income and costs only', () => {
    expect(loadCashFlowOptions()).toEqual(DEFAULT_CASH_FLOW)
  })

  it('come back as saved', () => {
    saveCashFlowOptions({ ...DEFAULT_CASH_FLOW, income: false, net: true, total: true })
    expect(loadCashFlowOptions()).toEqual({ ...DEFAULT_CASH_FLOW, income: false, net: true, total: true })
  })

  it('keep the default for a missing or broken value', () => {
    localStorage.setItem(CASH_FLOW_STORAGE_KEY, JSON.stringify({ net: true, expense: 'no' }))
    expect(loadCashFlowOptions()).toEqual({ ...DEFAULT_CASH_FLOW, net: true })
    localStorage.setItem(CASH_FLOW_STORAGE_KEY, '{')
    expect(loadCashFlowOptions()).toEqual(DEFAULT_CASH_FLOW)
  })
})

describe('runningTotals', () => {
  it('sums income less costs and interest month by month', () => {
    const months = [month('2025-01', 50000, 20000, 1000), month('2025-02', 0, 30000), month('2025-03', 50000, 0)]
    expect(runningTotals(months)).toEqual([29000, -1000, 49000])
  })
})
