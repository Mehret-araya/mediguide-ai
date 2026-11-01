export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  user: AuthUser;
}

interface SupabaseAuthEnvironment {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

interface AuthConfiguration {
  baseUrl: URL;
  anonKey: string;
  serviceRoleKey?: string;
}

interface RequestOptions {
  method: "DELETE" | "GET" | "POST";
  accessToken?: string;
  body?: Record<string, unknown>;
  admin?: boolean;
}

export class SupabaseAuthError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SupabaseAuthError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getUser(value: unknown): AuthUser | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = value.id;
  const email = value.email;

  if (
    typeof id !== "string" ||
    id.trim().length === 0 ||
    typeof email !== "string" ||
    email.trim().length === 0
  ) {
    return null;
  }

  return { id, email };
}

function getProviderCode(payload: unknown): string {
  if (!isRecord(payload)) {
    return "unavailable";
  }

  const value = payload.code ?? payload.error_code;

  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,80}$/u.test(value)
    ? value
    : "unavailable";
}

function redactSensitiveValues(
  message: string,
  sensitiveValues: readonly string[],
): string {
  let sanitized = message;

  for (const value of sensitiveValues) {
    if (value.length > 0) {
      sanitized = sanitized.replace(
        new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "giu"),
        "[REDACTED]",
      );
    }
  }

  return sanitized
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, "[REDACTED]")
    .replace(
      /\b(?:sb_(?:publishable|secret)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/gu,
      "[REDACTED]",
    )
    .replace(
      /\b(?:api[_ -]?key|password|token|secret)\s*[:=]\s*["']?[^,\s"']+/giu,
      "[REDACTED]",
    )
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/gu, "[REDACTED]")
    .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/giu, "[REDACTED]")
    .replace(/\+?\d[\d\s().-]{7,}\d/gu, "[REDACTED]")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .slice(0, 240);
}

function getProviderMessage(
  payload: unknown,
  sensitiveValues: readonly string[],
): string {
  if (!isRecord(payload)) {
    return "unavailable";
  }

  const value = payload.msg ?? payload.message ?? payload.error_description;

  return typeof value === "string"
    ? redactSensitiveValues(value, sensitiveValues)
    : "unavailable";
}

function getLocalHostname(url: URL): boolean {
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]"
  );
}

export class SupabaseAuthClient {
  constructor(
    private readonly environment: () => SupabaseAuthEnvironment = () =>
      process.env,
    private readonly fetcher: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {}

  async register(email: string, password: string, name: string): Promise<void> {
    const response = await this.send("/auth/v1/signup", {
      method: "POST",
      body: { email, password, data: { name } },
    });

    if (!response.ok) {
      const environment = this.environment();
      await this.logSignupProviderFailure(response, [
        email,
        password,
        name,
        environment.SUPABASE_ANON_KEY ?? "",
        environment.SUPABASE_SERVICE_ROLE_KEY ?? "",
      ]);
      this.throwForProviderResponse(response, "The account could not be created.");
    }
  }

  private async logSignupProviderFailure(
    response: Response,
    sensitiveValues: readonly string[],
  ): Promise<void> {
    let payload: unknown = null;

    try {
      payload = await response.clone().json();
    } catch {
      // The provider may return an empty or non-JSON error body.
    }

    console.error("Supabase Auth signup failed", {
      providerStatus: response.status,
      providerCode: getProviderCode(payload),
      providerMessage: getProviderMessage(payload, sensitiveValues),
    });
  }

  async login(email: string, password: string): Promise<AuthSession> {
    const response = await this.send("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email, password },
    });

    return this.sessionFromResponse(
      response,
      "INVALID_CREDENTIALS",
      "Email or password is invalid.",
    );
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const response = await this.send(
      "/auth/v1/token?grant_type=refresh_token",
      {
        method: "POST",
        body: { refresh_token: refreshToken },
      },
    );

    return this.sessionFromResponse(
      response,
      "INVALID_SESSION",
      "The refresh token is invalid.",
    );
  }

  private async sessionFromResponse(
    response: Response,
    invalidSessionCode: string,
    invalidSessionMessage: string,
  ): Promise<AuthSession> {
    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) {
        this.throwForProviderResponse(
          response,
          "The authentication service is temporarily unavailable.",
        );
      }

