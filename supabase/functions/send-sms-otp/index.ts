// Supabase Auth "Send SMS" hook: texts the sign-in code for phone sign-ins through Brevo (same as SmarTix).
// Secrets: SEND_SMS_HOOK_SECRET (from Auth > Hooks, "v1,whsec_..."), BREVO_API_KEY, optional SMS_SENDER, SITE_HOST.
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'

const SMS_SENDER = Deno.env.get('SMS_SENDER') || 'Sabi'
const SITE_HOST = Deno.env.get('SITE_HOST') || ''

function toIntl(phone: string): string | null {
  let d = phone.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('232')) return d.length === 11 ? d : null
  if (d.length === 9 && d.startsWith('0')) return '232' + d.slice(1)
  if (d.length === 8) return '232' + d
  return d.length >= 10 && d.length <= 15 ? d : null
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const fail = (message: string, http_code = 500) => json({ error: { http_code, message } }, http_code)

Deno.serve(async (req) => {
  const secret = (Deno.env.get('SEND_SMS_HOOK_SECRET') || '').replace('v1,whsec_', '')
  const key = Deno.env.get('BREVO_API_KEY')
  if (!secret || !key) return fail('SMS sign-in is not set up yet. Please use email for now.')
  const payload = await req.text()
  let user: { phone?: string }, sms: { otp?: string }
  try {
    ({ user, sms } = new Webhook(secret).verify(payload, Object.fromEntries(req.headers)) as { user: { phone?: string }; sms: { otp?: string } })
  } catch { return fail('Not a valid request', 401) }
  const to = toIntl(user?.phone || '')
  if (!to || !sms?.otp) return fail('That phone number cannot receive SMS', 400)
  const r = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
    method: 'POST',
    headers: { 'api-key': key, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: SMS_SENDER, recipient: to, type: 'transactional', tag: 'sabi-sign-in',
      content: `${sms.otp} is your Sabi sign-in code. Do not share it with anyone.` + (SITE_HOST ? `\n\n@${SITE_HOST} #${sms.otp}` : ''),
    }),
  })
  if (!r.ok) {
    console.error('Brevo SMS failed', r.status, (await r.text()).slice(0, 300))
    return fail('We could not send the SMS. Please try again or sign in with email.', 502)
  }
  return json({})
})
