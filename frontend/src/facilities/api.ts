export type FacilityVerificationStatus =
  | 'verified'
  | 'unverified'
  | 'outdated'

export interface HealthcareFacility {
  id: string
  name: string
  address: string
  area: string | null
  type: string
  phone: string | null
  sourceUrl: string | null
  mapUrl: string | null
  verifiedAt: string | null
  verificationStatus: FacilityVerificationStatus
}

export class FacilityApiError extends Error {
  readonly statusCode: number
  readonly code: string

  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.name = 'FacilityApiError'
    this.statusCode = statusCode
    this.code = code
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000')
  .replace(/\/+$/u, '')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isHttpsUrl(value: unknown): value is string | null {
  if (value === null) return true
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

function parseFacility(value: unknown): HealthcareFacility {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.address !== 'string' ||
    (value.area !== null && typeof value.area !== 'string') ||
    typeof value.type !== 'string' ||
    (value.phone !== null && typeof value.phone !== 'string') ||
    !isHttpsUrl(value.sourceUrl) ||
    !isHttpsUrl(value.mapUrl) ||
    (value.verifiedAt !== null && typeof value.verifiedAt !== 'string') ||
    (value.verificationStatus !== 'verified' &&
      value.verificationStatus !== 'unverified' &&
      value.verificationStatus !== 'outdated') ||
    (value.verificationStatus === 'verified' &&
      (value.sourceUrl === null ||
        value.verifiedAt === null ||
        typeof value.verifiedAt !== 'string' ||
        !Number.isFinite(Date.parse(value.verifiedAt))))
  ) {
    throw new FacilityApiError(
      200,
      'INVALID_RESPONSE',
      'Facility information could not be verified.',
    )
  }

  return {
    id: value.id,
    name: value.name,
    address: value.address,
    area: value.area,
    type: value.type,
    phone: value.phone,
    sourceUrl: value.sourceUrl,
    mapUrl: value.mapUrl,
    verifiedAt: value.verifiedAt,
    verificationStatus: value.verificationStatus,
  }
}

export const facilitiesApi = {
  async search(input: {
    area?: string
    type?: string
  }): Promise<HealthcareFacility[]> {
    const params = new URLSearchParams()
    if (input.area?.trim()) params.set('area', input.area.trim())
    if (input.type) params.set('type', input.type)

    let response: Response
    try {
      response = await fetch(
        `${apiBaseUrl}/api/v1/facilities?${params.toString()}`,
        { credentials: 'omit' },
      )
    } catch {
      throw new FacilityApiError(
        0,
        'NETWORK_ERROR',
        'Facility search is temporarily unavailable.',
      )
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new FacilityApiError(
        response.status,
        'INVALID_RESPONSE',
        'Facility information could not be verified.',
      )
    }

    if (!isRecord(payload) || !response.ok || payload.status !== 'ok') {
      throw new FacilityApiError(
        response.status,
        isRecord(payload) && typeof payload.code === 'string'
          ? payload.code
          : 'REQUEST_FAILED',
        isRecord(payload) && typeof payload.message === 'string'
          ? payload.message
          : 'Facility search is temporarily unavailable.',
      )
    }

    if (!Array.isArray(payload.items)) {
      throw new FacilityApiError(
        response.status,
        'INVALID_RESPONSE',
        'Facility information could not be verified.',
      )
    }

    return payload.items.map(parseFacility)
  },
}
