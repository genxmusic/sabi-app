-- 0006 Supabase security advice: keep pg_net out of the public schema.
-- Its functions live in the "net" schema either way, so the daily rate job is unaffected.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
