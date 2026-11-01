import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { SupabaseAuthClient } from "../auth/supabase-auth.js";
import { createDatabasePoolConfig } from "./database-options.js";

const integrationEnabled = process.env.RUN_DATABASE_INTEGRATION === "true";
const rlsIntegrationEnabled =
  process.env.RUN_DATABASE_RLS_INTEGRATION === "true";

function normalizeStringArray(value: unknown, column: string): string[] {
  let parsed = value;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      throw new Error(
        `PostgreSQL returned an invalid JSON array for ${column}.`,
      );
    }
  }

  if (
    !Array.isArray(parsed) ||
    !parsed.every((item): item is string => typeof item === "string")
  ) {
    const resultType = Array.isArray(parsed) ? "non-string array" : typeof parsed;
    throw new Error(
      `PostgreSQL returned ${resultType} for ${column}; expected a string array.`,
    );
  }

  return parsed;
}

describe("PostgreSQL schema result normalization", () => {
  it("accepts PostgreSQL driver arrays", () => {
    expect(normalizeStringArray(["one", "two"], "test_column")).toEqual([
      "one",
      "two",
    ]);
  });

  it("parses JSON-encoded arrays and rejects invalid result types", () => {
    expect(normalizeStringArray('["one","two"]', "test_column")).toEqual([
      "one",
      "two",
    ]);
    expect(() => normalizeStringArray("not-json", "test_column")).toThrow(
      "PostgreSQL returned an invalid JSON array for test_column.",
    );
    expect(() => normalizeStringArray(1, "test_column")).toThrow(
      "PostgreSQL returned number for test_column; expected a string array.",
    );
  });
});

