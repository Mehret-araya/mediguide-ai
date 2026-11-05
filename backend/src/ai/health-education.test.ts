import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import {
  HealthEducationClient,
  parseHealthEducationRequest,
  parseHealthEducationResponse,
  type HealthEducationResponse,
} from "./health-education.js";

function responseBody(requestId: string): HealthEducationResponse {
  return {
    answer: "Retrieved source passages:\n\nTest source passage.",
    language: "en",
    citations: [
      {
        sourceId: "approved-source",
        title: "Verified source title",
        publisher: "Verified publisher",
        url: "https://health.example.org/source",
        section: "Overview",
      },
    ],
    limitations: [
      "This is general health information, not a diagnosis.",
      "The source has a documented scope limitation.",
    ],
    requestId,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("health education backend-to-AI integration", () => {
  it("rejects zero, negative, and non-finite timeout values at construction", () => {
    expect(() => new HealthEducationClient({ timeoutMs: 0 })).toThrow(RangeError);
    expect(() => new HealthEducationClient({ timeoutMs: -1 })).toThrow(RangeError);
    expect(() => new HealthEducationClient({ timeoutMs: Infinity })).toThrow(RangeError);
    expect(() => new HealthEducationClient({ timeoutMs: NaN })).toThrow(RangeError);
  });

  it("accepts a positive finite timeout without throwing", () => {
    expect(() => new HealthEducationClient({ timeoutMs: 1 })).not.toThrow();
    expect(() => new HealthEducationClient({ timeoutMs: 30000 })).not.toThrow();
  });

  it("returns 400 for an empty question", async () => {
    const client = new HealthEducationClient({
      serviceUrl: "https://ai.internal.example",
      serviceToken: "test-internal-token",
      fetchImplementation: vi.fn(),
    });

    const response = await request(createApp(client))
      .post("/api/v1/health-education")
      .send({ question: "   " });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for a question over 2000 characters", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const client = new HealthEducationClient({
      serviceUrl: "https://ai.internal.example",
      serviceToken: "test-internal-token",
      fetchImplementation,
    });

    const response = await request(createApp(client))
      .post("/api/v1/health-education")
      .send({ question: "q".repeat(2001) });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("validates and normalizes incoming requests against the AI contract", () => {
    expect(parseHealthEducationRequest({ question: "  What is malaria? " }))
      .toEqual({ question: "What is malaria?", language: "en" });
    expect(
      parseHealthEducationRequest({
        question: "What is malaria?",
        language: "am",
      }),
    ).toBeNull();
    expect(parseHealthEducationRequest({ question: " " })).toBeNull();
    expect(
      parseHealthEducationRequest({ question: "x".repeat(2001) }),
    ).toBeNull();
  });

  it("validates the AI response schema and request correlation", () => {
    const body = responseBody("request-id");
    expect(parseHealthEducationResponse(body, "request-id")).toEqual(body);
    expect(parseHealthEducationResponse(body, "different-request")).toBeNull();
    expect(
      parseHealthEducationResponse(
        {
          ...body,
          citations: [
            { ...body.citations[0], url: "http://untrusted.example/source" },
          ],
        },
        "request-id",
      ),
    ).toBeNull();
    expect(
      parseHealthEducationResponse(
        { ...body, limitations: [" "] },
        "request-id",
      ),
    ).toBeNull();
  });

  it("forwards to the private service and preserves citations and limitations", async () => {
    const upstreamFetch = vi.fn<typeof fetch>(async (_input, init) => {
      const requestId = new Headers(init?.headers).get("x-request-id");
      if (!requestId) throw new Error("Missing request ID");
      return jsonResponse(responseBody(requestId));
    });
    const client = new HealthEducationClient({
      serviceUrl: "https://ai.internal.example",
      serviceToken: "test-internal-token",
      fetchImplementation: upstreamFetch,
    });

    const response = await request(createApp(client))
      .post("/api/v1/health-education")
      .send({ question: "What is malaria?" });

    expect(response.status).toBe(200);
    expect(response.body.answer).toContain("Test source passage.");
    expect(response.body.citations).toEqual(responseBody(response.body.requestId).citations);
    expect(response.body.limitations).toEqual(
      responseBody(response.body.requestId).limitations,
    );
    expect(response.headers["x-request-id"]).toBe(response.body.requestId);
    expect(upstreamFetch).toHaveBeenCalledOnce();
    const [url, options] = upstreamFetch.mock.calls[0];
    expect(url?.toString()).toBe(
      "https://ai.internal.example/api/v1/health-education",
    );
    expect(new Headers(options?.headers).get("x-internal-service-token"))
      .toBe("test-internal-token");
    expect(new Headers(options?.headers).get("x-request-id"))
      .toBe(response.body.requestId);
    expect(options?.redirect).toBe("error");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects invalid client input without calling the AI service", async () => {
    const upstreamFetch = vi.fn<typeof fetch>();
    const client = new HealthEducationClient({
      serviceUrl: "http://localhost:8000",
      serviceToken: "test-internal-token",
      fetchImplementation: upstreamFetch,
    });

    const response = await request(createApp(client))
      .post("/api/v1/health-education")
      .send({ question: "What is malaria?", language: "am" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(response.headers["x-request-id"]).toBeTruthy();
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("fails closed when the private URL or shared token is not configured", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    for (const client of [
      new HealthEducationClient({ fetchImplementation }),
      new HealthEducationClient({
        serviceUrl: "http://ai.internal.example",
        serviceToken: "test-internal-token",
        fetchImplementation,
      }),
      new HealthEducationClient({
        serviceUrl: "https://ai.internal.example",
        serviceToken: "",
        fetchImplementation,
      }),
    ]) {
      const response = await request(createApp(client))
        .post("/api/v1/health-education")
        .send({ question: "What is malaria?" });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe(
        "Health information is temporarily unavailable.",
      );
    }
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("does not allow insecure loopback URLs in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const fetchImplementation = vi.fn<typeof fetch>();
      const client = new HealthEducationClient({
        serviceUrl: "http://127.0.0.1:8000",
        serviceToken: "test-internal-token",
        fetchImplementation,
      });

      const response = await request(createApp(client))
        .post("/api/v1/health-education")
        .send({ question: "What is malaria?" });

      expect(response.status).toBe(503);
      expect(fetchImplementation).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("returns a generic timeout response without forwarding error details", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => {
      throw new DOMException("contains private endpoint", "TimeoutError");
    });
    const client = new HealthEducationClient({
      serviceUrl: "http://127.0.0.1:8000",
      serviceToken: "test-internal-token",
      fetchImplementation,
    });

    const response = await request(createApp(client))
      .post("/api/v1/health-education")
      .send({ question: "What is malaria?" });

    expect(response.status).toBe(504);
    expect(response.body.code).toBe("AI_SERVICE_TIMEOUT");
    expect(response.text).not.toContain("private endpoint");
    expect(response.text).not.toContain("127.0.0.1");
  });

  it("rejects malformed or mismatched AI responses safely", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (_input, init) => {
      const requestId = new Headers(init?.headers).get("x-request-id") ?? "";
      return jsonResponse({
        ...responseBody(requestId),
        requestId: "wrong-correlation",
      });
    });
    const client = new HealthEducationClient({
      serviceUrl: "https://ai.internal.example",
      serviceToken: "test-internal-token",
      fetchImplementation,
    });

    const response = await request(createApp(client))
      .post("/api/v1/health-education")
      .send({ question: "What is malaria?" });

    expect(response.status).toBe(502);
    expect(response.body.code).toBe("AI_SERVICE_ERROR");
    expect(response.text).not.toContain("wrong-correlation");
  });

  it("normalizes upstream HTTP failures without exposing provider details", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      jsonResponse({ detail: "private token and upstream hostname" }, 500),
    );
    const client = new HealthEducationClient({
      serviceUrl: "https://ai.internal.example",
      serviceToken: "test-internal-token",
      fetchImplementation,
    });

    const response = await request(createApp(client))
      .post("/api/v1/health-education")
      .send({ question: "What is malaria?" });

    expect(response.status).toBe(502);
    expect(response.text).not.toContain("private token");
    expect(response.text).not.toContain("upstream hostname");
  });
});
