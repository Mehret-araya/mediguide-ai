import express, { type RequestHandler } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerSupabaseClient } from "../auth/server-supabase-client.js";
import { createUserSupabaseClient } from "../auth/user-supabase-client.js";
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
const idempotencyKey = "10ec58c4-26b8-4efb-8501-2610e35b76f8";
const citation = {
  sourceId: "approved-source",
  title: "Reviewed health information",
  publisher: "Public health authority",
  url: "https://example.org/health-information",
  section: "Overview",
};

function providerResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createTestApp(options: {
  answer?: (
    input: { question: string; language: "en" },
    requestId: string,
  ) => Promise<HealthEducationResponse>;
  ownerExists?: boolean;
  authenticated?: boolean;
  serviceFailure?: boolean;
} = {}) {
  const storedMessages: Array<Record<string, unknown>> = [
    {
      id: "b5a83406-5ce4-480c-bab8-7f8339592258",
      conversation_id: conversation.id,
      role: "user",
      content: "Existing conversation message.",
      citations: [],
      limitations: [],
      created_at: "2026-10-31T12:00:01.000Z",
      idempotency_key: null,
    },
  ];
  let serviceFailure = options.serviceFailure ?? false;
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const requestObject = input instanceof Request ? input : null;
    const url = new URL(requestObject ? requestObject.url : String(input));
    const method = init?.method ?? requestObject?.method ?? "GET";

    if (url.pathname.endsWith("/conversations") && method === "GET") {
      const requestedId = url.searchParams.get("id");
      if (requestedId === `eq.${otherUserConversationId}`) {
        return providerResponse([]);
      }
      if (requestedId) {
        return providerResponse(
          options.ownerExists === false ? [] : [{ id: conversation.id }],
        );
      }
      return providerResponse([conversation]);
    }

    if (url.pathname.endsWith("/conversations") && method === "POST") {
      return providerResponse([conversation], 201);
    }

    if (url.pathname.endsWith("/conversations") && method === "DELETE") {
      return providerResponse(
        url.searchParams.get("id") === `eq.${otherUserConversationId}`
          ? []
          : [{ id: conversation.id }],
      );
    }

    if (url.pathname.endsWith("/messages") && method === "GET") {
      const requestedKey = url.searchParams.get("idempotency_key");
      const requestedConversation = url.searchParams.get("conversation_id");
      const messages = storedMessages.filter(
        (message) =>
          (!requestedConversation ||
            message.conversation_id === requestedConversation.replace(/^eq\./u, "")) &&
          (!requestedKey ||
            message.idempotency_key === requestedKey.replace(/^eq\./u, "")),
      );
      return providerResponse(messages);
    }

    if (url.pathname.endsWith("/messages") && method === "POST") {
      const body =
        init?.body ??
        (requestObject ? await requestObject.clone().text() : "");
      const payload = JSON.parse(String(body)) as
        | Record<string, unknown>
        | Array<Record<string, unknown>>;
      const rows = Array.isArray(payload) ? payload : [payload];
      const role = rows[0]?.role;
      const headers = new Headers(init?.headers ?? requestObject?.headers);
      if (
        role === "assistant" &&
        headers.get("apikey") === "test-service-role-key" &&
        serviceFailure
      ) {
        return providerResponse({ message: "private database failure" }, 500);
      }
      storedMessages.push(...rows);
      return providerResponse([], 201);
    }

    return providerResponse({ message: "Unexpected test request." }, 500);
  });
  vi.stubGlobal("fetch", fetcher);

  const supabase = createUserSupabaseClient("test-user-access-token", {
    SUPABASE_URL: "https://mediguide-test.supabase.co",
    SUPABASE_ANON_KEY: "test-publishable-key",
  });
  const authenticate: RequestHandler = (req, res, next) => {
    if (options.authenticated === false) {
      res.status(401).json({ code: "UNAUTHORIZED" });
      return;
    }
    req.user = { id: userId, email: "person@example.org" };
    req.supabase = supabase;
    next();
  };
  const answer =
    options.answer ??
    vi.fn(
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
    );
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/conversations",
    createConversationsRouter(
      { answer },
      authenticate,
      () =>
        createServerSupabaseClient({
          SUPABASE_URL: "https://mediguide-test.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
        }),
    ),
  );
  return {
    app,
    answer,
    fetcher,
    storedMessages,
    setServiceFailure(value: boolean) {
      serviceFailure = value;
    },
  };
}

