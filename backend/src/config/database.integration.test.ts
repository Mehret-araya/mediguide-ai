import "dotenv/config";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { createDatabasePoolConfig } from "./database-options.js";

const integrationEnabled = process.env.RUN_DATABASE_INTEGRATION === "true";

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
            missing_objects: string[];
            missing_rls: string[];
            invalid_ownership_policies: string[];
            public_data_privileges: string[];
            service_role_privileges: string[];
            embedding_dimensioned: boolean;
            dimension_dependent_indexes: string[];
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
              ARRAY(
                SELECT expected.object_name
                FROM expected_relations AS expected
                WHERE to_regclass(
                  format('public.%I', expected.object_name)
                ) IS NULL
                UNION ALL
                SELECT 'extensions.vector'
                WHERE to_regtype('extensions.vector') IS NULL
                ORDER BY 1
              ) AS missing_objects,
              ARRAY(
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
              ) AS missing_rls,
              ARRAY(
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
              ) AS invalid_ownership_policies,
              ARRAY(
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
              ) AS public_data_privileges,
              ARRAY(
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
              ) AS service_role_privileges,
              COALESCE((
                SELECT attribute.atttypmod <> -1
                FROM pg_attribute AS attribute
                WHERE attribute.attrelid =
                      to_regclass('public.health_source_chunks')
                  AND attribute.attname = 'embedding'
                  AND NOT attribute.attisdropped
              ), FALSE) AS embedding_dimensioned,
              ARRAY(
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
              ) AS dimension_dependent_indexes
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

        const checks = schema.rows[0];
        const failures = [
          ...(checks.missing_objects.length > 0
            ? [`missing objects: ${checks.missing_objects.join(", ")}`]
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
