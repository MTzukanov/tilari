import type { TilariModule } from '../types'
import { createCompanyHttp } from './http'
import { handleCompanyRoutes } from './routes'
import { CompanyService } from './service'

/** Company documents and deadlines (Yhtiö). ADR-031. */
export const companyModule: TilariModule<CompanyService> = {
  id: 'company',
  createService: (kernel) => new CompanyService(kernel),
  handleRoutes: handleCompanyRoutes,
  createHttp: createCompanyHttp,
}
