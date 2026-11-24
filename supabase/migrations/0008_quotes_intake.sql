-- 0008 No public prices. Customers pick a service, answer that service's intake questions, the AI asks
-- follow-ups and writes a summary (no prices), and the request lands in Admin. Sabi prices it, approves it,
-- and the customer sees the quote in My orders, where they accept and pay (deposit + first month) or decline.

-- ===== The price list becomes private (staff only) =====
alter policy options_read on public.service_options to authenticated using (public.is_staff());

-- ===== Per-service intake questions (admins can edit them later) =====
-- [{id, label, type: text|long|number|select|multi|yesno, options?: [..], required?: bool, help?: text}]
alter table public.services add column intake_questions jsonb not null default '[]'::jsonb;

-- ===== Orders become quotes first =====
alter table public.orders
  add column intake jsonb,                 -- {service_ids, answers per service, description, followups: [{q, a}]}
  add column ai_summary text check (char_length(ai_summary) <= 6000),
  add column deposit_pct int check (deposit_pct between 0 and 100),
  add column quote_note text check (char_length(quote_note) <= 2000),
  add column quote_sent_at timestamptz,
  add column quote_valid_until date,
  add column decline_reason text check (char_length(decline_reason) <= 500);

-- order_items: custom lines priced by Sabi (one-off and/or monthly)
alter table public.order_items alter column option_name set default 'To be quoted';

-- ===== Customer: send a quote request =====
create or replace function public.submit_intake(p_service_ids uuid[], p_intake jsonb, p_summary text, p_address text, p_notes text)
returns table (order_id uuid, ref text)
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ref text; s record; v_n int := 0;
begin
  if auth.uid() is null then raise exception 'Please sign in to send your request'; end if;
  if p_service_ids is null or array_length(p_service_ids, 1) is null then raise exception 'Choose at least one service'; end if;
  if array_length(p_service_ids, 1) > 8 then raise exception 'Too many services in one request'; end if;
  if pg_column_size(p_intake) > 60000 then raise exception 'Your answers are too long. Please shorten them.'; end if;
  v_ref := 'SABI-' || to_char(now() at time zone 'Africa/Freetown', 'YYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4));
  insert into orders (ref, customer_id, status, nle_per_usd, address, notes, intake, ai_summary)
  values (v_ref, auth.uid(), 'quote_requested', (select nle_per_usd from settings where id = 1),
          left(trim(coalesce(p_address, '')), 200), left(trim(coalesce(p_notes, '')), 1000), p_intake, left(p_summary, 6000))
  returning id into v_id;
  for s in select id, name from services where id = any (p_service_ids) and active loop
    insert into order_items (order_id, service_name, option_name, is_quote) values (v_id, s.name, 'To be quoted', true);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'That service is no longer available'; end if;
  return query select v_id, v_ref;
end $$;

-- ===== Staff: price the quote and (optionally) send it =====
-- p_items: [{service_name, option_name, qty, price_usd, monthly_usd}]
create or replace function public.save_quote(p_order uuid, p_items jsonb, p_note text, p_deposit_pct int, p_valid_days int, p_send boolean)
returns void language plpgsql security definer set search_path = public as $$
declare o orders; i jsonb; v_once numeric := 0; v_month numeric := 0; v_qty int; v_price numeric; v_monthly numeric; v_dep int;
begin
  if not is_staff() then raise exception 'Only Sabi staff can price quotes'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'Quote not found'; end if;
  if o.status not in ('quote_requested', 'quote_sent', 'quote_declined') then raise exception 'This order has already been accepted or paid'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one priced line'; end if;
  v_dep := greatest(0, least(100, coalesce(p_deposit_pct, (select deposit_pct from settings where id = 1))));
  delete from order_items where order_id = p_order;
  for i in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, least(1000, coalesce((i ->> 'qty')::int, 1)));
    v_price := greatest(0, coalesce((i ->> 'price_usd')::numeric, 0));
    v_monthly := greatest(0, coalesce((i ->> 'monthly_usd')::numeric, 0));
    if coalesce(trim(i ->> 'service_name'), '') = '' then raise exception 'Every line needs a description'; end if;
    insert into order_items (order_id, service_name, option_name, qty, price_usd, monthly_usd, is_quote)
    values (p_order, left(trim(i ->> 'service_name'), 120), left(coalesce(nullif(trim(i ->> 'option_name'), ''), '-'), 200), v_qty, v_price, v_monthly, false);
    v_once := v_once + v_price * v_qty;
    v_month := v_month + v_monthly * v_qty;
  end loop;
  if v_once + v_month <= 0 then raise exception 'The quote total is zero. Add prices.'; end if;
  update orders set
    deposit_pct = v_dep, quote_note = left(nullif(trim(p_note), ''), 2000),
    nle_per_usd = (select nle_per_usd from settings where id = 1),
    pay_today_usd = round(v_once * v_dep / 100.0, 2) + v_month,
    balance_usd = v_once - round(v_once * v_dep / 100.0, 2),
    monthly_usd = v_month,
    status = case when p_send then 'quote_sent' else status end,
    quote_sent_at = case when p_send then now() else quote_sent_at end,
    quote_valid_until = case when p_send then (now() at time zone 'Africa/Freetown')::date + greatest(1, coalesce(p_valid_days, 14)) else quote_valid_until end,
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_order;
end $$;

