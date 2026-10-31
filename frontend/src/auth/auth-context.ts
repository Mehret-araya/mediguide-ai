import { createContext, useContext } from 'react'
import type { AuthUser } from './api'

export type AuthStatus =
  | 'loading'
  | 'anonymous'
  | 'authenticated'
  | 'unavailable'

export interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  pending: boolean
  error: string | null
  notice: string | null
  clearFeedback: () => void
  register: (input: {
    name: string
    email: string
    password: string
  }) => Promise<void>
  signIn: (input: { email: string; password: string }) => Promise<void>
  signOut: () => Promise<void>
  deleteAccount: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.')
  }

  return context
}
