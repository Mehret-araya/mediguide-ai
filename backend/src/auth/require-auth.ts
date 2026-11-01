import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextFunction, Request, Response } from "express";
import {
  SupabaseAuthClient,
  SupabaseAuthError,
  type AuthUser,
} from "./supabase-auth.js";
import { createUserSupabaseClient } from "./user-supabase-client.js";

declare global {
  namespace Express {
    interface Request {
      supabase?: SupabaseClient;
      user?: AuthUser;
    }
  }
}

const ACCESS_COOKIE = "mediguide_access";
const MAX_ACCESS_TOKEN_LENGTH = 4096;

type UserClientFactory = (accessToken: string) => SupabaseClient;

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

function getAccessToken(req: Request): string | null {
  const authorization = req.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+([^\s]+)$/iu)?.[1];
  const token = bearer ?? getCookie(req, ACCESS_COOKIE);

  if (!token || token.length > MAX_ACCESS_TOKEN_LENGTH) {
    return null;
  }

  return token;
}

function unauthorized(res: Response): void {
  res.status(401).json({
    status: "error",
    code: "UNAUTHORIZED",
    message: "A valid session is required.",
  });
}

export function requireAuthenticatedUser(
  auth: Pick<SupabaseAuthClient, "getUser"> = new SupabaseAuthClient(),
  createUserClient: UserClientFactory = createUserSupabaseClient,
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req, res, next) => {
    const accessToken = getAccessToken(req);

    if (!accessToken) {
      unauthorized(res);
      return;
    }

    try {
      const user = await auth.getUser(accessToken);

      if (!user) {
        unauthorized(res);
        return;
      }

      req.user = user;
      req.supabase = createUserClient(accessToken);
      next();
    } catch (error) {
      if (error instanceof SupabaseAuthError) {
        res.status(error.statusCode).json({
          status: "error",
          code: error.code,
          message: error.message,
        });
        return;
      }

      next(error);
    }
  };
}
