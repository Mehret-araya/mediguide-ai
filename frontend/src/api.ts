export type BackendHealth = {
  status: string
  service: string
  message: string
}

export async function checkBackendHealth(): Promise<BackendHealth> {
  const response = await fetch('/api/health')

  if (!response.ok) {
    throw new Error(`Backend health check failed (${response.status})`)
  }

  return (await response.json()) as BackendHealth
}
export type EducationTopic = {
  id: string
  title: string
  summary: string
  guidance: string
  sourceStatus: string
}

export type EducationResponse = {
  status: string
  message: string
  disclaimer: string
  topics: EducationTopic[]
}

// Retrieve general health education topics from the backend.
export async function getEducationTopics(): Promise<EducationResponse> {
  const response = await fetch('/api/education')

  if (!response.ok) {
    throw new Error(`Failed to load education topics (${response.status})`)
  }

  return (await response.json()) as EducationResponse
}