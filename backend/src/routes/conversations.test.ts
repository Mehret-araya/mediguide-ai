import express, { type RequestHandler } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createUserSupabaseClient,
} from "../auth/user-supabase-client.js";
import {
  HealthEducationServiceError,
  type HealthEducationResponse,
} from "../ai/health-education.js";
import { createConversationsRouter } from "./conversations.js";

const userId = "9ab1a867-30a3-4ba9-8e15-4fdb2d32266a";
const otherUserConversationId = "a1929d6c-6e9a-4f1b-a01e-45c1ec0aa5a0";
const conversation = {
  id: "4f8336a9-ae25-450e-b8dd-35b601d44963",
  created_at: "2026-10-31T12:00:00.000Z",
  updated_at: "2026-10-31T12:00:00.000Z",
};
const citation = {
  sourceId: "approved-source",
  title: "Reviewed health information",
  publisher: "Public health authority",
  url: "https://example.org/health-information",
  section: "Overview",
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
  answer = vi.fn(
    async (
      _input: { question: string; language: "en" },
      requestId: string,
    ): Promise<HealthEducationResponse> => ({
      answer: "Information from an approved source.",
      language: "en",
      citations: [citation],
      limitations: ["General information only."],
      requestId,
    }),
  ),
) {
  vi.stubGlobal("fetch", fetcher);
  const supabase = createUserSupabaseClient("test-user-access-token", {
    SUPABASE_URL: "https://mediguide-test.supabase.co",
    SUPABASE_ANON_KEY: "test-publishable-key",
  });
  const authenticate: RequestHandler = (req, _res, next) => {
    req.user = { id: userId, email: "person@example.org" };
    req.supabase = supabase;
    next();
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/conversations",
    createConversationsRouter({ answer }, authenticate),
  );
  return { app, answer };
}

