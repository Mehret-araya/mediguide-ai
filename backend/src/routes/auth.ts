import { Router, type NextFunction, type Request, type Response } from "express";
import {
  SupabaseAuthClient,
  SupabaseAuthError,
} from "../auth/supabase-auth.js";
import {
  isAllowedBrowserOrigin as isAllowedOrigin,
} from "../security/browser-origins.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const ACCESS_COOKIE = "mediguide_access";
const REFRESH_COOKIE = "mediguide_refresh";
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const ACCESS_COOKIE_PATH = "/api/v1";
const REFRESH_COOKIE_PATH = "/api/v1/auth";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function cookieOptions(path: string, maxAge?: number) {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax" as const,
    path,
    ...(maxAge === undefined ? {} : { maxAge }),
  };
}

function getCookie(req: Request, name: string): string | null {
  const cookieHeader = req.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");

    if (separator < 0 || part.slice(0, separator).trim() !== name) {
      continue;
    }

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

function isAllowedBrowserOrigin(req: Request): boolean {
  const origin = req.get("origin");
  return isAllowedOrigin(origin);
}

function validateBrowserOrigin(req: Request, res: Response): boolean {
  if (!isAllowedBrowserOrigin(req)) {
    res.status(403).json({
      status: "error",
      code: "ORIGIN_NOT_ALLOWED",
      message: "This origin is not allowed to access the API.",
    });
    return false;
  }

  return true;
}

function usesCookieSession(req: Request): boolean {
  return getCookie(req, ACCESS_COOKIE) !== null;
}

export function validateCookieMutationOrigin(
  req: Request,
  res: Response,
): boolean {
  if (usesCookieSession(req) && !req.get("origin")) {
    res.status(403).json({
      status: "error",
      code: "ORIGIN_REQUIRED",
      message: "A valid browser origin is required for this request.",
    });
    return false;
  }

  return validateBrowserOrigin(req, res);
}

function setSessionCookies(
  res: Response,
  session: { accessToken: string; refreshToken: string; expiresIn: number },
): void {
  res.cookie(
    ACCESS_COOKIE,
    session.accessToken,
    cookieOptions(ACCESS_COOKIE_PATH, session.expiresIn * 1000),
  );
  res.cookie(
    REFRESH_COOKIE,
    session.refreshToken,
    cookieOptions(REFRESH_COOKIE_PATH, REFRESH_COOKIE_MAX_AGE),
  );
}

function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, cookieOptions(ACCESS_COOKIE_PATH));
  res.clearCookie(REFRESH_COOKIE, cookieOptions(REFRESH_COOKIE_PATH));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validationError(res: Response, message: string): void {
  res.status(400).json({
    status: "error",
    code: "VALIDATION_ERROR",
    message,
  });
}

function handleAuthError(
  error: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (!(error instanceof SupabaseAuthError)) {
    next(error);
    return;
  }

  res.status(error.statusCode).json({
    status: "error",
    code: error.code,
    message: error.message,
  });
}

function getBearerToken(req: Request): string | null {
  const authorization = req.get("authorization");
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/iu);
  return match?.[1] ?? null;
}

function getAccessToken(req: Request): string | null {
  return getBearerToken(req) ?? getCookie(req, ACCESS_COOKIE);
}

