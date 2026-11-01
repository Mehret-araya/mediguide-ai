import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { AuthUser } from "./supabase-auth.js";
import { requireAuthenticatedUser } from "./require-auth.js";
import { createUserSupabaseClient } from "./user-supabase-client.js";

const user: AuthUser = {
  id: "verified-user",
  email: "verified@example.org",
};

const accessToken = "test-user-access-token";
const configuration = {
  SUPABASE_URL: "https://mediguide-test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
};

function createTestApp(
  getUser: (token: string) => Promise<AuthUser | null>,
  createUserClient: (token: string) => SupabaseClient = () =>
    createClient(configuration.SUPABASE_URL, configuration.SUPABASE_ANON_KEY),
) {
  const app = express();
  app.get(
    "/protected",
    requireAuthenticatedUser({ getUser }, createUserClient),
    (req, res) => {
      res.json({
        user: req.user,
        hasUserScopedClient: Boolean(req.supabase),
      });
    },
  );
  return app;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Supabase user authentication middleware", () => {
  it("verifies the HttpOnly access cookie and attaches a user-scoped client", async () => {
    const getUser = vi.fn(async (token: string) => {
      expect(token).toBe(accessToken);
      return user;
    });
    const createUserClient = vi.fn(() =>
      createClient(configuration.SUPABASE_URL, configuration.SUPABASE_ANON_KEY),
    );
    const app = createTestApp(getUser, createUserClient);

    const response = await request(app)
      .get("/protected")
      .set("Cookie", `mediguide_access=${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user, hasUserScopedClient: true });
    expect(getUser).toHaveBeenCalledOnce();
    expect(createUserClient).toHaveBeenCalledExactlyOnceWith(accessToken);
  });

  it("rejects a missing access token without contacting Supabase", async () => {
    const getUser = vi.fn(async () => user);
    const createUserClient = vi.fn(() =>
      createClient(configuration.SUPABASE_URL, configuration.SUPABASE_ANON_KEY),
    );

    const response = await request(
      createTestApp(getUser, createUserClient),
    ).get("/protected");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
    expect(getUser).not.toHaveBeenCalled();
    expect(createUserClient).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid", "invalid-user-access-token"],
    ["expired", "expired-user-access-token"],
  ])("rejects an %s token returned as unauthorized by Supabase", async (_kind, token) => {
    const getUser = vi.fn(async () => null);
    const createUserClient = vi.fn(() =>
      createClient(configuration.SUPABASE_URL, configuration.SUPABASE_ANON_KEY),
    );

    const response = await request(createTestApp(getUser, createUserClient))
      .get("/protected")
      .set("Cookie", `mediguide_access=${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      status: "error",
      code: "UNAUTHORIZED",
      message: "A valid session is required.",
    });
    expect(getUser).toHaveBeenCalledExactlyOnceWith(token);
    expect(createUserClient).not.toHaveBeenCalled();
  });

  it("uses only the anon key and verified user JWT for data requests", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    const client = createUserSupabaseClient(accessToken, configuration);
    await client.from("user_profiles").select("id").limit(1);
    const [url, options] = fetcher.mock.calls[0];
    const headers = new Headers(options?.headers);

    expect(String(url)).toContain("/rest/v1/user_profiles");
    expect(headers.get("apikey")).toBe(configuration.SUPABASE_ANON_KEY);
    expect(headers.get("authorization")).toBe(`Bearer ${accessToken}`);
    expect(headers.get("authorization")).not.toContain("service-role");

    const {
      data: { session },
    } = await client.auth.getSession();
    expect(session).toBeNull();
  });
});