-- ===== Customer: accept and pay, or decline =====
create or replace function public.accept_quote(p_order uuid, p_method text, p_txn text, p_payer text)
returns void language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_order and customer_id = auth.uid() for update;
  if not found then raise exception 'Quote not found'; end if;
  if o.status <> 'quote_sent' then raise exception 'This quote is not waiting for payment'; end if;
  if o.quote_valid_until is not null and o.quote_valid_until < (now() at time zone 'Africa/Freetown')::date then
    raise exception 'This quote has expired. Please ask Sabi for an updated quote.';
  end if;
  if p_method not in ('orange', 'afrimoney', 'card') then raise exception 'Choose how you want to pay'; end if;
  if coalesce(trim(p_txn), '') = '' then raise exception 'Enter the transaction ID or card receipt number'; end if;
  if p_method <> 'card' and coalesce(trim(p_payer), '') = '' then raise exception 'Enter the number you paid from'; end if;
  if exists (select 1 from orders where method = p_method and upper(txn_id) = upper(trim(p_txn)) and status <> 'rejected' and id <> p_order) then
    raise exception 'That transaction ID has already been used on another order';
  end if;
  update orders set status = 'payment_submitted', method = p_method, txn_id = trim(p_txn), payer_number = nullif(trim(p_payer), '')
   where id = p_order;
end $$;

