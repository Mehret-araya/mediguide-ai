export function getApiBaseUrl(
  configuredUrl: string | undefined = import.meta.env.VITE_API_URL,
): string {
  return configuredUrl?.trim().replace(/\/+$/u, '') ?? ''
}