function messageRequests(fetcher: ReturnType<typeof vi.fn<typeof fetch>>) {
  return fetcher.mock.calls.filter(([input, init]) => {
    const requestObject = input instanceof Request ? input : null;
    const url = new URL(requestObject ? requestObject.url : String(input));
    return (
      url.pathname.endsWith("/messages") &&
      (init?.method ?? requestObject?.method) === "POST"
    );
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authenticated conversation routes", () => {
  it("uses the user-scoped client for the user's message and the server client for the assistant", async () => {
    const { app, fetcher } = createTestApp();

    const response = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ question: "What is general health information?" });

    expect(response.status).toBe(200);
    expect(response.body.messages.map((message: { role: string }) => message.role))
      .toEqual(["user", "assistant"]);
    expect(response.body.messages[1]).toMatchObject({
      role: "assistant",
      citations: [citation],
      limitations: ["General information only."],
    });

    const inserts = messageRequests(fetcher);
    expect(inserts).toHaveLength(2);
    const insertDetails = await Promise.all(
      inserts.map(async ([input, init]) => {
        const requestObject = input instanceof Request ? input : null;
        const headers = new Headers(init?.headers ?? requestObject?.headers);
        const body =
          init?.body ??
          (requestObject ? await requestObject.clone().text() : "");
        return {
          headers,
          body: JSON.parse(String(body)) as Record<string, unknown>,
        };
      }),
    );
    const userInsert = insertDetails.find(({ body }) => body.role === "user");
    const assistantInsert = insertDetails.find(
      ({ body }) => body.role === "assistant",
    );
    expect(userInsert?.headers.get("apikey")).toBe("test-publishable-key");
    expect(userInsert?.headers.get("authorization")).toBe(
      "Bearer test-user-access-token",
    );
    expect(assistantInsert?.headers.get("apikey")).toBe(
      "test-service-role-key",
    );
    expect(assistantInsert?.headers.get("authorization")).toBe(
      "Bearer test-service-role-key",
    );
    expect(userInsert?.body.idempotency_key).toBe(idempotencyKey);
    expect(assistantInsert?.body).toMatchObject({
      role: "assistant",
      citations: [citation],
      limitations: ["General information only."],
      idempotency_key: idempotencyKey,
    });
  });

  it("does not call AI or insert messages for another user's conversation", async () => {
    const { app, answer, fetcher } = createTestApp({ ownerExists: false });

    const response = await request(app)
      .post(`/api/v1/conversations/${otherUserConversationId}/messages`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ question: "What is general health information?" });

    expect(response.status).toBe(404);
    expect(answer).not.toHaveBeenCalled();
    expect(messageRequests(fetcher)).toHaveLength(0);
  });

  it("rejects malformed conversation IDs and idempotency keys", async () => {
    const { app, answer, fetcher } = createTestApp();

    const invalidConversation = await request(app)
      .post("/api/v1/conversations/not-a-uuid/messages")
      .set("Idempotency-Key", idempotencyKey)
      .send({ question: "A valid question" });
    const invalidKey = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Idempotency-Key", "not-a-uuid")
      .send({ question: "A valid question" });

    expect(invalidConversation.status).toBe(400);
    expect(invalidKey.status).toBe(400);
    expect(answer).not.toHaveBeenCalled();
    expect(messageRequests(fetcher)).toHaveLength(0);
  });

  it("rejects unauthenticated requests before accessing conversation data", async () => {
    const { app, fetcher } = createTestApp({ authenticated: false });

    const response = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ question: "A valid question" });

    expect(response.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not persist either message when the AI service fails", async () => {
    const answer = vi
      .fn()
      .mockRejectedValue(new HealthEducationServiceError("unavailable"));
    const { app, fetcher } = createTestApp({ answer });

    const response = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ question: "What is general health information?" });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("AI_SERVICE_UNAVAILABLE");
    expect(messageRequests(fetcher)).toHaveLength(0);
  });

  it("retries a failed assistant insert with the same key without duplicating the user message", async () => {
    const { app, fetcher, setServiceFailure, storedMessages } = createTestApp({
      serviceFailure: true,
    });
    const send = () =>
      request(app)
        .post(`/api/v1/conversations/${conversation.id}/messages`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ question: "What is general health information?" });

    const first = await send();
    expect(first.status).toBe(503);
    expect(first.body.code).toBe("CONVERSATION_STORAGE_UNAVAILABLE");
    expect(first.body.message).not.toContain("test-service-role-key");

    setServiceFailure(false);
    const retry = await send();

    expect(retry.status).toBe(200);
    expect(
      storedMessages.filter(
        (message) => message.idempotency_key === idempotencyKey,
      ),
    ).toHaveLength(2);
    expect(
      storedMessages.filter(
        (message) =>
          message.idempotency_key === idempotencyKey &&
          message.role === "user",
      ),
    ).toHaveLength(1);
    expect(messageRequests(fetcher)).toHaveLength(3);
  });

  it("replays a completed request without inserting duplicates or calling AI again", async () => {
    const { app, answer, fetcher } = createTestApp();
    const send = () =>
      request(app)
        .post(`/api/v1/conversations/${conversation.id}/messages`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ question: "What is general health information?" });

    const first = await send();
    const replay = await send();

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body.messages).toEqual(first.body.messages);
    expect(replay.body.requestId).toBe(first.body.requestId);
    expect(answer).toHaveBeenCalledOnce();
    expect(messageRequests(fetcher)).toHaveLength(2);
  });

  it("rejects reusing a request key for a different question", async () => {
    const { app, answer, fetcher } = createTestApp();
    const first = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ question: "First health question?" });
    const reused = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ question: "A different health question?" });

    expect(first.status).toBe(200);
    expect(reused.status).toBe(409);
    expect(reused.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(answer).toHaveBeenCalledOnce();
    expect(messageRequests(fetcher)).toHaveLength(2);
  });

  it("does not expose service-role configuration in logged errors", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, setServiceFailure } = createTestApp({ serviceFailure: true });

    const response = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ question: "What is general health information?" });

    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("test-service-role-key");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(
      "test-service-role-key",
    );
    errorLog.mockRestore();
    setServiceFailure(false);
  });
});
