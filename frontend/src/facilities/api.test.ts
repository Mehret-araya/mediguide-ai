import { afterEach, describe, expect, it, vi } from 'vitest'
import { facilitiesApi } from './api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('healthcare facility API', () => {
  it('searches with filters without sending account cookies', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        status: 'ok',
        items: [],
        total: 0,
        limit: 20,
        offset: 0,
      }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(facilitiesApi.search({
      area: 'Addis Ababa',
      type: 'hospital',
    })).resolves.toEqual([])
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^\/api\/v1\//u)
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'area=Addis+Ababa&type=hospital',
    )
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe('omit')
  })

  it('surfaces the explicit unavailable-data state', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        status: 'error',
        code: 'FACILITY_DATA_UNAVAILABLE',
        message: 'Verified facility information is not available yet.',
      }), { status: 503 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(facilitiesApi.search({})).rejects.toMatchObject({
      code: 'FACILITY_DATA_UNAVAILABLE',
      statusCode: 503,
    })
  })

  it('rejects unsafe map links from a provider response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        status: 'ok',
        items: [{
          id: 'facility-1',
          name: 'Facility',
          address: 'Verified address',
          area: null,
          type: 'clinic',
          phone: null,
          sourceUrl: null,
          mapUrl: 'javascript:alert(1)',
          verifiedAt: null,
          verificationStatus: 'unverified',
        }],
        total: 1,
        limit: 20,
        offset: 0,
      }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(facilitiesApi.search({})).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
})
