// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { AuthDialog } from './AuthDialog'
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

function renderDialog(onClose = vi.fn()) {
  render(
    <AuthProvider>
      <AuthDialog onClose={onClose} />
    </AuthProvider>,
  )
  return onClose
}

function mockAnonymousSession() {
  vi.mocked(authApi.me).mockRejectedValue(
    new AuthApiError(401, 'UNAUTHORIZED', 'A valid session is required.'),
  )
  vi.mocked(authApi.refresh).mockRejectedValue(
    new AuthApiError(401, 'INVALID_SESSION', 'The refresh token is invalid.'),
  )
}

async function waitForAnonymousSession() {
  await waitFor(() => {
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in securely' })).toBeTruthy()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('AuthDialog', () => {
  it('switches to registration, validates the form, and displays confirmation', async () => {
    mockAnonymousSession()
    vi.mocked(authApi.register).mockResolvedValue(
      'Check your email if confirmation is enabled.',
    )
    const onClose = renderDialog()
    await waitForAnonymousSession()

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByLabelText('Name')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toHaveProperty('minLength', 12)

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Example User' },
    })
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: user.email },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'a-test-password' },
    })
    const registrationForm = screen.getByLabelText('Name').closest('form')
    if (!registrationForm) throw new Error('Registration form was not found.')
    fireEvent.submit(registrationForm)

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Check your email')
    })
    expect(authApi.register).toHaveBeenCalledWith({
      name: 'Example User',
      email: user.email,
      password: 'a-test-password',
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('signs in and closes without exposing a token in the interface', async () => {
    mockAnonymousSession()
    vi.mocked(authApi.login).mockResolvedValue(user)
    const onClose = renderDialog()
    await waitForAnonymousSession()

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: user.email },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'a-test-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in securely' }))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce()
    })
    expect(authApi.login).toHaveBeenCalledWith({
      email: user.email,
      password: 'a-test-password',
    })
    expect(document.body.textContent).not.toContain('accessToken')
  })

  it('shows only safe API errors on failed sign-in', async () => {
    mockAnonymousSession()
    vi.mocked(authApi.login).mockRejectedValue(
      new AuthApiError(401, 'INVALID_CREDENTIALS', 'Email or password is invalid.'),
    )
    renderDialog()
    await waitForAnonymousSession()

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: user.email },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'a-test-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in securely' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Email or password is invalid.',
    )
  })

  it('requires explicit DELETE confirmation before deleting an account', async () => {
    vi.mocked(authApi.me).mockResolvedValue(user)
    vi.mocked(authApi.deleteAccount).mockResolvedValue()
    const onClose = renderDialog()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete account' })).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    const confirmButton = screen.getByRole('button', { name: 'Confirm deletion' })
    expect(confirmButton).toHaveProperty('disabled', true)
    expect(authApi.deleteAccount).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Confirmation'), {
      target: { value: 'DELETE' },
    })
    expect(confirmButton).toHaveProperty('disabled', false)
    fireEvent.click(confirmButton)

    expect(await screen.findByRole('heading', {
      name: 'Your account was deleted.',
    })).toBeTruthy()
    expect(authApi.deleteAccount).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('signs out and closes the account dialog', async () => {
    vi.mocked(authApi.me).mockResolvedValue(user)
    vi.mocked(authApi.logout).mockResolvedValue()
    const onClose = renderDialog()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce()
    })
    expect(authApi.logout).toHaveBeenCalledOnce()
  })
})
