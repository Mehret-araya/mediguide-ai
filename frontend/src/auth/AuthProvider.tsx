import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AuthApiError, authApi, type AuthUser } from './api'
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
} from './auth-context'

function isUnauthorized(error: unknown): boolean {
  return error instanceof AuthApiError && error.statusCode === 401
}

function restoreSession(): Promise<AuthUser | null> {
  return (async () => {
    try {
      return await authApi.me()
    } catch (error) {
      if (!isUnauthorized(error)) {
        throw error
      }
    }

    try {
      return await authApi.refresh()
    } catch (error) {
      if (isUnauthorized(error)) {
        return null
      }
      throw error
    }
  })()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const restorePromise = useRef<Promise<AuthUser | null> | null>(null)

  useEffect(() => {
    let active = true
    restorePromise.current ??= restoreSession()

    void restorePromise.current
      .then((restoredUser) => {
        if (!active) return
        setUser(restoredUser)
        setStatus(restoredUser ? 'authenticated' : 'anonymous')
      })
      .catch((restoreError: unknown) => {
        if (!active) return
        setUser(null)
        setStatus('unavailable')
        setError(
          restoreError instanceof Error
            ? restoreError.message
            : 'Cannot verify your account session right now.',
        )
      })

    return () => {
      active = false
    }
  }, [])

  const clearFeedback = useCallback(() => {
    setError(null)
    setNotice(null)
  }, [])

  const register = useCallback(
    async (input: { name: string; email: string; password: string }) => {
      setPending(true)
      setError(null)
      setNotice(null)

      try {
        setNotice(await authApi.register(input))
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Registration could not be completed.',
        )
        throw requestError
      } finally {
        setPending(false)
      }
    },
    [],
  )

  const signIn = useCallback(
    async (input: { email: string; password: string }) => {
      setPending(true)
      setError(null)
      setNotice(null)

      try {
        const signedInUser = await authApi.login(input)
        setUser(signedInUser)
        setStatus('authenticated')
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Sign-in could not be completed.',
        )
        throw requestError
      } finally {
        setPending(false)
      }
    },
    [],
  )

  const signOut = useCallback(async () => {
    setPending(true)
    setError(null)

    try {
      await authApi.logout()
      setUser(null)
      setStatus('anonymous')
      setNotice(null)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Sign-out could not be completed.',
      )
      throw requestError
    } finally {
      setPending(false)
    }
  }, [])

  const deleteAccount = useCallback(async () => {
    setPending(true)
    setError(null)

    try {
      await authApi.deleteAccount()
      setUser(null)
      setStatus('anonymous')
      setNotice('Your account deletion request was completed.')
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Account deletion could not be completed.',
      )
      throw requestError
    } finally {
      setPending(false)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      pending,
      error,
      notice,
      clearFeedback,
      register,
      signIn,
      signOut,
      deleteAccount,
    }),
    [
      status,
      user,
      pending,
      error,
      notice,
      clearFeedback,
      register,
      signIn,
      signOut,
      deleteAccount,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
