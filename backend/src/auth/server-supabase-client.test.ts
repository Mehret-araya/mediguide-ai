import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerSupabaseClient } from "./server-supabase-client.js";

const serviceEnvironment = {
  SUPABASE_URL: "https://mediguide-test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-server-only-role-key",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("server-only Supabase client", () => {
  it("uses the service-role key without persisting an auth session", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("[]", {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    const client = createServerSupabaseClient(serviceEnvironment);
    await client.from("messages").insert({
      conversation_id: "4f8336a9-ae25-450e-b8dd-35b601d44963",
      role: "assistant",
      content: "Grounded response.",
    });

    const [url, options] = fetcher.mock.calls[0];
    const headers = new Headers(options?.headers);
    expect(String(url)).toContain("/rest/v1/messages");
    expect(headers.get("apikey")).toBe(
      serviceEnvironment.SUPABASE_SERVICE_ROLE_KEY,
    );
    expect(headers.get("authorization")).toBe(
      `Bearer ${serviceEnvironment.SUPABASE_SERVICE_ROLE_KEY}`,
    );

    const {
      data: { session },
    } = await client.auth.getSession();
    expect(session).toBeNull();
  });

  it.each([
    ["missing URL", { SUPABASE_SERVICE_ROLE_KEY: "test-key" }],
    ["missing key", { SUPABASE_URL: serviceEnvironment.SUPABASE_URL }],
    [
      "non-HTTPS remote URL",
      {
        SUPABASE_URL: "http://supabase.example.org",
        SUPABASE_SERVICE_ROLE_KEY: "test-key",
      },
    ],
    [
      "URL credentials",
      {
        SUPABASE_URL: "https://user:password@supabase.example.org",
        SUPABASE_SERVICE_ROLE_KEY: "test-key",
      },
    ],
    [
      "URL path",
      {
        SUPABASE_URL: "https://supabase.example.org/project",
        SUPABASE_SERVICE_ROLE_KEY: "test-key",
      },
    ],
  ])("rejects unsafe configuration (%s)", (_description, environment) => {
    expect(() => createServerSupabaseClient(environment)).toThrow(
      /Server-side Supabase configuration/u,
    );
  });

  it("allows local HTTP for loopback development", () => {
    expect(() =>
      createServerSupabaseClient({
        SUPABASE_URL: "http://localhost:54321",
        SUPABASE_SERVICE_ROLE_KEY: "local-test-key",
      }),
    ).not.toThrow();
  });
});
