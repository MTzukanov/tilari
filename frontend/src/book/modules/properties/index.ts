import type { TilariModule } from '../types'
import { createPropertiesHttp } from './http'
import { handlePropertiesRoutes } from './routes'
import { PropertiesService } from './service'

/** Rental objects (vuokrakohteet) over Kitsas cost centres. ADR-023. */
export const propertiesModule: TilariModule<PropertiesService> = {
  id: 'properties',
  createService: (kernel) => new PropertiesService(kernel),
  handleRoutes: handlePropertiesRoutes,
  createHttp: createPropertiesHttp,
}
