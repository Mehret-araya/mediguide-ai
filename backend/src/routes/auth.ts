import { Router, type NextFunction, type Request, type Response } from "express";
import {
  SupabaseAuthClient,
  SupabaseAuthError,
} from "../auth/supabase-auth.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

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
      res.status(200).json({ status: "ok", session });
    } catch (error) {
      handleAuthError(error, res, next);
    }
  });

  router.post("/refresh", async (req, res, next) => {
    const refreshToken =
      isRecord(req.body) && typeof req.body.refreshToken === "string"
        ? req.body.refreshToken
        : "";

    if (refreshToken.length === 0 || refreshToken.length > 4096) {
      validationError(res, "Provide a valid refresh token.");
      return;
    }

    try {
      const session = await auth.refresh(refreshToken);
      res.status(200).json({ status: "ok", session });
    } catch (error) {
      handleAuthError(error, res, next);
    }
  });

  router.post("/logout", async (req, res, next) => {
    const accessToken = getBearerToken(req);

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
      res.status(204).end();
    } catch (error) {
      handleAuthError(error, res, next);
    }
  });

  router.get("/me", async (req, res, next) => {
    const accessToken = getBearerToken(req);

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
    const accessToken = getBearerToken(req);

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
      res.status(204).end();
    } catch (error) {
      handleAuthError(error, res, next);
    }
  });

  return router;
}

export default createAuthRouter;
