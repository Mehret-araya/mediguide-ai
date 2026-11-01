// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { AuthApiError, authApi, type AuthUser } from './auth/api'
import { conversationsApi } from './conversations/api'

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

vi.mock('./conversations/api', () => ({
  conversationsApi: {
    list: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    sendMessage: vi.fn(),
    delete: vi.fn(),
  },
}))

const user: AuthUser = { id: 'user-1', email: 'person@example.org' }
const otherUser: AuthUser = { id: 'user-2', email: 'other@example.org' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(conversationsApi.list).mockResolvedValue([])
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

  it('sends an authenticated question and renders saved citations and limitations', async () => {
    vi.mocked(authApi.me).mockRejectedValue(
      new AuthApiError(401, 'UNAUTHORIZED', 'A valid session is required.'),
    )
    vi.mocked(authApi.refresh).mockRejectedValue(
      new AuthApiError(401, 'INVALID_SESSION', 'The refresh token is invalid.'),
    )
    vi.mocked(authApi.login).mockResolvedValue(user)
    vi.mocked(conversationsApi.create).mockResolvedValue({
      id: 'conversation-1',
      created_at: '2026-10-31T12:00:00.000Z',
      updated_at: '2026-10-31T12:00:00.000Z',
    })
    vi.mocked(conversationsApi.sendMessage).mockResolvedValue({
      conversationId: 'conversation-1',
      answer: 'Evidence-grounded information.',
      citations: [{
        sourceId: 'source-1',
        title: 'Reviewed source',
        publisher: 'Public health authority',
        url: 'https://example.org/source',
      }],
      limitations: ['General information only.'],
      requestId: 'request-1',
      messages: [
        {
          id: 'message-1',
          role: 'user',
          content: 'What is general health information?',
          citations: [],
          limitations: [],
          created_at: '2026-10-31T12:00:01.000Z',
        },
        {
          id: 'message-2',
          role: 'assistant',
          content: 'Evidence-grounded information.',
          citations: [{
          sourceId: 'source-1',
          title: 'Reviewed source',
          publisher: 'Public health authority',
          url: 'https://example.org/source',
          }],
          limitations: ['General information only.'],
          created_at: '2026-10-31T12:00:02.000Z',
        },
      ],
    })
    vi.mocked(conversationsApi.delete).mockResolvedValue()

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }))
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: user.email },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'a-test-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in securely' }))

    const question = await screen.findByLabelText(
      'What would you like to learn about?',
    )
    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: 'Ask MediGuide' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false)
    })
    fireEvent.change(question, {
      target: { value: 'What is general health information?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask MediGuide' }))

    expect(await screen.findByText('Evidence-grounded information.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Reviewed source' })).toBeTruthy()
    expect(screen.getByText('Limitations: General information only.')).toBeTruthy()
    expect(conversationsApi.sendMessage).toHaveBeenCalledWith(
      'conversation-1',
      'What is general health information?',
      expect.any(String),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete conversation 1' }),
    )
    await waitFor(() => {
      expect(conversationsApi.delete).toHaveBeenCalledWith('conversation-1')
      expect(screen.getByText('No saved conversations')).toBeTruthy()
    })
  })

  it('does not render a pending response after the authenticated user changes', async () => {
    vi.mocked(authApi.me).mockResolvedValue(user)
    vi.mocked(conversationsApi.create).mockResolvedValue({
      id: 'conversation-user-a',
      created_at: '2026-10-31T12:00:00.000Z',
      updated_at: '2026-10-31T12:00:00.000Z',
    })
    vi.mocked(authApi.logout).mockResolvedValue()
    let resolveSend:
      | ((value: Awaited<ReturnType<typeof conversationsApi.sendMessage>>) => void)
      | undefined
    const pendingResponse = new Promise<
      Awaited<ReturnType<typeof conversationsApi.sendMessage>>
    >((resolve) => {
      resolveSend = resolve
    })
    vi.mocked(conversationsApi.sendMessage).mockReturnValueOnce(pendingResponse)

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    )

    await screen.findByRole('button', { name: user.email })
    const question = screen.getByLabelText('What would you like to learn about?')
    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: 'Ask MediGuide' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false)
    })
    fireEvent.change(question, { target: { value: 'A private question' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ask MediGuide' }))
    await waitFor(() => {
      expect(conversationsApi.sendMessage).toHaveBeenCalledWith(
        'conversation-user-a',
        'A private question',
        expect.any(String),
      )
    })

    fireEvent.click(screen.getByRole('button', { name: user.email }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    await screen.findByRole('button', { name: 'Sign in' })

    vi.mocked(authApi.login).mockResolvedValue(otherUser)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: otherUser.email },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'another-test-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in securely' }))
    await screen.findByRole('button', { name: otherUser.email })

    await act(async () => {
      resolveSend?.({
        conversationId: 'conversation-user-a',
        answer: 'Private answer from account A.',
        citations: [],
        limitations: [],
        requestId: 'request-a',
        messages: [
          {
            id: 'message-a',
            role: 'assistant',
            content: 'Private answer from account A.',
            citations: [],
            limitations: [],
            created_at: '2026-10-31T12:00:01.000Z',
          },
        ],
      })
      await pendingResponse
    })

    expect(screen.queryByText('Private answer from account A.')).toBeNull()
    expect(screen.getByText('No saved conversations')).toBeTruthy()
  })
})