function getCredentials(
  body: unknown,
): { email: string; password: string } | null {
  if (!isRecord(body)) {
    return null;
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = body.password;

  if (
    email.length === 0 ||
    email.length > 254 ||
    !EMAIL_PATTERN.test(email) ||
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128
  ) {
    return null;
  }

  return { email, password };
}

export function createAuthRouter(
  auth = new SupabaseAuthClient(),
): Router {
  const router = Router();

  router.post("/register", async (req, res, next) => {
    if (!validateBrowserOrigin(req, res)) {
      return;
    }

    const credentials = getCredentials(req.body);
    const name =
      isRecord(req.body) && typeof req.body.name === "string"
        ? req.body.name.trim()
        : "";

    if (
      !credentials ||
      name.length === 0 ||
      Array.from(name).length > 80 ||
      /[\u0000-\u001f\u007f]/u.test(name)
    ) {
      validationError(
        res,
        "Provide a valid email, a password of 12 to 128 characters, and a name of at most 80 characters.",
      );
      return;
    }

    try {
      await auth.register(credentials.email, credentials.password, name);
      res.status(202).json({
        status: "ok",
        message:
          "If the address can be registered, the request was accepted. Check your email if confirmation is enabled.",
      });
    } catch (error) {
      handleAuthError(error, res, next);
    }
  });

  router.post("/login", async (req, res, next) => {
    if (!validateBrowserOrigin(req, res)) {
      return;
    }

    const credentials = getCredentials(req.body);

    if (!credentials) {
      validationError(
        res,
        "Provide a valid email and a password of 12 to 128 characters.",
      );
      return;
    }

    try {
      const session = await auth.login(
        credentials.email,
        credentials.password,
      );
      setSessionCookies(res, session);
      res.status(200).json({ status: "ok", user: session.user });
    } catch (error) {
      handleAuthError(error, res, next);
    }
  });

  router.post("/refresh", async (req, res, next) => {
    if (!validateCookieMutationOrigin(req, res)) {
      return;
    }

    const refreshToken = getCookie(req, REFRESH_COOKIE);

    if (!refreshToken || refreshToken.length > 4096) {
      res.status(401).json({
        status: "error",
        code: "UNAUTHORIZED",
        message: "A valid session is required.",
      });
      return;
    }

    try {
      const session = await auth.refresh(refreshToken);
      setSessionCookies(res, session);
      res.status(200).json({ status: "ok", user: session.user });
    } catch (error) {
      if (error instanceof SupabaseAuthError && error.statusCode === 401) {
        clearSessionCookies(res);
      }
      handleAuthError(error, res, next);
    }
  });

  router.post("/logout", async (req, res, next) => {
    if (!validateCookieMutationOrigin(req, res)) {
      return;
    }

    const accessToken = getAccessToken(req);

    if (!accessToken) {
      res.status(401).json({
        status: "error",
        code: "UNAUTHORIZED",
        message: "A valid session is required.",
      });
      return;
    }

    try {
      await auth.logout(accessToken);
      clearSessionCookies(res);
      res.status(204).end();
    } catch (error) {
      if (error instanceof SupabaseAuthError && error.statusCode === 401) {
        clearSessionCookies(res);
      }
      handleAuthError(error, res, next);
    }
  });

  router.get("/me", async (req, res, next) => {
    const accessToken = getAccessToken(req);

    if (!accessToken) {
      res.status(401).json({
        status: "error",
        code: "UNAUTHORIZED",
        message: "A valid session is required.",
      });
      return;
    }

    try {
      const user = await auth.getUser(accessToken);

      if (!user) {
        res.status(401).json({
          status: "error",
          code: "UNAUTHORIZED",
          message: "A valid session is required.",
        });
        return;
      }

      res.status(200).json({ status: "ok", user });
    } catch (error) {
      handleAuthError(error, res, next);
    }
  });

  router.delete("/account", async (req, res, next) => {
    if (!validateCookieMutationOrigin(req, res)) {
      return;
    }

    const accessToken = getAccessToken(req);

    if (!accessToken) {
      res.status(401).json({
        status: "error",
        code: "UNAUTHORIZED",
        message: "A valid session is required.",
      });
      return;
    }

    try {
      const user = await auth.getUser(accessToken);

      if (!user) {
        res.status(401).json({
          status: "error",
          code: "UNAUTHORIZED",
          message: "A valid session is required.",
        });
        return;
      }

      await auth.deleteUser(user.id);
      clearSessionCookies(res);
      res.status(204).end();
    } catch (error) {
      handleAuthError(error, res, next);
    }
  });

  return router;
}

export default createAuthRouter;
