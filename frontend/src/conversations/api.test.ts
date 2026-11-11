import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConversationApiError, conversationsApi } from './api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('credentialed conversation API', () => {
  it('lists account history without sending session tokens in JavaScript', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        status: 'ok',
        conversations: [{
          id: 'conversation-1',
          created_at: '2026-10-31T12:00:00.000Z',
          updated_at: '2026-10-31T12:01:00.000Z',
        }],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(conversationsApi.list()).resolves.toMatchObject([
      { id: 'conversation-1' },
    ])
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe('include')
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({})
  })

  it('sends a question and preserves citations and limitations', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        status: 'ok',
        conversationId: 'conversation/1',
        answer: 'Evidence-grounded information.',
        citations: [{
          sourceId: 'source-1',
          title: 'Reviewed source',
          publisher: 'Public health authority',
          url: 'https://example.org/source',
        }],
        limitations: ['General information only.'],
        requestId: 'request-1',
        messages: [{
          id: 'message-1',
          role: 'assistant',
          content: 'Evidence-grounded information.',
          citations: [{
            sourceId: 'source-1',
            title: 'Reviewed source',
            publisher: 'Public health authority',
            url: 'https://example.org/source',
          }],
          limitations: ['General information only.'],
          created_at: '2026-10-31T12:01:00.000Z',
        }],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await conversationsApi.sendMessage(
      'conversation/1',
      'What is general health information?',
      '10ec58c4-26b8-4efb-8501-2610e35b76f8',
    )

    expect(response.limitations).toEqual(['General information only.'])
    expect(response.messages[0].citations[0].url).toBe(
      'https://example.org/source',
    )
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/v1/conversations/conversation%2F1/messages',
    )
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^\/api\/v1\//u)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': '10ec58c4-26b8-4efb-8501-2610e35b76f8',
      },
    })
  })

  it('preserves optional citation license and modification metadata', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        status: 'ok',
        conversationId: 'conversation-1',
        answer: 'Evidence-grounded information.',
        citations: [{
          sourceId: 'source-1',
          title: 'Reviewed source',
          publisher: 'Public health authority',
          url: 'https://example.org/source',
          licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
          modificationNotice: 'Modified by the source publisher.',
        }],
        limitations: [],
        requestId: 'request-1',
        messages: [],
      }),
    ))

    await expect(conversationsApi.sendMessage(
      'conversation-1',
      'Question',
      '10ec58c4-26b8-4efb-8501-2610e35b76f8',
    )).resolves.toMatchObject({
      citations: [{
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        modificationNotice: 'Modified by the source publisher.',
      }],
    })
  })

  it('rejects non-HTTPS citation license links', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        status: 'ok',
        conversationId: 'conversation-1',
        answer: 'Evidence-grounded information.',
        citations: [{
          sourceId: 'source-1',
          title: 'Reviewed source',
          publisher: 'Public health authority',
          url: 'https://example.org/source',
          licenseUrl: 'http://example.org/license',
        }],
        limitations: [],
        requestId: 'request-1',
        messages: [],
      }),
    ))

    await expect(conversationsApi.sendMessage(
      'conversation-1',
      'Question',
      '10ec58c4-26b8-4efb-8501-2610e35b76f8',
    )).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('restores user and assistant messages in chronological order', async () => {
    const messages = [
      {
        id: 'user-1',
        role: 'user',
        content: 'First question',
        citations: [],
        limitations: [],
        created_at: '2026-10-31T12:00:01.000Z',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'First answer',
        citations: [],
        limitations: [],
        created_at: '2026-10-31T12:00:02.000Z',
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'Second question',
        citations: [],
        limitations: [],
        created_at: '2026-10-31T12:00:03.000Z',
      },
      {
        id: 'assistant-2',
        role: 'assistant',
        content: 'Second answer',
        citations: [],
        limitations: [],
        created_at: '2026-10-31T12:00:04.000Z',
      },
    ]
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        status: 'ok',
        conversation: {
          id: 'conversation-1',
          created_at: '2026-10-31T12:00:00.000Z',
          updated_at: '2026-10-31T12:00:04.000Z',
        },
        messages,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const detail = await conversationsApi.get('conversation-1')

    expect(detail.messages).toEqual(messages)
    expect(detail.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ])
    expect(detail.messages.every((message) =>
      message.citations.length === 0 && message.limitations.length === 0,
    )).toBe(true)
  })

  it('rejects non-HTTPS citation URLs in stored history', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        status: 'ok',
        conversation: {
          id: 'conversation-1',
          created_at: '2026-10-31T12:00:00.000Z',
          updated_at: '2026-10-31T12:01:00.000Z',
        },
        messages: [{
          id: 'message-1',
          role: 'assistant',
          content: 'Information.',
          citations: [{
            sourceId: 'source-1',
            title: 'Source',
            publisher: 'Publisher',
            url: 'javascript:alert(1)',
          }],
          limitations: [],
          created_at: '2026-10-31T12:01:00.000Z',
        }],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(conversationsApi.get('conversation-1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })

  it('surfaces safe server errors and handles successful deletion', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'error',
          code: 'CONVERSATION_NOT_FOUND',
          message: 'The requested conversation was not found.',
          internal: 'must-not-be-shown',
        }, 404),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(conversationsApi.get('missing')).rejects.toBeInstanceOf(
      ConversationApiError,
    )
    await expect(conversationsApi.delete('conversation-1')).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[1][1]?.method).toBe('DELETE')
    expect(fetchMock.mock.calls[1][1]?.credentials).toBe('include')
  })
})
