CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

DO $$
DECLARE
    vector_schema name;
BEGIN
    SELECT nsp.nspname
    INTO vector_schema
    FROM pg_extension AS installed_extension
    JOIN pg_namespace AS nsp
        ON nsp.oid = installed_extension.extnamespace
    WHERE installed_extension.extname = 'vector';

    IF vector_schema IS NULL THEN
        RAISE EXCEPTION 'The pgvector extension is not installed.';
    ELSIF vector_schema <> 'extensions' THEN
        EXECUTE 'ALTER EXTENSION vector SET SCHEMA extensions';
    END IF;
END;
$$;

DO $$
BEGIN
    CREATE TYPE public.source_review_status AS ENUM (
        'pending_review',
        'approved',
        'rejected',
        'needs_update',
        'retired'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.user_profiles (
    id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    display_name varchar(80),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_profiles_display_name_nonempty
        CHECK (display_name IS NULL OR length(btrim(display_name)) > 0)
);

CREATE OR REPLACE FUNCTION public.create_mediaguide_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.user_profiles (id, display_name)
    VALUES (
        NEW.id,
        NULLIF(LEFT(BTRIM(NEW.raw_user_meta_data ->> 'name'), 80), '')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_mediaguide_user_profile()
    FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS mediaguide_profile_after_auth_user_insert
    ON auth.users;
CREATE TRIGGER mediaguide_profile_after_auth_user_insert
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.create_mediaguide_user_profile();

CREATE OR REPLACE FUNCTION public.set_mediaguide_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_mediaguide_updated_at()
    FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.health_sources (
    source_key text PRIMARY KEY,
    title text NOT NULL CHECK (length(btrim(title)) > 0),
    publisher text NOT NULL CHECK (length(btrim(publisher)) > 0),
    source_url text NOT NULL CHECK (source_url ~ '^https://'),
    publication_date date,
    updated_date date,
    accessed_date date NOT NULL,
    language text NOT NULL CHECK (length(btrim(language)) > 0),
    topics text[] NOT NULL CHECK (
        cardinality(topics) > 0 AND array_position(topics, '') IS NULL
    ),
    review_status public.source_review_status NOT NULL
        DEFAULT 'pending_review',
    reviewer text,
    reviewed_at date,
    limitations text[] NOT NULL DEFAULT '{}'
        CHECK (array_position(limitations, '') IS NULL),
    version text,
    checksum text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT health_sources_key_nonempty
        CHECK (length(btrim(source_key)) > 0),
    CONSTRAINT health_sources_approved_requires_review
        CHECK (
            review_status <> 'approved'
            OR (
                reviewer IS NOT NULL
                AND length(btrim(reviewer)) > 0
                AND reviewed_at IS NOT NULL
            )
        )
);

CREATE TABLE IF NOT EXISTS public.health_source_reviews (
    review_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_key text NOT NULL
        REFERENCES public.health_sources (source_key) ON DELETE CASCADE,
    from_status public.source_review_status NOT NULL,
    to_status public.source_review_status NOT NULL,
    reviewer text NOT NULL CHECK (length(btrim(reviewer)) > 0),
    reviewed_at date NOT NULL,
    reason text NOT NULL CHECK (length(btrim(reason)) > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS health_source_reviews_latest_idx
    ON public.health_source_reviews (source_key, review_id DESC);
CREATE INDEX IF NOT EXISTS health_sources_status_language_idx
    ON public.health_sources (review_status, language);

CREATE OR REPLACE VIEW public.approved_health_sources
WITH (security_invoker = true)
AS
SELECT
    source.source_key,
    source.title,
    source.publisher,
    source.source_url,
    source.publication_date,
    source.updated_date,
    source.accessed_date,
    source.language,
    source.topics,
    source.review_status,
    source.reviewer,
    source.reviewed_at,
    source.limitations,
    source.version,
    source.checksum
FROM public.health_sources AS source
JOIN LATERAL (
    SELECT review.from_status, review.to_status, review.reviewer, review.reviewed_at
    FROM public.health_source_reviews AS review
    WHERE review.source_key = source.source_key
    ORDER BY review.review_id DESC
    LIMIT 1
) AS latest_review ON TRUE
WHERE source.review_status = 'approved'
  AND latest_review.from_status = 'pending_review'
  AND latest_review.to_status = 'approved'
  AND latest_review.reviewer = source.reviewer
  AND latest_review.reviewed_at = source.reviewed_at;

CREATE TABLE IF NOT EXISTS public.health_source_chunks (
    chunk_id text PRIMARY KEY
        CHECK (chunk_id ~ '^[0-9a-f]{64}$'),
    source_key text NOT NULL
        REFERENCES public.health_sources (source_key) ON DELETE CASCADE,
    chunk_index integer NOT NULL CHECK (chunk_index >= 0),
    section text NOT NULL CHECK (length(btrim(section)) > 0),
    content text NOT NULL CHECK (length(btrim(content)) > 0),
    content_sha256 text NOT NULL
        CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
    embedding extensions.vector,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_key, chunk_index)
);

CREATE INDEX IF NOT EXISTS health_source_chunks_source_idx
    ON public.health_source_chunks (source_key, chunk_index);

CREATE OR REPLACE VIEW public.approved_source_chunks
WITH (security_invoker = true)
AS
SELECT
    chunk.chunk_id,
    chunk.chunk_index,
    chunk.section,
    chunk.content,
    chunk.content_sha256,
    chunk.embedding,
    source.source_key,
    source.title,
    source.publisher,
    source.source_url,
    source.language,
    source.topics,
    source.limitations,
    source.version
FROM public.health_source_chunks AS chunk
JOIN public.approved_health_sources AS source
    ON source.source_key = chunk.source_key;

CREATE TABLE IF NOT EXISTS public.conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL
        REFERENCES public.conversations (id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('user', 'assistant')),
    content text NOT NULL CHECK (length(btrim(content)) > 0),
    citations jsonb NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(citations) = 'array'),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.touch_mediaguide_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.conversations
    SET updated_at = GREATEST(updated_at, NEW.created_at)
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_mediaguide_conversation()
    FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS mediaguide_profile_updated_at
    ON public.user_profiles;
DROP TRIGGER IF EXISTS mediaguide_source_updated_at
    ON public.health_sources;
DROP TRIGGER IF EXISTS mediaguide_conversation_updated_at
    ON public.conversations;
DROP TRIGGER IF EXISTS mediaguide_message_updates_conversation
    ON public.messages;

CREATE TRIGGER mediaguide_profile_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.set_mediaguide_updated_at();
CREATE TRIGGER mediaguide_source_updated_at
    BEFORE UPDATE ON public.health_sources
    FOR EACH ROW
    EXECUTE FUNCTION public.set_mediaguide_updated_at();
CREATE TRIGGER mediaguide_conversation_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION public.set_mediaguide_updated_at();
CREATE TRIGGER mediaguide_message_updates_conversation
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_mediaguide_conversation();

CREATE INDEX IF NOT EXISTS conversations_owner_updated_idx
    ON public.conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
    ON public.messages (conversation_id, created_at, id);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_source_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_source_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_profiles,
    public.health_sources,
    public.health_source_reviews,
    public.health_source_chunks,
    public.conversations,
    public.messages
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.approved_health_sources,
    public.approved_source_chunks
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.approved_health_sources,
    public.approved_source_chunks
FROM service_role;
GRANT USAGE ON SCHEMA public, extensions TO service_role;

GRANT SELECT, UPDATE (display_name)
    ON public.user_profiles TO authenticated;
REVOKE ALL ON public.user_profiles FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.conversations TO authenticated;
REVOKE ALL ON public.conversations FROM service_role;
GRANT SELECT, DELETE ON public.messages TO authenticated;
REVOKE ALL ON public.messages FROM service_role;

REVOKE ALL ON public.health_sources, public.health_source_chunks
    FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.health_sources, public.health_source_chunks TO service_role;
REVOKE ALL ON public.health_source_reviews FROM service_role;
GRANT SELECT, INSERT ON public.health_source_reviews TO service_role;
REVOKE ALL
    ON SEQUENCE public.health_source_reviews_review_id_seq
    FROM service_role;
GRANT SELECT ON public.approved_health_sources,
    public.approved_source_chunks TO service_role;
GRANT USAGE
    ON SEQUENCE public.health_source_reviews_review_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.health_source_reviews_review_id_seq
    FROM PUBLIC, anon, authenticated;
GRANT USAGE
    ON SEQUENCE public.health_source_reviews_review_id_seq TO service_role;

DROP POLICY IF EXISTS user_profiles_select_own
    ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_update_own
    ON public.user_profiles;
DROP POLICY IF EXISTS conversations_select_own
    ON public.conversations;
DROP POLICY IF EXISTS conversations_insert_own
    ON public.conversations;
DROP POLICY IF EXISTS conversations_update_own
    ON public.conversations;
DROP POLICY IF EXISTS conversations_delete_own
    ON public.conversations;
DROP POLICY IF EXISTS messages_select_own_conversation
    ON public.messages;
DROP POLICY IF EXISTS messages_delete_own_conversation
    ON public.messages;

CREATE POLICY user_profiles_select_own
    ON public.user_profiles FOR SELECT TO authenticated
    USING (id = (SELECT auth.uid()));
CREATE POLICY user_profiles_update_own
    ON public.user_profiles FOR UPDATE TO authenticated
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY conversations_select_own
    ON public.conversations FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));
CREATE POLICY conversations_insert_own
    ON public.conversations FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY conversations_update_own
    ON public.conversations FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY conversations_delete_own
    ON public.conversations FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY messages_select_own_conversation
    ON public.messages FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.conversations AS conversation
            WHERE conversation.id = messages.conversation_id
              AND conversation.user_id = (SELECT auth.uid())
        )
    );
CREATE POLICY messages_delete_own_conversation
    ON public.messages FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.conversations AS conversation
            WHERE conversation.id = messages.conversation_id
              AND conversation.user_id = (SELECT auth.uid())
        )
    );
