ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS idempotency_key uuid;

DO $$
DECLARE
    column_type text;
    column_not_null boolean;
    column_default text;
BEGIN
    SELECT
        format_type(attribute.atttypid, attribute.atttypmod),
        attribute.attnotnull,
        pg_get_expr(default_definition.adbin, default_definition.adrelid)
    INTO column_type, column_not_null, column_default
    FROM pg_attribute AS attribute
    LEFT JOIN pg_attrdef AS default_definition
        ON default_definition.adrelid = attribute.attrelid
       AND default_definition.adnum = attribute.attnum
    WHERE attribute.attrelid = 'public.messages'::regclass
      AND attribute.attname = 'idempotency_key'
      AND NOT attribute.attisdropped;

    IF column_type IS DISTINCT FROM 'uuid'
       OR column_not_null IS DISTINCT FROM FALSE
       OR column_default IS NOT NULL THEN
        RAISE EXCEPTION
            'public.messages.idempotency_key has a conflicting definition.';
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_idempotency_role_idx
    ON public.messages (conversation_id, idempotency_key, role)
    WHERE idempotency_key IS NOT NULL;

DO $$
DECLARE
    index_is_unique boolean;
    index_is_valid boolean;
    index_is_ready boolean;
    index_key_count smallint;
    index_column_count smallint;
    index_method text;
    index_predicate text;
    index_columns text[];
BEGIN
    SELECT
        index_definition.indisunique,
        index_definition.indisvalid,
        index_definition.indisready,
        index_definition.indnkeyatts,
        index_definition.indnatts,
        access_method.amname,
        pg_get_expr(
            index_definition.indpred,
            index_definition.indrelid
        ),
        ARRAY(
            SELECT attribute.attname
            FROM unnest(index_definition.indkey)
                WITH ORDINALITY AS index_key(attnum, ordinality)
            JOIN pg_attribute AS attribute
                ON attribute.attrelid = index_definition.indrelid
               AND attribute.attnum = index_key.attnum
            ORDER BY index_key.ordinality
        )
    INTO
        index_is_unique,
        index_is_valid,
        index_is_ready,
        index_key_count,
        index_column_count,
        index_method,
        index_predicate,
        index_columns
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
        ON index_relation.oid = index_definition.indexrelid
    JOIN pg_am AS access_method
        ON access_method.oid = index_relation.relam
    WHERE index_relation.oid =
            to_regclass('public.messages_conversation_idempotency_role_idx')
      AND index_definition.indrelid = 'public.messages'::regclass;

    IF NOT FOUND
       OR index_is_unique IS DISTINCT FROM TRUE
       OR index_is_valid IS DISTINCT FROM TRUE
       OR index_is_ready IS DISTINCT FROM TRUE
       OR index_key_count IS DISTINCT FROM 3
       OR index_column_count IS DISTINCT FROM 3
       OR index_method IS DISTINCT FROM 'btree'
       OR index_columns IS DISTINCT FROM
            ARRAY['conversation_id', 'idempotency_key', 'role']::text[]
       OR regexp_replace(
            lower(COALESCE(index_predicate, '')),
            '\s+',
            '',
            'g'
          ) IS DISTINCT FROM '(idempotency_keyisnotnull)' THEN
        RAISE EXCEPTION
            'The messages idempotency index has a conflicting definition.';
    END IF;
END;
$$;

GRANT INSERT ON public.messages TO authenticated;

REVOKE ALL ON public.messages FROM service_role;

DO $$
DECLARE
    column_privilege record;
BEGIN
    FOR column_privilege IN
        SELECT DISTINCT privilege_type, column_name
        FROM information_schema.column_privileges
        WHERE table_schema = 'public'
          AND table_name = 'messages'
          AND grantee = 'service_role'
    LOOP
        EXECUTE format(
            'REVOKE %s (%I) ON TABLE public.messages FROM service_role',
            column_privilege.privilege_type,
            column_privilege.column_name
        );
    END LOOP;
END;
$$;

GRANT INSERT (
    id,
    conversation_id,
    role,
    content,
    citations,
    limitations,
    created_at,
    idempotency_key
)
ON public.messages TO service_role;

DROP POLICY IF EXISTS messages_insert_own_conversation
    ON public.messages;
CREATE POLICY messages_insert_own_conversation
    ON public.messages FOR INSERT TO authenticated
    WITH CHECK (
        role = 'user'
        AND EXISTS (
            SELECT 1
            FROM public.conversations AS conversation
            WHERE conversation.id = messages.conversation_id
              AND conversation.user_id = (SELECT auth.uid())
        )
    );
