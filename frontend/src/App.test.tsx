// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { AuthApiError, authApi, type AuthUser } from './auth/api'

vi.mock('./auth/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auth/api')>()
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

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('site authentication navigation', () => {
  it('opens sign-in from navigation and shows the signed-in account state', async () => {
    vi.mocked(authApi.me).mockRejectedValue(
      new AuthApiError(401, 'UNAUTHORIZED', 'A valid session is required.'),
    )
    vi.mocked(authApi.refresh).mockRejectedValue(
      new AuthApiError(401, 'INVALID_SESSION', 'The refresh token is invalid.'),
    )
    vi.mocked(authApi.login).mockResolvedValue(user)

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    )

    const signInButton = await screen.findByRole('button', { name: 'Sign in' })
    fireEvent.click(signInButton)
    expect(await screen.findByRole('dialog')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: user.email },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'a-test-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in securely' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.getByRole('button', { name: user.email })).toBeTruthy()
    })
    expect(authApi.login).toHaveBeenCalledWith({
      email: user.email,
      password: 'a-test-password',
    })
  })
})
