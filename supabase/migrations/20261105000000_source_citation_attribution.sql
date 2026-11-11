ALTER TABLE public.health_sources
    ADD COLUMN IF NOT EXISTS license_url text,
    ADD COLUMN IF NOT EXISTS modification_notice text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.health_sources'::regclass
          AND conname = 'health_sources_license_url_https'
    ) THEN
        ALTER TABLE public.health_sources
            ADD CONSTRAINT health_sources_license_url_https
            CHECK (
                license_url IS NULL
                OR license_url ~ '^https://[^/[:space:]]+(/[^[:space:]]*)?$'
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.health_sources'::regclass
          AND conname = 'health_sources_modification_notice_nonempty'
    ) THEN
        ALTER TABLE public.health_sources
            ADD CONSTRAINT health_sources_modification_notice_nonempty
            CHECK (
                modification_notice IS NULL
                OR length(btrim(modification_notice)) > 0
            ) NOT VALID;
    END IF;
END;
$$;

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
    source.checksum,
    source.license,
    source.license_url,
    source.modification_notice
FROM public.health_sources AS source
JOIN LATERAL (
    SELECT review.from_status, review.to_status, review.reviewer, review.reviewed_at
    FROM public.health_source_reviews AS review
    WHERE review.source_key = source.source_key
    ORDER BY review.review_id DESC
    LIMIT 1
) AS latest_review ON TRUE
WHERE source.review_status = 'approved'
  AND source.license IS NOT NULL
  AND length(btrim(source.license)) > 0
  AND latest_review.from_status = 'pending_review'
  AND latest_review.to_status = 'approved'
  AND latest_review.reviewer = source.reviewer
  AND latest_review.reviewed_at = source.reviewed_at;

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
    source.version,
    source.license,
    chunk.embedding_model,
    chunk.embedding_dimensions,
    source.license_url,
    source.modification_notice
FROM public.health_source_chunks AS chunk
JOIN public.approved_health_sources AS source
    ON source.source_key = chunk.source_key;
