import type { TilariModule } from '../types'
import { TYPE_INCOME_TAX } from '../../vouchers'
import { reconcileClosingTax } from './domain/yearEnd'
import { createPeriodEndHttp } from './http'
import { handlePeriodEndRoutes } from './routes'
import { PeriodEndService } from './service'

export const periodEndModule: TilariModule<PeriodEndService> = {
  id: 'periodEnd',
  createService: (kernel) => new PeriodEndService(kernel),
  handleRoutes: handlePeriodEndRoutes,
  createHttp: createPeriodEndHttp,
  postingHooks: [
    {
      onAfterDelete(db, date, type) {
        if (type === TYPE_INCOME_TAX) reconcileClosingTax(db, date)
      },
    },
  ],
}
