-- 0001 Sabi: customer accounts, services catalogue, orders and payments, admin.
-- Payments work like SmarTix: Orange Money / Afrimoney merchant codes (customer enters the
-- transaction ID, Sabi confirms) and cards through a Stripe Payment Link (receipt number, Sabi confirms).

-- ===== Accounts =====
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 100),
  business text check (char_length(business) <= 150),
  email text,
  phone text,
  location text check (char_length(location) <= 200),
  role text not null default 'customer' check (role in ('customer', 'staff', 'admin')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('staff', 'admin'));
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- Every new sign-up (email or phone) gets a customer profile
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, business, email, phone, location)
  values (new.id,
          nullif(new.raw_user_meta_data ->> 'full_name', ''),
          nullif(new.raw_user_meta_data ->> 'business', ''),
          nullif(new.email, ''),
          coalesce(nullif(new.phone, ''), nullif(new.raw_user_meta_data ->> 'phone', '')),
          nullif(new.raw_user_meta_data ->> 'location', ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Customers may edit their details but never their own role
create or replace function public.protect_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not is_admin() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only an admin can change roles';
  end if;
  if new.id = auth.uid() and old.role = 'admin' and new.role <> 'admin' then
    raise exception 'You cannot remove your own admin role';
  end if;
  return new;
end $$;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_role();

-- ===== Settings (one row) =====
create table public.settings (
  id int primary key default 1 check (id = 1),
  nle_per_usd numeric(10, 4) not null default 22.94 check (nle_per_usd > 0),
  rate_date date not null default current_date,
  deposit_pct int not null default 50 check (deposit_pct between 0 and 100),
  whatsapp text, email text,
  orange_code text, afri_code text,
  orange_ussd text not null default '#144#',
  afri_ussd text not null default '*161#',
  card_link text check (card_link is null or card_link ~ '^https://'),
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);
alter table public.settings enable row level security;
create policy settings_read on public.settings for select to anon, authenticated using (true);
create policy settings_admin on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ===== Services =====
create table public.services (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('digital', 'ai', 'security', 'support', 'training', 'projects')),
  name text not null check (char_length(name) between 2 and 100),
  description text check (char_length(description) <= 600),
  per_person boolean not null default false,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create table public.service_options (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  subtitle text check (char_length(subtitle) <= 120),
  price_usd numeric(10, 2) not null default 0 check (price_usd >= 0),
  monthly_usd numeric(10, 2) not null default 0 check (monthly_usd >= 0),
  is_quote boolean not null default false,
  active boolean not null default true,
  sort int not null default 0
);
create index on public.service_options (service_id);
alter table public.services enable row level security;
alter table public.service_options enable row level security;
create policy services_read on public.services for select to anon, authenticated using (active or public.is_admin());
create policy services_admin on public.services for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy options_read on public.service_options for select to anon, authenticated using (active or public.is_admin());
create policy options_admin on public.service_options for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ===== Orders =====
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  customer_id uuid not null references public.profiles (id),
  status text not null check (status in ('quote_requested', 'payment_submitted', 'paid', 'rejected',
                                           'in_progress', 'completed', 'cancelled')),
  method text check (method in ('orange', 'afrimoney', 'card')),
  txn_id text check (char_length(txn_id) <= 80),
  payer_number text check (char_length(payer_number) <= 30),
  nle_per_usd numeric(10, 4) not null,
  pay_today_usd numeric(12, 2) not null default 0,
  balance_usd numeric(12, 2) not null default 0,
  monthly_usd numeric(12, 2) not null default 0,
  address text check (char_length(address) <= 200),
  notes text check (char_length(notes) <= 1000),
  admin_note text check (char_length(admin_note) <= 1000),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.orders (customer_id);
create index on public.orders (status, created_at desc);
create unique index orders_one_use_per_txn on public.orders (method, upper(txn_id))
  where txn_id is not null and status <> 'rejected';

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  option_id uuid references public.service_options (id) on delete set null,
  service_name text not null,
  option_name text not null,
  qty int not null default 1 check (qty between 1 and 200),
  price_usd numeric(10, 2) not null default 0,
  monthly_usd numeric(10, 2) not null default 0,
  is_quote boolean not null default false
);
create index on public.order_items (order_id);
create index on public.order_items (option_id);
create index on public.orders (reviewed_by);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
create policy orders_read on public.orders for select to authenticated
  using (customer_id = auth.uid() or public.is_staff());
create policy items_read on public.order_items for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_staff())));
-- No direct inserts or updates: orders go through place_order, changes through set_order_status.

-- Places an order. Prices always come from the database, never from the browser.
-- p_items: [{"option_id": "...", "qty": 1}, ...]
create or replace function public.place_order(p_items jsonb, p_method text, p_txn text, p_payer text,
                                              p_address text, p_notes text)
