import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApiError, authApi } from './api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('browser authentication API client', () => {
  it('sends registration through the credentialed same-site API', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        status: 'ok',
        message: 'Check email if confirmation is enabled.',
      }, 202),
    )
    vi.stubGlobal('fetch', fetchMock)

    const message = await authApi.register({
      name: 'Example User',
      email: 'person@example.org',
      password: 'a-test-password',
    })

    expect(message).toContain('Check email')
    const [url, options] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/v1\/auth\/register$/u)
    expect(options).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(JSON.parse(String(options?.body))).toEqual({
      name: 'Example User',
      email: 'person@example.org',
      password: 'a-test-password',
    })
  })

  it('returns only the minimal user profile from login', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        status: 'ok',
        user: { id: 'user-1', email: 'person@example.org' },
        accessToken: 'must-not-be-returned',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const user = await authApi.login({
      email: 'person@example.org',
      password: 'a-test-password',
    })

    expect(user).toEqual({ id: 'user-1', email: 'person@example.org' })
    expect(user).not.toHaveProperty('accessToken')
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe('include')
  })

  it('uses the cookie-backed refresh endpoint without sending tokens in a body', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        status: 'ok',
        user: { id: 'user-1', email: 'person@example.org' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await authApi.refresh()

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
    })
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined()
  })

  it('supports current-user lookup, logout, and account deletion', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'ok',
          user: { id: 'user-1', email: 'person@example.org' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(authApi.me()).resolves.toEqual({
      id: 'user-1',
      email: 'person@example.org',
    })
    await expect(authApi.logout()).resolves.toBeUndefined()
    await expect(authApi.deleteAccount()).resolves.toBeUndefined()

    expect(fetchMock.mock.calls.map(([, options]) => options?.method)).toEqual([
      undefined,
      'POST',
      'DELETE',
    ])
    expect(fetchMock.mock.calls.every(([, options]) =>
      options?.credentials === 'include')).toBe(true)
  })

  it('surfaces safe API error codes and messages', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        status: 'error',
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is invalid.',
        providerSecret: 'must-not-be-shown',
      }, 401),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(authApi.login({
      email: 'person@example.org',
      password: 'a-test-password',
    })).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is invalid.',
    })
    await expect(authApi.login({
      email: 'person@example.org',
      password: 'a-test-password',
    })).rejects.not.toThrow('must-not-be-shown')
  })

  it('does not expose malformed responses or network errors', async () => {
    const malformedFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('not json', { status: 502 }),
    )
    vi.stubGlobal('fetch', malformedFetch)

    await expect(authApi.me()).rejects.toBeInstanceOf(AuthApiError)
    await expect(authApi.me()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })

    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(
        new Error('private network details'),
      ),
    )

    await expect(authApi.me()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Cannot reach the account service. Please try again.',
    })
  })
})
