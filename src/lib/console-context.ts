import { useOutletContext } from 'react-router-dom'
import type { Session } from './auth'
import type { MeResponse } from './api'

export interface ConsoleContext {
  session: Session
  me: MeResponse
  signOut: () => void
}

export function useConsole(): ConsoleContext {
  return useOutletContext<ConsoleContext>()
}
