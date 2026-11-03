import type { TilariModule } from '../types'
import { createTaxReturnHttp } from './http'
import { handleTaxReturnRoutes } from './routes'
import { TaxReturnService } from './service'

/** Annual tax return data (6B): numbers for OmaVero and an Ilmoitin file. ADR-032. */
export const taxReturnModule: TilariModule<TaxReturnService> = {
  id: 'taxReturn',
  createService: (kernel) => new TaxReturnService(kernel),
  handleRoutes: handleTaxReturnRoutes,
  createHttp: createTaxReturnHttp,
}