create or replace function public.decline_quote(p_order uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update orders set status = 'quote_declined', decline_reason = left(nullif(trim(p_reason), ''), 500)
   where id = p_order and customer_id = auth.uid() and status = 'quote_sent';
  if not found then raise exception 'Quote not found'; end if;
end $$;

-- staff status changes must know the new statuses too
create or replace function public.set_order_status(p_order uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Only Sabi staff can change orders'; end if;
  if p_status not in ('quote_requested', 'quote_sent', 'quote_declined', 'payment_submitted', 'paid', 'rejected', 'in_progress', 'completed', 'cancelled') then
    raise exception 'Unknown status';
  end if;
  update orders set status = p_status, admin_note = coalesce(nullif(trim(p_note), ''), admin_note),
                    reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_order;
  if not found then raise exception 'Order not found'; end if;
end $$;

revoke all on function public.submit_intake(uuid[], jsonb, text, text, text) from public, anon;
revoke all on function public.save_quote(uuid, jsonb, text, int, int, boolean) from public, anon;
revoke all on function public.accept_quote(uuid, text, text, text) from public, anon;
revoke all on function public.decline_quote(uuid, text) from public, anon;
grant execute on function public.submit_intake(uuid[], jsonb, text, text, text) to authenticated;
grant execute on function public.save_quote(uuid, jsonb, text, int, int, boolean) to authenticated;
grant execute on function public.accept_quote(uuid, text, text, text) to authenticated;
grant execute on function public.decline_quote(uuid, text) to authenticated;
-- the old direct-pay checkout is retired (prices are no longer public)
revoke all on function public.place_order(jsonb, text, text, text, text, text) from public, anon, authenticated;

-- ===== Starting questions for each service =====
update public.services set intake_questions = q.qs::jsonb from (values
 ('Starter business setup', '[
   {"id":"biz_type","label":"What kind of business is it?","type":"select","options":["Shop","Pharmacy","Restaurant or bar","Hotel or guesthouse","Transport","Other"],"required":true},
   {"id":"staff","label":"How many staff work there?","type":"number"},
   {"id":"branches","label":"How many branches or locations?","type":"number"},
   {"id":"now","label":"How do you keep records now?","type":"multi","options":["Paper books","Excel","WhatsApp","An app or software","Nothing yet"]},
   {"id":"need","label":"What do you want set up?","type":"multi","options":["Mobile money payments","Bookkeeping","Stock / inventory","Invoices and receipts","Sales reports"],"required":true}
 ]'),
 ('WhatsApp AI assistant', '[
   {"id":"tasks","label":"What should the assistant do?","type":"multi","options":["Answer customer questions","Take orders","Bookings or appointments","Send payment details","Follow up with customers"],"required":true},
   {"id":"langs","label":"Which languages?","type":"multi","options":["Krio","English","Other"]},
   {"id":"volume","label":"About how many customer messages a day?","type":"select","options":["Under 20","20 to 100","Over 100","Not sure"]},
   {"id":"wa_business","label":"Do you already use WhatsApp Business?","type":"yesno"}
 ]'),
 ('Monthly support plan', '[
   {"id":"devices","label":"How many computers, phones and printers need support?","type":"number","required":true},
   {"id":"staff","label":"How many staff use them?","type":"number"},
   {"id":"locations","label":"How many locations?","type":"number"},
   {"id":"speed","label":"How fast do you need help when something breaks?","type":"select","options":["Next working day is fine","Same day","Within 2 hours, any day"]}
 ]'),
 ('CCTV and access control', '[
   {"id":"site","label":"What kind of site?","type":"select","options":["Shop","Office","Warehouse","Home","Compound","School","Other"],"required":true},
   {"id":"cameras","label":"About how many cameras do you think you need?","type":"select","options":["1 to 4","5 to 8","9 to 16","More than 16","Not sure"]},
   {"id":"areas","label":"Where do you need cameras?","type":"multi","options":["Inside","Outside","Gate / entrance","Cash point","Parking"]},
   {"id":"access","label":"Do you also want door access control (cards or fingerprints)?","type":"yesno"},
   {"id":"phone_view","label":"Do you want to watch the cameras on your phone?","type":"yesno"},
   {"id":"power","label":"What is the power like at the site?","type":"select","options":["Mostly grid","Generator","Solar","Unreliable"]}
 ]'),
 ('Cyber security check', '[
   {"id":"devices","label":"How many computers and phones does the business use?","type":"number","required":true},
   {"id":"momo","label":"Do you use mobile money for the business?","type":"yesno"},
   {"id":"incident","label":"Have you had a hack, scam or virus before?","type":"yesno"},
   {"id":"worries","label":"What worries you most?","type":"multi","options":["Hacked accounts","Fraud and scams","Viruses","Staff misuse","Losing data"]}
 ]'),
 ('Workshops for business owners', '[
   {"id":"people","label":"How many people will attend?","type":"number","required":true},
   {"id":"topics","label":"Which topics?","type":"multi","options":["Computer basics","Excel","AI tools","Online safety","Mobile money and bookkeeping"],"required":true},
   {"id":"length","label":"How long?","type":"select","options":["Half day","Full day","Not sure"]},
   {"id":"where","label":"Where should it happen?","type":"text"}
 ]'),
 ('Corporate staff training', '[
   {"id":"org","label":"What kind of organisation?","type":"select","options":["Bank","NGO","Mining services","Government","Company","Other"],"required":true},
   {"id":"people","label":"How many staff need training?","type":"number","required":true},
   {"id":"topics","label":"What should they learn?","type":"long"},
   {"id":"days","label":"How many days are you thinking of?","type":"select","options":["1 day","2 to 3 days","A week or more","Not sure"]}
 ]'),
 ('Data, automation and big projects', '[
   {"id":"org","label":"What kind of organisation?","type":"select","options":["Bank","NGO","Mining services","Government","Company","Other"],"required":true},
   {"id":"goal","label":"What do you want to improve or build?","type":"long","required":true},
   {"id":"systems","label":"What systems or tools do you use now?","type":"text"},
   {"id":"budget","label":"Do you have a budget in mind? (optional)","type":"text"}
 ]')
) as q(name, qs) where services.name = q.name;

-- ===== AI assistant usage (limits each customer to 30 AI calls an hour) =====
create table public.ai_calls (id bigint generated always as identity primary key, user_id uuid not null, at timestamptz not null default now());
create index on public.ai_calls (user_id, at desc);
alter table public.ai_calls enable row level security;   -- no policies: only the edge function (service role) uses it
