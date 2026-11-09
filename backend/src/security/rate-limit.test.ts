import express from "express";
import { rateLimit } from "express-rate-limit";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authCredentialLimiter,
  authSessionLimiter,
  conversationWriteLimiter,
  facilitySearchLimiter,
  healthEducationLimiter,
} from "./rate-limit.js";

/**
 * Rate-limit tests bypass the skip-in-test guard by building fresh limiter
 * instances directly (not the module-level exports) so enforcement is active.
 * The skip-in-test behaviour is tested separately using the module exports.
 */

function makeLimiter(limit: number, windowMs = 60_000) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler(_req: express.Request, res: express.Response) {
      res.status(429).json({
        status: "error",
        code: "RATE_LIMITED",
        message: "Too many requests. Please wait before trying again.",
      });
    },
  });
}

function makeApp(limit: number, method: "get" | "post" | "delete" = "post") {
  const app = express();
  const limiter = makeLimiter(limit);
  app[method]("/test", limiter, (_req, res) => {
    res.status(200).json({ status: "ok" });
  });
  return app;
}

describe("rate limiting", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows requests below the limit", async () => {
    const app = makeApp(3);

    const responses = await Promise.all([
      request(app).post("/test"),
      request(app).post("/test"),
      request(app).post("/test"),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(200);
    }
  });

  it("returns 429 after the limit is exceeded", async () => {
    const app = makeApp(2);

    await request(app).post("/test");
    await request(app).post("/test");
    const over = await request(app).post("/test");

    expect(over.status).toBe(429);
    expect(over.body).toEqual({
      status: "error",
      code: "RATE_LIMITED",
      message: "Too many requests. Please wait before trying again.",
    });
  });

  it("includes RateLimit headers on responses", async () => {
    const app = makeApp(5);

    const response = await request(app).post("/test");

    expect(response.status).toBe(200);
    // draft-8 combines limit/remaining/reset into a single "ratelimit" header
    expect(response.headers["ratelimit"]).toBeDefined();
    expect(response.headers["ratelimit-policy"]).toBeDefined();
  });

  it("includes Retry-After header on 429 responses", async () => {
    const app = makeApp(1);

    await request(app).post("/test");
    const over = await request(app).post("/test");

    expect(over.status).toBe(429);
    expect(over.headers["retry-after"]).toBeDefined();
  });

  it("does not expose internal details in 429 response body", async () => {
    const app = makeApp(1);

    await request(app).post("/test");
    const over = await request(app).post("/test");

    expect(over.status).toBe(429);
    expect(over.text).not.toContain("stack");
    expect(over.text).not.toContain("Error");
    expect(over.text).not.toContain("127.0.0.1");
    expect(over.text).not.toContain("windowMs");
  });

  it("blocks the second request when limit is 1", async () => {
    const app = makeApp(1);

    const first = await request(app).post("/test");
    expect(first.status).toBe(200);

    const second = await request(app).post("/test");
    expect(second.status).toBe(429);
  });

  it("skips rate limiting in the test environment", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");

    const app = express();
    app.post("/test", authCredentialLimiter, (_req, res) => {
      res.status(200).json({ status: "ok" });
    });

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => request(app).post("/test")),
    );

    for (const response of responses) {
      expect(response.status).toBe(200);
    }
  });

  it("all exported limiters are middleware functions", () => {
    expect(typeof authCredentialLimiter).toBe("function");
    expect(typeof authSessionLimiter).toBe("function");
    expect(typeof conversationWriteLimiter).toBe("function");
    expect(typeof facilitySearchLimiter).toBe("function");
    expect(typeof healthEducationLimiter).toBe("function");
  });
});
