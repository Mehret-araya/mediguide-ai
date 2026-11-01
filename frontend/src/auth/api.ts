import { getApiBaseUrl } from '../api-base-url'

export interface AuthUser {
  id: string
  email: string
}

export interface AuthErrorBody {
  status: 'error'
  code: string
  message: string
}

export class AuthApiError extends Error {
  readonly statusCode: number
  readonly code: string

  constructor(
    statusCode: number,
    code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AuthApiError'
    this.statusCode = statusCode
    this.code = code
  }
}

const apiBaseUrl = getApiBaseUrl()

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
  } catch {
    throw new AuthApiError(
      0,
      'NETWORK_ERROR',
      'Cannot reach the account service. Please try again.',
    )
  }

  if (response.status === 204) {
    if (!response.ok) {
      throw new AuthApiError(
        response.status,
        'REQUEST_FAILED',
        'The request could not be completed.',
      )
    }

    return undefined as T
  }

  let payload: unknown

  try {
    payload = await response.json()
  } catch {
    throw new AuthApiError(
      response.status,
      'INVALID_RESPONSE',
      'The account service returned an invalid response.',
    )
  }

  if (!response.ok) {
    const error = isRecord(payload) ? payload : {}
    throw new AuthApiError(
      response.status,
      typeof error.code === 'string' ? error.code : 'REQUEST_FAILED',
      typeof error.message === 'string'
        ? error.message
        : 'The request could not be completed.',
    )
  }

  if (!isRecord(payload) || payload.status !== 'ok') {
    throw new AuthApiError(
      response.status,
      'INVALID_RESPONSE',
      'The account service returned an invalid response.',
    )
  }

  return payload as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getUser(value: unknown): AuthUser {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.email !== 'string'
  ) {
    throw new AuthApiError(
      200,
      'INVALID_RESPONSE',
      'The account service returned an invalid user.',
    )
  }

  return { id: value.id, email: value.email }
}

export const authApi = {
  async register(input: {
    name: string
    email: string
    password: string
  }): Promise<string> {
    const result = await request<{ message: string }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    })

    if (typeof result.message !== 'string') {
      throw new AuthApiError(
        202,
        'INVALID_RESPONSE',
        'The account service returned an invalid response.',
      )
    }

    return result.message
  },

  async login(input: {
    email: string
    password: string
  }): Promise<AuthUser> {
    const result = await request<{ user: unknown }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return getUser(result.user)
  },

  async refresh(): Promise<AuthUser> {
    const result = await request<{ user: unknown }>('/api/v1/auth/refresh', {
      method: 'POST',
    })
    return getUser(result.user)
  },

  async me(): Promise<AuthUser> {
    const result = await request<{ user: unknown }>('/api/v1/auth/me')
    return getUser(result.user)
  },

  async logout(): Promise<void> {
    await request<void>('/api/v1/auth/logout', { method: 'POST' })
  },

  async deleteAccount(): Promise<void> {
    await request<void>('/api/v1/auth/account', { method: 'DELETE' })
  },
}
