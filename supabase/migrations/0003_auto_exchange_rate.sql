-- 0003 Exchange rate updates itself every day: market rate + Sabi's margin (default 2%).
-- The update-rate edge function fetches the market rate and calls apply_market_rate.
-- A jump of more than 5% from the last market rate is held back for an admin to check.

alter table public.settings
  add column rate_auto boolean not null default true,
  add column rate_margin_pct numeric(5, 2) not null default 2 check (rate_margin_pct between 0 and 50),
  add column rate_market numeric(10, 4),
  add column rate_source text,
  add column rate_updated_at timestamptz,
  add column rate_alert text;

-- Called only by the edge function (service role). Returns what it did, for the logs.
create or replace function public.apply_market_rate(p_market numeric, p_source text)
returns text language plpgsql security definer set search_path = public as $$
declare s settings; v_new numeric; v_jump numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not allowed'; end if;
  if p_market is null or p_market <= 0 or p_market > 1000 then raise exception 'Bad market rate %', p_market; end if;
  select * into s from settings where id = 1 for update;
  if s.rate_market is not null then
    v_jump := abs(p_market - s.rate_market) / s.rate_market * 100;
    if v_jump > 5 then
      update settings set rate_alert = format('Market rate moved %s%% (NLe%s to NLe%s) on %s. Not applied: check it, then save the rate yourself or press "Accept market rate".',
                                               round(v_jump, 1), round(s.rate_market, 2), round(p_market, 2), to_char(now() at time zone 'Africa/Freetown', 'DD Mon YYYY')),
                          rate_source = p_source
       where id = 1;
      return 'held: jump ' || round(v_jump, 1) || '%';
    end if;
  end if;
  v_new := round(p_market * (1 + s.rate_margin_pct / 100.0), 2);
  update settings set rate_market = round(p_market, 4), rate_source = p_source, rate_updated_at = now(), rate_alert = null,
                      nle_per_usd = case when rate_auto then v_new else nle_per_usd end,
                      rate_date = case when rate_auto then (now() at time zone 'Africa/Freetown')::date else rate_date end
   where id = 1;
  return case when s.rate_auto then 'applied ' || v_new else 'auto off; market saved' end;
end $$;

-- Admin accepts a held-back market rate (after a big jump)
create or replace function public.accept_market_rate(p_market numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only an admin can do that'; end if;
  if p_market is null or p_market <= 0 or p_market > 1000 then raise exception 'That rate does not look right'; end if;
  update settings set rate_market = round(p_market, 4), rate_alert = null, rate_updated_at = now(),
                      nle_per_usd = round(p_market * (1 + rate_margin_pct / 100.0), 2),
                      rate_date = (now() at time zone 'Africa/Freetown')::date
   where id = 1;
end $$;

revoke all on function public.apply_market_rate(numeric, text) from public, anon, authenticated;
grant execute on function public.apply_market_rate(numeric, text) to service_role;
revoke all on function public.accept_market_rate(numeric) from public, anon;
grant execute on function public.accept_market_rate(numeric) to authenticated;

-- Start from today's market rate (22.93 on 24 Nov 2026) + 2%
update public.settings set rate_market = 22.9294, rate_source = 'open.er-api.com', rate_updated_at = now(),
                           nle_per_usd = round(22.9294 * 1.02, 2), rate_date = current_date
 where id = 1;
