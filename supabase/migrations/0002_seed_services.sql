-- 0002 Starting catalogue, from Sabi's draft price list (US$; charged in leones at the settings rate).
-- Admins edit everything after this in the app's Admin > Services page.
with s as (
  insert into public.services (category, name, description, per_person, sort) values
   ('digital',  'Starter business setup', 'Mobile money payments, cloud bookkeeping and stock control, set up and taught to your staff.', false, 10),
   ('ai',       'WhatsApp AI assistant', 'A chatbot that takes orders and answers customers in Krio and English, day and night.', false, 20),
   ('support',  'Monthly support plan', 'Help by phone and WhatsApp, updates and on-site visits when you need them.', false, 30),
   ('security', 'CCTV and access control', 'Cameras, recorders, card and fingerprint door access. We survey your site and quote for the equipment.', false, 40),
   ('security', 'Cyber security check', 'Protect your network, accounts and mobile money from hackers and fraud.', false, 50),
   ('training', 'Workshops for business owners', 'Practical digital, AI and security skills for owners and staff.', true, 60),
   ('training', 'Corporate staff training', 'On-site training days for your teams, built around your systems.', false, 70),
   ('projects', 'Data, automation and big projects', 'Dashboards, reports and automated workflows for banks, NGOs, mining services and government.', false, 80)
  returning id, name
)
insert into public.service_options (service_id, name, subtitle, price_usd, monthly_usd, is_quote, sort)
select s.id, o.name, o.subtitle, o.price, o.monthly, o.quote, o.sort
from s join (values
  ('Starter business setup', 'Starter', 'Payments and bookkeeping', 150, 0, false, 1),
  ('Starter business setup', 'Complete', 'Payments, bookkeeping and inventory', 300, 0, false, 2),
  ('WhatsApp AI assistant', 'Standard', 'Answers questions, takes orders', 200, 30, false, 1),
  ('WhatsApp AI assistant', 'Advanced', 'Plus payments, bookings and reports', 400, 50, false, 2),
  ('Monthly support plan', 'Basic', 'Reply within 1 business day', 0, 25, false, 1),
  ('Monthly support plan', 'Standard', 'Reply within 4 hours, quarterly check', 0, 40, false, 2),
  ('Monthly support plan', 'Premium', 'Reply within 2 hours, 7 days, CCTV check', 0, 60, false, 3),
  ('CCTV and access control', 'Site survey and quote', 'Free, no obligation', 0, 0, true, 1),
  ('Cyber security check', 'Security check and setup', 'Quoted per business', 0, 0, true, 1),
  ('Workshops for business owners', 'Half-day workshop', 'Per person', 20, 0, false, 1),
  ('Workshops for business owners', 'Full-day workshop', 'Per person', 40, 0, false, 2),
  ('Corporate staff training', 'Training day', 'US$1,000 to 3,000 a day, quoted', 0, 0, true, 1),
  ('Data, automation and big projects', 'Project', 'US$3,000 to 15,000, quoted', 0, 0, true, 1),
  ('Data, automation and big projects', 'Monthly retainer', 'US$500 to 2,000 a month, quoted', 0, 0, true, 2)
) as o(service, name, subtitle, price, monthly, quote, sort) on o.service = s.name;
