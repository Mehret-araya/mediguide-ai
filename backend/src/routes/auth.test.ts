import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import {
  SupabaseAuthClient,
  type AuthSession,
} from "../auth/supabase-auth.js";
import { createAuthRouter } from "./auth.js";

const configuration = {
  SUPABASE_URL: "https://mediguide-test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
};

const session: AuthSession = {
  accessToken: "test-access-token",
  refreshToken: "test-refresh-token",
  expiresIn: 3600,
  tokenType: "bearer",
  user: {
    id: "user-123",
    email: "person@example.org",
  },
};

function providerResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(
    body === null ? null : JSON.stringify(body),
    { status, headers: { "content-type": "application/json" } },
  );
}

function createTestApp(
  fetcher: typeof fetch,
  environment: Partial<typeof configuration> = configuration,
) {
  const app = express();
  const auth = new SupabaseAuthClient(() => environment, fetcher);
  app.use(express.json());
  app.use("/api/v1/auth", createAuthRouter(auth));
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Supabase-backed authentication routes", () => {
  it("validates registration input before calling Supabase", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const app = createTestApp(fetcher);

    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: "not-an-email",
        password: "short",
        name: " ",
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(response.text).not.toContain("short");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("registers without returning account-existence or credential details", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      providerResponse(null, 204),
    );
    const app = createTestApp(fetcher);

    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Example User",
        email: " PERSON@example.org ",
        password: "long-enough-test-password",
      });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      status: "ok",
      message:
        "If the address can be registered, the request was accepted. Check your email if confirmation is enabled.",
    });

    const [url, options] = fetcher.mock.calls[0];
    expect(url.toString()).toBe(
      "https://mediguide-test.supabase.co/auth/v1/signup",
    );
    expect(options?.headers).toMatchObject({
      apikey: "test-anon-key",
    });
    expect(options?.headers).not.toHaveProperty("authorization");
    expect(JSON.parse(String(options?.body))).toEqual({
      email: "person@example.org",
      password: "long-enough-test-password",
      data: { name: "Example User" },
    });
    expect(response.text).not.toContain("long-enough-test-password");
    expect(response.text).not.toContain("test-service-role-key");
  });

  it("logs sanitized Supabase signup diagnostics without exposing personal data or secrets", async () => {
    const email = "private.person@example.org";
    const password = "private-test-password";
    const name = "Private Person";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      providerResponse(
        {
          code: "email_exists",
          message: `Account ${email} for ${name}; password=${password}; api_key=${configuration.SUPABASE_ANON_KEY}`,
        },
        400,
      ),
    );
    const app = createTestApp(fetcher);
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ name, email, password });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: "error",
      code: "AUTH_REQUEST_FAILED",
      message: "The account could not be created.",
    });
    expect(diagnostic).toHaveBeenCalledOnce();
    expect(diagnostic).toHaveBeenCalledWith("Supabase Auth signup failed", {
      providerStatus: 400,
      providerCode: "email_exists",
      providerMessage: expect.any(String),
    });

    const loggedDetails = JSON.stringify(diagnostic.mock.calls);
    for (const sensitiveValue of [
      email,
      password,
      name,
      configuration.SUPABASE_ANON_KEY,
      configuration.SUPABASE_SERVICE_ROLE_KEY,
    ]) {
      expect(loggedDetails).not.toContain(sensitiveValue);
    }
    expect(response.text).not.toContain("email_exists");
    expect(response.text).not.toContain(email);
    expect(response.text).not.toContain(password);
  });

  it("accepts local loopback Vite origins in development", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      providerResponse(null, 204),
    );
    const app = createTestApp(fetcher);

    const response = await request(app)
      .post("/api/v1/auth/register")
      .set("Origin", "http://127.0.0.1:5181")
      .send({
        name: "Example User",
        email: "person@example.org",
        password: "long-enough-test-password",
      });

    expect(response.status).toBe(202);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("sets HttpOnly auth cookies and returns no tokens on successful login", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      providerResponse({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
        expires_in: session.expiresIn,
        token_type: session.tokenType,
        user: {
          ...session.user,
          app_metadata: { provider: "email" },
          user_metadata: { name: "Example User" },
        },
      }),
    );
    const app = createTestApp(fetcher);

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: session.user.email,
        password: "long-enough-test-password",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", user: session.user });
    expect(response.text).not.toContain("long-enough-test-password");
    expect(response.text).not.toContain(session.accessToken);
    expect(response.text).not.toContain(session.refreshToken);
    expect(response.text).not.toContain("test-service-role-key");
    const setCookieHeader = response.headers["set-cookie"];
    const cookies = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : [setCookieHeader];
    expect(cookies).toHaveLength(2);
    const accessCookie = cookies.find((cookie) =>
      cookie.startsWith("mediguide_access="),
    );
    const refreshCookie = cookies.find((cookie) =>
      cookie.startsWith("mediguide_refresh="),
    );
    expect(accessCookie).toContain("Path=/api/v1;");
    expect(refreshCookie).toContain("Path=/api/v1/auth;");
    expect(cookies.every((cookie) => /httponly/iu.test(cookie))).toBe(true);
    expect(cookies.every((cookie) => /samesite=lax/iu.test(cookie))).toBe(true);

    const [url, options] = fetcher.mock.calls[0];
    expect(url.toString()).toContain(
      "/auth/v1/token?grant_type=password",
    );
    expect(options?.headers).toMatchObject({ apikey: "test-anon-key" });
    expect(options?.headers).not.toHaveProperty("authorization");
  });

  it("returns a generic error for invalid login credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      providerResponse({ message: "provider detail" }, 400),
    );
    const app = createTestApp(fetcher);

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: session.user.email,
        password: "long-enough-test-password",
      });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      status: "error",
      code: "INVALID_CREDENTIALS",
      message: "Email or password is invalid.",
    });
    expect(response.text).not.toContain("provider detail");
  });

  it("preserves upstream auth throttling as a safe retryable response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      providerResponse({ message: "provider detail" }, 429),
    );
    const app = createTestApp(fetcher);

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: session.user.email,
        password: "long-enough-test-password",
      });

    expect(response.status).toBe(429);
    expect(response.body).toEqual({
      status: "error",
      code: "RATE_LIMITED",
      message: "Too many authentication attempts. Please try again later.",
    });
    expect(response.text).not.toContain("provider detail");
  });

  it("rotates refresh cookies without returning tokens to the browser", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      providerResponse({
        access_token: session.accessToken,
        refresh_token: "rotated-refresh-token",
        expires_in: session.expiresIn,
        token_type: session.tokenType,
        user: session.user,
      }),
    );
    const app = createTestApp(fetcher);

    const response = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", "http://localhost:5173")
      .set("Cookie", "mediguide_refresh=test-refresh-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", user: session.user });
    expect(response.text).not.toContain(session.accessToken);
    expect(response.text).not.toContain("rotated-refresh-token");
    expect(
      JSON.stringify(response.headers["set-cookie"]).match(
        /mediguide_(?:access|refresh)=/gu,
      ),
    ).toHaveLength(2);
    const [url, options] = fetcher.mock.calls[0];
    expect(url.toString()).toContain(
      "/auth/v1/token?grant_type=refresh_token",
    );
    expect(JSON.parse(String(options?.body))).toEqual({
      refresh_token: "test-refresh-token",
    });
  });

  it("requires a valid Supabase session for the current-user endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      providerResponse(session.user),
    );
    const app = createTestApp(fetcher);

    const unauthorized = await request(app).get("/api/v1/auth/me");
    expect(unauthorized.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", user: session.user });
    expect(response.text).not.toContain(session.accessToken);
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      apikey: "test-anon-key",
      authorization: `Bearer ${session.accessToken}`,
    });
  });

  it("authenticates browser requests using HttpOnly session cookies", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      providerResponse(session.user),
    );
    const app = createTestApp(fetcher);

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", `mediguide_access=${session.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", user: session.user });
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      authorization: `Bearer ${session.accessToken}`,
    });
  });

  it("revokes the authenticated session on logout", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      providerResponse(null, 204),
    );
    const app = createTestApp(fetcher);

    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(response.status).toBe(204);
    expect(fetcher.mock.calls[0][0].toString()).toBe(
      "https://mediguide-test.supabase.co/auth/v1/logout?scope=local",
    );
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      authorization: `Bearer ${session.accessToken}`,
    });
  });

  it("requires an allowed Origin for cookie-authenticated mutations", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const app = createTestApp(fetcher);

    const missingOrigin = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", `mediguide_access=${session.accessToken}`);
    expect(missingOrigin.status).toBe(403);
    expect(missingOrigin.body.code).toBe("ORIGIN_REQUIRED");

    const untrustedOrigin = await request(app)
      .post("/api/v1/auth/logout")
      .set("Origin", "https://attacker.example")
      .set("Cookie", `mediguide_access=${session.accessToken}`);
    expect(untrustedOrigin.status).toBe(403);
    expect(untrustedOrigin.body.code).toBe("ORIGIN_NOT_ALLOWED");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("deletes only the account resolved from the authenticated session", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerResponse(session.user))
      .mockResolvedValueOnce(providerResponse(null, 204));
    const app = createTestApp(fetcher);

    const response = await request(app)
      .delete("/api/v1/auth/account")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ userId: "attacker-selected-user" });

    expect(response.status).toBe(204);
    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("mediguide_access=;"),
        expect.stringContaining("mediguide_refresh=;"),
      ]),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      apikey: "test-anon-key",
      authorization: `Bearer ${session.accessToken}`,
    });
    expect(fetcher.mock.calls[1][0].toString()).toBe(
      "https://mediguide-test.supabase.co/auth/v1/admin/users/user-123",
    );
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({
      apikey: "test-service-role-key",
      authorization: "Bearer test-service-role-key",
    });
  });

  it("keeps authentication cookies when Supabase rejects account deletion", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerResponse(session.user))
      .mockResolvedValueOnce(
        providerResponse({ message: "sensitive provider details" }, 500),
      );
    const app = createTestApp(fetcher);

    const response = await request(app)
      .delete("/api/v1/auth/account")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: "error",
      code: "AUTH_UNAVAILABLE",
      message: "The account could not be deleted. Please try again later.",
    });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.text).not.toContain("sensitive provider details");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps authentication cookies when Supabase account deletion has a network error", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerResponse(session.user))
      .mockRejectedValueOnce(new Error("sensitive network details"));
    const app = createTestApp(fetcher);

    const response = await request(app)
      .delete("/api/v1/auth/account")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: "error",
      code: "AUTH_UNAVAILABLE",
      message: "The authentication service is temporarily unavailable.",
    });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.text).not.toContain("sensitive network details");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not delete an account when its session cannot be verified", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      providerResponse({ message: "invalid token" }, 401),
    );
    const app = createTestApp(fetcher);

    const response = await request(app)
      .delete("/api/v1/auth/account")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(response.status).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0].toString()).toContain("/auth/v1/user");
  });

  it("requires the server-only service role key for account deletion", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      providerResponse(session.user),
    );
    const app = createTestApp(fetcher, {
      SUPABASE_URL: configuration.SUPABASE_URL,
      SUPABASE_ANON_KEY: configuration.SUPABASE_ANON_KEY,
    });

    const response = await request(app)
      .delete("/api/v1/auth/account")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("AUTH_NOT_CONFIGURED");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(response.text).not.toContain("test-service-role-key");
  });

  it("does not make insecure or unconfigured Supabase requests", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const auth = new SupabaseAuthClient(
      () => ({
        SUPABASE_URL: "http://public.example",
        SUPABASE_ANON_KEY: "test-anon-key",
      }),
      fetcher,
    );
    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", createAuthRouter(auth));

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: session.user.email,
        password: "long-enough-test-password",
      });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("AUTH_NOT_CONFIGURED");
    expect(response.text).not.toContain("test-anon-key");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails safely when the authentication provider is unreachable", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("network detail with credential"));
    const app = createTestApp(fetcher);

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: session.user.email,
        password: "long-enough-test-password",
      });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: "error",
      code: "AUTH_UNAVAILABLE",
      message: "The authentication service is temporarily unavailable.",
    });
    expect(response.text).not.toContain("network detail");
  });
});
