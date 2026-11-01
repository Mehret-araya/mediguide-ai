import { readFileSync } from "node:fs";
import type { PoolConfig } from "pg";

export interface DatabaseEnvironment {
  DATABASE_URL?: string;
  DATABASE_SSL?: string;
  DATABASE_SSL_CA?: string;
}

export function createDatabasePoolConfig(
  environment: DatabaseEnvironment,
): PoolConfig {
  const connectionString = environment.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error("DATABASE_URL must be configured for PostgreSQL access.");
  }

  const sslSetting = (environment.DATABASE_SSL ?? "true")
    .trim()
    .toLowerCase();
  const caPath = environment.DATABASE_SSL_CA?.trim();

  if (sslSetting !== "true" && sslSetting !== "false") {
    throw new Error("DATABASE_SSL must be set to true or false.");
  }

  if (sslSetting === "false" && caPath) {
    throw new Error("DATABASE_SSL_CA requires DATABASE_SSL=true.");
  }

  return {
    connectionString,
    ssl:
      sslSetting === "true"
        ? {
            rejectUnauthorized: true,
            ...(caPath ? { ca: readFileSync(caPath, "utf8") } : {}),
          }
        : false,
    max: 5,
    connectionTimeoutMillis: 10000,
  };
}
