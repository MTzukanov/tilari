import type { TilariModule } from '../types'
import { expandVatPostedLines } from './domain/vatCashBasis'
import { createVatHttp } from './http'
import { handleVatRoutes } from './routes'
import { VatService } from './service'

export const vatModule: TilariModule<VatService> = {
  id: 'vat',
  createService: (kernel) => new VatService(kernel),
  postingHooks: [{ expandPostedLines: expandVatPostedLines }],
  handleRoutes: handleVatRoutes,
  createHttp: createVatHttp,
}