      throw new SupabaseAuthError(
        401,
        invalidSessionCode,
        invalidSessionMessage,
      );
    }

    const payload = await this.readJson(response);
    const user = getUser(payload?.user);

    if (
      !payload ||
      typeof payload.access_token !== "string" ||
      payload.access_token.length === 0 ||
      typeof payload.refresh_token !== "string" ||
      payload.refresh_token.length === 0 ||
      typeof payload.expires_in !== "number" ||
      !Number.isFinite(payload.expires_in) ||
      typeof payload.token_type !== "string" ||
      payload.token_type.length === 0 ||
      !user
    ) {
      throw this.invalidProviderResponse();
    }

    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresIn: payload.expires_in,
      tokenType: payload.token_type,
      user,
    };
  }

  async getUser(accessToken: string): Promise<AuthUser | null> {
    const response = await this.send("/auth/v1/user", {
      method: "GET",
      accessToken,
    });

    if ([400, 401, 403].includes(response.status)) {
      return null;
    }

    if (!response.ok) {
      this.throwForProviderResponse(
        response,
        "The authentication service is temporarily unavailable.",
      );
    }

    const user = getUser(await this.readJson(response));

    if (!user) {
      throw this.invalidProviderResponse();
    }

    return user;
  }

  async logout(accessToken: string): Promise<void> {
    const response = await this.send("/auth/v1/logout?scope=local", {
      method: "POST",
      accessToken,
    });

    if (!response.ok) {
      if ([400, 401, 403].includes(response.status)) {
        throw new SupabaseAuthError(
          401,
          "UNAUTHORIZED",
          "A valid session is required.",
        );
      }

      this.throwForProviderResponse(
        response,
        "The authentication service is temporarily unavailable.",
      );
    }
  }

  async deleteUser(userId: string): Promise<void> {
    const response = await this.send(
      `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      { method: "DELETE", admin: true },
    );

    if (!response.ok) {
      this.throwForProviderResponse(
        response,
        "The account could not be deleted. Please try again later.",
        503,
      );
    }
  }

  private configuration(requireAdmin = false): AuthConfiguration {
    const environment = this.environment();
    const rawUrl = environment.SUPABASE_URL?.trim();
    const anonKey = environment.SUPABASE_ANON_KEY?.trim();
    const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!rawUrl || !anonKey || (requireAdmin && !serviceRoleKey)) {
      throw new SupabaseAuthError(
        503,
        "AUTH_NOT_CONFIGURED",
        "Account services are not configured.",
      );
    }

    let baseUrl: URL;

    try {
      baseUrl = new URL(rawUrl);
    } catch {
      throw new SupabaseAuthError(
        503,
        "AUTH_NOT_CONFIGURED",
        "Account services are not configured.",
      );
    }

    const isSecure = baseUrl.protocol === "https:";
    const isLocalHttp =
      baseUrl.protocol === "http:" && getLocalHostname(baseUrl);

    if (
      (!isSecure && !isLocalHttp) ||
      baseUrl.username.length > 0 ||
      baseUrl.password.length > 0 ||
      baseUrl.pathname !== "/" ||
      baseUrl.search.length > 0 ||
      baseUrl.hash.length > 0
    ) {
      throw new SupabaseAuthError(
        503,
        "AUTH_NOT_CONFIGURED",
        "Account services are not configured.",
      );
    }

    return {
      baseUrl,
      anonKey,
      ...(serviceRoleKey ? { serviceRoleKey } : {}),
    };
  }

  private async send(
    path: string,
    options: RequestOptions,
  ): Promise<Response> {
    const configuration = this.configuration(options.admin);
    const key = options.admin
      ? configuration.serviceRoleKey
      : configuration.anonKey;

    if (!key) {
      throw new SupabaseAuthError(
        503,
        "AUTH_NOT_CONFIGURED",
        "Account services are not configured.",
      );
    }

    const headers: Record<string, string> = {
      apikey: key,
    };

    if (options.accessToken) {
      headers.authorization = `Bearer ${options.accessToken}`;
    } else if (options.admin) {
      headers.authorization = `Bearer ${configuration.serviceRoleKey}`;
    }

    if (options.body) {
      headers["content-type"] = "application/json";
    }

    try {
      return await this.fetcher(new URL(path, configuration.baseUrl), {
        method: options.method,
        headers,
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new SupabaseAuthError(
        503,
        "AUTH_UNAVAILABLE",
        "The authentication service is temporarily unavailable.",
      );
    }
  }

  private async readJson(
    response: Response,
  ): Promise<Record<string, unknown> | null> {
    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw this.invalidProviderResponse();
    }

    return isRecord(payload) ? payload : null;
  }

  private throwForProviderResponse(
    response: Response,
    message: string,
    rejectedStatus = 400,
  ): never {
    if (response.status === 429) {
      throw new SupabaseAuthError(
        429,
        "RATE_LIMITED",
        "Too many authentication attempts. Please try again later.",
      );
    }

    if (response.status >= 500) {
      throw new SupabaseAuthError(503, "AUTH_UNAVAILABLE", message);
    }

    throw new SupabaseAuthError(
      rejectedStatus,
      "AUTH_REQUEST_FAILED",
      message,
    );
  }

  private invalidProviderResponse(): SupabaseAuthError {
    return new SupabaseAuthError(
      503,
      "AUTH_UNAVAILABLE",
      "The authentication service returned an invalid response.",
    );
  }
}
