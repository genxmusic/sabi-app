-- 0004 Run the update-rate edge function every day at 06:07 Freetown time (= UTC).
-- Deploy supabase/functions/update-rate first (verify_jwt off: it only reads a public rate).
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule('sabi-daily-exchange-rate', '7 6 * * *', $$
  select net.http_post(url := 'https://tplfuhllauwfmxohdvqv.supabase.co/functions/v1/update-rate',
                       headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb);
$$);
