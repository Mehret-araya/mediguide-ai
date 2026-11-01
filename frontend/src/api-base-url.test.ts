import { describe, expect, it } from 'vitest'
import { getApiBaseUrl } from './api-base-url'

describe('API base URL configuration', () => {
  it('uses the same-origin Vite proxy when no API URL is configured', () => {
    expect(getApiBaseUrl(undefined)).toBe('')
  })

  it('normalizes an explicitly configured API origin', () => {
    expect(getApiBaseUrl(' https://api.example.org/// ')).toBe(
      'https://api.example.org',
    )
  })
})
