-- 0007 Audit helpers are only used inside the triggers; nobody calls them directly.
revoke all on function public.audit_actor() from public, anon, authenticated;
revoke all on function public.jsonb_changes(jsonb, jsonb, text[]) from public, anon, authenticated;
