
import "dotenv/config";
import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import educationRouter from "./routes/education.js";

const app = express();

// Configure which frontend origins may call this API.
const allowedOrigins = (
  process.env.FRONTEND_URL || "http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests without an Origin header, such as local command-line tests.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS"));
    },
  }),
);

app.use(express.json({ limit: "10kb" }));

// Versioned general health education endpoints.
app.use("/api/v1/education", educationRouter);

// Process health check. This does not verify dependency readiness.
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "MediGuide AI backend",
    message: "Backend server is running.",
  });
});

// Return a consistent JSON response for unknown routes.
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    status: "error",
    message: "The requested endpoint was not found.",
  });
});

// Handle unexpected errors without exposing internal details.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
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

  console.error("Unexpected API error:", err);

  res.status(500).json({
    status: "error",
    message: "An unexpected server error occurred.",
  });
};

app.use(errorHandler);

export default app;