describe("Supabase database foundation", () => {
  it.skipIf(!integrationEnabled)(
    "connects with verified TLS and verifies the migrated schema",
    async () => {
      const poolConfig = createDatabasePoolConfig(process.env);
      const tls = poolConfig.ssl;
      if (
        typeof tls !== "object" ||
        tls === null ||
        tls.rejectUnauthorized !== true
      ) {
        throw new Error(
          "The database integration test requires certificate-verified TLS.",
        );
      }

      const pool = new pg.Pool(poolConfig);

      try {
        try {
          const connection = await pool.query(
            "SELECT 1 AS connection_ok",
          );
          expect(connection.rows[0].connection_ok).toBe(1);
        } catch (error) {
          const code =
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            typeof error.code === "string"
              ? ` PostgreSQL error code: ${error.code}.`
              : "";
          throw new Error(
            `PostgreSQL connection or TLS verification failed; schema checks were not run.${code}`,
          );
        }

        let schema;
        try {
          schema = await pool.query<{
            missing_objects: unknown;
            missing_columns: unknown;
            missing_rls: unknown;
            invalid_ownership_policies: unknown;
            public_data_privileges: unknown;
            service_role_privileges: unknown;
            embedding_dimensioned: boolean;
            dimension_dependent_indexes: unknown;
          }>(`
            WITH expected_relations(object_name) AS (
              VALUES
                ('user_profiles'),
                ('health_sources'),
                ('health_source_reviews'),
                ('health_source_chunks'),
                ('approved_health_sources'),
                ('approved_source_chunks'),
                ('conversations'),
                ('messages')
            ),
            expected_columns(table_name, column_name) AS (
              VALUES
                ('messages', 'limitations')
            ),
            expected_rls(table_name) AS (
              VALUES
                ('user_profiles'),
                ('health_sources'),
                ('health_source_reviews'),
                ('health_source_chunks'),
                ('conversations'),
                ('messages')
            ),
            expected_policies(
              table_name,
              policy_name,
              policy_command,
              ownership_column
            ) AS (
              VALUES
                ('user_profiles', 'user_profiles_select_own', 'SELECT', 'id'),
                ('user_profiles', 'user_profiles_update_own', 'UPDATE', 'id'),
                ('conversations', 'conversations_select_own', 'SELECT', 'user_id'),
                ('conversations', 'conversations_insert_own', 'INSERT', 'user_id'),
                ('conversations', 'conversations_update_own', 'UPDATE', 'user_id'),
                ('conversations', 'conversations_delete_own', 'DELETE', 'user_id'),
                ('messages', 'messages_select_own_conversation', 'SELECT', 'conversation_id'),
                ('messages', 'messages_insert_own_conversation', 'INSERT', 'conversation_id'),
                ('messages', 'messages_delete_own_conversation', 'DELETE', 'conversation_id')
            ),
            private_relations(relation_name) AS (
              VALUES
                ('public.user_profiles'),
                ('public.health_sources'),
                ('public.health_source_reviews'),
                ('public.health_source_chunks'),
                ('public.conversations'),
                ('public.messages'),
                ('public.approved_health_sources'),
                ('public.approved_source_chunks')
            ),
            restricted_service_privileges(relation_name, privilege_name) AS (
              VALUES
                ('public.user_profiles', 'SELECT'),
                ('public.user_profiles', 'INSERT'),
                ('public.user_profiles', 'UPDATE'),
                ('public.user_profiles', 'DELETE'),
                ('public.user_profiles', 'TRUNCATE'),
                ('public.conversations', 'SELECT'),
                ('public.conversations', 'INSERT'),
                ('public.conversations', 'UPDATE'),
                ('public.conversations', 'DELETE'),
                ('public.conversations', 'TRUNCATE'),
                ('public.messages', 'SELECT'),
                ('public.messages', 'INSERT'),
                ('public.messages', 'UPDATE'),
                ('public.messages', 'DELETE'),
                ('public.messages', 'TRUNCATE'),
                ('public.health_source_reviews', 'UPDATE'),
                ('public.health_source_reviews', 'DELETE'),
                ('public.health_source_reviews', 'TRUNCATE'),
                ('public.health_sources', 'TRUNCATE'),
                ('public.health_source_chunks', 'TRUNCATE')
            )
            SELECT
              to_json(ARRAY(
                SELECT expected.object_name
                FROM expected_relations AS expected
                WHERE to_regclass(
                  format('public.%I', expected.object_name)
                ) IS NULL
                UNION ALL
                SELECT 'extensions.vector'
                WHERE to_regtype('extensions.vector') IS NULL
                ORDER BY 1
              )) AS missing_objects,
              to_json(ARRAY(
                SELECT format(
                  'public.%s.%s',
                  expected.table_name,
                  expected.column_name
                )
                FROM expected_columns AS expected
                WHERE NOT EXISTS (
                  SELECT 1
                  FROM pg_attribute AS attribute
                  WHERE attribute.attrelid =
                        to_regclass(format('public.%I', expected.table_name))
                    AND attribute.attname = expected.column_name
                    AND NOT attribute.attisdropped
                )
                ORDER BY expected.table_name, expected.column_name
              )) AS missing_columns,
              to_json(ARRAY(
                SELECT expected.table_name
                FROM expected_rls AS expected
                WHERE NOT COALESCE((
                  SELECT relation.relrowsecurity
                  FROM pg_class AS relation
                  WHERE relation.oid = to_regclass(
                    format('public.%I', expected.table_name)
                  )
                ), FALSE)
                ORDER BY expected.table_name
              )) AS missing_rls,
              to_json(ARRAY(
                SELECT expected.policy_name
                FROM expected_policies AS expected
                LEFT JOIN pg_policies AS policy
                  ON policy.schemaname = 'public'
                 AND policy.tablename = expected.table_name
                 AND policy.policyname = expected.policy_name
                WHERE policy.policyname IS NULL
                   OR policy.cmd <> expected.policy_command
                   OR NOT (
                     policy.roles @> ARRAY['authenticated']::name[]
                   )
                   OR concat(
                        COALESCE(policy.qual, ''),
                        ' ',
                        COALESCE(policy.with_check, '')
                      ) NOT ILIKE '%auth.uid%'
                   OR concat(
                        COALESCE(policy.qual, ''),
                        ' ',
                        COALESCE(policy.with_check, '')
                      ) NOT ILIKE
                        concat('%', expected.ownership_column, '%')
                ORDER BY expected.policy_name
              )) AS invalid_ownership_policies,
              to_json(ARRAY(
                SELECT format(
                  '%s has unexpected %s on %s',
                  'anon',
                  privilege.privilege_name,
                  private_relation.relation_name
                )
                FROM private_relations AS private_relation
                CROSS JOIN (
                  VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
                ) AS privilege(privilege_name)
                WHERE has_table_privilege(
                  'anon',
                  to_regclass(private_relation.relation_name),
                  privilege.privilege_name
                )
                ORDER BY private_relation.relation_name,
                         privilege.privilege_name
              )) AS public_data_privileges,
              to_json(ARRAY(
                SELECT format(
                  'service_role has unexpected %s on %s',
                  restricted.privilege_name,
                  restricted.relation_name
                )
                FROM restricted_service_privileges AS restricted
                WHERE has_table_privilege(
                  'service_role',
                  to_regclass(restricted.relation_name),
                  restricted.privilege_name
                )
                ORDER BY restricted.relation_name,
                         restricted.privilege_name
              )) AS service_role_privileges,
              COALESCE((
                SELECT attribute.atttypmod <> -1
                FROM pg_attribute AS attribute
                WHERE attribute.attrelid =
                      to_regclass('public.health_source_chunks')
                  AND attribute.attname = 'embedding'
                  AND NOT attribute.attisdropped
              ), FALSE) AS embedding_dimensioned,
              to_json(ARRAY(
                SELECT index_relation.relname
                FROM pg_index AS index_definition
                JOIN pg_class AS index_relation
                  ON index_relation.oid = index_definition.indexrelid
                JOIN pg_am AS access_method
                  ON access_method.oid = index_relation.relam
                WHERE index_definition.indrelid =
                      to_regclass('public.health_source_chunks')
                  AND access_method.amname IN ('hnsw', 'ivfflat')
                ORDER BY index_relation.relname
              )) AS dimension_dependent_indexes
          `);
        } catch (error) {
          const code =
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            typeof error.code === "string"
              ? ` PostgreSQL error code: ${error.code}.`
              : "";
          throw new Error(
            `PostgreSQL connected, but the schema catalog checks failed.${code}`,
          );
        }

        const row = schema.rows[0];
        const checks = {
          ...row,
          missing_objects: normalizeStringArray(
            row.missing_objects,
            "missing_objects",
          ),
          missing_columns: normalizeStringArray(
            row.missing_columns,
            "missing_columns",
          ),
          missing_rls: normalizeStringArray(row.missing_rls, "missing_rls"),
          invalid_ownership_policies: normalizeStringArray(
            row.invalid_ownership_policies,
            "invalid_ownership_policies",
          ),
          public_data_privileges: normalizeStringArray(
            row.public_data_privileges,
            "public_data_privileges",
          ),
          service_role_privileges: normalizeStringArray(
            row.service_role_privileges,
            "service_role_privileges",
          ),
          dimension_dependent_indexes: normalizeStringArray(
            row.dimension_dependent_indexes,
            "dimension_dependent_indexes",
          ),
        };
        const failures = [
          ...(checks.missing_objects.length > 0
            ? [`missing objects: ${checks.missing_objects.join(", ")}`]
            : []),
          ...(checks.missing_columns.length > 0
            ? [`missing columns: ${checks.missing_columns.join(", ")}`]
            : []),
          ...(checks.missing_rls.length > 0
            ? [`RLS is disabled on: ${checks.missing_rls.join(", ")}`]
            : []),
          ...(checks.invalid_ownership_policies.length > 0
            ? [
                `missing or invalid ownership policies: ${checks.invalid_ownership_policies.join(", ")}`,
              ]
            : []),
          ...(checks.public_data_privileges.length > 0
            ? [
                `unexpected anonymous privileges: ${checks.public_data_privileges.join(", ")}`,
              ]
            : []),
          ...(checks.service_role_privileges.length > 0
            ? [
                `excess service-role privileges: ${checks.service_role_privileges.join(", ")}`,
              ]
            : []),
          ...(checks.embedding_dimensioned
            ? ["the embedding column has a fixed dimension"]
            : []),
          ...(checks.dimension_dependent_indexes.length > 0
            ? [
                `dimension-dependent vector indexes are present: ${checks.dimension_dependent_indexes.join(", ")}`,
              ]
            : []),
        ];

        expect(
          failures,
          failures.length === 0
            ? undefined
            : `PostgreSQL connected, but migration verification failed: ${failures.join("; ")}`,
        ).toEqual([]);
      } finally {
        await pool.end();
      }
    },
  );
});

