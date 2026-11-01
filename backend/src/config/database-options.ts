import { readFileSync } from "node:fs";
import type { PoolConfig } from "pg";

export interface DatabaseEnvironment {
  DATABASE_URL?: string;
  DATABASE_SSL?: string;
  DATABASE_SSL_CA?: string;
}

const CONNECTION_STRING_TLS_PARAMETERS = [
  "ssl",
  "sslmode",
  "sslcert",
  "sslkey",
  "sslrootcert",
  "sslnegotiation",
  "uselibpqcompat",
];

function connectionStringHasTlsParameters(connectionString: string): boolean {
  try {
    const url = new URL(connectionString);
    return CONNECTION_STRING_TLS_PARAMETERS.some((parameter) =>
      url.searchParams.has(parameter),
    );
  } catch {
    const tlsParameterPattern = new RegExp(
      `(?:^|\\s)(?:${CONNECTION_STRING_TLS_PARAMETERS.join("|")})\\s*=`,
      "iu",
    );
    return tlsParameterPattern.test(connectionString);
  }
}

export function createDatabasePoolConfig(
  environment: DatabaseEnvironment,
): PoolConfig {
  const connectionString = environment.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error("DATABASE_URL must be configured for PostgreSQL access.");
  }

  if (connectionStringHasTlsParameters(connectionString)) {
    throw new Error(
      "Remove TLS parameters from DATABASE_URL and configure PostgreSQL TLS with DATABASE_SSL and DATABASE_SSL_CA.",
    );
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
