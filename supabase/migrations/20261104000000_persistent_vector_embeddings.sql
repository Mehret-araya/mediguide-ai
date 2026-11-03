ALTER TABLE public.health_source_chunks
    ADD COLUMN IF NOT EXISTS embedding_model text,
    ADD COLUMN IF NOT EXISTS embedding_dimensions integer;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.health_source_chunks'::regclass
          AND conname = 'health_source_chunks_embedding_metadata_valid'
    ) THEN
        ALTER TABLE public.health_source_chunks
            ADD CONSTRAINT health_source_chunks_embedding_metadata_valid
            CHECK (
                (
                    embedding IS NULL
                    AND embedding_model IS NULL
                    AND embedding_dimensions IS NULL
                )
                OR (
                    embedding IS NOT NULL
                    AND embedding_model IS NOT NULL
                    AND length(btrim(embedding_model)) BETWEEN 1 AND 160
                    AND embedding_dimensions IS NOT NULL
                    AND embedding_dimensions BETWEEN 1 AND 16000
                    AND extensions.vector_dims(embedding) = embedding_dimensions
                )
            ) NOT VALID;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS health_source_chunks_embedding_model_idx
    ON public.health_source_chunks (embedding_model, embedding_dimensions)
    WHERE embedding IS NOT NULL;

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
    chunk.embedding_dimensions
FROM public.health_source_chunks AS chunk
JOIN public.approved_health_sources AS source
    ON source.source_key = chunk.source_key;
