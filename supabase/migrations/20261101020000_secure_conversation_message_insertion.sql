ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS limitations text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
    ALTER TABLE public.messages
        ADD CONSTRAINT messages_limitations_nonempty
        CHECK (array_position(limitations, '') IS NULL);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END;
$$;

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_idempotency_role_idx
    ON public.messages (conversation_id, idempotency_key, role)
    WHERE idempotency_key IS NOT NULL;

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

DO $$
DECLARE
    existing_policy record;
BEGIN
    FOR existing_policy IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'messages'
          AND cmd = 'INSERT'
    LOOP
        EXECUTE format(
            'DROP POLICY %I ON public.messages',
            existing_policy.policyname
        );
    END LOOP;
END;
$$;

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
