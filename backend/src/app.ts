import "dotenv/config";
import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import {
  createHealthEducationRouter,
  HealthEducationClient,
} from "./ai/health-education.js";
import createAuthRouter from "./routes/auth.js";
import { createConversationsRouter } from "./routes/conversations.js";
import educationRouter from "./routes/education.js";
import { createFacilitiesRouter } from "./routes/facilities.js";

// Handle unexpected errors without exposing internal details.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) {
    return;
  }

  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      status: "error",
      message: "The request contains invalid JSON.",
    });
    return;
  }

  if (err instanceof Error && err.message === "Origin not allowed by CORS") {
    res.status(403).json({
      status: "error",
      message: "This origin is not allowed to access the API.",
    });
    return;
  }

  const errorStatus =
    typeof err === "object" && err !== null && "status" in err
      ? err.status
      : undefined;
  const errorType =
    typeof err === "object" && err !== null && "type" in err
      ? err.type
      : undefined;

  if (errorStatus === 413 || errorType === "entity.too.large") {
    res.status(413).json({
      status: "error",
      message: "The request body exceeds the allowed size.",
    });
    return;
  }

  console.error(
    "Unexpected API error:",
    err instanceof Error ? err.name : "UnknownError",
  );

  res.status(500).json({
    status: "error",
    message: "An unexpected server error occurred.",
  });
};

export function createApp(
  healthEducationClient = new HealthEducationClient(),
) {
  const app = express();

  const allowedOrigins = (
    process.env.FRONTEND_URL || "http://localhost:5173"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(helmet());

  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("Origin not allowed by CORS"));
      },
    }),
  );

  app.use(express.json({ limit: "10kb" }));

  app.use("/api/v1/education", educationRouter);
  app.use("/api/v1/conversations", createConversationsRouter());
  app.use("/api/v1/facilities", createFacilitiesRouter());
  app.use(
    "/api/v1/health-education",
    createHealthEducationRouter(healthEducationClient),
  );
  app.use("/api/v1/auth", createAuthRouter());

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      service: "MediGuide AI backend",
      message: "Backend server is running.",
    });
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      status: "error",
      message: "The requested endpoint was not found.",
    });
  });

  app.use(errorHandler);

  return app;
}

const app = createApp();

export default app;
