import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDatabasePoolConfig } from "./database-options.js";

describe("PostgreSQL pool configuration", () => {
  it("requires a non-empty database URL", () => {
    expect(() => createDatabasePoolConfig({})).toThrow(
      "DATABASE_URL must be configured for PostgreSQL access.",
    );
    expect(() =>
      createDatabasePoolConfig({ DATABASE_URL: " " }),
    ).toThrow("DATABASE_URL must be configured for PostgreSQL access.");
  });

  it("enables certificate-verified TLS by default", () => {
    const config = createDatabasePoolConfig({
      DATABASE_URL: "postgresql://localhost/mediguide",
    });

    expect(config.ssl).toEqual({ rejectUnauthorized: true });
    expect(config.max).toBe(5);
    expect(config.connectionTimeoutMillis).toBe(10000);
  });

  it("allows explicit non-TLS configuration for local development", () => {
    const config = createDatabasePoolConfig({
      DATABASE_URL: "postgresql://localhost/mediguide",
      DATABASE_SSL: "false",
    });

    expect(config.ssl).toBe(false);
  });

  it("uses a configured CA certificate while verifying TLS", () => {
    const caPath = join(tmpdir(), `mediguide-test-ca-${randomUUID()}.pem`);
    const caCertificate = "test CA certificate";
    try {
      writeFileSync(caPath, caCertificate);

      const config = createDatabasePoolConfig({
        DATABASE_URL: "postgresql://localhost/mediguide",
        DATABASE_SSL: "true",
        DATABASE_SSL_CA: caPath,
      });

      expect(config.ssl).toEqual({
        rejectUnauthorized: true,
        ca: caCertificate,
      });
    } finally {
      rmSync(caPath, { force: true });
    }
  });

  it("rejects a CA certificate when TLS is disabled", () => {
    expect(() =>
      createDatabasePoolConfig({
        DATABASE_URL: "postgresql://localhost/mediguide",
        DATABASE_SSL: "false",
        DATABASE_SSL_CA: "ca.pem",
      }),
    ).toThrow("DATABASE_SSL_CA requires DATABASE_SSL=true.");
  });

  it("rejects invalid TLS configuration", () => {
    expect(() =>
      createDatabasePoolConfig({
        DATABASE_URL: "postgresql://localhost/mediguide",
        DATABASE_SSL: "sometimes",
      }),
    ).toThrow("DATABASE_SSL must be set to true or false.");
  });
});
