DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'mediaguide_knowledge_reader'
    ) THEN
        CREATE ROLE mediaguide_knowledge_reader
            NOLOGIN NOINHERIT;
    END IF;
END;
$$;

DO $$
DECLARE
    knowledge_role record;
BEGIN
    SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
           rolreplication, rolbypassrls
    INTO knowledge_role
    FROM pg_roles
    WHERE rolname = 'mediaguide_knowledge_reader';

    IF knowledge_role.rolcanlogin
       OR knowledge_role.rolsuper
       OR knowledge_role.rolcreatedb
       OR knowledge_role.rolcreaterole
       OR knowledge_role.rolreplication
       OR knowledge_role.rolbypassrls THEN
        RAISE EXCEPTION
            'mediaguide_knowledge_reader must remain a non-login, unprivileged role';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mediaguide_knowledge_source_is_approved(
    requested_source_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.health_sources AS source
        JOIN LATERAL (
            SELECT
                review.from_status,
                review.to_status,
                review.reviewer,
                review.reviewed_at
            FROM public.health_source_reviews AS review
            WHERE review.source_key = source.source_key
            ORDER BY review.review_id DESC
            LIMIT 1
        ) AS latest_review ON TRUE
        WHERE source.source_key = requested_source_key
          AND source.review_status = 'approved'
          AND source.license IS NOT NULL
          AND length(btrim(source.license)) > 0
          AND latest_review.from_status = 'pending_review'
          AND latest_review.to_status = 'approved'
          AND latest_review.reviewer = source.reviewer
          AND latest_review.reviewed_at = source.reviewed_at
    );
$$;

CREATE OR REPLACE FUNCTION public.mediaguide_knowledge_review_is_current(
    requested_source_key text,
    requested_review_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        public.mediaguide_knowledge_source_is_approved(requested_source_key)
        AND EXISTS (
            SELECT 1
            FROM public.health_source_reviews AS review
            WHERE review.source_key = requested_source_key
              AND review.review_id = requested_review_id
              AND review.from_status = 'pending_review'
              AND review.to_status = 'approved'
        );
$$;

REVOKE ALL ON FUNCTION
    public.mediaguide_knowledge_source_is_approved(text),
    public.mediaguide_knowledge_review_is_current(text, bigint)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
    public.mediaguide_knowledge_source_is_approved(text),
    public.mediaguide_knowledge_review_is_current(text, bigint)
TO mediaguide_knowledge_reader;

GRANT USAGE ON SCHEMA public, extensions
TO mediaguide_knowledge_reader;
GRANT SELECT ON
    public.health_sources,
    public.health_source_reviews,
    public.health_source_chunks,
    public.approved_health_sources,
    public.approved_source_chunks
TO mediaguide_knowledge_reader;
GRANT INSERT, UPDATE ON public.health_source_chunks
TO mediaguide_knowledge_reader;

DROP POLICY IF EXISTS knowledge_reader_select_approved_sources
    ON public.health_sources;
CREATE POLICY knowledge_reader_select_approved_sources
    ON public.health_sources
    FOR SELECT TO mediaguide_knowledge_reader
    USING (
        public.mediaguide_knowledge_source_is_approved(source_key)
    );

DROP POLICY IF EXISTS knowledge_reader_select_current_reviews
    ON public.health_source_reviews;
CREATE POLICY knowledge_reader_select_current_reviews
    ON public.health_source_reviews
    FOR SELECT TO mediaguide_knowledge_reader
    USING (
        public.mediaguide_knowledge_review_is_current(
            source_key,
            review_id
        )
    );

DROP POLICY IF EXISTS knowledge_reader_select_approved_chunks
    ON public.health_source_chunks;
CREATE POLICY knowledge_reader_select_approved_chunks
    ON public.health_source_chunks
    FOR SELECT TO mediaguide_knowledge_reader
    USING (
        public.mediaguide_knowledge_source_is_approved(source_key)
    );

DROP POLICY IF EXISTS knowledge_reader_insert_approved_chunks
    ON public.health_source_chunks;
CREATE POLICY knowledge_reader_insert_approved_chunks
    ON public.health_source_chunks
    FOR INSERT TO mediaguide_knowledge_reader
    WITH CHECK (
        public.mediaguide_knowledge_source_is_approved(source_key)
    );

DROP POLICY IF EXISTS knowledge_reader_update_approved_chunks
    ON public.health_source_chunks;
CREATE POLICY knowledge_reader_update_approved_chunks
    ON public.health_source_chunks
    FOR UPDATE TO mediaguide_knowledge_reader
    USING (
        public.mediaguide_knowledge_source_is_approved(source_key)
    )
    WITH CHECK (
        public.mediaguide_knowledge_source_is_approved(source_key)
    );
