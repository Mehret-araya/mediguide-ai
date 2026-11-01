interface OriginEnvironment {
  FRONTEND_URL?: string;
  NODE_ENV?: string;
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function getConfiguredBrowserOrigins(
  environment: OriginEnvironment = process.env,
): string[] {
  return (environment.FRONTEND_URL || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isLoopbackDevelopmentOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.protocol === "http:" &&
      LOCAL_HOSTNAMES.has(url.hostname) &&
      url.origin === origin &&
      url.pathname === "/" &&
      url.search.length === 0 &&
      url.hash.length === 0
    );
  } catch {
    return false;
  }
}

export function isAllowedBrowserOrigin(
  origin: string | undefined,
  environment: OriginEnvironment = process.env,
): boolean {
  if (!origin) {
    return true;
  }

  if (getConfiguredBrowserOrigins(environment).includes(origin)) {
    return true;
  }

  return (
    environment.NODE_ENV !== "production" &&
    isLoopbackDevelopmentOrigin(origin)
  );
}
