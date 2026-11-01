import { randomUUID } from "node:crypto";
import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuthenticatedUser } from "../auth/require-auth.js";
import { createServerSupabaseClient } from "../auth/server-supabase-client.js";
import {
  HealthEducationClient,
  HealthEducationServiceError,
  type HealthEducationResponse,
} from "../ai/health-education.js";
import { validateCookieMutationOrigin } from "./auth.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IDEMPOTENCY_HEADER = "idempotency-key";

interface ConversationRecord {
  id: string;
  created_at: string;
  updated_at: string;
}

interface MessageRecord {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: HealthEducationResponse["citations"];
  limitations: string[];
  created_at: string;
  idempotency_key?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sendDatabaseFailure(
  response: Response,
  operation: string,
): void {
  console.error("Conversation persistence request failed:", { operation });
  response.status(503).json({
    status: "error",
    code: "CONVERSATION_STORAGE_UNAVAILABLE",
    message: "Conversation history is temporarily unavailable.",
  });
}

function getConversationId(request: Request): string | null {
  const id = request.params.id;
  return typeof id === "string" && UUID_PATTERN.test(id) ? id : null;
}

function getIdempotencyKey(request: Request): string | null {
  const key = request.get(IDEMPOTENCY_HEADER);
  return key && UUID_PATTERN.test(key) ? key : null;
}

function getQuestion(value: unknown): string | null {
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

  return question;
}

function sendValidationError(response: Response): void {
  response.status(400).json({
    status: "error",
    code: "VALIDATION_ERROR",
    message: "Provide a valid conversation ID or health question.",
  });
}

function sendNotFound(response: Response): void {
  response.status(404).json({
    status: "error",
    code: "CONVERSATION_NOT_FOUND",
    message: "The requested conversation was not found.",
  });
}

function isHealthEducationFailure(
  error: unknown,
): error is HealthEducationServiceError {
  return error instanceof HealthEducationServiceError;
}

export function createConversationsRouter(
  healthEducationClient: Pick<HealthEducationClient, "answer"> =
    new HealthEducationClient(),
  authenticate: RequestHandler = requireAuthenticatedUser(),
  createPrivilegedClient: () => SupabaseClient = createServerSupabaseClient,
): Router {
  const router = Router();
  router.use((request, response, next) => {
    if (
      (request.method === "POST" || request.method === "DELETE") &&
      !validateCookieMutationOrigin(request, response)
    ) {
      return;
    }

    next();
  });
  router.use(authenticate);

  router.post("/", async (request, response) => {
    const user = request.user;
    const supabase = request.supabase;
    if (!user || !supabase) {
      response.status(401).json({
        status: "error",
        code: "UNAUTHORIZED",
        message: "A valid session is required.",
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("conversations")
        .insert({ user_id: user.id })
        .select("id, created_at, updated_at")
        .single();

      if (error || !data) {
        sendDatabaseFailure(response, "create");
        return;
      }

      response.status(201).json({
        status: "ok",
        conversation: data as ConversationRecord,
      });
    } catch {
      sendDatabaseFailure(response, "create");
    }
  });

  router.get("/", async (request, response) => {
    const supabase = request.supabase;
    if (!request.user || !supabase) {
      response.status(401).json({
        status: "error",
        code: "UNAUTHORIZED",
        message: "A valid session is required.",
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true });

      if (error || !data) {
        sendDatabaseFailure(response, "list");
        return;
      }

      response.status(200).json({
        status: "ok",
        conversations: data as ConversationRecord[],
      });
    } catch {
      sendDatabaseFailure(response, "list");
    }
  });

  router.get("/:id", async (request, response) => {
    const id = getConversationId(request);
    if (!id) {
      sendValidationError(response);
      return;
    }

    const supabase = request.supabase;
    if (!request.user || !supabase) {
      response.status(401).json({
        status: "error",
        code: "UNAUTHORIZED",
        message: "A valid session is required.",
      });
      return;
    }

    try {
      const conversationResult = await supabase
        .from("conversations")
        .select("id, created_at, updated_at")
        .eq("id", id)
        .maybeSingle();

      if (conversationResult.error) {
        sendDatabaseFailure(response, "retrieve");
        return;
      }
      if (!conversationResult.data) {
        sendNotFound(response);
        return;
      }

      const messagesResult = await supabase
        .from("messages")
        .select("id, role, content, citations, limitations, created_at")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (messagesResult.error || !messagesResult.data) {
        sendDatabaseFailure(response, "retrieve");
        return;
      }

      response.status(200).json({
        status: "ok",
        conversation: conversationResult.data as ConversationRecord,
        messages: messagesResult.data as MessageRecord[],
      });
    } catch {
      sendDatabaseFailure(response, "retrieve");
    }
  });

  router.post("/:id/messages", async (request, response) => {
    const id = getConversationId(request);
    const question = getQuestion(request.body);
    const idempotencyKey = getIdempotencyKey(request);
    if (!id || !question || !idempotencyKey) {
      sendValidationError(response);
      return;
    }

    const supabase = request.supabase;
    if (!request.user || !supabase) {
      response.status(401).json({
        status: "error",
        code: "UNAUTHORIZED",
        message: "A valid session is required.",
      });
      return;
    }

    try {
      const conversationResult = await supabase
        .from("conversations")
        .select("id")
        .eq("id", id)
        .maybeSingle();

      if (conversationResult.error) {
        sendDatabaseFailure(response, "send-message");
        return;
      }
      if (!conversationResult.data) {
        sendNotFound(response);
        return;
      }

      const existingResult = await supabase
        .from("messages")
        .select("id, role, content, citations, limitations, created_at, idempotency_key")
        .eq("conversation_id", id)
        .eq("idempotency_key", idempotencyKey)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (existingResult.error || !existingResult.data) {
        sendDatabaseFailure(response, "check-idempotency");
        return;
      }

      let savedMessages = existingResult.data as MessageRecord[];
      const existingUserMessage = savedMessages.find(
        (message) => message.role === "user",
      );
      let existingAssistantMessage = savedMessages.find(
        (message) => message.role === "assistant",
      );

      if (existingUserMessage && existingUserMessage.content !== question) {
        response.status(409).json({
          status: "error",
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "This request key has already been used for another question.",
        });
        return;
      }

      const requestId = idempotencyKey.replaceAll("-", "");
      if (existingUserMessage && existingAssistantMessage) {
        response.status(200).json({
          status: "ok",
          conversationId: id,
          messages: savedMessages.map(({ idempotency_key: _key, ...message }) => message),
          answer: existingAssistantMessage.content,
          language: "en",
          citations: existingAssistantMessage.citations,
          limitations: existingAssistantMessage.limitations,
          requestId,
        });
        return;
      }

      let answer: HealthEducationResponse;
      try {
        answer = await healthEducationClient.answer(
          { question, language: "en" },
          requestId,
        );
      } catch (error) {
        if (isHealthEducationFailure(error)) {
          response.status(
            error.kind === "timeout"
              ? 504
              : error.kind === "upstream"
                ? 502
                : 503,
          ).json({
            status: "error",
            code:
              error.kind === "timeout"
                ? "AI_SERVICE_TIMEOUT"
                : error.kind === "upstream"
                  ? "AI_SERVICE_ERROR"
                  : "AI_SERVICE_UNAVAILABLE",
            message: "Health information is temporarily unavailable.",
            requestId,
          });
          return;
        }
        throw error;
      }

      if (!existingUserMessage) {
        const questionTime = new Date();
        const { error } = await supabase
          .from("messages")
          .insert({
            id: randomUUID(),
            conversation_id: id,
            role: "user",
            content: question,
            limitations: [],
            created_at: questionTime.toISOString(),
            idempotency_key: idempotencyKey,
          });

        if (error) {
          const retryResult = await supabase
            .from("messages")
            .select("id, role, content, citations, limitations, created_at, idempotency_key")
            .eq("conversation_id", id)
            .eq("idempotency_key", idempotencyKey)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true });
          if (retryResult.error || !retryResult.data) {
            sendDatabaseFailure(response, "save-user-message");
            return;
          }
          savedMessages = retryResult.data as MessageRecord[];
          const savedUserMessage = savedMessages.find(
            (message) => message.role === "user",
          );
          if (!savedUserMessage || savedUserMessage.content !== question) {
            sendDatabaseFailure(response, "save-user-message");
            return;
          }
          existingAssistantMessage = savedMessages.find(
            (message) => message.role === "assistant",
          );
          if (existingAssistantMessage) {
            response.status(200).json({
              status: "ok",
              conversationId: id,
              messages: savedMessages.map(({ idempotency_key: _key, ...message }) => message),
              answer: existingAssistantMessage.content,
              language: "en",
              citations: existingAssistantMessage.citations,
              limitations: existingAssistantMessage.limitations,
              requestId,
            });
            return;
          }
        }
      }

      const questionMessage = savedMessages.find(
        (message) => message.role === "user",
      );
      const questionTime = questionMessage
        ? new Date(questionMessage.created_at)
        : new Date();
      const answerTime = new Date(
        Math.max(Date.now(), questionTime.getTime() + 1),
      );
      const assistantMessageId = randomUUID();

      try {
        const privilegedClient = createPrivilegedClient();
        const { error } = await privilegedClient
          .from("messages")
          .insert({
            id: assistantMessageId,
            conversation_id: id,
            role: "assistant",
            content: answer.answer,
            citations: answer.citations,
            limitations: answer.limitations,
            created_at: answerTime.toISOString(),
            idempotency_key: idempotencyKey,
          });

        if (error) {
          const retryResult = await supabase
            .from("messages")
            .select("id, role, content, citations, limitations, created_at, idempotency_key")
            .eq("conversation_id", id)
            .eq("idempotency_key", idempotencyKey)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true });
          if (retryResult.error || !retryResult.data) {
            sendDatabaseFailure(response, "save-assistant-message");
            return;
          }
          savedMessages = retryResult.data as MessageRecord[];
          existingAssistantMessage = savedMessages.find(
            (message) => message.role === "assistant",
          );
          if (!existingAssistantMessage) {
            sendDatabaseFailure(response, "save-assistant-message");
            return;
          }
        }
      } catch {
        sendDatabaseFailure(response, "save-assistant-message");
        return;
      }

      const savedResult = await supabase
        .from("messages")
        .select("id, role, content, citations, limitations, created_at, idempotency_key")
        .eq("conversation_id", id)
        .eq("idempotency_key", idempotencyKey)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (savedResult.error || !savedResult.data) {
        sendDatabaseFailure(response, "read-saved-messages");
        return;
      }

      savedMessages = (savedResult.data as MessageRecord[]).sort((left, right) =>
        left.created_at.localeCompare(right.created_at),
      );
      response.status(200).json({
        status: "ok",
        conversationId: id,
        messages: savedMessages.map(({ idempotency_key: _key, ...message }) => message),
        answer: existingAssistantMessage?.content ?? answer.answer,
        language: "en",
        citations: existingAssistantMessage?.citations ?? answer.citations,
        limitations: existingAssistantMessage?.limitations ?? answer.limitations,
        requestId: answer.requestId ?? requestId,
      });
    } catch {
      sendDatabaseFailure(response, "send-message");
    }
  });

  router.delete("/:id", async (request, response) => {
    const id = getConversationId(request);
    if (!id) {
      sendValidationError(response);
      return;
    }

    const supabase = request.supabase;
    if (!request.user || !supabase) {
      response.status(401).json({
        status: "error",
        code: "UNAUTHORIZED",
        message: "A valid session is required.",
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("conversations")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) {
        sendDatabaseFailure(response, "delete");
        return;
      }
      if (!data) {
        sendNotFound(response);
        return;
      }

      response.status(204).end();
    } catch {
      sendDatabaseFailure(response, "delete");
    }
  });

  return router;
}