async function conversationFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = input instanceof Request ? input : null;
  const url = new URL(request ? request.url : String(input));
  const method = init?.method ?? request?.method ?? "GET";

  if (url.pathname.endsWith("/conversations") && method === "POST") {
    return providerResponse(conversation);
  }
  if (
    url.pathname.endsWith("/conversations") &&
    method === "GET" &&
    !url.searchParams.has("id")
  ) {
    return providerResponse([conversation]);
  }
  if (
    url.pathname.endsWith("/conversations") &&
    method === "GET" &&
    url.searchParams.get("id") === `eq.${otherUserConversationId}`
  ) {
    return providerResponse([]);
  }
  if (url.pathname.endsWith("/conversations") && method === "GET") {
    return providerResponse([conversation]);
  }
  if (url.pathname.endsWith("/conversations") && method === "DELETE") {
    return providerResponse(
      url.searchParams.get("id") === `eq.${otherUserConversationId}`
        ? []
        : [{ id: conversation.id }],
    );
  }
  if (url.pathname.endsWith("/messages") && method === "GET") {
    return providerResponse([
      {
        id: "b5a83406-5ce4-480c-bab8-7f8339592258",
        role: "user",
        content: "What is general health information?",
        citations: [],
        created_at: "2026-10-31T12:00:01.000Z",
      },
    ]);
  }
  if (url.pathname.endsWith("/messages") && method === "POST") {
    const body =
      init?.body ??
      (request ? await request.clone().text() : "");
    const inserted = JSON.parse(String(body)) as Array<Record<string, unknown>>;
    return providerResponse(
      inserted.map((message, index) => ({
        ...message,
        id:
          index === 0
            ? "b5a83406-5ce4-480c-bab8-7f8339592258"
            : "c72c6313-9bc5-4e51-9eb3-7e870aad59b8",
      })),
    );
  }

  return providerResponse({ message: "Unexpected test request." }, 500);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authenticated conversation routes", () => {
  it("creates and lists conversations through the user-scoped client", async () => {
    const fetcher = vi.fn<typeof fetch>(conversationFetch);
    const { app } = createTestApp(fetcher);

    const created = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", "Bearer test-user-access-token")
      .send({});
    const listed = await request(app)
      .get("/api/v1/conversations")
      .set("Authorization", "Bearer test-user-access-token");

    expect(created.status).toBe(201);
    expect(created.body.conversation).toMatchObject({
      id: conversation.id,
    });
    expect(listed.status).toBe(200);
    expect(listed.body.conversations).toEqual([conversation]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const createCall = fetcher.mock.calls.find(
      ([input, init]) =>
        new URL(input instanceof Request ? input.url : String(input)).pathname.endsWith(
          "/conversations",
        ) &&
        (init?.method ??
          (input instanceof Request ? input.method : undefined)) === "POST",
    );
    const createRequest =
      createCall?.[0] instanceof Request ? createCall[0] : null;
    const createBody =
      createCall?.[1]?.body ??
      (createRequest ? await createRequest.clone().text() : "");
    expect(JSON.parse(String(createBody))).toEqual({ user_id: userId });

    for (const [input, init] of fetcher.mock.calls) {
      const request = input instanceof Request ? input : null;
      expect(request?.url ?? String(input)).toContain(
        "/rest/v1/conversations",
      );
      const headers = new Headers(init?.headers ?? request?.headers);
      expect(headers.get("authorization")).toBe(
        "Bearer test-user-access-token",
      );
      expect(headers.get("apikey")).toBe("test-publishable-key");
    }
  });

  it("retrieves a conversation and orders its messages by timestamp", async () => {
    const fetcher = vi.fn<typeof fetch>(conversationFetch);
    const { app } = createTestApp(fetcher);

    const response = await request(app)
      .get(`/api/v1/conversations/${conversation.id}`)
      .set("Authorization", "Bearer test-user-access-token");

    expect(response.status).toBe(200);
    expect(response.body.conversation.id).toBe(conversation.id);
    expect(response.body.messages).toHaveLength(1);
    expect(response.body.messages[0].role).toBe("user");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not reveal a conversation owned by another user", async () => {
    const fetcher = vi.fn<typeof fetch>(conversationFetch);
    const { app } = createTestApp(fetcher);

    const response = await request(app)
      .get(`/api/v1/conversations/${otherUserConversationId}`)
      .set("Authorization", "Bearer test-user-access-token");

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("CONVERSATION_NOT_FOUND");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed conversation IDs before issuing a database request", async () => {
    const fetcher = vi.fn<typeof fetch>(conversationFetch);
    const { app } = createTestApp(fetcher);

    const response = await request(app)
      .get("/api/v1/conversations/not-a-uuid")
      .set("Authorization", "Bearer test-user-access-token");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("persists the question and grounded answer with citations", async () => {
    const fetcher = vi.fn<typeof fetch>(conversationFetch);
    const { app, answer } = createTestApp(fetcher);

    const response = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", "Bearer test-user-access-token")
      .send({ question: "  What is general health information?  " });

    expect(response.status).toBe(200);
    expect(response.body.messages).toHaveLength(2);
    expect(response.body.messages[0]).toMatchObject({
      role: "user",
      content: "What is general health information?",
    });
    expect(response.body.messages[1]).toMatchObject({
      role: "assistant",
      content: "Information from an approved source.",
      citations: [citation],
    });
    expect(response.body.citations).toEqual([citation]);
    expect(answer).toHaveBeenCalledWith(
      { question: "What is general health information?", language: "en" },
      expect.any(String),
    );
    const insertCall = fetcher.mock.calls.find(
      ([input, init]) =>
        new URL(input instanceof Request ? input.url : String(input)).pathname.endsWith(
          "/messages",
        ) &&
        (init?.method ??
          (input instanceof Request ? input.method : undefined)) === "POST",
    );
    expect(insertCall).toBeDefined();
    const insertRequest =
      insertCall?.[0] instanceof Request ? insertCall[0] : null;
    const requestBody =
      insertCall?.[1]?.body ??
      (insertRequest ? await insertRequest.clone().text() : "");
    const inserted = JSON.parse(String(requestBody)) as Array<
      Record<string, unknown>
    >;
    expect(inserted.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(Date.parse(String(inserted[0].created_at))).toBeLessThan(
      Date.parse(String(inserted[1].created_at)),
    );
  });

  it("validates questions before invoking the AI service", async () => {
    const fetcher = vi.fn<typeof fetch>(conversationFetch);
    const { app, answer } = createTestApp(fetcher);

    const response = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", "Bearer test-user-access-token")
      .send({ question: " " });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(answer).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not persist a question when the AI service is unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>(conversationFetch);
    const answer = vi.fn().mockRejectedValue(
      new HealthEducationServiceError("unavailable"),
    );
    const { app } = createTestApp(fetcher, answer);

    const response = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", "Bearer test-user-access-token")
      .send({ question: "What is general health information?" });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("AI_SERVICE_UNAVAILABLE");
    expect(
      fetcher.mock.calls.some(
        ([input, init]) =>
          new URL(input instanceof Request ? input.url : String(input)).pathname.endsWith(
            "/messages",
          ) &&
          (init?.method ??
            (input instanceof Request ? input.method : undefined)) === "POST",
      ),
    ).toBe(false);
  });

  it("deletes only visible conversations and hides foreign IDs", async () => {
    const fetcher = vi.fn<typeof fetch>(conversationFetch);
    const { app } = createTestApp(fetcher);

    const deleted = await request(app)
      .delete(`/api/v1/conversations/${conversation.id}`)
      .set("Authorization", "Bearer test-user-access-token");
    const foreign = await request(app)
      .delete(`/api/v1/conversations/${otherUserConversationId}`)
      .set("Authorization", "Bearer test-user-access-token");

    expect(deleted.status).toBe(204);
    expect(foreign.status).toBe(404);
  });
});
