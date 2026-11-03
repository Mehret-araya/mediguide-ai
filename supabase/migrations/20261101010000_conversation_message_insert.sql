ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS limitations text[] NOT NULL DEFAULT '{}';

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
      AND attribute.attname = 'limitations'
      AND NOT attribute.attisdropped;

    IF column_type IS DISTINCT FROM 'text[]'
       OR column_not_null IS DISTINCT FROM TRUE
       OR column_default IS DISTINCT FROM '''{}''::text[]' THEN
        RAISE EXCEPTION
            'public.messages.limitations has a conflicting definition.';
    END IF;
END;
$$;

DO $$
DECLARE
    constraint_definition text;
    constraint_oid oid;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.messages'::regclass
          AND conname = 'messages_limitations_nonempty'
    ) THEN
        ALTER TABLE public.messages
            ADD CONSTRAINT messages_limitations_nonempty
            CHECK (array_position(limitations, '') IS NULL);
    END IF;

    SELECT oid
    INTO constraint_oid
    FROM pg_constraint
    WHERE conrelid = 'public.messages'::regclass
      AND conname = 'messages_limitations_nonempty'
      AND contype = 'c'
      AND convalidated;

    IF constraint_oid IS NOT NULL THEN
        SELECT regexp_replace(
            lower(pg_get_constraintdef(constraint_oid)),
            'check|[[:space:]()]',
            '',
            'g'
        )
        INTO constraint_definition;
    END IF;

    IF constraint_definition IS DISTINCT FROM
        $expected$array_positionlimitations,''::textisnull$expected$ THEN
        RAISE EXCEPTION
            'public.messages.messages_limitations_nonempty has a conflicting definition.';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_mediaguide_message_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF current_user = 'authenticated' THEN
        IF NEW.role IS DISTINCT FROM 'user' THEN
            RAISE EXCEPTION 'Authenticated users may insert only user messages.'
                USING ERRCODE = '42501';
        END IF;
    ELSIF current_user = 'service_role' THEN
        IF NEW.role IS DISTINCT FROM 'assistant' THEN
            RAISE EXCEPTION 'The service role may insert only assistant messages.'
                USING ERRCODE = '42501';
        END IF;
    ELSE
        RAISE EXCEPTION 'This database role may not insert messages.'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_mediaguide_message_role()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS mediaguide_enforce_message_role
    ON public.messages;
CREATE TRIGGER mediaguide_enforce_message_role
    BEFORE INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_mediaguide_message_role();

GRANT INSERT ON public.messages TO authenticated;

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

DROP POLICY IF EXISTS messages_insert_owner_guard
    ON public.messages;
CREATE POLICY messages_insert_owner_guard
    ON public.messages AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.conversations AS conversation
            WHERE conversation.id = messages.conversation_id
              AND conversation.user_id = (SELECT auth.uid())
        )
    );
