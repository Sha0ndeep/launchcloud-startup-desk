import { config } from '../config'
import type { ApiClient } from './client'
import { HttpApiClient } from './client'
import { MockApiClient } from './mock'

/**
 * The single client instance used by the UI. The fixture client is only selected when the
 * separately enabled development flag is set; the app then shows a persistent banner.
 */
export const api: ApiClient = config.useMockApi ? new MockApiClient() : new HttpApiClient(config.apiBaseUrl)

export type { ApiClient, ApplicantAuth, Auth, OperatorAuth } from './client'
