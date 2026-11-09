/**
 * Application-level rate limiting.
 *
 * Uses express-rate-limit with the default in-memory store.
 *
 * OPERATIONAL LIMITATION: The in-memory store is per-process. If the backend
 * runs as multiple instances (e.g. behind a load balancer), each instance
 * maintains its own counter and the effective limit per client is multiplied
 * by the number of instances. Before scaling horizontally, replace the store
 * with a shared Redis-backed store (e.g. rate-limit-redis) and configure
 * `app.set("trust proxy", 1)` to read the real client IP from X-Forwarded-For.
 *
 * PROXY CONFIGURATION: `trust proxy` is NOT set by default. req.ip is the
 * direct TCP connection address, which is safe and correct for a single-instance
 * deployment without a reverse proxy. If a trusted reverse proxy is placed in
 * front of the backend, set `app.set("trust proxy", 1)` in app.ts and verify
 * that the proxy strips or overwrites X-Forwarded-For before enabling it.
 * Never set `trust proxy` to `true` (trusts all proxies) in production.
 *
 * TEST ENVIRONMENT: All limiters are disabled (windowMs=0, limit=0 means
 * express-rate-limit skips enforcement) when NODE_ENV=test so existing tests
 * are unaffected. The skip function returns true for test environments.
 */

import { rateLimit, type Options } from "express-rate-limit";
import type { Request, Response } from "express";

function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === "test";
}

function skipInTest(_req: Request): boolean {
  return isTestEnvironment();
}

function rateLimitResponse(_req: Request, res: Response): void {
  res.status(429).json({
    status: "error",
    code: "RATE_LIMITED",
    message: "Too many requests. Please wait before trying again.",
  });
}

const BASE_OPTIONS: Partial<Options> = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: skipInTest,
  handler: rateLimitResponse,
};

/**
 * Strict limiter for authentication credential endpoints.
 * Applies to: POST /auth/register, POST /auth/login
 * 10 attempts per 15 minutes per IP.
 */
export const authCredentialLimiter = rateLimit({
  ...BASE_OPTIONS,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: undefined,
});

/**
 * Moderate limiter for session management endpoints.
 * Applies to: POST /auth/refresh, POST /auth/logout, GET /auth/me,
 *             DELETE /auth/account
 * 30 attempts per 15 minutes per IP.
 */
export const authSessionLimiter = rateLimit({
  ...BASE_OPTIONS,
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: undefined,
});

/**
 * Limiter for AI health-education requests.
 * Applies to: POST /health-education
 * 20 requests per minute per IP.
 * Lower than conversation messaging because each request calls the AI service.
 */
export const healthEducationLimiter = rateLimit({
  ...BASE_OPTIONS,
  windowMs: 60 * 1000,
  limit: 20,
  message: undefined,
});

/**
 * Limiter for conversation write operations.
 * Applies to: POST /conversations, POST /conversations/:id/messages
 * 30 requests per minute per IP.
 */
export const conversationWriteLimiter = rateLimit({
  ...BASE_OPTIONS,
  windowMs: 60 * 1000,
  limit: 30,
  message: undefined,
});

/**
 * Limiter for facility search.
 * Applies to: GET /facilities
 * 60 requests per minute per IP (read-only, no auth required).
 */
export const facilitySearchLimiter = rateLimit({
  ...BASE_OPTIONS,
  windowMs: 60 * 1000,
  limit: 60,
  message: undefined,
});
