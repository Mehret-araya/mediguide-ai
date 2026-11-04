REVOKE ALL ON
    public.health_sources,
    public.health_source_reviews,
    public.health_source_chunks,
    public.approved_health_sources,
    public.approved_source_chunks
FROM service_role;

REVOKE ALL ON SEQUENCE public.health_source_reviews_review_id_seq
FROM service_role;
