import { getApiBaseUrl } from '../api-base-url'

export interface ConversationSummary {
  id: string
  created_at: string
  updated_at: string
}

export interface HealthEducationCitation {
  sourceId: string
  title: string
  publisher: string
  url: string
  licenseUrl?: string | null
  modificationNotice?: string | null
  section?: string | null
}

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations: HealthEducationCitation[]
  limitations: string[]
  created_at: string
}

export class ConversationApiError extends Error {
  readonly statusCode: number
  readonly code: string

  constructor(
    statusCode: number,
    code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ConversationApiError'
    this.statusCode = statusCode
    this.code = code
  }
}

const apiBaseUrl = getApiBaseUrl()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseConversation(value: unknown): ConversationSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.created_at !== 'string' ||
    typeof value.updated_at !== 'string'
  ) {
    throw new ConversationApiError(
      200,
      'INVALID_RESPONSE',
      'Conversation history returned an invalid response.',
    )
  }

  return {
    id: value.id,
    created_at: value.created_at,
    updated_at: value.updated_at,
  }
}

function parseCitation(value: unknown): HealthEducationCitation {
  const licenseUrl = isRecord(value) ? value.licenseUrl : undefined
  const modificationNotice = isRecord(value)
    ? value.modificationNotice
    : undefined
  if (
    !isRecord(value) ||
    typeof value.sourceId !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.publisher !== 'string' ||
    typeof value.url !== 'string'
  ) {
    throw new ConversationApiError(
      200,
      'INVALID_RESPONSE',
      'Conversation history returned an invalid citation.',
    )
  }

  let url: URL
  try {
    url = new URL(value.url)
  } catch {
    throw new ConversationApiError(
      200,
      'INVALID_RESPONSE',
      'Conversation history returned an invalid citation.',
    )
  }

  if (
    url.protocol !== 'https:' ||
    (value.section !== undefined &&
      value.section !== null &&
      typeof value.section !== 'string') ||
    (licenseUrl !== undefined &&
      licenseUrl !== null &&
      typeof licenseUrl !== 'string') ||
    (modificationNotice !== undefined &&
      modificationNotice !== null &&
      (typeof modificationNotice !== 'string' ||
        modificationNotice.trim().length === 0))
  ) {
    throw new ConversationApiError(
      200,
      'INVALID_RESPONSE',
      'Conversation history returned an invalid citation.',
    )
  }

  if (typeof licenseUrl === 'string') {
    let parsedLicenseUrl: URL
    try {
      parsedLicenseUrl = new URL(licenseUrl)
    } catch {
      throw new ConversationApiError(
        200,
        'INVALID_RESPONSE',
        'Conversation history returned an invalid citation.',
      )
    }
    if (parsedLicenseUrl.protocol !== 'https:') {
      throw new ConversationApiError(
        200,
        'INVALID_RESPONSE',
        'Conversation history returned an invalid citation.',
      )
    }
  }

  return {
    sourceId: value.sourceId,
    title: value.title,
    publisher: value.publisher,
    url: value.url,
    ...(licenseUrl === undefined ? {} : { licenseUrl }),
    ...(modificationNotice === undefined ? {} : { modificationNotice }),
    ...(value.section === undefined ? {} : { section: value.section }),
  }
}

function parseMessage(value: unknown): ConversationMessage {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    (value.role !== 'user' && value.role !== 'assistant') ||
    typeof value.content !== 'string' ||
    !Array.isArray(value.citations) ||
    !Array.isArray(value.limitations) ||
    !value.limitations.every((item) => typeof item === 'string') ||
    typeof value.created_at !== 'string'
  ) {
    throw new ConversationApiError(
      200,
      'INVALID_RESPONSE',
      'Conversation history returned an invalid message.',
    )
  }

  return {
    id: value.id,
    role: value.role,
    content: value.content,
    citations: value.citations.map(parseCitation),
    limitations: value.limitations,
    created_at: value.created_at,
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ConversationApiError(
      0,
      'NETWORK_ERROR',
      'Cannot reach conversation history right now. Please try again.',
    )
  }

  if (response.status === 204) {
    if (!response.ok) {
      throw new ConversationApiError(
        response.status,
        'REQUEST_FAILED',
        'The conversation request could not be completed.',
      )
    }
    return undefined
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ConversationApiError(
      response.status,
      'INVALID_RESPONSE',
      'Conversation history returned an invalid response.',
    )
  }

  if (!isRecord(payload)) {
    throw new ConversationApiError(
      response.status,
      'INVALID_RESPONSE',
      'Conversation history returned an invalid response.',
    )
  }
  if (!response.ok || payload.status !== 'ok') {
    throw new ConversationApiError(
      response.status,
      typeof payload.code === 'string' ? payload.code : 'REQUEST_FAILED',
      typeof payload.message === 'string'
        ? payload.message
        : 'The conversation request could not be completed.',
    )
  }

  return payload
}

export const conversationsApi = {
  async list(): Promise<ConversationSummary[]> {
    const result = await request('/api/v1/conversations')
    if (!isRecord(result) || !Array.isArray(result.conversations)) {
      throw new ConversationApiError(
        200,
        'INVALID_RESPONSE',
        'Conversation history returned an invalid response.',
      )
    }
    return result.conversations.map(parseConversation)
  },

  async create(): Promise<ConversationSummary> {
    const result = await request('/api/v1/conversations', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    if (!isRecord(result)) {
      throw new ConversationApiError(
        200,
        'INVALID_RESPONSE',
        'Conversation history returned an invalid response.',
      )
    }
    return parseConversation(result.conversation)
  },

  async get(id: string): Promise<{
    conversation: ConversationSummary
    messages: ConversationMessage[]
  }> {
    const result = await request(
      `/api/v1/conversations/${encodeURIComponent(id)}`,
    )
    if (!isRecord(result) || !Array.isArray(result.messages)) {
      throw new ConversationApiError(
        200,
        'INVALID_RESPONSE',
        'Conversation history returned an invalid response.',
      )
    }
    return {
      conversation: parseConversation(result.conversation),
      messages: result.messages.map(parseMessage),
    }
  },

  async sendMessage(
    id: string,
    question: string,
    idempotencyKey: string,
  ): Promise<{
    conversationId: string
    messages: ConversationMessage[]
    answer: string
    citations: HealthEducationCitation[]
    limitations: string[]
    requestId: string
  }> {
    const result = await request(
      `/api/v1/conversations/${encodeURIComponent(id)}/messages`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ question, language: 'en' }),
      },
    )
    if (
      !isRecord(result) ||
      typeof result.conversationId !== 'string' ||
      !Array.isArray(result.messages) ||
      typeof result.answer !== 'string' ||
      !Array.isArray(result.citations) ||
      !Array.isArray(result.limitations) ||
      !result.limitations.every((item) => typeof item === 'string') ||
      typeof result.requestId !== 'string'
    ) {
      throw new ConversationApiError(
        200,
        'INVALID_RESPONSE',
        'The health assistant returned an invalid response.',
      )
    }

    return {
      conversationId: result.conversationId,
      messages: result.messages.map(parseMessage),
      answer: result.answer,
      citations: result.citations.map(parseCitation),
      limitations: result.limitations,
      requestId: result.requestId,
    }
  },

  async delete(id: string): Promise<void> {
    await request(`/api/v1/conversations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}