describe("Supabase row-level security isolation", () => {
  it.skipIf(!rlsIntegrationEnabled)(
    "isolates profiles, conversations, and messages between two authenticated users",
    async () => {
      const userAToken = process.env.RLS_TEST_USER_A_ACCESS_TOKEN;
      const userBToken = process.env.RLS_TEST_USER_B_ACCESS_TOKEN;

      if (!userAToken || !userBToken) {
        throw new Error(
          "RLS integration requires RLS_TEST_USER_A_ACCESS_TOKEN and RLS_TEST_USER_B_ACCESS_TOKEN.",
        );
      }

      const auth = new SupabaseAuthClient();
      const [userA, userB] = await Promise.all([
        auth.getUser(userAToken),
        auth.getUser(userBToken),
      ]);

      if (!userA || !userB || userA.id === userB.id) {
        throw new Error(
          "RLS integration requires two distinct, valid Supabase user sessions.",
        );
      }

      const pool = new pg.Pool(createDatabasePoolConfig(process.env));
      const conversationA = randomUUID();
      const conversationB = randomUUID();
      const messageA = randomUUID();
      const messageB = randomUUID();
      const ownerInsertedMessage = randomUUID();
      const crossUserInsertedMessage = randomUUID();

      try {
        const client = await pool.connect();
        let transactionStarted = false;
        try {
          await client.query("BEGIN");
          transactionStarted = true;

          await client.query(
            `INSERT INTO public.user_profiles (id, display_name)
           VALUES ($1, 'RLS test user A'), ($2, 'RLS test user B')
           ON CONFLICT (id) DO NOTHING`,
            [userA.id, userB.id],
          );
          await client.query(
            `INSERT INTO public.conversations (id, user_id)
           VALUES ($1, $2), ($3, $4)`,
            [conversationA, userA.id, conversationB, userB.id],
          );
          await client.query(
            `INSERT INTO public.messages (id, conversation_id, role, content)
           VALUES
             ($1, $2, 'user', 'RLS integration fixture'),
             ($3, $4, 'user', 'RLS integration fixture')`,
            [messageA, conversationA, messageB, conversationB],
          );

          await client.query("SET LOCAL ROLE authenticated");
          const role = await client.query<{ current_user: string }>(
            "SELECT current_user",
          );
          if (role.rows[0].current_user !== "authenticated") {
            throw new Error(
              "RLS integration could not assume the authenticated database role.",
            );
          }

          const setAuthenticatedUser = async (
            userId: string,
          ): Promise<void> => {
            await client.query(
              "SELECT set_config('request.jwt.claim.sub', $1, true)",
              [userId],
            );
          };

          const expectVisible = async (
            table: "conversations" | "messages" | "user_profiles",
            id: string,
            expected: boolean,
          ): Promise<void> => {
            const result = await client.query(
              `SELECT id FROM public.${table} WHERE id = $1`,
              [id],
            );
            if ((result.rowCount === 1) !== expected) {
              throw new Error(`RLS visibility check failed for ${table}.`);
            }
          };

          const expectNoCrossUserWrites = async (
            profileId: string,
            conversationId: string,
            messageId: string,
          ): Promise<void> => {
            const profileUpdate = await client.query(
              `UPDATE public.user_profiles
               SET display_name = 'Unauthorized update'
               WHERE id = $1`,
              [profileId],
            );
            const conversationUpdate = await client.query(
              `UPDATE public.conversations
               SET updated_at = now()
               WHERE id = $1`,
              [conversationId],
            );
            const conversationDelete = await client.query(
              "DELETE FROM public.conversations WHERE id = $1",
              [conversationId],
            );
            const messageDelete = await client.query(
              "DELETE FROM public.messages WHERE id = $1",
              [messageId],
            );

            if (
              profileUpdate.rowCount !== 0 ||
              conversationUpdate.rowCount !== 0 ||
              conversationDelete.rowCount !== 0 ||
              messageDelete.rowCount !== 0
            ) {
              throw new Error(
                "RLS allowed a user to modify another user's records.",
              );
            }
          };

          const expectPermissionDenied = async (
            operation: () => Promise<{ rowCount: number | null }>,
            description: string,
          ): Promise<void> => {
            await client.query("SAVEPOINT rls_permission_check");
            let denied = false;
            try {
              const result = await operation();
              if (result.rowCount === 0) {
                denied = true;
              }
            } catch (error) {
              const code =
                typeof error === "object" &&
                error !== null &&
                "code" in error &&
                typeof error.code === "string"
                  ? error.code
                  : undefined;
              if (code === "42501") {
                denied = true;
              } else {
                throw error;
              }
            } finally {
              await client.query("ROLLBACK TO SAVEPOINT rls_permission_check");
              await client.query("RELEASE SAVEPOINT rls_permission_check");
            }

            if (!denied) {
              throw new Error(`RLS allowed a forbidden operation: ${description}.`);
            }
          };

          await setAuthenticatedUser(userA.id);
          await expectVisible("user_profiles", userA.id, true);
          await expectVisible("user_profiles", userB.id, false);
          await expectVisible("conversations", conversationA, true);
          await expectVisible("conversations", conversationB, false);
          await expectVisible("messages", messageA, true);
          await expectVisible("messages", messageB, false);
          await expectNoCrossUserWrites(userB.id, conversationB, messageB);
          await expectPermissionDenied(
            () =>
              client.query(
                `INSERT INTO public.messages
                   (id, conversation_id, role, content)
                 VALUES ($1, $2, 'user', 'Cross-user RLS fixture')`,
                [crossUserInsertedMessage, conversationB],
              ),
            "inserting a message into another user's conversation",
          );
          await expectPermissionDenied(
            () =>
              client.query(
                `UPDATE public.messages
                 SET content = 'Unauthorized update'
                 WHERE id = $1`,
                [messageB],
              ),
            "updating another user's message",
          );
          await expectPermissionDenied(
            () =>
              client.query(
                "DELETE FROM public.user_profiles WHERE id = $1",
                [userB.id],
              ),
            "deleting another user's profile",
          );
          const ownerMessage = await client.query(
            `INSERT INTO public.messages
               (id, conversation_id, role, content)
             VALUES ($1, $2, 'user', 'Owner RLS fixture')
             RETURNING id`,
            [ownerInsertedMessage, conversationA],
          );
          if (ownerMessage.rowCount !== 1) {
            throw new Error("RLS denied a user inserting into their own conversation.");
          }

          await setAuthenticatedUser(userB.id);
          await expectVisible("user_profiles", userB.id, true);
          await expectVisible("user_profiles", userA.id, false);
          await expectVisible("conversations", conversationB, true);
          await expectVisible("conversations", conversationA, false);
          await expectVisible("messages", messageB, true);
          await expectVisible("messages", messageA, false);
          await expectVisible("messages", ownerInsertedMessage, false);
          await expectVisible("messages", crossUserInsertedMessage, false);
          await expectNoCrossUserWrites(userA.id, conversationA, messageA);
        } finally {
          try {
            if (transactionStarted) {
              await client.query("ROLLBACK");
            }
          } finally {
            client.release();
          }
        }
      } finally {
        await pool.end();
      }
    },
  );
});
