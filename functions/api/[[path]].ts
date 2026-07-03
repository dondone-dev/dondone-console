import { handleConsoleApi } from '../lib/api'
import type { ConsoleEnv } from '../lib/types'

export const onRequest: PagesFunction<ConsoleEnv> = async ({ request, env }) =>
  handleConsoleApi(request, env)