returns table (order_id uuid, ref text)
language plpgsql security definer set search_path = public as $$
declare
  s settings; v_id uuid; v_ref text; v_item jsonb; o record;
  v_qty int; v_once numeric := 0; v_dep numeric := 0; v_month numeric := 0; v_line numeric; v_count int := 0;
begin
  if auth.uid() is null then raise exception 'Please sign in to place an order'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Your order is empty'; end if;
  if jsonb_array_length(p_items) > 30 then raise exception 'Too many items in one order'; end if;
  select * into s from settings where id = 1;
  v_ref := 'SABI-' || to_char(now() at time zone 'Africa/Freetown', 'YYMMDD') || '-' ||
           upper(substr(md5(gen_random_uuid()::text), 1, 4));

  insert into orders (ref, customer_id, status, nle_per_usd, address, notes)
  values (v_ref, auth.uid(), 'quote_requested', s.nle_per_usd, left(trim(p_address), 200), left(trim(p_notes), 1000))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select so.*, sv.name as service_name, sv.per_person into o
      from service_options so join services sv on sv.id = so.service_id
      where so.id = (v_item ->> 'option_id')::uuid and so.active and sv.active;
    if not found then raise exception 'One of the services is no longer available. Refresh and try again.'; end if;
    v_qty := case when o.per_person then greatest(1, least(200, coalesce((v_item ->> 'qty')::int, 1))) else 1 end;
    insert into order_items (order_id, option_id, service_name, option_name, qty, price_usd, monthly_usd, is_quote)
    values (v_id, o.id, o.service_name, o.name, v_qty, o.price_usd, o.monthly_usd, o.is_quote);
    if not o.is_quote then
      v_count := v_count + 1;
      v_line := o.price_usd * v_qty;
      v_once := v_once + v_line;
      -- per-person training is paid in full; setup work pays the deposit now
      v_dep := v_dep + case when o.per_person then v_line else round(v_line * s.deposit_pct / 100.0, 2) end;
      v_month := v_month + o.monthly_usd;
    end if;
  end loop;

  if v_count > 0 then
    if p_method not in ('orange', 'afrimoney', 'card') then raise exception 'Choose how you want to pay'; end if;
    if coalesce(trim(p_txn), '') = '' then raise exception 'Enter the transaction ID or card receipt number'; end if;
    if p_method <> 'card' and coalesce(trim(p_payer), '') = '' then raise exception 'Enter the number you paid from'; end if;
    if exists (select 1 from orders where method = p_method and upper(txn_id) = upper(trim(p_txn)) and status <> 'rejected') then
      raise exception 'That transaction ID has already been used on another order';
    end if;
    update orders set status = 'payment_submitted', method = p_method, txn_id = trim(p_txn),
                      payer_number = nullif(trim(p_payer), ''),
                      pay_today_usd = v_dep + v_month, balance_usd = v_once - v_dep, monthly_usd = v_month
     where id = v_id;
  end if;
  return query select v_id, v_ref;
end $$;

-- Staff confirm or reject a payment, and move a job along
create or replace function public.set_order_status(p_order uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Only Sabi staff can change orders'; end if;
  if p_status not in ('quote_requested', 'payment_submitted', 'paid', 'rejected', 'in_progress', 'completed', 'cancelled') then
    raise exception 'Unknown status';
  end if;
  update orders set status = p_status, admin_note = coalesce(nullif(trim(p_note), ''), admin_note),
                    reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_order;
  if not found then raise exception 'Order not found'; end if;
end $$;

-- Admin makes someone staff or admin, found by email or phone
create or replace function public.set_role(p_who text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_digits text := regexp_replace(coalesce(p_who, ''), '\D', '', 'g');
begin
  if not is_admin() then raise exception 'Only an admin can change roles'; end if;
  if p_role not in ('customer', 'staff', 'admin') then raise exception 'Unknown role'; end if;
  update profiles set role = p_role
   where (position('@' in p_who) > 0 and lower(email) = lower(trim(p_who)))
      or (position('@' in p_who) = 0 and length(v_digits) >= 8 and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 8) = right(v_digits, 8));
  if not found then raise exception 'No Sabi account with that email or phone yet. Ask them to sign up first.'; end if;
end $$;

revoke all on function public.place_order(jsonb, text, text, text, text, text) from public, anon;
revoke all on function public.set_order_status(uuid, text, text) from public, anon;
revoke all on function public.set_role(text, text) from public, anon;
grant execute on function public.place_order(jsonb, text, text, text, text, text) to authenticated;
grant execute on function public.set_order_status(uuid, text, text) to authenticated;
grant execute on function public.set_role(text, text) to authenticated;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.protect_role() from public, anon, authenticated;
