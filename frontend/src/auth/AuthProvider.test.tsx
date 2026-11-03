// @vitest-environment jsdom

import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './auth-context'
import { AuthApiError, authApi, type AuthUser } from './api'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    authApi: {
      register: vi.fn(),
      login: vi.fn(),
      refresh: vi.fn(),
      me: vi.fn(),
      logout: vi.fn(),
      deleteAccount: vi.fn(),
    },
  }
})

const user: AuthUser = { id: 'user-1', email: 'person@example.org' }

function AuthStateProbe() {
  const auth = useAuth()

  return (
    <div>
      <output data-testid="status">{auth.status}</output>
      <output data-testid="user">{auth.user?.email ?? ''}</output>
      <output data-testid="error">{auth.error ?? ''}</output>
      <output data-testid="notice">{auth.notice ?? ''}</output>
      <button onClick={() => void auth.signIn({
        email: user.email,
        password: 'a-test-password',
      })}>Sign in</button>
      <button onClick={() => void auth.register({
        name: 'Example User',
        email: user.email,
        password: 'a-test-password',
      })}>Register</button>
      <button onClick={() => void auth.signOut()}>Sign out</button>
      <button onClick={() => {
        void auth.deleteAccount().catch(() => undefined)
      }}>Delete account</button>
    </div>
  )
}

function renderProvider(strict = false) {
  const content = (
    <AuthProvider>
      <AuthStateProbe />
    </AuthProvider>
  )
  return render(strict ? <StrictMode>{content}</StrictMode> : content)
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('AuthProvider browser session state', () => {
  it('restores a valid cookie session once under React Strict Mode', async () => {
    vi.mocked(authApi.me).mockResolvedValue(user)

    renderProvider(true)

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
    })
    expect(screen.getByTestId('user').textContent).toBe(user.email)
    expect(authApi.me).toHaveBeenCalledTimes(1)
    expect(authApi.refresh).not.toHaveBeenCalled()
  })

  it('refreshes an expired cookie session and does not expose tokens', async () => {
    vi.mocked(authApi.me).mockRejectedValue(
      new AuthApiError(401, 'UNAUTHORIZED', 'A valid session is required.'),
    )
    vi.mocked(authApi.refresh).mockResolvedValue(user)

    renderProvider(true)

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
    })
    expect(authApi.me).toHaveBeenCalledTimes(1)
    expect(authApi.refresh).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('user').textContent).toBe(user.email)
  })

  it('shows anonymous state when neither access nor refresh cookies are valid', async () => {
    vi.mocked(authApi.me).mockRejectedValue(
      new AuthApiError(401, 'UNAUTHORIZED', 'A valid session is required.'),
    )
    vi.mocked(authApi.refresh).mockRejectedValue(
      new AuthApiError(401, 'INVALID_SESSION', 'The refresh token is invalid.'),
    )

    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('anonymous')
    })
    expect(screen.getByTestId('user').textContent).toBe('')
  })

  it('reports session verification outages instead of treating them as logged out', async () => {
    vi.mocked(authApi.me).mockRejectedValue(
      new AuthApiError(0, 'NETWORK_ERROR', 'Account service is unavailable.'),
    )

    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unavailable')
    })
    expect(screen.getByTestId('error').textContent).toBe(
      'Account service is unavailable.',
    )
    expect(authApi.refresh).not.toHaveBeenCalled()
  })

  it('supports registration followed by login and logout', async () => {
    vi.mocked(authApi.me).mockRejectedValue(
      new AuthApiError(401, 'UNAUTHORIZED', 'A valid session is required.'),
    )
    vi.mocked(authApi.refresh).mockRejectedValue(
      new AuthApiError(401, 'INVALID_SESSION', 'The refresh token is invalid.'),
    )
    vi.mocked(authApi.register).mockResolvedValue(
      'Check your email if confirmation is enabled.',
    )
    vi.mocked(authApi.login).mockResolvedValue(user)
    vi.mocked(authApi.logout).mockResolvedValue()

    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('anonymous')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    await waitFor(() => {
      expect(screen.getByTestId('notice').textContent).toContain('Check your email')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('anonymous')
    })
    expect(authApi.register).toHaveBeenCalledTimes(1)
    expect(authApi.login).toHaveBeenCalledTimes(1)
    expect(authApi.logout).toHaveBeenCalledTimes(1)
  })

  it('clears local identity only after successful account deletion', async () => {
    vi.mocked(authApi.me).mockResolvedValue(user)
    vi.mocked(authApi.deleteAccount).mockResolvedValue()

    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('anonymous')
    })
    expect(screen.getByTestId('notice').textContent).toContain(
      'account deletion request was completed',
    )
  })

  it('preserves local identity when account deletion fails', async () => {
    vi.mocked(authApi.me).mockResolvedValue(user)
    vi.mocked(authApi.deleteAccount).mockRejectedValue(
      new Error('Account deletion could not be completed.'),
    )

    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    await waitFor(() => {
      expect(screen.getByTestId('error').textContent).toBe(
        'Account deletion could not be completed.',
      )
    })
    expect(screen.getByTestId('status').textContent).toBe('authenticated')
    expect(screen.getByTestId('user').textContent).toBe(user.email)
  })
})
