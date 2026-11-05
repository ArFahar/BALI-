-- Lock tables down for hosted Postgres such as Supabase, where every table in the public schema is reachable through the
-- auto-generated Data API with the public "anon" key unless Row Level Security is enabled.
-- The API server connects as the table owner, which bypasses RLS, so enabling RLS without policies blocks only the
-- Data API roles. On plain PostgreSQL (local Docker) this is harmless.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['knowledge_documents', 'knowledge_chunks', 'knowledge_ingest_runs',
                           'legacy_scenario_chunks', 'feedback', 'schema_migrations'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
      END IF;
    END IF;
  END LOOP;
END $$;
