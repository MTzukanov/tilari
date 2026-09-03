export const COMPANY = 'Testikirja Oy'
export const BUSINESS_ID = '1234567-8'
export const KP_VERSION = '24'

export const PERIODS = [
  { starts: '2024-01-01', ends: '2024-12-31' },
  { starts: '2025-01-01', ends: '2025-12-31' },
]

export const ACCOUNT_BANK = 1910
export const ACCOUNT_RETAINED_EARNINGS = 2251
export const ACCOUNT_PROFIT = 2371
export const ACCOUNT_SALES = 3000
export const ACCOUNT_RENT = 4000
export const ACCOUNT_SERVICES = 5000

export const BANK_2024 = 100000 + 20000 - 5000 - 3000 - 1000 - 500
export const BANK_2025 = BANK_2024 + 40000 - 10000 + 8000

export const PNL_2024_SALES = 20000
export const PNL_2024_RENT = -6500
export const PNL_2024_SERVICES = -3000
export const PNL_2024 = PNL_2024_SALES + PNL_2024_RENT + PNL_2024_SERVICES

export const PNL_2025_SALES = 48000
export const PNL_2025_RENT = -10000
export const PNL_2025 = PNL_2025_SALES + PNL_2025_RENT

export const BALANCES_2024: Record<string, number> = {
  [String(ACCOUNT_BANK)]: BANK_2024,
  [String(ACCOUNT_RETAINED_EARNINGS)]: 100000,
  [String(ACCOUNT_PROFIT)]: PNL_2024,
  [String(ACCOUNT_SALES)]: PNL_2024_SALES,
  [String(ACCOUNT_RENT)]: PNL_2024_RENT,
  [String(ACCOUNT_SERVICES)]: PNL_2024_SERVICES,
}

export const BALANCES_2025: Record<string, number> = {
  [String(ACCOUNT_BANK)]: BANK_2025,
  [String(ACCOUNT_RETAINED_EARNINGS)]: 100000 + PNL_2024,
  [String(ACCOUNT_PROFIT)]: PNL_2025,
  [String(ACCOUNT_SALES)]: PNL_2025_SALES,
  [String(ACCOUNT_RENT)]: PNL_2025_RENT,
}

export const LEDGER_1910_2024_03_OPENING = 100000
export const LEDGER_1910_2024_03_COUNT = 2
export const LEDGER_1910_2024_03_CLOSING_RUNNING = 115000
export const LEDGER_3000_2024_04_OPENING = 20000

export const KP1_2024_WITH_PROJECTS = {
  income_cents: 20000,
  expense_cents: 8000,
  profit_cents: 12000,
  kitsas_profit_cents: 12000,
}

export const KP1_2024_WITHOUT_PROJECTS = {
  income_cents: 20000,
  expense_cents: 5000,
  profit_cents: 15000,
  kitsas_profit_cents: 15000,
}
