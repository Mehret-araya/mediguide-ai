import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";

export interface HealthEducationRequest {
  question: string;
  language: "en";
}

export interface HealthEducationCitation {
  sourceId: string;
  title: string;
  publisher: string;
  url: string;
  section?: string | null;
}

export interface HealthEducationResponse {
  answer: string;
  language: "en";
  citations: HealthEducationCitation[];
  limitations: string[];
  requestId: string;
}

type UpstreamFailureKind = "unavailable" | "timeout" | "upstream";

export class HealthEducationServiceError extends Error {
  constructor(readonly kind: UpstreamFailureKind) {
    super("Health education service request failed.");
    this.name = "HealthEducationServiceError";
  }
}

export interface HealthEducationClientOptions {
  serviceUrl?: string;
  serviceToken?: string;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeServiceUrl(
  value: string,
  allowLoopbackHttp: boolean,
): URL | null {
  try {
    const url = new URL(value);
    const isLoopback =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    if (
      url.protocol !== "https:" &&
      !(allowLoopbackHttp && url.protocol === "http:" && isLoopback)
    ) {
      return null;
    }
    if (url.username || url.password || url.search || url.hash) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function parseHealthEducationRequest(
  value: unknown,
): HealthEducationRequest | null {
  if (!isRecord(value) || typeof value.question !== "string") {
    return null;
  }
  const question = value.question.trim();
  if (
    question.length === 0 ||
    question.length > 2000 ||
    (value.language !== undefined && value.language !== "en")
  ) {
    return null;
  }
  return { question, language: "en" };
}

export function parseHealthEducationResponse(
  value: unknown,
  expectedRequestId: string,
): HealthEducationResponse | null {
  if (
    !isRecord(value) ||
    typeof value.answer !== "string" ||
    value.answer.trim().length === 0 ||
    value.language !== "en" ||
    !Array.isArray(value.citations) ||
    !Array.isArray(value.limitations) ||
    !value.limitations.every(isNonEmptyString) ||
    value.requestId !== expectedRequestId
  ) {
    return null;
  }

  const citations: HealthEducationCitation[] = [];
  for (const citation of value.citations) {
    const section = isRecord(citation) ? citation.section : undefined;
    if (
      !isRecord(citation) ||
      !isNonEmptyString(citation.sourceId) ||
      !isNonEmptyString(citation.title) ||
      !isNonEmptyString(citation.publisher) ||
      typeof citation.url !== "string"
    ) {
      return null;
    }
    let url: URL;
    try {
      url = new URL(citation.url);
    } catch {
      return null;
    }
    if (url.protocol !== "https:") {
      return null;
    }
    if (
      section !== undefined &&
      section !== null &&
      typeof section !== "string"
    ) {
      return null;
    }
    citations.push({
      sourceId: citation.sourceId,
      title: citation.title,
      publisher: citation.publisher,
      url: citation.url,
      ...(section === undefined ? {} : { section }),
    });
  }

  return {
    answer: value.answer,
    language: "en",
    citations,
    limitations: value.limitations,
    requestId: expectedRequestId,
  };
}

export class HealthEducationClient {
  private readonly serviceUrl: URL | null;
  private readonly serviceToken: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: HealthEducationClientOptions = {}) {
    const configuredUrl = options.serviceUrl ?? process.env.AI_SERVICE_URL;
    this.serviceUrl = isNonEmptyString(configuredUrl)
      ? isSafeServiceUrl(
          configuredUrl,
          process.env.NODE_ENV !== "production",
        )
      : null;
    this.serviceToken = options.serviceToken ?? process.env.AI_SERVICE_TOKEN;
    const rawTimeout = options.timeoutMs ?? 8000;
    if (!Number.isFinite(rawTimeout) || rawTimeout <= 0) {
      throw new RangeError(
        `HealthEducationClient timeoutMs must be a positive finite number, got ${rawTimeout}.`,
      );
    }
    this.timeoutMs = rawTimeout;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async answer(
    request: HealthEducationRequest,
    requestId: string,
  ): Promise<HealthEducationResponse> {
    if (!this.serviceUrl || !isNonEmptyString(this.serviceToken)) {
      throw new HealthEducationServiceError("unavailable");
    }

    let response: globalThis.Response;
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    try {
      response = await this.fetchImplementation(
        new URL("/api/v1/health-education", this.serviceUrl),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-internal-service-token": this.serviceToken,
            "x-request-id": requestId,
          },
          body: JSON.stringify(request),
          signal: timeoutSignal,
          redirect: "error",
        },
      );
    } catch (error) {
      if (
        timeoutSignal.aborted ||
        (error instanceof Error && error.name === "TimeoutError")
      ) {
        throw new HealthEducationServiceError("timeout");
      }
      throw new HealthEducationServiceError("unavailable");
    }

    if (!response.ok) {
      throw new HealthEducationServiceError("upstream");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (timeoutSignal.aborted) {
        throw new HealthEducationServiceError("timeout");
      }
      throw new HealthEducationServiceError("upstream");
    }

    const parsed = parseHealthEducationResponse(body, requestId);
    if (!parsed) {
      throw new HealthEducationServiceError("upstream");
    }
    return parsed;
  }
}

function sendFailure(
  response: Response,
  requestId: string,
  error: HealthEducationServiceError,
): void {
  const details = {
    status: "error",
    requestId,
  };

  if (error.kind === "timeout") {
    response.status(504).json({
      ...details,
      code: "AI_SERVICE_TIMEOUT",
      message: "Health information is temporarily taking too long to retrieve.",
    });
    return;
  }

  response.status(error.kind === "upstream" ? 502 : 503).json({
    ...details,
    code: error.kind === "upstream" ? "AI_SERVICE_ERROR" : "AI_SERVICE_UNAVAILABLE",
    message: "Health information is temporarily unavailable.",
  });
}

export function createHealthEducationRouter(
  client = new HealthEducationClient(),
): Router {
  const router = Router();

  router.post("/", async (request: Request, response: Response) => {
    const requestId = randomUUID().replaceAll("-", "");
    response.setHeader("X-Request-ID", requestId);

    const parsedRequest = parseHealthEducationRequest(request.body);
    if (!parsedRequest) {
      response.status(400).json({
        status: "error",
        code: "VALIDATION_ERROR",
        message: "The health education request could not be accepted.",
        requestId,
      });
      return;
    }

    try {
      const result = await client.answer(parsedRequest, requestId);
      response.status(200).json(result);
    } catch (error) {
      const serviceError =
        error instanceof HealthEducationServiceError
          ? error
          : new HealthEducationServiceError("upstream");
      console.error("Health education upstream request failed:", {
        requestId,
        failure: serviceError.kind,
      });
      sendFailure(response, requestId, serviceError);
    }
  });

  return router;
}
