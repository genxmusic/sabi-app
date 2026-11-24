-- 0005 Security add-ons:
--  * Two-step sign-in: staff and admin powers only work after the authenticator-app step (aal2)
--  * Activity log: who changed order status, prices, services, settings and roles, and when
--  * Order limit: at most 5 orders an hour per customer
-- (pg_net is moved out of the public schema in 0006, which runs only on Supabase.)

-- ===== Two-step: staff/admin checks need aal2 =====
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from profiles where id = auth.uid() and role in ('staff', 'admin'));
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- Lets the app tell a staff member "do your second step" instead of showing empty pages
create or replace function public.my_staff_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;
revoke all on function public.my_staff_role() from public, anon;
grant execute on function public.my_staff_role() to authenticated;

-- ===== Activity log =====
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor text not null,
  action text not null,
  target text,
  details jsonb
);
create index on public.audit_log (at desc);
alter table public.audit_log enable row level security;
create policy audit_read on public.audit_log for select to authenticated using (public.is_admin());
-- nobody writes directly; only the triggers below (security definer) add rows, and nothing can change or delete them

create or replace function public.audit_actor() returns text
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is not null then coalesce((select coalesce(full_name, email, '+' || phone) from profiles where id = auth.uid()), 'Unknown user')
    when coalesce(auth.role(), '') = 'service_role' then 'System'
    else 'Database (Sabi tech)'
  end;
$$;

create or replace function public.jsonb_changes(o jsonb, n jsonb, skip text[] default '{}') returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_object('from', o -> k, 'to', n -> k)), '{}'::jsonb)
  from jsonb_object_keys(n) k
  where not (k = any (skip)) and (o -> k) is distinct from (n -> k);
$$;

create or replace function public.audit_write(p_action text, p_target text, p_details jsonb) returns void
language sql security definer set search_path = public as $$
  insert into audit_log (actor_id, actor, action, target, details) values (auth.uid(), audit_actor(), p_action, p_target, p_details);
$$;
revoke all on function public.audit_write(text, text, jsonb) from public, anon, authenticated;

create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_changes jsonb; v_what text := case tg_table_name when 'service_options' then 'Package' when 'services' then 'Service' else initcap(tg_table_name) end;
begin
  if tg_table_name = 'orders' then
    if new.status is distinct from old.status then
      perform audit_write('Order ' || replace(new.status, '_', ' '), new.ref,
        jsonb_build_object('from', old.status, 'to', new.status, 'note', new.admin_note, 'txn_id', new.txn_id, 'method', new.method));
    end if;
  elsif tg_table_name = 'profiles' then
    if new.role is distinct from old.role then
      perform audit_write('Role changed', coalesce(new.full_name, new.email, '+' || new.phone),
        jsonb_build_object('from', old.role, 'to', new.role));
    end if;
  elsif tg_table_name = 'settings' then
    v_changes := jsonb_changes(to_jsonb(old), to_jsonb(new), array['updated_at', 'rate_updated_at']);
    if v_changes <> '{}'::jsonb then perform audit_write('Settings changed', null, v_changes); end if;
  elsif tg_op = 'INSERT' then
    perform audit_write(v_what || ' added', new.name, to_jsonb(new) - 'id');
  elsif tg_op = 'DELETE' then
    perform audit_write(v_what || ' deleted', old.name, to_jsonb(old) - 'id');
  else
    v_changes := jsonb_changes(to_jsonb(old), to_jsonb(new));
    if v_changes <> '{}'::jsonb then perform audit_write(v_what || ' changed', new.name, v_changes); end if;
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.audit_trigger() from public, anon, authenticated;

create trigger audit_orders after update on public.orders for each row execute function public.audit_trigger();
create trigger audit_profiles after update on public.profiles for each row execute function public.audit_trigger();
create trigger audit_settings after update on public.settings for each row execute function public.audit_trigger();
create trigger audit_services after insert or update or delete on public.services for each row execute function public.audit_trigger();
create trigger audit_options after insert or update or delete on public.service_options for each row execute function public.audit_trigger();

-- ===== Order limit: 5 an hour per customer =====
create or replace function public.order_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from orders where customer_id = new.customer_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'You have placed several orders in the last hour. Please wait a little, or contact Sabi on WhatsApp.';
  end if;
  return new;
end $$;
revoke all on function public.order_rate_limit() from public, anon, authenticated;
create trigger orders_rate_limit before insert on public.orders for each row execute function public.order_rate_limit();
