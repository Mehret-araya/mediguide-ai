
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "./app.js";

describe("MediGuide AI API", () => {
  it("returns a healthy status from GET /health", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "MediGuide AI backend",
      message: "Backend server is running.",
    });
  });

  it("returns 404 for the old health endpoint", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(404);
  });

  it("returns the available education topics from the versioned API", async () => {
    const response = await request(app).get("/api/v1/education");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.topics).toHaveLength(2);
    expect(
      response.body.topics.map((topic: { id: string }) => topic.id),
    ).toEqual(["hydration", "hand-hygiene"]);
    expect(response.body.disclaimer).toContain("not been clinically reviewed");
  });

  it("returns the hydration topic by ID", async () => {
    const response = await request(app).get(
      "/api/v1/education/hydration",
    );

    expect(response.status).toBe(200);
    expect(response.body.topic.id).toBe("hydration");
  });

  it("returns 404 when an education topic does not exist", async () => {
    const response = await request(app).get(
      "/api/v1/education/unknown-topic",
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      status: "error",
      message: "The requested education topic was not found.",
    });
  });

  it("returns 404 for the old education endpoint", async () => {
    const response = await request(app).get("/api/education");

    expect(response.status).toBe(404);
  });

  it("returns 404 for an unknown API route", async () => {
    const response = await request(app).get("/api/v1/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      status: "error",
      message: "The requested endpoint was not found.",
    });
  });

  it("rejects malformed JSON with status 400", async () => {
    const response = await request(app)
      .post("/api/v1/education")
      .set("Content-Type", "application/json")
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: "error",
      message: "The request contains invalid JSON.",
    });
  });

  it("blocks requests from unapproved origins", async () => {
    const response = await request(app)
      .get("/health")
      .set("Origin", "http://evil.example");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      status: "error",
      message: "This origin is not allowed to access the API.",
    });
  });

  it("includes the Helmet security header", async () => {
    const response = await request(app).get("/health");

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });
});
