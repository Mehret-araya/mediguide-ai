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

GRANT INSERT ON public.messages TO authenticated;

DROP POLICY IF EXISTS messages_insert_own_conversation
    ON public.messages;
CREATE POLICY messages_insert_own_conversation
    ON public.messages FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.conversations AS conversation
            WHERE conversation.id = messages.conversation_id
              AND conversation.user_id = (SELECT auth.uid())
        )
    );
