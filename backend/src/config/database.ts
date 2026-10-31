
import pg from "pg";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createDatabasePoolConfig } from "./database-options.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: resolve(currentDirectory, "../../.env"),
});

export const database = new pg.Pool(
  createDatabasePoolConfig(process.env),
);

database.on("error", () => {
  console.error("Unexpected error from an idle PostgreSQL connection.");
});
