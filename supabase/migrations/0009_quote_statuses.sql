-- 0009 Allow the new quote statuses (quote_sent, quote_declined)
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check (status in
  ('quote_requested', 'quote_sent', 'quote_declined', 'payment_submitted', 'paid', 'rejected', 'in_progress', 'completed', 'cancelled'));
