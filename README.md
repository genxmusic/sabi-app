# Sabi app

Customer app for **Sabi IT and Security Solutions**: customers see every service, create an account (phone number or email), choose services and pay with Orange Money, Afrimoney or card. Sabi staff check payments and run orders from the Admin pages.

*Smart tech. Safe business.*

## What's in it

```
web/                         Vite + React + TypeScript site (deploys to Vercel)
  src/pages/Home.tsx           services and prices
  src/pages/Login.tsx          one step to sign up or sign in: phone or email, then a one-time code (no passwords)
  src/pages/Checkout.tsx       order, pay, send transaction ID
  src/pages/Orders.tsx         customer's orders and their status
  src/pages/Account.tsx        customer's details
  src/pages/Admin.tsx          staff: orders, customers; admin: services, settings, roles
supabase/migrations/         database (run in order)
  0001_accounts_services_orders.sql
  0002_seed_services.sql       starting services and prices
supabase/functions/send-sms-otp  texts sign-in codes through Brevo (same as SmarTix)
```

## How payment works (same as SmarTix)

- **Orange Money / Afrimoney:** customer pays Sabi's merchant code by USSD, then enters the transaction ID and the number they paid from. Order shows as *Checking payment* until staff press **Payment received** (or **Payment not found**).
- **Card:** customer pays on Sabi's Stripe Payment Link (set to "customer chooses amount", US$) and enters the receipt number. Staff confirm the same way.
- Setup work: deposit now (50% by default), balance on completion. Monthly plans: first month in advance. Per-person workshops: paid in full. CCTV, cyber security and big projects: free quote first.
- Prices are stored in US$ and shown in leones. The rate updates itself daily at 06:07 Freetown time: market rate (open.er-api.com) + Sabi's margin (2% by default), via the `update-rate` edge function and pg_cron. A jump over 5% is held for an admin to accept in Admin › Settings; automatic updates can be switched off there. The database works out every amount itself; the browser never sets a price. A transaction ID can only be used on one order.

## Roles

- **customer:** everyone who signs up.
- **staff:** sees all orders and customers, confirms payments, moves jobs along.
- **admin:** staff plus editing services, prices, settings and roles.

Make the first admin after signing up once (Supabase › SQL editor):

```sql
update public.profiles set role = 'admin' where email = 'YOUR-EMAIL';
```

After that, admins set roles in Admin › Customers.

## Security

- **Two-step sign-in for staff and admins:** after the email/SMS code, a 6-digit authenticator-app code. Staff/admin powers in the database (`is_staff`, `is_admin`) only work at `aal2`, so a stolen email alone can't confirm payments or change prices.
- **Auto sign-out:** 30 minutes without activity (15 for staff/admins), or when the browser closes, unless "Keep me signed in" is ticked.
- **Bot check on sign-in:** Cloudflare Turnstile. Off until `VITE_TURNSTILE_SITE_KEY` is set in Vercel and the secret key is saved in Supabase › Authentication › Attack Protection › CAPTCHA (Turnstile).
- **Activity log:** Admin › Activity. Order status changes, price/service changes, settings and role changes, with who and when. Written only by database triggers; can't be edited or deleted.
- **Order limit:** 5 orders an hour per customer.
- **Browser security headers:** strict Content-Security-Policy and others in `web/vercel.json`.

## Setup

1. **Database:** run the files in `supabase/migrations` in order (SQL editor, or `supabase db push`).
2. **Auth:** Authentication › URL Configuration: Site URL and Redirect URL `https://<site>/**`.
   Email codes: Authentication › Emails › templates **Magic link** and **Confirm signup** must show `{{ .Token }}` (the code), with the link as a backup.
   Custom SMTP (Resend, like SmarTix) so emails reach customers, not just Supabase team members.
3. **Phone sign-in (optional):** deploy `send-sms-otp`, set Auth › Hooks › Send SMS hook to its URL, save the hook secret as `SEND_SMS_HOOK_SECRET` and the Brevo key as `BREVO_API_KEY`, turn on Auth › Providers › Phone.
4. **Web:** copy `web/.env.example` to `web/.env` with the project URL and publishable key; `cd web && npm install && npm run dev`.
5. **Vercel:** import the repo, root directory `web`, add the two `VITE_` variables.
6. **Admin › Settings:** WhatsApp number, email, Orange Money and Afrimoney merchant codes, Stripe card link, exchange rate.

Database: Supabase project **Sabi-App** (`tplfuhllauwfmxohdvqv`, eu-west-1) in the free "Sabi IT and Security Solutions" organization; both migrations applied Nov 24, 2026. Move to the Generation Next Entertainment (Pro) organization when going live.

## Live setup (Nov 24, 2026)

- Site: https://www.sabitechsl.com (sabitechsl.com forwards to www; also https://sabi-app-lovat.vercel.app). Vercel, root directory `web`. DNS at GoDaddy: A @ 76.76.21.21, CNAME www cname.vercel-dns.com. Supabase Site URL = https://www.sabitechsl.com
- Auth emails: Supabase custom SMTP through Resend, sender **Sabi <sabi@sabitechsl.com>** (domain sabitechsl.com verified in Resend; DNS at GoDaddy). Sign-in and Confirm sign-up templates show the code (`{{ .Token }}`) with the link as backup.
- First admin: sabi@sabitechsl.com
- Phone sign-in codes: not set up yet (needs the Brevo SMS hook above).
